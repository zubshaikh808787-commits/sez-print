package expo.modules.tezprinter

import android.app.Application
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.util.Log
import com.print.base.bean.DeviceItem
import com.print.base.bean.PrinterConstantPool
import com.print.base.listen.ScanListener
import com.print.base.utils.SDKUtils
import com.print.myprinter.ScannerBase
import com.print.printer.Command
import com.print.printer.Printer
import com.print.printer.PrinterManage
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicBoolean

/**
 * TezPrinterManager coordinates the Flashlabel OEM PrintSDK lifecycle,
 * connection management, scanning, calibration, and print pipeline for
 * both Tez and Shakti thermal printer series.
 */
class TezPrinterManager private constructor() {
    private var isInitialized = false
    private var printer: Printer? = null
    private var scanner: ScannerBase? = null

    val connectionGuard = ConnectionGuard()
    val taskQueue = SerialTaskQueue { printer }
    val calibrationController = CalibrationController(taskQueue)
    val printPipeline = PrintPipeline({ printer }, taskQueue)

    private val isScanning = AtomicBoolean(false)
    private var scanListenerHandle: ScanListener? = null

    fun initialize(context: Context, merchantKey: String = "sez-print") {
        if (isInitialized) return
        try {
            val app = context.applicationContext as? Application
            if (app != null) {
                SDKUtils.init(app, merchantKey)
                isInitialized = true
                Log.i(TAG, "[TezPrinterManager] SDKUtils initialized with merchantKey=$merchantKey")
            } else {
                Log.w(TAG, "[TezPrinterManager] Context is not Application, SDKUtils.init skipped")
            }
        } catch (e: Exception) {
            Log.e(TAG, "[TezPrinterManager] SDKUtils initialization failed", e)
        }
    }

    fun getPrinterHandle(): Printer {
        var p = printer
        if (p == null) {
            p = PrinterManage.getInstance().getPrinter(PrinterConstantPool.SocketType.SPP)
            printer = p
        }
        return p
    }

    val isConnected: Boolean
        get() = printer?.isConnect == true && connectionGuard.isReady

    val isBluetoothEnabled: Boolean
        get() {
            return try {
                val adapter = BluetoothAdapter.getDefaultAdapter()
                adapter != null && adapter.isEnabled
            } catch (_: Exception) {
                false
            }
        }

    /**
     * Resolves the hardware instruction matching key (modelKey) for Tez and Shakti printers.
     * Implements Section 4.1 of the Implementation Guide.
     */
    fun resolveModelKey(deviceName: String?): String {
        if (deviceName.isNullOrBlank()) {
            return DEFAULT_MODEL_KEY
        }
        val lower = deviceName.lowercase().trim()

        return when {
            lower.contains("380") || lower.startsWith("tp3z") || lower.contains("3120") -> "380"
            lower.contains("yc3121") || lower.contains("3121") -> "YC3121"
            lower.contains("z212") -> "Z212"
            lower.contains("ge920") -> "GE920"
            lower.contains("y50") ||
            lower.startsWith("yx") ||
            lower.contains("tez") ||
            lower.contains("seznik") ||
            Regex("(^|[^a-z])tej([^a-z]|$)").containsMatchIn(lower) ||
            lower.contains("shakti") -> "Y50"
            else -> DEFAULT_MODEL_KEY
        }
    }

