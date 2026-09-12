package expo.modules.tejprinter

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo module bridge for Tej Bluetooth label printer (com.yx.print:PrintSDK).
 */
class TejPrinterModule : Module() {
    private var manager: TejPrinterManager? = null

    private fun getContext(): Context? {
        return appContext.reactContext?.applicationContext
            ?: appContext.currentActivity?.applicationContext
    }

    private fun getOrInitManager(): TejPrinterManager? {
        if (manager != null) return manager
        val context = getContext() ?: return null
        val mgr = TejPrinterManager(context)
        val ok = mgr.initialize()
        if (!ok) return null

        mgr.listener = object : TejPrinterManager.EventListener {
            override fun onStateChanged(state: TejPrinterManager.State, data: Map<String, Any?>) {
                val payload = HashMap(data)
                payload["state"] = state.name
                payload["isConnected"] = mgr.isConnected()
                sendEvent("onTejConnectionStateChanged", payload)
            }

            override fun onDeviceDiscovered(device: Map<String, Any?>) {
                sendEvent("onTejDeviceFound", device)
            }

            override fun onScanFinished() {
                sendEvent("onTejScanFinished", emptyMap<String, Any?>())
            }

            override fun onPrintProgress(current: Int, total: Int) {
                sendEvent(
                    "onTejPrintProgress",
                    mapOf(
                        "current" to current,
                        "total" to total,
                        "progress" to "$current/$total"
                    )
                )
            }

            override fun onError(code: String, message: String) {
                sendEvent("onTejError", mapOf("code" to code, "message" to message))
            }
        }

        manager = mgr
        return mgr
    }

