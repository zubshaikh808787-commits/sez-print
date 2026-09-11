package expo.modules.joshprinter

import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.dothantech.lpapi.LPAPI
import com.dothantech.printer.IDzPrinter
import com.dothantech.printer.IDzPrinter.AddressType
import com.dothantech.printer.IDzPrinter.PrintParamName
import com.dothantech.printer.IDzPrinter.PrintProgress
import com.dothantech.printer.IDzPrinter.PrinterAddress
import com.dothantech.printer.IDzPrinter.PrinterState
import com.dothantech.printer.IDzPrinter.ProgressInfo
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock

/**
 * JOSH / DothanTech LPAPI printer lifecycle manager.
 *
 * Owns a single LPAPI instance. Provides:
 *  • Explicit state machine (no bare booleans)
 *  • Serialized print queue (one job at a time)
 *  • Connection guard (no duplicate openPrinterByAddress calls)
 *  • Auto-reconnection with exponential backoff
 *  • Print timeout (never stuck in PRINTING)
 *  • Thread-safe callback marshalling to main thread
 *
 * This class is NOT an Activity. It survives screen navigation.
 */
class JoshPrinterManager(private val context: Context) {

    companion object {
        private const val TAG = "JoshPrinter"
        private const val DISCOVERY_TIMEOUT_MS = 15_000L
        private const val CONNECT_TIMEOUT_MS = 20_000L
        private const val CONNECT_RETRY_DELAY_MS = 1_500L
        private const val CONNECT_MAX_ATTEMPTS = 2
        private const val PRINT_TIMEOUT_MS = 15_000L
        private const val MAX_RECONNECT_ATTEMPTS = 3
        private val RECONNECT_DELAYS_MS = longArrayOf(1000, 2000, 4000)

        // Default print parameters — -1 means use printer hardware defaults
        const val DEFAULT_DENSITY = -1   // -1 = use printer default (safe for all models)
        const val DEFAULT_SPEED = -1     // -1 = use printer default
        const val DEFAULT_GAP_TYPE = -1  // -1 = use printer default
        const val DEFAULT_GAP_LENGTH = -1
        /** DothanTech JOSH heads are 203 DPI. 304 is TD-404 and must not size the bitmap. */
        const val HARDWARE_DPI = 203.0
        const val HARDWARE_DPM = 8.0
        /** Official demo: Label / 间隙纸. Die-cut 50×30 stock. */
        const val GAP_TYPE_LABEL = 2
        const val GAP_TYPE_RECEIPT = 0
        const val GAP_TYPE_BLACK_MARK = 3
    }

    // ─── State Machine ─────────────────────────────────────────────────

    enum class State {
        IDLE,
        SCANNING,
        CONNECTING,
        CONNECTED,
        DISCONNECTING,
        DISCONNECTED,
        PRINTING,
        PRINT_SUCCESS,
        PRINT_FAILED,
        RECONNECTING,
        ERROR
    }

    private val state = AtomicReference(State.IDLE)
    private val mainHandler = Handler(Looper.getMainLooper())

    // ─── Connection ────────────────────────────────────────────────────

    private val isConnecting = AtomicBoolean(false)
    private val isDiscovering = AtomicBoolean(false)
    private var connectedPrinterAddress: PrinterAddress? = null
    private var connectedPrinterName: String? = null
    private var connectedMacAddress: String? = null
    private var lastConnectedAddress: PrinterAddress? = null
    private val lastConnectedAt = AtomicLong(0)
    private var connectLatch: CountDownLatch? = null

    // ─── Discovery ─────────────────────────────────────────────────────

    private val discoveredPrinters = ConcurrentHashMap<String, PrinterAddress>()
    private var discoveryTimer: Runnable? = null

    // ─── Print Queue ───────────────────────────────────────────────────

    private val printLock = ReentrantLock()
    private val isPrinting = AtomicBoolean(false)
    private var printLatch: CountDownLatch? = null
    private var lastPrintSuccess = false
    private val jobIdCounter = AtomicInteger(0)

    // ─── Configuration ─────────────────────────────────────────────────

    private var density = DEFAULT_DENSITY
    private var speed = DEFAULT_SPEED
    private var gapType = DEFAULT_GAP_TYPE
    private var gapLength = DEFAULT_GAP_LENGTH

    // ─── Last Error ────────────────────────────────────────────────────

    @Volatile
    var lastError: String? = null
        private set

    // ─── Event Listener ────────────────────────────────────────────────

    interface EventListener {
        fun onStateChanged(state: State, data: Map<String, Any?>)
        fun onPrinterDiscovered(printer: Map<String, Any?>)
        fun onPrintProgress(jobId: String, progress: String, data: Map<String, Any?>)
        fun onError(code: String, message: String)
    }

    @Volatile
    var listener: EventListener? = null

    // ─── LPAPI ─────────────────────────────────────────────────────────

    private var api: LPAPI? = null
    private val apiInitialized = AtomicBoolean(false)

