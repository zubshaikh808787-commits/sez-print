package expo.modules.tejprinter

import android.annotation.SuppressLint
import android.app.Application
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.print.base.bean.DeviceItem
import com.print.base.bean.ImgData
import com.print.base.bean.PrinterConstantPool
import com.print.base.bean.TaskCallBean
import com.print.base.listen.ConnectListener
import com.print.base.listen.ScanListener
import com.print.base.listen.TaskCallback
import com.print.base.utils.SDKUtils
import com.print.myprinter.ScannerBase
import com.print.printer.Command
import com.print.printer.PrintImgHelper
import com.print.printer.Printer
import com.print.printer.PrinterManage
import java.util.Timer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.fixedRateTimer

/**
 * Hardened native lifecycle and print engine manager for the Tej printer (com.yx.print:PrintSDK).
 *
 * Provides:
 *  - Explicit connection state machine
 *  - Serialized command execution (single-thread executor)
 *  - Auto-reconnect with capped exponential backoff on unexpected disconnects
 *  - Bluetooth adapter state awareness (ACTION_STATE_CHANGED)
 *  - Periodic idle liveness heartbeat (Command.get_status())
 *  - Pre-print status validation (cover open, out of paper, overheated)
 *  - Multi-copy builder print pipeline driven by ACK detection (0x4F 0x4B / 0xAA)
 *  - Structured error reporting
 */
class TejPrinterManager(private val context: Context) {

    companion object {
        private const val TAG = "TejPrinter"
        const val DEFAULT_SDK_KEY = "d2fnGqzf2Rs="
        const val DEFAULT_MODEL_KEY = "Z212"
        private const val LIVENESS_INTERVAL_MS = 20_000L
        private const val CONNECT_TIMEOUT_MS = 15_000L
        private const val STATUS_CHECK_TIMEOUT_MS = 6_000L
        private const val PRINT_COPY_TIMEOUT_MS = 30_000L
        private val RECONNECT_DELAYS_MS = longArrayOf(0, 1000, 3000, 5000, 8000)
        private const val MAX_RECONNECT_ATTEMPTS = 4
    }

    enum class State {
        DISCONNECTED,
        SCANNING,
        CONNECTING,
        CONNECTED,
        PRINTING,
        RECONNECTING,
        ERROR
    }

    data class TejStatus(
        val isOk: Boolean,
        val isPrinting: Boolean,
        val isCoverOpen: Boolean,
        val isOutOfPaper: Boolean,
        val isLowBattery: Boolean,
        val isOverheated: Boolean,
        val rawCode: Int,
        val rawHex: String
    )

    interface EventListener {
        fun onStateChanged(state: State, data: Map<String, Any?>)
        fun onDeviceDiscovered(device: Map<String, Any?>)
        fun onScanFinished()
        fun onPrintProgress(current: Int, total: Int)
        fun onError(code: String, message: String)
    }

    @Volatile
    var listener: EventListener? = null

    private val currentState = AtomicReference(State.DISCONNECTED)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val commandExecutor = Executors.newSingleThreadExecutor()

    private var sdkInitialized = false
    private var activeSdkKey: String = DEFAULT_SDK_KEY

    // Vendor SDK components
    private var printer: Printer? = null
    private var scanner: ScannerBase? = null

    // Connection tracking
    private var userInitiatedDisconnect = false
    private var currentDevice: DeviceItem? = null
    private var lastConnectedDevice: DeviceItem? = null
    private var reconnectAttempt = 0
    private var reconnectRunnable: Runnable? = null
    private var livenessTimer: Timer? = null

    // Discovery tracking
    private val isScanning = AtomicBoolean(false)
    private val isPrinting = AtomicBoolean(false)
    private val discoveredDevices = ConcurrentHashMap<String, DeviceItem>()