    override fun definition() = ModuleDefinition {
        Name("TejPrinter")

        Events(
            "onTejDeviceFound",
            "onTejScanFinished",
            "onTejConnectionStateChanged",
            "onTejPrintProgress",
            "onTejError"
        )

        OnCreate {
            getOrInitManager()
        }

        OnDestroy {
            manager?.destroy()
            manager = null
        }

        Function("isAvailable") {
            val mgr = getOrInitManager()
            mgr != null
        }

        Function("isBluetoothEnabled") {
            val context = getContext() ?: return@Function false
            val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = btManager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
            adapter != null && adapter.isEnabled
        }

        Function("getState") {
            val mgr = getOrInitManager()
            mapOf(
                "state" to (mgr?.state?.name ?: TejPrinterManager.State.DISCONNECTED.name),
                "isConnected" to (mgr?.isConnected() ?: false)
            )
        }

        AsyncFunction("getBondedDevices") { promise: Promise ->
            val context = getContext()
            if (context == null) {
                promise.reject("NO_CONTEXT", "React context is unavailable", null)
                return@AsyncFunction
            }
            if (!hasConnectPermission(context)) {
                promise.reject("PERMISSION_DENIED", "Bluetooth connect permission is required", null)
                return@AsyncFunction
            }
            val mgr = getOrInitManager()
            if (mgr == null) {
                promise.reject("NOT_INITIALIZED", "Tej manager not initialized", null)
                return@AsyncFunction
            }
            try {
                val list = mgr.getBondedDevices()
                promise.resolve(list)
            } catch (e: Exception) {
                promise.reject("BONDED_ERROR", e.message, e)
            }
        }

        AsyncFunction("startScan") { timeoutMs: Long?, promise: Promise ->
            val context = getContext()
            if (context == null) {
                promise.reject("NO_CONTEXT", "React context is unavailable", null)
                return@AsyncFunction
            }
            if (!hasScanPermissions(context)) {
                promise.reject("PERMISSION_DENIED", "Bluetooth scan permissions are required", null)
                return@AsyncFunction
            }
            val mgr = getOrInitManager()
            if (mgr == null) {
                promise.reject("NOT_INITIALIZED", "Tej manager not initialized", null)
                return@AsyncFunction
            }
            val started = mgr.startScan(timeoutMs ?: 10_000L)
            promise.resolve(mapOf("scanStarted" to started))
        }

        AsyncFunction("stopScan") { promise: Promise ->
            manager?.stopScan()
            promise.resolve(null)
        }

        AsyncFunction("connect") { address: String, name: String?, modelKey: String?, promise: Promise ->
            val context = getContext()
            if (context == null) {
                promise.reject("NO_CONTEXT", "React context is unavailable", null)
                return@AsyncFunction
            }
            if (!hasConnectPermission(context)) {
                promise.reject("PERMISSION_DENIED", "Bluetooth connect permission is required", null)
                return@AsyncFunction
            }
            val mgr = getOrInitManager()
            if (mgr == null) {
                promise.reject("NOT_INITIALIZED", "Tej manager not initialized", null)
                return@AsyncFunction
            }

            mgr.connect(address, name, modelKey) { result ->
                result.onSuccess {
                    promise.resolve(
                        mapOf(
                            "id" to address.uppercase(),
                            "address" to address.uppercase(),
                            "name" to (name ?: "Tej Printer"),
                            "modelKey" to (modelKey ?: mgr.resolveModelKey(name)),
                            "transport" to "bluetooth-spp",
                            "sdkId" to "tej"
                        )
                    )
                }.onFailure { error ->
                    promise.reject("CONNECT_FAILED", error.message ?: "Connect failed", error)
                }
            }
        }

        AsyncFunction("disconnect") { promise: Promise ->
            val mgr = manager
            if (mgr == null) {
                promise.resolve(null)
                return@AsyncFunction
            }
            mgr.disconnect {
                promise.resolve(null)
            }
        }

        AsyncFunction("getStatus") { promise: Promise ->
            val mgr = getOrInitManager()
            if (mgr == null || !mgr.isConnected()) {
                promise.reject("NOT_CONNECTED", "Tej printer is not connected", null)
                return@AsyncFunction
            }
            mgr.getStatus { result ->
                result.onSuccess { status ->
                    promise.resolve(
                        mapOf(
                            "isOk" to status.isOk,
                            "isPrinting" to status.isPrinting,
                            "isCoverOpen" to status.isCoverOpen,
                            "isOutOfPaper" to status.isOutOfPaper,
                            "isLowBattery" to status.isLowBattery,
                            "isOverheated" to status.isOverheated,
                            "rawCode" to status.rawCode,
                            "rawHex" to status.rawHex
                        )
                    )
                }.onFailure { error ->
                    promise.reject("STATUS_ERROR", error.message ?: "Failed to get status", error)
                }
            }
        }

        AsyncFunction("setDensity") { density: Int, promise: Promise ->
            val mgr = getOrInitManager()
            if (mgr == null || !mgr.isConnected()) {
                promise.reject("NOT_CONNECTED", "Tej printer is not connected", null)
                return@AsyncFunction
            }
            mgr.setDensity(density) { result ->
                result.onSuccess { promise.resolve(true) }
                    .onFailure { error -> promise.reject("DENSITY_ERROR", error.message, error) }
            }
        }

        AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
            val mgr = getOrInitManager()
            if (mgr == null || !mgr.isConnected()) {
                promise.reject("NOT_CONNECTED", "Tej printer is not connected", null)
                return@AsyncFunction
            }

            val base64Png = options["pngBase64"] as? String
            if (base64Png.isNullOrBlank()) {
                promise.reject("INVALID_DATA", "Base64 PNG data is required", null)
                return@AsyncFunction
            }

            val copies = (options["copies"] as? Number)?.toInt() ?: 1
            val paperTypeStr = (options["paperType"] as? String)?.lowercase() ?: "gap"
            val paperType = when (paperTypeStr) {
                "continuous", "receipt" -> 1 // PrinterConstantPool.PaperType.CONTINUOUS
                "black", "bline" -> 2        // PrinterConstantPool.PaperType.BLACK
                "tattoo" -> 3                // PrinterConstantPool.PaperType.TATTOO
                else -> 0                    // PrinterConstantPool.PaperType.GAP
            }
            val dpiDotsPerMm = (options["dpiDotsPerMm"] as? Number)?.toInt() ?: 8 // 8 dpm = 203 DPI
            val density = (options["density"] as? Number)?.toInt()
            val widthMm = (options["widthMm"] as? Number)?.toInt()
            val heightMm = (options["heightMm"] as? Number)?.toInt()

            mgr.printImage(
                base64Png = base64Png,
                copies = copies,
                paperType = paperType,
                dpi = dpiDotsPerMm,
                density = density,
                widthMm = widthMm,
                heightMm = heightMm
            ) { result ->
                result.onSuccess {
                    promise.resolve(
                        mapOf(
                            "success" to true,
                            "copies" to copies,
                            "paperType" to paperTypeStr
                        )
                    )
                }.onFailure { error ->
                    promise.reject("PRINT_FAILED", error.message ?: "Print failed", error)
                }
            }
        }
    }

    private fun hasConnectPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun hasScanPermissions(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_SCAN
            ) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
    }
}