    /**
     * Retrieves currently bonded (paired) Bluetooth printers recognized by the OEM SDK.
     */
    fun getBondedDevices(): List<Map<String, Any?>> {
        val list = mutableListOf<Map<String, Any?>>()
        try {
            val bonded = PrinterManage.getInstance().bondedDevices ?: emptyList()
            for (item in bonded) {
                val name = item.name ?: item.blueDevice?.name ?: "Unknown"
                val mac = item.address ?: item.blueDevice?.address ?: continue
                val modelKey = resolveModelKey(name)
                list.add(
                    mapOf(
                        "id" to mac,
                        "name" to name,
                        "modelKey" to modelKey,
                        "bonded" to true
                    )
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "[TezPrinterManager] Failed to get bonded devices", e)
        }
        return list
    }

    /**
     * Connects to a printer by MAC address.
     */
    fun connect(macAddress: stringMac, deviceName: String?): CompletableFuture<Map<String, Any?>> {
        val future = CompletableFuture<Map<String, Any?>>()
        val cleanMac = macAddress.trim().uppercase()

        val p = getPrinterHandle()
        if (p.isConnect) {
            try {
                p.disconnect()
            } catch (_: Exception) {}
        }

        val modelKey = resolveModelKey(deviceName)
        Log.i(TAG, "[TezPrinterManager] Preparing connection to $cleanMac ($deviceName), modelKey=$modelKey")

        val deviceItem = DeviceItem.build(cleanMac).apply {
            this.name = deviceName ?: "Tez/Shakti Printer"
            this.modelKey = modelKey
        }

        connectionGuard.setStateChangeListener { state, errorMsg ->
            when (state) {
                ConnectionGuard.State.CONNECTED -> {
                    future.complete(
                        mapOf(
                            "id" to cleanMac,
                            "name" to (deviceName ?: cleanMac),
                            "modelKey" to modelKey,
                            "connected" to true
                        )
                    )
                }
                ConnectionGuard.State.FAILED -> {
                    future.completeExceptionally(
                        Exception(errorMsg ?: "Connection to $cleanMac failed")
                    )
                }
                else -> {}
            }
        }

        connectionGuard.connect(p, deviceItem)
        return future
    }

    fun disconnect(): CompletableFuture<Void> {
        val future = CompletableFuture<Void>()
        try {
            val p = printer
            if (p != null && p.isConnect) {
                p.disconnect()
            }
            connectionGuard.reset()
            future.complete(null)
        } catch (e: Exception) {
            future.completeExceptionally(e)
        }
        return future
    }

    /**
     * Starts Bluetooth discovery using the OEM SPP scanner.
     */
    fun startScan(
        onFound: (Map<String, Any?>) -> Unit,
        onFinished: () -> Unit,
        onFailed: (String) -> Unit
    ) {
        if (!isScanning.compareAndSet(false, true)) {
            Log.w(TAG, "[TezPrinterManager] Scan already in progress")
            return
        }

        try {
            val sc = PrinterManage.getInstance().getScanner(PrinterConstantPool.SocketType.SPP)
            scanner = sc

            val listener = object : ScanListener {
                override fun onStart() {
                    Log.i(TAG, "[TezPrinterManager] Scan started")
                }

                override fun onFound(item: DeviceItem?) {
                    if (item == null) return
                    val mac = item.address ?: item.blueDevice?.address ?: return
                    val name = item.name ?: item.blueDevice?.name ?: "Unknown Device"
                    val modelKey = resolveModelKey(name)
                    Log.d(TAG, "[TezPrinterManager] Discovered: $name ($mac)")
                    onFound(
                        mapOf(
                            "id" to mac,
                            "name" to name,
                            "modelKey" to modelKey,
                            "bonded" to false
                        )
                    )
                }

                override fun onFinished() {
                    Log.i(TAG, "[TezPrinterManager] Scan finished")
                    isScanning.set(false)
                    onFinished()
                }

                override fun onFailed(msg: String?) {
                    Log.w(TAG, "[TezPrinterManager] Scan failed: $msg")
                    isScanning.set(false)
                    onFailed(msg ?: "Bluetooth scan failed")
                }
            }

            scanListenerHandle = listener
            sc.setListener(listener)
            sc.scan()
        } catch (e: Exception) {
            isScanning.set(false)
            onFailed(e.message ?: "Failed to start scan")
        }
    }

    fun stopScan() {
        if (isScanning.compareAndSet(true, false)) {
            try {
                scanner?.stopScan()
            } catch (e: Exception) {
                Log.w(TAG, "[TezPrinterManager] Exception stopping scan", e)
            }
            scanListenerHandle = null
        }
    }

    fun getBatteryLevel(): CompletableFuture<Int> {
        return taskQueue.submit(Command.get_battervol(), "get_battervol", RetryPolicy.standard)
            .thenApply { bean ->
                if (bean.data != null && bean.data.isNotEmpty()) {
                    bean.data[0].toInt() and 0xFF
                } else {
                    -1
                }
            }
    }

    companion object {
        private const val TAG = "TezPrinterManager"
        const val DEFAULT_MODEL_KEY = "Y50"

        @Volatile
        private var instance: TezPrinterManager? = null

        fun getInstance(): TezPrinterManager {
            return instance ?: synchronized(this) {
                instance ?: TezPrinterManager().also { instance = it }
            }
        }
    }
}

typealias stringMac = String