    // Bluetooth broadcast receiver
    private var btReceiverRegistered = false
    private val btStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
            if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                val btState = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                if (btState == BluetoothAdapter.STATE_OFF || btState == BluetoothAdapter.STATE_TURNING_OFF) {
                    Log.w(TAG, "[BT_STATE] Bluetooth adapter turned off mid-session")
                    stopLivenessCheck()
                    cancelReconnect()
                    transitionState(State.DISCONNECTED, mapOf("reason" to "BLUETOOTH_DISABLED"))
                    listener?.onError("BLUETOOTH_DISABLED", "Bluetooth adapter was turned off.")
                }
            }
        }
    }

    val state: State get() = currentState.get()
    fun isConnected(): Boolean = currentState.get() == State.CONNECTED && (printer?.isConnect() == true)

    // ─── Lifecycle & Initialization ─────────────────────────────────────

    @Synchronized
    fun initialize(customKey: String? = null): Boolean {
        if (sdkInitialized && printer != null) return true
        try {
            val app = context.applicationContext as? Application
            if (app == null) {
                Log.e(TAG, "Cannot initialize SDK without Application context")
                return false
            }

            activeSdkKey = if (!customKey.isNullOrBlank()) customKey else DEFAULT_SDK_KEY
            SDKUtils.init(app, activeSdkKey)
            Log.i(TAG, "SDKUtils initialized with key: ${activeSdkKey.take(4)}***")

            val manage = PrinterManage.getInstance()
            printer = manage.getPrinter(PrinterConstantPool.SocketType.SPP)
            scanner = manage.getScanner(1) // 1 = Bluetooth scanner

            registerBtReceiver()
            setupPrinterListeners()
            sdkInitialized = true
            return true
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to initialize Tej printer SDK", e)
            return false
        }
    }

    private fun registerBtReceiver() {
        if (btReceiverRegistered) return
        try {
            val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
            context.registerReceiver(btStateReceiver, filter)
            btReceiverRegistered = true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to register Bluetooth state receiver: ${e.message}")
        }
    }

    private fun unregisterBtReceiver() {
        if (!btReceiverRegistered) return
        try {
            context.unregisterReceiver(btStateReceiver)
            btReceiverRegistered = false
        } catch (e: Exception) {
            // ignore
        }
    }

    @Synchronized
    fun destroy() {
        Log.i(TAG, "Destroying TejPrinterManager resources")
        userInitiatedDisconnect = true
        stopLivenessCheck()
        cancelReconnect()
        stopScan()
        unregisterBtReceiver()

        commandExecutor.execute {
            try {
                printer?.disconnect()
                printer?.release()
                scanner?.release()
            } catch (e: Throwable) {
                Log.w(TAG, "Error releasing printer/scanner: ${e.message}")
            }
        }
        commandExecutor.shutdown()
        currentState.set(State.DISCONNECTED)
    }

    // ─── Model Key Resolution ───────────────────────────────────────────

    /**
     * Resolves the SDK modelKey from the Bluetooth device name.
     *
     * The YX PrintSDK uses modelKey to select internal command tables, checksum/protocol
     * quirks, and gap/black-mark sensor calibration profiles. A wrong modelKey causes
     * calibration failures and "different type of printer" errors.
     *
     * See TEZ_PRINTER_CALIBRATION_FIX.md §2.1 / §3.1 for full context.
     */
    fun resolveModelKey(deviceName: String?): String {
        if (deviceName == null) {
            Log.w(TAG, "[MODEL_KEY] Device name is null, defaulting to '$DEFAULT_MODEL_KEY'")
            return DEFAULT_MODEL_KEY
        }
        val upper = deviceName.trim().uppercase()
        val resolved = when {
            // TP3 / Z431 family
            upper.contains("TP3") || upper.contains("Z431") -> "TP3Z431"
            // GE920 family (TestActivity in vendor demo uses this key for GE920-named devices)
            upper.contains("GE920") -> "GE920"
            // 380-prefix family (vendor demo hides/shows paper-size inputs based on this)
            upper.startsWith("380") -> "Z212" // TODO: confirm correct key for 380-family with vendor
            // YC3121 family (referenced in vendor UpdateActivity for firmware updates)
            upper.contains("YC3121") -> "Z212" // TODO: confirm correct key with vendor
            // Y50 / Z212 / Tej / YX — the default hardware family
            upper.contains("Y50") || upper.contains("Z212") || upper.contains("TEJ") -> "Z212"
            upper.startsWith("YX") -> "Z212"
            // Fallback
            else -> DEFAULT_MODEL_KEY
        }
        Log.i(TAG, "[MODEL_KEY] Resolved modelKey='$resolved' for device='$deviceName' (uppercase='$upper')")
        return resolved
    }

    // ─── State Management ───────────────────────────────────────────────

    private fun transitionState(newState: State, extraData: Map<String, Any?> = emptyMap()) {
        val oldState = currentState.getAndSet(newState)
        if (oldState != newState) {
            Log.i(TAG, "State transition: $oldState -> $newState")
            mainHandler.post {
                val data = HashMap(extraData)
                data["state"] = newState.name
                data["isConnected"] = (newState == State.CONNECTED)
                data["deviceAddress"] = currentDevice?.address
                data["deviceName"] = currentDevice?.name
                listener?.onStateChanged(newState, data)
            }
        }
    }

    // ─── Scanning / Discovery ───────────────────────────────────────────

    fun startScan(timeoutMs: Long = 10_000L): Boolean {
        if (!initialize()) return false
        if (isScanning.getAndSet(true)) {
            Log.d(TAG, "Scan already in progress")
            return true
        }

        discoveredDevices.clear()
        transitionState(State.SCANNING)

        scanner?.setListener(object : ScanListener {
            override fun onStart() {
                Log.i(TAG, "Tej scanner started")
            }

            override fun onFound(item: DeviceItem?) {
                if (item == null || item.address.isNullOrBlank()) return
                val addr = item.address.trim().uppercase()
                if (discoveredDevices.containsKey(addr)) return

                item.address = addr
                item.modelKey = resolveModelKey(item.name)
                Log.d(TAG, "[SCAN_FOUND] device='${item.name}' addr=$addr -> modelKey='${item.modelKey}'")
                discoveredDevices[addr] = item

                val devMap = mapOf(
                    "id" to addr,
                    "address" to addr,
                    "name" to (item.name ?: "Tej Printer"),
                    "modelKey" to item.modelKey,
                    "transport" to "bluetooth-spp",
                    "sdkId" to "tej"
                )
                mainHandler.post {
                    listener?.onDeviceDiscovered(devMap)
                }
            }

            override fun onFinished() {
                Log.i(TAG, "Tej scanner finished")
                finishScan()
            }

            override fun onFailed(msg: String?) {
                Log.w(TAG, "Tej scanner failed: $msg")
                finishScan()
                listener?.onError("SCAN_FAILED", msg ?: "Tej scanner failed")
            }
        })

        scanner?.scan()

        mainHandler.postDelayed({
            if (isScanning.get()) {
                stopScan()
            }
        }, timeoutMs)

        return true
    }

    fun stopScan() {
        if (isScanning.getAndSet(false)) {
            try {
                scanner?.stopScan()
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping scanner: ${e.message}")
            }
            finishScan()
        }
    }

    private fun finishScan() {
        isScanning.set(false)
        if (currentState.get() == State.SCANNING) {
            transitionState(if (isConnected()) State.CONNECTED else State.DISCONNECTED)
        }
        mainHandler.post {
            listener?.onScanFinished()
        }
    }

    @SuppressLint("MissingPermission")
    fun getBondedDevices(): List<Map<String, Any?>> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        val bonded = adapter.bondedDevices ?: return emptyList()
        return bonded.map { dev ->
            val addr = dev.address.uppercase()
            val name = dev.name ?: "Tej Printer"
            mapOf(
                "id" to addr,
                "address" to addr,
                "name" to name,
                "modelKey" to resolveModelKey(name),
                "transport" to "bluetooth-spp",
                "sdkId" to "tej",
                "bonded" to true
            )
        }
    }

    // ─── Connection Lifecycle ───────────────────────────────────────────

    private fun setupPrinterListeners() {
        val p = printer ?: return
        p.setListener(object : ConnectListener {
            override fun onConneted() {
                Log.i(TAG, "[CONNECT_CALLBACK] onConneted() fired successfully")
                reconnectAttempt = 0
                lastConnectedDevice = currentDevice
                transitionState(State.CONNECTED)
                startLivenessCheck()
            }

            override fun onConnetFailed(errMsg: String?) {
                Log.w(TAG, "[CONNECT_CALLBACK] onConnetFailed(): $errMsg")
                stopLivenessCheck()
                val code = if (errMsg?.contains("timeout", ignoreCase = true) == true) "CONNECT_TIMEOUT" else "CONNECT_FAILED"
                transitionState(State.DISCONNECTED, mapOf("error" to (errMsg ?: "Connection failed")))
                listener?.onError(code, errMsg ?: "Failed to connect to Tej printer")
            }

            override fun closed() {
                Log.w(TAG, "[CONNECT_CALLBACK] closed() fired (userInitiated=$userInitiatedDisconnect)")
                stopLivenessCheck()
                if (userInitiatedDisconnect) {
                    transitionState(State.DISCONNECTED)
                } else {
                    handleUnexpectedDisconnect()
                }
            }
        })
    }

    fun connect(
        macAddress: String,
        deviceName: String? = null,
        modelKey: String? = null,
        onResult: (Result<Unit>) -> Unit
    ) {
        if (!initialize()) {
            onResult(Result.failure(Exception("Failed to initialize Tej printer SDK")))
            return
        }

        userInitiatedDisconnect = false
        stopScan()
        cancelReconnect()

        val resolvedModelKey = if (!modelKey.isNullOrBlank()) modelKey else resolveModelKey(deviceName)
        Log.i(TAG, "[CONNECT] addr=$macAddress name='$deviceName' requestedModelKey='$modelKey' -> resolvedModelKey='$resolvedModelKey'")
        val item = DeviceItem.build(macAddress.trim().uppercase())
        item.name = deviceName ?: "Tej Printer"
        item.modelKey = resolvedModelKey
        currentDevice = item

        transitionState(State.CONNECTING)

        commandExecutor.execute {
            val latch = CountDownLatch(1)
            var connectSuccess = false
            var connectError: String? = null

            // Intercept connect result via custom listener wrapping setupPrinterListeners
            val originalPrinter = printer
            if (originalPrinter == null) {
                mainHandler.post {
                    transitionState(State.DISCONNECTED)
                    onResult(Result.failure(Exception("Printer instance is null")))
                }
                return@execute
            }

            originalPrinter.setListener(object : ConnectListener {
                override fun onConneted() {
                    connectSuccess = true
                    reconnectAttempt = 0
                    lastConnectedDevice = currentDevice
                    transitionState(State.CONNECTED)
                    startLivenessCheck()
                    latch.countDown()
                }

                override fun onConnetFailed(errMsg: String?) {
                    connectSuccess = false
                    connectError = errMsg ?: "Connection failed"
                    stopLivenessCheck()
                    transitionState(State.DISCONNECTED, mapOf("error" to connectError))
                    latch.countDown()
                }

                override fun closed() {
                    stopLivenessCheck()
                    if (userInitiatedDisconnect) {
                        transitionState(State.DISCONNECTED)
                    } else {
                        handleUnexpectedDisconnect()
                    }
                    if (latch.count > 0) {
                        connectSuccess = false
                        connectError = "Connection socket closed during handshake"
                        latch.countDown()
                    }
                }
            })

            try {
                Log.i(TAG, "Submitting printer.connect(item: ${item.address}, model: ${item.modelKey})")
                originalPrinter.connect(item)

                val finished = latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                mainHandler.post {
                    if (!finished) {
                        Log.e(TAG, "Connection handshake timed out after ${CONNECT_TIMEOUT_MS}ms")
                        originalPrinter.disconnect()
                        transitionState(State.DISCONNECTED)
                        listener?.onError("CONNECT_TIMEOUT", "Connection to Tej printer timed out.")
                        onResult(Result.failure(Exception("CONNECT_TIMEOUT: Connection timed out")))
                    } else if (connectSuccess) {
                        onResult(Result.success(Unit))
                    } else {
                        listener?.onError("CONNECT_FAILED", connectError ?: "Connect failed")
                        onResult(Result.failure(Exception("CONNECT_FAILED: $connectError")))
                    }
                }
            } catch (e: Throwable) {
                Log.e(TAG, "Exception during printer.connect", e)
                mainHandler.post {
                    transitionState(State.DISCONNECTED)
                    listener?.onError("CONNECT_FAILED", e.message ?: "Connect exception")
                    onResult(Result.failure(e))
                }
            }
        }
    }

    fun disconnect(onResult: (() -> Unit)? = null) {
        userInitiatedDisconnect = true
        stopLivenessCheck()
        cancelReconnect()

        commandExecutor.execute {
            try {
                printer?.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Error disconnecting printer: ${e.message}")
            } finally {
                mainHandler.post {
                    transitionState(State.DISCONNECTED)
                    onResult?.invoke()
                }
            }
        }
    }

    private fun handleUnexpectedDisconnect() {
        if (userInitiatedDisconnect) return
        val target = currentDevice ?: lastConnectedDevice
        if (target == null || reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "Unexpected disconnect — max retries reached ($reconnectAttempt). Giving up.")
            transitionState(State.DISCONNECTED, mapOf("reason" to "CONNECTION_LOST"))
            listener?.onError("CONNECTION_LOST", "Printer connection was lost.")
            return
        }

        transitionState(State.RECONNECTING, mapOf("attempt" to (reconnectAttempt + 1)))
        val delay = RECONNECT_DELAYS_MS.getOrElse(reconnectAttempt) { RECONNECT_DELAYS_MS.last() }
        reconnectAttempt++
        Log.i(TAG, "Scheduling auto-reconnect attempt #$reconnectAttempt in ${delay}ms")

        val runnable = Runnable {
            if (currentState.get() == State.RECONNECTING && !userInitiatedDisconnect) {
                Log.i(TAG, "Executing auto-reconnect to ${target.address} (attempt #$reconnectAttempt)")
                connect(target.address, target.name, target.modelKey) { result ->
                    result.onFailure {
                        if (!userInitiatedDisconnect && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
                            handleUnexpectedDisconnect()
                        } else {
                            transitionState(State.DISCONNECTED, mapOf("reason" to "RECONNECT_FAILED"))
                            listener?.onError("CONNECTION_LOST", "Failed to restore printer connection.")
                        }
                    }
                }
            }
        }
        reconnectRunnable = runnable
        mainHandler.postDelayed(runnable, delay)
    }

    private fun cancelReconnect() {
        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        reconnectRunnable = null
        reconnectAttempt = 0
    }

    // ─── Liveness Check ──────────────────────────────────────────────────

    private fun startLivenessCheck() {
        stopLivenessCheck()
        livenessTimer = fixedRateTimer(name = "tej-liveness", initialDelay = LIVENESS_INTERVAL_MS, period = LIVENESS_INTERVAL_MS) {
            if (currentState.get() == State.CONNECTED) {
                commandExecutor.execute {
                    val p = printer
                    if (p != null && p.isConnect) {
                        try {
                            p.addTask(Command.get_status(), "liveness", false, null)
                        } catch (e: Exception) {
                            Log.w(TAG, "Liveness status probe failed: ${e.message}")
                        }
                    }
                }
            }
        }
    }

    private fun stopLivenessCheck() {
        livenessTimer?.cancel()
        livenessTimer = null
    }

    // ─── Status & Health Check ───────────────────────────────────────────

    fun getStatus(onResult: (Result<TejStatus>) -> Unit) {
        if (!isConnected()) {
            onResult(Result.failure(Exception("NOT_CONNECTED: Printer is not connected")))
            return
        }

        commandExecutor.execute {
            val p = printer
            if (p == null || !p.isConnect) {
                mainHandler.post { onResult(Result.failure(Exception("NOT_CONNECTED"))) }
                return@execute
            }

            val latch = CountDownLatch(1)
            var resultStatus: TejStatus? = null
            var errorMsg: String? = null

            val callback = object : TaskCallback() {
                override fun sendStatus(bean: TaskCallBean?) {
                    if (bean?.status != PrinterConstantPool.Status.OK) {
                        errorMsg = bean?.msg ?: "Failed to query status"
                        latch.countDown()
                    }
                }

                override fun readCall(bean: TaskCallBean?) {
                    val data = bean?.data
                    if (data != null && data.isNotEmpty()) {
                        resultStatus = parseStatusBytes(data)
                    } else {
                        errorMsg = "Empty status response"
                    }
                    latch.countDown()
                }

                override fun timeOut(): Int = STATUS_CHECK_TIMEOUT_MS.toInt()
            }

            try {
                p.addTask(Command.get_status(), "status", false, callback)
                val finished = latch.await(STATUS_CHECK_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                mainHandler.post {
                    if (!finished) {
                        onResult(Result.failure(Exception("STATUS_TIMEOUT: Status query timed out")))
                    } else if (resultStatus != null) {
                        onResult(Result.success(resultStatus!!))
                    } else {
                        onResult(Result.failure(Exception("STATUS_FAILED: ${errorMsg ?: "Unknown error"}")))
                    }
                }
            } catch (e: Throwable) {
                mainHandler.post { onResult(Result.failure(e)) }
            }
        }
    }

    private fun parseStatusBytes(data: ByteArray?): TejStatus {
        if (data == null || data.isEmpty()) {
            return TejStatus(isOk = false, isPrinting = false, isCoverOpen = false, isOutOfPaper = false, isLowBattery = false, isOverheated = false, rawCode = -99, rawHex = "")
        }
        val first = data[0].toInt() and 0xFF
        val hex = String.format("0x%02X", first)

        val isCoverOpen = (first and 0x02) == 0x02
        val isOutOfPaper = (first and 0x04) == 0x04
        val isLowBattery = (first and 0x08) == 0x08
        val isOverheated = (first and 0x10) == 0x10
        val isPrinting = (first and 0x01) == 0x01
        val isOk = (first == 0x00) || isPrinting || isLowBattery

        return TejStatus(
            isOk = isOk && !isCoverOpen && !isOutOfPaper && !isOverheated,
            isPrinting = isPrinting,
            isCoverOpen = isCoverOpen,
            isOutOfPaper = isOutOfPaper,
            isLowBattery = isLowBattery,
            isOverheated = isOverheated,
            rawCode = first,
            rawHex = hex
        )
    }

    fun setDensity(densityLevel: Int, onResult: ((Result<Unit>) -> Unit)? = null) {
        val bounded = densityLevel.coerceIn(1, 15)
        commandExecutor.execute {
            val p = printer
            if (p != null && p.isConnect) {
                p.addTask(Command.set_Density(bounded), "density", false, null)
                mainHandler.post { onResult?.invoke(Result.success(Unit)) }
            } else {
                mainHandler.post { onResult?.invoke(Result.failure(Exception("NOT_CONNECTED"))) }
            }
        }
    }

    // ─── Image Printing Pipeline ─────────────────────────────────────────

    fun printImage(
        base64Png: String,
        copies: Int = 1,
        paperType: Int = PrinterConstantPool.PaperType.GAP,
        dpi: Int = 8, // 8 dots/mm = 203 DPI
        density: Int? = null,
        widthMm: Int? = null,
        heightMm: Int? = null,
        onResult: (Result<Unit>) -> Unit
    ) {
        if (!isConnected()) {
            onResult(Result.failure(Exception("NOT_CONNECTED: Printer is not connected")))
            return
        }

        // Phase 4 fix: Re-entrancy guard — reject overlapping print calls
        if (!isPrinting.compareAndSet(false, true)) {
            Log.w(TAG, "[PRINT_GUARD] Rejected overlapping printImage() call — a job is already in progress")
            onResult(Result.failure(Exception("PRINT_IN_PROGRESS: A print job is already in progress")))
            return
        }

        val totalCopies = copies.coerceAtLeast(1)
        Log.i(TAG, "[PRINT_JOB] Starting print: copies=$totalCopies paperType=$paperType dpi=$dpi density=$density widthMm=$widthMm heightMm=$heightMm")

        commandExecutor.execute {
            val p = printer
            if (p == null || !p.isConnect) {
                isPrinting.set(false)
                mainHandler.post { onResult(Result.failure(Exception("NOT_CONNECTED"))) }
                return@execute
            }

            // Step 1: Pre-print status check
            Log.i(TAG, "[PRINT_STEP 1] Checking printer health before job dispatch...")
            val preCheckLatch = CountDownLatch(1)
            var preCheckStatus: TejStatus? = null

            p.addTask(Command.get_status(), "pre-check", false, object : TaskCallback() {
                override fun sendStatus(bean: TaskCallBean?) {
                    if (bean?.status != PrinterConstantPool.Status.OK) {
                        preCheckLatch.countDown()
                    }
                }
                override fun readCall(bean: TaskCallBean?) {
                    bean?.data?.let { preCheckStatus = parseStatusBytes(it) }
                    preCheckLatch.countDown()
                }
                override fun timeOut(): Int = 4000
            })

            preCheckLatch.await(4000, TimeUnit.MILLISECONDS)
            preCheckStatus?.let { st ->
                if (st.isCoverOpen) {
                    isPrinting.set(false)
                    mainHandler.post {
                        listener?.onError("COVER_OPEN", "Printer cover is open.")
                        onResult(Result.failure(Exception("COVER_OPEN: Printer cover is open")))
                    }
                    return@execute
                }
                if (st.isOutOfPaper) {
                    isPrinting.set(false)
                    mainHandler.post {
                        listener?.onError("OUT_OF_PAPER", "Printer is out of paper.")
                        onResult(Result.failure(Exception("OUT_OF_PAPER: Printer is out of paper")))
                    }
                    return@execute
                }
                if (st.isOverheated) {
                    isPrinting.set(false)
                    mainHandler.post {
                        listener?.onError("OVERHEATED", "Print head is overheated.")
                        onResult(Result.failure(Exception("OVERHEATED: Print head is overheated")))
                    }
                    return@execute
                }
                if (st.isLowBattery) {
                    Log.w(TAG, "[PRINT_STEP 1] Low battery detected, proceeding with warning")
                }
            }

            // Step 2: Set print density if requested
            if (density != null) {
                p.addTask(Command.set_Density(density.coerceIn(1, 15)), false)
            }

            // Step 3: Decode Base64 PNG to Bitmap
            Log.i(TAG, "[PRINT_STEP 2] Decoding image bitmap...")
            val bitmap = try {
                val cleanB64 = if (base64Png.contains(",")) base64Png.substringAfter(",") else base64Png
                val bytes = Base64.decode(cleanB64, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to decode base64 PNG", e)
                isPrinting.set(false)
                mainHandler.post { onResult(Result.failure(Exception("DECODE_FAILED: ${e.message}"))) }
                return@execute
            }

            if (bitmap == null) {
                isPrinting.set(false)
                mainHandler.post { onResult(Result.failure(Exception("DECODE_FAILED: Null bitmap"))) }
                return@execute
            }

            transitionState(State.PRINTING)

            // Step 4: Cache image in SDK helper
            // Phase 4 fix: always stop+clear before setting up new job to prevent leftover imgNames
            val helper = p.helper
            helper.stopPrint()

            val imgName = "tej_page_0"
            val imgList = listOf(ImgData(imgName, bitmap))
            val cacheDpi = if (dpi <= 12) 128 else dpi
            helper.setImgDatas(cacheDpi, imgList)

            // Phase 3 fix: Only GAP and BLACK should trigger gap/mark sensing.
            // TATTOO and CONTINUOUS both use the simple fixed-feed path.
            // See TEZ_PRINTER_CALIBRATION_FIX.md §2.3 / §3.3
            val isGap = (paperType == PrinterConstantPool.PaperType.GAP
                      || paperType == PrinterConstantPool.PaperType.BLACK)
            Log.i(TAG, "[PRINT_STEP 3] isGap=$isGap (paperType=$paperType, GAP=${PrinterConstantPool.PaperType.GAP}, BLACK=${PrinterConstantPool.PaperType.BLACK})")

            val printCompletedLatch = CountDownLatch(1)
            val currentPrintedIndex = AtomicInteger(0)
            var printJobFailed = false
            var printFailureReason: String? = null

            // Step 5: ACK detection & multi-copy driver
            lateinit var dispatchCopy: (Int) -> Unit

            val copyCallback = object : TaskCallback() {
                override fun sendStatus(bean: TaskCallBean?) {
                    if (bean?.status != PrinterConstantPool.Status.OK) {
                        Log.e(TAG, "Send status error: ${bean?.msg}")
                        printJobFailed = true
                        printFailureReason = "PRINT_FAILED: ${bean?.msg ?: "Send data failed"}"
                        helper.stopPrint()
                        printCompletedLatch.countDown()
                    }
                }

                override fun readCall(bean: TaskCallBean?) {
                    if (bean?.type != PrinterConstantPool.Command.PRINT_IMG) return
                    val data = bean.data

                    if (bean.status == PrinterConstantPool.Status.TIMEOUT) {
                        Log.e(TAG, "Print copy timed out")
                        printJobFailed = true
                        printFailureReason = "PRINT_TIMEOUT: Print operation timed out"
                        helper.stopPrint()
                        printCompletedLatch.countDown()
                        return
                    }

                    if (data == null) return

                    // Check for ACK: 0x4F 0x4B ("OK") for label paper, 0xAA for continuous
                    var hasAck = false
                    if (paperType == PrinterConstantPool.PaperType.CONTINUOUS) {
                        if ((data.size == 1 && data[0] == 0xAA.toByte()) ||
                            (data.size >= 3 && data[2] == 0xAA.toByte())) {
                            hasAck = true
                        }
                    } else {
                        for (i in 0 until (data.size - 1)) {
                            if (data[i] == 0x4F.toByte() && data[i + 1] == 0x4B.toByte()) {
                                hasAck = true
                                break
                            }
                        }
                    }

                    if (hasAck) {
                        val finishedIndex = currentPrintedIndex.incrementAndGet()
                        Log.i(TAG, "ACK received for copy #$finishedIndex / $totalCopies")
                        mainHandler.post {
                            listener?.onPrintProgress(finishedIndex, totalCopies)
                        }

                        if (finishedIndex < totalCopies && p.isConnect) {
                            dispatchCopy(finishedIndex + 1)
                        } else {
                            Log.i(TAG, "All $totalCopies copies successfully printed")
                            printCompletedLatch.countDown()
                        }
                    }
                }

                override fun timeOut(): Int = PRINT_COPY_TIMEOUT_MS.toInt()
            }

            dispatchCopy = { copyNum ->
                Log.i(TAG, "Dispatching copy #$copyNum of $totalCopies (isGap=$isGap)")
                val build = helper.build(copyCallback)
                build.enable()

                if (copyNum == 1 && isGap) {
                    build.backoffPaper()
                }

                build.paperType(paperType)

                // Phase 2 fix: Attempt to send paper size to the SDK via reflection.
                // The vendor's PrintImgHelper.PrintBuild likely has a paperSize(w, h) or
                // labelSize(w, h) method, but it's inside the compiled AAR.
                // See TEZ_PRINTER_CALIBRATION_FIX.md §2.2 / §3.2
                if (widthMm != null && heightMm != null && widthMm > 0 && heightMm > 0) {
                    val widthDots = widthMm * dpi
                    val heightDots = heightMm * dpi
                    Log.i(TAG, "[PAPER_SIZE] Attempting to set paper size: ${widthMm}mm x ${heightMm}mm = ${widthDots} x ${heightDots} dots (dpi=$dpi)")
                    trySetPaperSize(build, widthDots, heightDots)
                } else {
                    Log.d(TAG, "[PAPER_SIZE] No widthMm/heightMm provided, skipping paperSize configuration")
                }

                build.printImg(imgName)

                if (isGap) {
                    build.fixedPoint()
                    if (copyNum == totalCopies) {
                        build.forwardPaper()
                    }
                } else {
                    val lineDots = (if (copyNum == totalCopies) 20 else 5) * dpi
                    build.printLinedots(lineDots)
                }

                build.disenable()
                helper.run(build)
            }

            // Launch first copy
            dispatchCopy(1)

            val totalMaxWait = (PRINT_COPY_TIMEOUT_MS * totalCopies) + 5000L
            val finished = printCompletedLatch.await(totalMaxWait, TimeUnit.MILLISECONDS)

            // Phase 4 fix: always reset isPrinting before reporting result
            isPrinting.set(false)
            transitionState(State.CONNECTED)

            mainHandler.post {
                if (!finished) {
                    helper.stopPrint()
                    listener?.onError("PRINT_TIMEOUT", "Print job timed out")
                    onResult(Result.failure(Exception("PRINT_TIMEOUT: Job took longer than ${totalMaxWait}ms")))
                } else if (printJobFailed) {
                    listener?.onError("PRINT_FAILED", printFailureReason ?: "Print failed")
                    onResult(Result.failure(Exception(printFailureReason ?: "PRINT_FAILED")))
                } else {
                    onResult(Result.success(Unit))
                }
            }
        }
    }

    /**
     * Phase 2: Attempt to call paperSize(w, h) or labelSize(w, h) on PrintImgHelper.PrintBuild
     * via reflection. The method name is unknown because the SDK is a compiled AAR.
     *
     * If neither method is found, logs a warning — the print will still proceed but without
     * explicit paper size configuration (the SDK will use its defaults).
     */
    private fun trySetPaperSize(build: PrintImgHelper.PrintBuild, widthDots: Int, heightDots: Int) {
        val buildClass = build.javaClass
        val methodNames = listOf("paperSize", "labelSize", "setPaperSize", "setLabelSize", "pageSize", "setPageSize")

        for (methodName in methodNames) {
            try {
                // Try (int, int) signature first
                val method = buildClass.getMethod(methodName, Int::class.javaPrimitiveType, Int::class.javaPrimitiveType)
                method.invoke(build, widthDots, heightDots)
                Log.i(TAG, "[PAPER_SIZE] Successfully called build.$methodName($widthDots, $heightDots)")
                return
            } catch (e: NoSuchMethodException) {
                // Method doesn't exist with this name, try next
            } catch (e: Exception) {
                Log.w(TAG, "[PAPER_SIZE] Error calling build.$methodName: ${e.message}")
            }
        }

        // Log all available methods for diagnostics (first time only)
        Log.w(TAG, "[PAPER_SIZE] No paperSize/labelSize method found on ${buildClass.simpleName}. Available methods:")
        try {
            buildClass.methods.forEach { m ->
                if (!m.declaringClass.name.startsWith("java.")) {
                    Log.d(TAG, "[PAPER_SIZE]   ${m.name}(${m.parameterTypes.joinToString { it.simpleName }})")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[PAPER_SIZE] Failed to list methods: ${e.message}")
        }
    }
}