    private val lpapiCallback = object : LPAPI.Callback {

        override fun onStateChange(address: PrinterAddress?, printerState: PrinterState?) {
            Log.i(TAG, "[JOSH-CONN-P4:STATE_CHANGE] address=${address?.shownName ?: address?.macAddress} state=$printerState")
            when (printerState) {
                PrinterState.Connected, PrinterState.Connected2 -> {
                    mainHandler.post { handleConnected(address) }
                }
                PrinterState.Disconnected -> {
                    mainHandler.post { handleDisconnected() }
                }
                PrinterState.Connecting -> {
                    Log.d(TAG, "[JOSH-CONN-P3:STATE_CHANGE] Connecting in progress...")
                }
                else -> {
                    Log.d(TAG, "[JOSH-CONN-P3:STATE_CHANGE] State: $printerState")
                }
            }
        }

        override fun onProgressInfo(info: ProgressInfo?, data: Any?) {
            Log.d(TAG, "[JOSH-INFO] info=$info")
        }

        override fun onPrinterDiscovery(address: PrinterAddress?, data: Any?) {
            if (address == null) return
            mainHandler.post { handlePrinterDiscovered(address) }
        }

        override fun onPrintProgress(
            address: PrinterAddress?,
            bitmapData: IDzPrinter.PrintData?,
            progress: PrintProgress?,
            addiInfo: Any?
        ) {
            Log.i(TAG, "[JOSH-PRINT-P4:HARDWARE-PROGRESS] progress=$progress addiInfo=$addiInfo")
            when (progress) {
                PrintProgress.Success -> {
                    Log.i(TAG, "[JOSH-PRINT-P4:HARDWARE-ACK] Physical print confirmed by printer hardware!")
                    lastPrintSuccess = true
                    printLatch?.countDown()
                    mainHandler.post { handlePrintSuccess() }
                }
                PrintProgress.Failed -> {
                    lastPrintSuccess = false
                    val reason = addiInfo?.toString() ?: "Print job failed"
                    Log.e(TAG, "[JOSH-PRINT-P4:HARDWARE-FAIL] Physical print failed at hardware level: $reason")
                    lastError = "JOSH_PRINT_FAILED: $reason"
                    printLatch?.countDown()
                    mainHandler.post { handlePrintFailed(reason) }
                }
                PrintProgress.DataEnded -> {
                    Log.i(TAG, "[JOSH-PRINT-P3:DATA-TRANSMITTED] Bluetooth byte transmission completed, waiting for hardware print confirmation...")
                    // If hardware does not send Success packet within 1500ms after all bytes are sent,
                    // count down as success so print completes fast without hanging on models lacking hardware ACK
                    mainHandler.postDelayed({
                        if (printLatch != null && isPrinting.get() && !lastPrintSuccess) {
                            Log.i(TAG, "[JOSH-PRINT-P4:FALLBACK-SUCCESS] DataEnded confirmed and safety timer elapsed; completing print.")
                            lastPrintSuccess = true
                            printLatch?.countDown()
                            handlePrintSuccess()
                        }
                    }, 1500)
                }
                else -> {
                    Log.d(TAG, "[JOSH-PRINT-P4:HARDWARE-PROGRESS] $progress (info=$addiInfo)")
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Initialization
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Initialize the LPAPI instance. Must be called once.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    fun initialize(): Boolean {
        if (apiInitialized.get()) return true
        return try {
            // Android 14/15 reflection fix:
            // LPAPI's DzPrinter internally relies on com.dothantech.common.a.g (Application).
            // Under Android 14/15, ActivityThread.currentApplication() can return null, causing
            // DzPrinter.init() to fail and openPrinter/print to be rejected immediately.
            try {
                val appClass = Class.forName("com.dothantech.common.a")
                val field = appClass.getDeclaredField("g")
                field.isAccessible = true
                val app = (context.applicationContext as? android.app.Application)
                    ?: (context as? android.app.Application)
                if (app != null) {
                    field.set(null, app)
                    Log.i(TAG, "[INIT] Injected Application context into com.dothantech.common.a.g")
                }
            } catch (t: Throwable) {
                Log.w(TAG, "[INIT] Reflection injection into com.dothantech.common.a: ${t.message}")
            }

            api = LPAPI.Factory.createInstance(lpapiCallback)

            // Also directly initialize DzPrinter singleton with explicit context
            try {
                val dz = com.dothantech.printer.DzPrinter.getInstance()
                dz.init(context.applicationContext, lpapiCallback)
                Log.i(TAG, "[INIT] DzPrinter.init called with explicit applicationContext")
            } catch (t: Throwable) {
                Log.w(TAG, "[INIT] DzPrinter.init call: ${t.message}")
            }

            apiInitialized.set(true)
            setState(State.IDLE)
            Log.i(TAG, "[INIT] LPAPI initialized successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "[INIT] Failed to initialize LPAPI", e)
            lastError = "JOSH_SDK_INIT_FAILED: ${e.message}"
            emitError("JOSH_SDK_INIT_FAILED", e.message ?: "Failed to initialize JOSH SDK")
            false
        }
    }

    /**
     * Full shutdown. Only call on application/module destruction.
     */
    fun destroy() {
        Log.i(TAG, "[DESTROY] Shutting down JoshPrinterManager")
        stopDiscovery()
        try {
            api?.quit()
        } catch (e: Exception) {
            Log.w(TAG, "[DESTROY] quit() threw", e)
        }
        api = null
        apiInitialized.set(false)
        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        setState(State.IDLE)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Discovery
    // ═══════════════════════════════════════════════════════════════════

    fun startDiscovery(): Boolean {
        val currentApi = api
        if (currentApi == null) {
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return false
        }

        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        if (btAdapter == null || !btAdapter.isEnabled) {
            Log.w(TAG, "[DISCOVERY_START] Bluetooth is off — skipping LPAPI discovery")
            return false
        }

        // Prevent duplicate discovery
        if (isDiscovering.get()) {
            Log.w(TAG, "[DISCOVERY_START] Already discovering — ignoring")
            return false
        }

        // Don't discover while connecting or printing
        val currentState = state.get()
        if (currentState == State.CONNECTING || currentState == State.PRINTING) {
            Log.w(TAG, "[DISCOVERY_START] Cannot scan in state=$currentState")
            emitError("JOSH_INVALID_STATE", "Cannot scan while $currentState")
            return false
        }

        discoveredPrinters.clear()
        isDiscovering.set(true)
        setState(State.SCANNING)
        Log.i(TAG, "[DISCOVERY_START] Starting printer discovery")

        currentApi.discovery()

        // Immediate query for bonded/paired LPAPI printers
        try {
            val pairedList = currentApi.getAllPrinterAddresses(null)
            if (pairedList != null) {
                for (addr in pairedList) {
                    handlePrinterDiscovered(addr)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[DISCOVERY] getAllPrinterAddresses threw", e)
        }

        // Auto-stop timer
        val timeout = Runnable {
            if (isDiscovering.get()) {
                Log.i(TAG, "[DISCOVERY_TIMEOUT] ${DISCOVERY_TIMEOUT_MS}ms elapsed — stopping")
                stopDiscovery()
            }
        }
        discoveryTimer = timeout
        mainHandler.postDelayed(timeout, DISCOVERY_TIMEOUT_MS)

        return true
    }

    fun stopDiscovery() {
        if (!isDiscovering.getAndSet(false)) return
        Log.i(TAG, "[DISCOVERY_STOP] Stopping discovery")
        try {
            api?.stopDiscovery()
        } catch (e: Exception) {
            Log.w(TAG, "[DISCOVERY_STOP] stopDiscovery() threw", e)
        }
        discoveryTimer?.let { mainHandler.removeCallbacks(it) }
        discoveryTimer = null

        if (state.get() == State.SCANNING) {
            setState(if (connectedPrinterAddress != null) State.CONNECTED else State.DISCONNECTED)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Connection
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Connect to a JOSH printer by its PrinterAddress (MAC).
     * Blocks the calling thread until Connected callback or timeout.
     *
     * @return true if connection succeeded, false on failure/timeout.
     */
    fun connect(macAddress: String, printerName: String?): Boolean {
        val currentApi = api
        if (currentApi == null) {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return false
        }

        // Prevent duplicate connections
        if (isConnecting.get()) {
            Log.w(TAG, "[CONNECT] Already connecting — ignoring duplicate")
            return false
        }

        // Pre-flight: Check Bluetooth adapter is enabled
        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        if (btAdapter == null || !btAdapter.isEnabled) {
            lastError = "JOSH_BT_DISABLED: Bluetooth is not enabled"
            emitError("JOSH_BT_DISABLED", "Bluetooth adapter is not enabled")
            return false
        }

        // Cancel any active Bluetooth discovery to avoid RFCOMM page collisions
        if (btAdapter.isDiscovering) {
            try { btAdapter.cancelDiscovery() } catch (_: Exception) {}
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
        }

        // Already connected to this device?
        val currentState = state.get()
        if ((currentState == State.CONNECTED) &&
            connectedMacAddress != null &&
            connectedMacAddress.equals(macAddress, ignoreCase = true)
        ) {
            Log.i(TAG, "[CONNECT] Already connected to $macAddress — no-op")
            return true
        }

        // Don't connect while printing
        if (currentState == State.PRINTING) {
            Log.w(TAG, "[CONNECT] Cannot connect during PRINTING")
            emitError("JOSH_INVALID_STATE", "Cannot connect while printing")
            return false
        }

        // Stop any running discovery
        stopDiscovery()

        isConnecting.set(true)
        setState(State.CONNECTING)
        lastError = null
        Log.i(TAG, "[JOSH-CONN-P1:IDENTIFY] Initiating JOSH connection: mac=$macAddress, name=$printerName")

        // ── PHASE 2: PREPARE — clean up any active SDK session ──
        // Only close if currently opened/connected. Closing when already idle queues a
        // spurious Disconnected callback that would interfere with the new connection attempt.
        if (currentApi.isPrinterOpened || currentState == State.CONNECTED) {
            try {
                currentApi.closePrinter()
                Log.i(TAG, "[JOSH-CONN-P2:PREPARE] closePrinter() called to clear previous session")
                try { Thread.sleep(300) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] closePrinter() threw (non-fatal)", e)
            }
        }

        // Check if printer is already connected via SDK
        val sdkState = currentApi.printerState
        if (currentApi.isPrinterOpened || sdkState?.group() == 2) {
            val currentName = currentApi.printerName
            Log.d(TAG, "[JOSH-CONN-P1:IDENTIFY] SDK reports already connected to: $currentName")
            if (connectedMacAddress != null && connectedMacAddress.equals(macAddress, ignoreCase = true)) {
                isConnecting.set(false)
                setState(State.CONNECTED)
                return true
            }
        }

        // Resolve PrinterAddress with validated friendly name (NEVER pass a MAC as shownName!)
        var printerAddress = discoveredPrinters[macAddress.uppercase()]
        if (printerAddress == null) {
            try {
                printerAddress = currentApi.getFirstPrinterAddress(macAddress)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] getFirstPrinterAddress threw", e)
            }
        }

        val remoteDevice = try {
            btAdapter.getRemoteDevice(macAddress)
        } catch (e: Exception) {
            null
        }

        if (printerAddress == null && remoteDevice != null) {
            try {
                printerAddress = com.dothantech.b.b.c(remoteDevice)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] BluetoothUtils.c threw", e)
            }
        }

        val resolvedName = when {
            !printerName.isNullOrBlank() && !printerName.contains(":") -> printerName
            remoteDevice?.name != null && !remoteDevice.name.isNullOrBlank() -> remoteDevice.name
            printerAddress?.shownName != null && !printerAddress.shownName.contains(":") -> printerAddress.shownName
            else -> "JOSH"
        }

        val resolvedType = when {
            printerAddress?.addressType != null -> printerAddress.addressType
            remoteDevice != null -> {
                try { com.dothantech.b.b.b(remoteDevice) } catch (_: Throwable) { AddressType.DUAL }
            }
            else -> AddressType.DUAL
        }

        val targetAddress = if (printerAddress == null) {
            PrinterAddress(resolvedName, macAddress, resolvedType)
        } else if (printerAddress.shownName.isNullOrBlank() || printerAddress.shownName.contains(":")) {
            PrinterAddress(resolvedName, macAddress, printerAddress.addressType ?: resolvedType)
        } else {
            printerAddress
        }
        Log.i(TAG, "[JOSH-CONN-P2:PREPARE] Target PrinterAddress: shownName=${targetAddress.shownName}, mac=${targetAddress.macAddress}, type=${targetAddress.addressType}")

        // ── PHASE 3: OPEN — attempt connection with retry ──
        for (attempt in 1..CONNECT_MAX_ATTEMPTS) {
            if (attempt > 1) {
                Log.i(TAG, "[JOSH-CONN-P3:RETRY] Attempt $attempt/$CONNECT_MAX_ATTEMPTS after ${CONNECT_RETRY_DELAY_MS}ms delay")
                try { Thread.sleep(CONNECT_RETRY_DELAY_MS) } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
                // Clean up before retry
                try { currentApi.closePrinter() } catch (_: Exception) {}
                try { Thread.sleep(300) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            }

            val latch = CountDownLatch(1)
            connectLatch = latch

            // Tier 1: Try openPrinterByAddress
            Log.i(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — submitting openPrinterByAddress to LPAPI...")
            var requestAccepted = try {
                currentApi.openPrinterByAddress(targetAddress)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinterByAddress threw", e)
                false
            }

            // Tier 2: Try openPrinter(BluetoothDevice)
            if (!requestAccepted && remoteDevice != null) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] openPrinterByAddress returned false; falling back to openPrinter(device)")
                requestAccepted = try {
                    currentApi.openPrinter(remoteDevice)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(device) threw", e)
                    false
                }
            }

            // Tier 3: Try openPrinter(String)
            if (!requestAccepted) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] falling back to openPrinter(name/mac)")
                requestAccepted = try {
                    currentApi.openPrinter(resolvedName) || currentApi.openPrinter(macAddress)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(string) threw", e)
                    false
                }
            }

            if (!requestAccepted) {
                Log.w(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — all openPrinter methods returned false")
                connectLatch = null
                if (attempt < CONNECT_MAX_ATTEMPTS) continue
                // Final attempt failed
                isConnecting.set(false)
                lastError = "JOSH_CONNECTION_FAILED: Connection request rejected"
                setState(State.DISCONNECTED)
                emitError("JOSH_CONNECTION_FAILED", "Printer rejected connection request")
                return false
            }

            Log.i(TAG, "[JOSH-CONN-P3:WAIT] Attempt $attempt — waiting for LPAPI Connected callback (timeout=${CONNECT_TIMEOUT_MS}ms)...")
            val connected = try {
                latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }

            connectLatch = null

            val isNowConnected = state.get() == State.CONNECTED || currentApi.isPrinterOpened || currentApi.printerState?.group() == 2
            if (isNowConnected) {
                // Success!
                isConnecting.set(false)
                setState(State.CONNECTED)
                if (connectedPrinterAddress == null) {
                    connectedPrinterAddress = targetAddress
                    connectedPrinterName = targetAddress.shownName ?: currentApi.printerName
                    connectedMacAddress = macAddress
                    lastConnectedAt.set(System.currentTimeMillis())
                }
                lastConnectedAddress = targetAddress
                Log.i(TAG, "[JOSH-CONN-P4:CONFIRMED] Connected to ${connectedPrinterName ?: macAddress} on attempt $attempt")
                listener?.onStateChanged(State.CONNECTED, mapOf(
                    "printerName" to (connectedPrinterName ?: targetAddress.shownName),
                    "macAddress" to macAddress,
                    "timestamp" to System.currentTimeMillis(),
                ))
                return true
            }

            Log.w(TAG, "[JOSH-CONN-P3:TIMEOUT] Attempt $attempt — no Connected callback within ${CONNECT_TIMEOUT_MS}ms")
            if (attempt < CONNECT_MAX_ATTEMPTS) {
                // Reset state for retry
                setState(State.CONNECTING)
            }
        }

        // All attempts exhausted
        isConnecting.set(false)
        Log.e(TAG, "[JOSH-CONN-P4:FAILED] All $CONNECT_MAX_ATTEMPTS connect attempts exhausted")
        lastError = "JOSH_CONNECTION_TIMEOUT: Printer did not respond after $CONNECT_MAX_ATTEMPTS attempts"
        setState(State.DISCONNECTED)
        emitError("JOSH_CONNECTION_TIMEOUT", "Printer did not respond after $CONNECT_MAX_ATTEMPTS attempts")
        return false
    }

    /**
     * Disconnect from the current printer.
     * Uses closePrinter() instead of quit() to preserve the LPAPI instance
     * for future connections. quit() is only called in destroy().
     */
    fun disconnect() {
        val currentState = state.get()
        if (currentState == State.DISCONNECTED || currentState == State.IDLE) {
            Log.d(TAG, "[DISCONNECT] Already disconnected")
            return
        }

        if (currentState == State.PRINTING) {
            Log.w(TAG, "[DISCONNECT] Warning: disconnecting during active print")
        }

        setState(State.DISCONNECTING)
        Log.i(TAG, "[DISCONNECT_START] Disconnecting from ${connectedPrinterName ?: connectedMacAddress}")

        stopDiscovery()
        try {
            // Use closePrinter() instead of quit() — this cleanly closes the
            // RFCOMM socket without destroying the LPAPI singleton. The instance
            // remains valid for future openPrinter calls.
            api?.closePrinter()
            Log.i(TAG, "[DISCONNECT] closePrinter() completed")
        } catch (e: Exception) {
            Log.w(TAG, "[DISCONNECT] closePrinter() threw", e)
        }

        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        isPrinting.set(false)
        isConnecting.set(false)
        setState(State.DISCONNECTED)
        Log.i(TAG, "[DISCONNECT_DONE] Disconnected")
    }

    /**
     * Attempt to reconnect to the last connected printer with backoff.
     * @return true if reconnection succeeded.
     */
    fun reconnect(): Boolean {
        val lastAddr = lastConnectedAddress ?: run {
            Log.w(TAG, "[RECONNECT] No last known address")
            return false
        }

        if (state.get() == State.CONNECTED) {
            Log.d(TAG, "[RECONNECT] Already connected")
            return true
        }

        setState(State.RECONNECTING)
        Log.i(TAG, "[RECONNECT_START] Attempting reconnect to ${lastAddr.shownName ?: lastAddr.macAddress}")

        for (attempt in 0 until MAX_RECONNECT_ATTEMPTS) {
            val delay = RECONNECT_DELAYS_MS[attempt.coerceAtMost(RECONNECT_DELAYS_MS.size - 1)]
            Log.i(TAG, "[RECONNECT] Attempt ${attempt + 1}/$MAX_RECONNECT_ATTEMPTS after ${delay}ms delay")

            try {
                Thread.sleep(delay)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            }

            val success = connect(lastAddr.macAddress, lastAddr.shownName)
            if (success) {
                Log.i(TAG, "[RECONNECT_SUCCESS] Reconnected on attempt ${attempt + 1}")
                return true
            }
        }

        Log.e(TAG, "[RECONNECT_FAILED] All $MAX_RECONNECT_ATTEMPTS attempts failed")
        lastError = "JOSH_RECONNECT_FAILED: Max retries exceeded"
        setState(State.ERROR)
        emitError("JOSH_RECONNECT_FAILED", "Could not reconnect after $MAX_RECONNECT_ATTEMPTS attempts")
        return false
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Print
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Print a PNG bitmap on the connected JOSH printer.
     *
     * @param pngBytes Raw PNG bytes (decoded from base64 by the caller).
     * @param widthMm Physical label width in mm.
     * @param heightMm Physical label height in mm.
     * Physical size is locked with LPAPI startJob(widthMm, heightMm) + drawBitmap in mm.
     * Bitmap pixels are never treated as 304 DPI TSPL dots (that prints ~1.5× too large).
     */
    fun printBitmap(
        pngBytes: ByteArray,
        widthMm: Double,
        heightMm: Double,
        dpi: Double = HARDWARE_DPI,
        copies: Int = 1,
        paramDensity: Int = -1,
        paramSpeed: Int = -1,
        direction: Int = 0,
        paramGapType: Int = GAP_TYPE_LABEL,
        paramGapLength: Int = 3,
        hOffsetMm: Double = 0.0,
        vOffsetMm: Double = 0.0,
        alignment: String = "left",
    ): Map<String, Any?>? {
        val currentApi = api ?: run {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return null
        }

        // ── Pre-flight checks ──────────────────────────────────────────

        // 1. Check state — must be CONNECTED
        val currentState = state.get()
        if (currentState != State.CONNECTED && currentState != State.PRINT_SUCCESS && currentState != State.PRINT_FAILED) {
            lastError = "JOSH_NOT_CONNECTED: State is $currentState"
            emitError("JOSH_NOT_CONNECTED", "Printer is not connected (state: $currentState)")
            return null
        }

        // 2. Check SDK state
        val sdkState = currentApi.printerState
        if (sdkState == null || sdkState == PrinterState.Disconnected) {
            lastError = "JOSH_NOT_CONNECTED: SDK reports disconnected"
            emitError("JOSH_NOT_CONNECTED", "LPAPI reports printer disconnected")
            return null
        }

        // 3. Acquire print lock (non-blocking check first)
        if (isPrinting.get()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Another print job is active")
            return null
        }

        // 4. Acquire lock
        if (!printLock.tryLock()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING: Lock contention"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Print lock is held by another job")
            return null
        }

        isPrinting.set(true)
        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.incrementAndGet())}"
        setState(State.PRINTING)
        Log.i(TAG, "[$jobId] [JOSH-PRINT-P1:PREFLIGHT] Start ${widthMm}x${heightMm}mm @${dpi}DPI copies=$copies")

        try {
            val t0 = System.currentTimeMillis()

            // ── Decode PNG ─────────────────────────────────────────────
            val decoded = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.size)
                ?: run {
                    lastError = "JOSH_INVALID_BITMAP: Could not decode PNG"
                    emitError("JOSH_INVALID_BITMAP", "Failed to decode PNG bitmap")
                    return null
                }
            val tDecode = System.currentTimeMillis()

            val hardwareDpi = if (dpi == 300.0) 300.0 else HARDWARE_DPI
            val dpm = if (hardwareDpi == 300.0) hardwareDpi / 25.4 else HARDWARE_DPM

            var working = decoded
            var finalWidthMm = widthMm
            var finalHeightMm = heightMm
            if (direction != 0) {
                val matrix = Matrix().apply { postRotate(direction.toFloat()) }
                val rotated = Bitmap.createBitmap(working, 0, 0, working.width, working.height, matrix, true)
                if (rotated !== working) {
                    working.recycle()
                    working = rotated
                }
                if (direction == 90 || direction == 270) {
                    finalWidthMm = heightMm
                    finalHeightMm = widthMm
                }
            }

            val targetW = Math.max(1, Math.round(finalWidthMm * dpm).toInt())
            val targetH = Math.max(1, Math.round(finalHeightMm * dpm).toInt())
            Log.i(
                TAG,
                "[$jobId] [JOSH-PRINT-P2:RASTERIZE] src=${working.width}x${working.height} page=${targetW}x${targetH}px " +
                    "${finalWidthMm}x${finalHeightMm}mm dpm=$dpm dpi=$hardwareDpi dir=$direction align=$alignment offset=${hOffsetMm}x${vOffsetMm}",
            )

            val bitmap = containFitToPage(working, targetW, targetH, alignment)
            if (working !== decoded && !working.isRecycled) working.recycle()
            if (!decoded.isRecycled) decoded.recycle()
            val tFit = System.currentTimeMillis()

            lastPrintSuccess = false
            val latch = CountDownLatch(1)
            printLatch = latch

            val gapTypeValue = if (paramGapType >= 0) paramGapType else GAP_TYPE_LABEL
            val gapLengthValue = if (paramGapLength >= 0) paramGapLength else 3
            try {
                currentApi.setPrintPageGapType(gapTypeValue)
                currentApi.setPrintPageGapLength(gapLengthValue)
            } catch (e: Exception) {
                Log.w(TAG, "[$jobId] [JOSH-PRINT-P2:GAP] setPrintPageGap* threw (non-fatal)", e)
            }

            val printParams = Bundle().apply {
                putInt(PrintParamName.GAP_TYPE, gapTypeValue)
                putInt(PrintParamName.GAP_LENGTH, gapLengthValue)
                if (paramDensity >= 0) putInt(PrintParamName.PRINT_DENSITY, paramDensity)
                if (paramSpeed >= 0) putInt(PrintParamName.PRINT_SPEED, paramSpeed)
                if (copies > 1) putInt(PrintParamName.PRINT_COPIES, copies)
            }

            val xMm = hOffsetMm
            val yMm = Math.max(0.0, vOffsetMm)

            // Strategy 1: millimetre page lock (official LPAPI demo). SIZE is mm, not pixels.
            var submitted = submitMmJob(currentApi, bitmap, finalWidthMm, finalHeightMm, xMm, yMm, printParams)
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 1 startJob(mm)+drawBitmap(mm) submitted=$submitted")

            // Strategy 2: same mm job without extra params (some models reject density opcodes).
            if (!submitted) {
                submitted = submitMmJob(currentApi, bitmap, finalWidthMm, finalHeightMm, xMm, yMm, null)
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 2 startJob(mm) no-params submitted=$submitted")
            }

            // Strategy 3: 1 pixel = 1 hardware dot at 203 DPI (50×30 → 400×240, not 600×360).
            if (!submitted) {
                submitted = try {
                    currentApi.printBitmap(bitmap, printParams)
                } catch (e: Exception) {
                    Log.w(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] printBitmap threw", e)
                    false
                }
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 3 printBitmap@${hardwareDpi}dpi submitted=$submitted")
            }

            if (!submitted) {
                submitted = try {
                    currentApi.printBitmap(bitmap, null)
                } catch (e: Exception) {
                    Log.w(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] printBitmap(null) threw", e)
                    false
                }
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 4 printBitmap(null) submitted=$submitted")
            }

            if (!submitted) {
                Log.e(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] PRINT_REJECTED all print strategies were rejected")
                printLatch = null
                lastError = "JOSH_PRINT_FAILED: Print request rejected by printer SDK"
                handlePrintFailed("Print request rejected by LPAPI SDK")
                return null
            }
            val tSubmit = System.currentTimeMillis()

            Log.i(TAG, "[$jobId] [JOSH-PRINT-P4:WAIT-HARDWARE] PRINT_SUBMITTED waiting for physical completion (timeout=${PRINT_TIMEOUT_MS}ms)")

            // ── Wait for completion callback ───────────────────────────
            val completed = try {
                latch.await(PRINT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            printLatch = null
            val tDone = System.currentTimeMillis()

            if (!completed) {
                Log.e(TAG, "[$jobId] PRINT_TIMEOUT No callback within ${PRINT_TIMEOUT_MS}ms")
                lastError = "JOSH_PRINT_TIMEOUT"
                setState(State.PRINT_FAILED)
                emitError("JOSH_PRINT_TIMEOUT", "Print timed out — printer may be unresponsive")
                emitPrintProgress(jobId, "TIMEOUT", mapOf("timeoutMs" to PRINT_TIMEOUT_MS))

                // Check connection after timeout
                val postState = currentApi.printerState
                if (postState == null || postState == PrinterState.Disconnected) {
                    Log.w(TAG, "[$jobId] Connection lost after timeout")
                    handleDisconnected()
                }
                return null
            }

            if (!lastPrintSuccess) {
                Log.e(TAG, "[$jobId] PRINT_FAILED callback received")
                return null
            }

            // Recycle bitmap
            if (!bitmap.isRecycled) bitmap.recycle()

            val result = mapOf<String, Any?>(
                "jobId" to jobId,
                "copies" to copies,
                "widthMm" to finalWidthMm,
                "heightMm" to finalHeightMm,
                "targetW" to targetW,
                "targetH" to targetH,
                "decodeMs" to (tDecode - t0),
                "fitMs" to (tFit - tDecode),
                "submitMs" to (tSubmit - tFit),
                "waitMs" to (tDone - tSubmit),
                "totalMs" to (tDone - t0),
            )
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P5:FINALIZE] Print complete in ${tDone - t0}ms $result")
            return result

        } catch (e: Exception) {
            Log.e(TAG, "[$jobId] PRINT_ERROR", e)
            lastError = "JOSH_PRINT_FAILED: ${e.message}"
            setState(State.PRINT_FAILED)
            emitError("JOSH_PRINT_FAILED", e.message ?: "Print failed")
            emitPrintProgress(jobId, "FAILED", mapOf("error" to (e.message ?: "Unknown")))
            return null
        } finally {
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Configuration
    // ═══════════════════════════════════════════════════════════════════

    fun configureParams(
        newDensity: Int? = null,
        newSpeed: Int? = null,
        newGapType: Int? = null,
        newGapLength: Int? = null,
    ) {
        val currentApi = api
        newDensity?.let {
            density = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintDarkness(it)
                Log.d(TAG, "[CONFIG] density=$it")
            }
        }
        newSpeed?.let {
            speed = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintSpeed(it)
                Log.d(TAG, "[CONFIG] speed=$it")
            }
        }
        newGapType?.let {
            gapType = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintPageGapType(it)
                Log.d(TAG, "[CONFIG] gapType=$it")
            }
        }
        newGapLength?.let {
            gapLength = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintPageGapLength(it)
                Log.d(TAG, "[CONFIG] gapLength=$it")
            }
        }
    }

    fun printTestText(text: String): Boolean {
        val currentApi = api ?: return false
        if (!isConnected()) return false

        if (!printLock.tryLock(5000, TimeUnit.MILLISECONDS)) {
            Log.w(TAG, "[JOSH-PRINT-P1:PREFLIGHT] Test print lock contention")
            return false
        }
        isPrinting.set(true)
        setState(State.PRINTING)

        return try {
            lastPrintSuccess = false
            val latch = CountDownLatch(1)
            printLatch = latch

            currentApi.abortJob()
            Log.i(TAG, "[JOSH-PRINT-P2:TEST-DRAW] Starting test job (50.0x30.0mm), text=\"$text\"")
            val started = currentApi.startJob(50.0, 30.0, 0)
            if (!started) {
                Log.w(TAG, "[JOSH-PRINT-P2:TEST-DRAW] startJob(50, 30, 0) returned false")
                return false
            }
            currentApi.setItemHorizontalAlignment(1) // Center
            currentApi.setItemVerticalAlignment(1)   // Center
            currentApi.drawTextRegular(text, 2.0, 2.0, 46.0, 26.0, 4.5, 1)
            val committed = currentApi.commitJob()
            Log.i(TAG, "[JOSH-PRINT-P3:TEST-SUBMIT] commitJob returned: $committed, awaiting physical hardware ACK")
            if (!committed) {
                return false
            }

            val completed = try {
                latch.await(15_000L, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            Log.i(TAG, "[JOSH-PRINT-P4:TEST-RESULT] Physical print result: completed=$completed, success=$lastPrintSuccess")
            completed && lastPrintSuccess
        } catch (e: Exception) {
            Log.e(TAG, "[JOSH-PRINT-P4:TEST-ERROR] Error during test print", e)
            false
        } finally {
            printLatch = null
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
            Log.i(TAG, "[JOSH-PRINT-P5:TEST-FINALIZE] State restored to ${state.get()}")
        }
    }

    private fun containFitToPage(
        src: Bitmap,
        pageW: Int,
        pageH: Int,
        alignment: String,
    ): Bitmap {
        val page = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(page)
        canvas.drawColor(Color.WHITE)
        if (src.width <= 0 || src.height <= 0) return page
        val scale = Math.min(pageW.toFloat() / src.width, pageH.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val left = if (alignment.equals("center", ignoreCase = true)) (pageW - dw) / 2f else 0f
        val top = if (alignment.equals("center", ignoreCase = true)) (pageH - dh) / 2f else 0f
        val paint = Paint().apply {
            isFilterBitmap = true
            isDither = true
            isAntiAlias = false
        }
        canvas.drawBitmap(src, null, RectF(left, top, left + dw, top + dh), paint)
        return page
    }

    private fun submitMmJob(
        api: LPAPI,
        bitmap: Bitmap,
        widthMm: Double,
        heightMm: Double,
        xMm: Double,
        yMm: Double,
        params: Bundle?,
    ): Boolean {
        return try {
            if (!api.startJob(widthMm, heightMm, 0)) {
                false
            } else {
                api.setItemHorizontalAlignment(0)
                api.setItemVerticalAlignment(0)
                api.drawBitmap(bitmap, xMm, yMm, widthMm, heightMm)
                if (params != null) {
                    api.commitJobWithParam(params)
                } else {
                    api.commitJob()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[JOSH-PRINT-P3:SUBMIT] startJob(mm)+drawBitmap(mm) threw", e)
            false
        }
    }

    /**
     * Check if a device name matches DothanTech SDK printer model formats.
     */
    fun isDeviceNameSupported(name: String?): Boolean {
        if (name.isNullOrBlank()) return false
        return try {
            com.dothantech.b.b.g(name)
        } catch (e: Throwable) {
            false
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  State Accessors
    // ═══════════════════════════════════════════════════════════════════

    fun getState(): State = state.get()

    fun isConnected(): Boolean {
        val currentApi = api ?: return false
        val isOpened = try {
            currentApi.isPrinterOpened
        } catch (e: Exception) {
            false
        }
        if (isOpened) {
            val s = state.get()
            if (s == State.DISCONNECTED || s == State.IDLE || s == State.PRINT_SUCCESS || s == State.PRINT_FAILED) {
                state.set(State.CONNECTED)
            }
            return true
        }
        return false
    }

    fun getStateSnapshot(): Map<String, Any?> {
        return mapOf(
            "state" to state.get().name,
            "isConnected" to isConnected(),
            "isPrinting" to isPrinting.get(),
            "isDiscovering" to isDiscovering.get(),
            "printerName" to connectedPrinterName,
            "macAddress" to connectedMacAddress,
            "lastError" to lastError,
            "lastConnectedAt" to lastConnectedAt.get(),
            "density" to density,
            "speed" to speed,
            "gapType" to gapType,
            "gapLength" to gapLength,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    //  LPAPI Callback Handlers (always called on main thread)
    // ═══════════════════════════════════════════════════════════════════

    private fun handleConnected(address: PrinterAddress?) {
        Log.i(TAG, "[CONNECTED] ${address?.shownName ?: address?.macAddress}")
        connectedPrinterAddress = address
        connectedPrinterName = address?.shownName ?: api?.printerName
        connectedMacAddress = address?.macAddress
        lastConnectedAt.set(System.currentTimeMillis())
        isConnecting.set(false)

        setState(State.CONNECTED)
        connectLatch?.countDown()

        listener?.onStateChanged(State.CONNECTED, mapOf(
            "printerName" to connectedPrinterName,
            "macAddress" to connectedMacAddress,
            "timestamp" to lastConnectedAt.get(),
        ))
    }

    private fun handleDisconnected() {
        Log.i(TAG, "[DISCONNECTED] Previous: ${connectedPrinterName ?: connectedMacAddress}, isConnecting=${isConnecting.get()}")
        val wasConnected = state.get() == State.CONNECTED ||
                state.get() == State.PRINTING ||
                state.get() == State.PRINT_SUCCESS ||
                state.get() == State.PRINT_FAILED

        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null

        // If actively connecting, DO NOT abort the connection attempt or count down the latch!
        // Transient Disconnected callbacks from a prior session or initial state must not fail the handshake.
        if (!isConnecting.get()) {
            setState(State.DISCONNECTED)
            listener?.onStateChanged(State.DISCONNECTED, mapOf(
                "wasConnected" to wasConnected,
                "timestamp" to System.currentTimeMillis(),
            ))
        }

        // Release print latch if waiting (print will fail)
        if (isPrinting.get()) {
            lastPrintSuccess = false
            printLatch?.countDown()
        }

        // Attempt auto-reconnect if unexpected disconnect while previously connected.
        // Guard: do NOT auto-reconnect if a manual connect() call is already in progress,
        // because the Disconnected callback may fire as part of the closePrinter() cleanup
        // that precedes every connect attempt.
        if (wasConnected && lastConnectedAddress != null && !isConnecting.get()) {
            Log.i(TAG, "[AUTO_RECONNECT] Unexpected disconnect — scheduling reconnect")
            // Don't block the main thread — run reconnect on a worker
            Thread({
                try {
                    Thread.sleep(500) // brief pause before reconnect
                    reconnect()
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                }
            }, "josh-reconnect").start()
        } else if (wasConnected && isConnecting.get()) {
            Log.d(TAG, "[AUTO_RECONNECT] Suppressed — manual connect in progress")
        }
    }

    private fun handlePrinterDiscovered(address: PrinterAddress) {
        val mac = address.macAddress ?: return
        val key = mac.uppercase()

        // Deduplicate by MAC
        if (discoveredPrinters.containsKey(key)) return

        val shownName = (address.shownName ?: "").trim()
        val lowerName = shownName.lowercase()

        // Filter: DO NOT claim devices that belong to TD-404, Tejas, Rudra, or SEZ printers!
        if (lowerName.contains("tejas") ||
            lowerName.contains("rudra") ||
            lowerName.contains("td-404") ||
            lowerName.contains("td404") ||
            lowerName.contains("sez")
        ) {
            Log.d(TAG, "[PRINTER_IGNORED_NON_JOSH] Ignoring classic printer in JOSH scan: $shownName ($mac)")
            return
        }

        // Only accept if verified by DothanTech SDK or matches known Josh/LPAPI name patterns
        val isDothanModel = isDeviceNameSupported(shownName)
        val isJoshName = lowerName.contains("josh") ||
            lowerName.contains("lpapi") ||
            lowerName.contains("dothan") ||
            lowerName.contains("dzprinter") ||
            lowerName.startsWith("ld08") ||
            lowerName.startsWith("lp08") ||
            lowerName.startsWith("lp12") ||
            lowerName.startsWith("dt-") ||
            lowerName.startsWith("dt_") ||
            lowerName.startsWith("dp-") ||
            lowerName.startsWith("dp_") ||
            lowerName.startsWith("jc")

        if (!isDothanModel && !isJoshName) {
            Log.d(TAG, "[PRINTER_IGNORED_UNKNOWN] Ignoring non-JOSH device: $shownName ($mac)")
            return
        }

        discoveredPrinters[key] = address

        Log.i(TAG, "[PRINTER_FOUND] name=${address.shownName} mac=$mac")

        val data = mapOf<String, Any?>(
            "id" to mac,
            "name" to (address.shownName ?: mac),
            "macAddress" to mac,
            "transport" to "josh-lpapi",
            "sdkId" to "josh",
            "bonded" to false,
        )
        listener?.onPrinterDiscovered(data)
    }

    private fun handlePrintSuccess() {
        Log.i(TAG, "[PRINT_SUCCESS]")
        lastPrintSuccess = true
        setState(State.PRINT_SUCCESS)
        printLatch?.countDown()

        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.get())}"
        emitPrintProgress(jobId, "SUCCESS", emptyMap())
    }

    private fun handlePrintFailed(reason: String) {
        Log.e(TAG, "[PRINT_FAILED] $reason")
        lastPrintSuccess = false
        lastError = "JOSH_PRINT_FAILED: $reason"
        setState(State.PRINT_FAILED)
        printLatch?.countDown()

        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.get())}"
        emitPrintProgress(jobId, "FAILED", mapOf("reason" to reason))
        emitError("JOSH_PRINT_FAILED", reason)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  State + Event Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun setState(newState: State) {
        val old = state.getAndSet(newState)
        if (old != newState) {
            Log.d(TAG, "[STATE] $old → $newState")
        }
    }

    private fun emitError(code: String, message: String) {
        listener?.onError(code, message)
    }

    private fun emitPrintProgress(jobId: String, progress: String, data: Map<String, Any?>) {
        listener?.onPrintProgress(jobId, progress, data)
    }
}
