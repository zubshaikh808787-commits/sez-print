package expo.modules.joshprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

/**
 * Expo module bridge for JOSH / DothanTech LPAPI Bluetooth printer.
 */
class JoshPrinterModule : Module() {
  private val ioExecutor = Executors.newCachedThreadPool()
  private var manager: JoshPrinterManager? = null

  private fun getContext(): Context? {
    return appContext.reactContext?.applicationContext
      ?: appContext.currentActivity?.applicationContext
  }

  private fun getOrInitManager(): JoshPrinterManager? {
    if (manager != null) return manager
    val context = getContext() ?: return null
    val mgr = JoshPrinterManager(context)
    val ok = mgr.initialize()
    if (!ok) return null

    mgr.listener = object : JoshPrinterManager.EventListener {
      override fun onStateChanged(state: JoshPrinterManager.State, data: Map<String, Any?>) {
        val payload = HashMap(data)
        payload["state"] = state.name
        payload["isConnected"] = mgr.isConnected()
        sendEvent("onJoshConnectionStateChanged", payload)
      }

      override fun onPrinterDiscovered(printer: Map<String, Any?>) {
        sendEvent("onJoshPrinterDiscovered", printer)
      }

      override fun onPrintProgress(jobId: String, progress: String, data: Map<String, Any?>) {
        val payload = HashMap(data)
        payload["jobId"] = jobId
        payload["progress"] = progress
        sendEvent("onJoshPrintProgress", payload)
      }

      override fun onError(code: String, message: String) {
        sendEvent("onJoshError", mapOf("code" to code, "message" to message))
      }
    }

    manager = mgr
    return mgr
  }

  override fun definition() = ModuleDefinition {
    Name("JoshPrinter")

    Events(
      "onJoshPrinterDiscovered",
      "onJoshScanFinished",
      "onJoshConnectionStateChanged",
      "onJoshPrintProgress",
      "onJoshError"
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
      val ok = mgr != null
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] isAvailable() called -> $ok")
      ok
    }

    Function("isDeviceNameSupported") { name: String? ->
      val mgr = getOrInitManager()
      val supported = mgr?.isDeviceNameSupported(name) ?: false
      Log.d("JoshPrinter", "[JOSH-NATIVE-BRIDGE] isDeviceNameSupported('$name') -> $supported")
      supported
    }

    AsyncFunction("startDiscovery") { promise: Promise ->
      val context = getContext()
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context is unavailable", null)
        return@AsyncFunction
      }

      if (!hasScanPermissions(context)) {
        promise.reject("PERMISSION", "Bluetooth Scan / Location permissions are required.", null)
        return@AsyncFunction
      }

      val mgr = getOrInitManager()
      if (mgr == null) {
        promise.reject("NO_MANAGER", "Failed to initialize JOSH printer manager.", null)
        return@AsyncFunction
      }

      ioExecutor.execute {
        try {
          val started = mgr.startDiscovery()
          promise.resolve(mapOf("discoveryStarted" to started))
        } catch (e: Exception) {
          promise.reject("DISCOVERY_FAILED", e.message ?: "Failed to start discovery", e)
        }
      }
    }

    AsyncFunction("stopDiscovery") { promise: Promise ->
      ioExecutor.execute {
        try {
          manager?.stopDiscovery()
          sendEvent("onJoshScanFinished", emptyMap<String, Any?>())
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("STOP_FAILED", e.message ?: "Failed to stop discovery", e)
        }
      }
    }

    AsyncFunction("connect") { macAddress: String, name: String?, promise: Promise ->
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] connect() invoked: mac=$macAddress, name=$name")
      val context = getContext()
      if (context != null && !hasConnectPermission(context)) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Bluetooth Connect permission missing")
        promise.reject("PERMISSION", "Bluetooth Connect permission is required.", null)
        return@AsyncFunction
      }

      val mgr = getOrInitManager()
      if (mgr == null) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] JOSH printer manager failed to initialize")
        promise.reject("NO_MANAGER", "JOSH printer manager is not initialized.", null)
        return@AsyncFunction
      }

      ioExecutor.execute {
        try {
          Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Delegating connect to JoshPrinterManager...")
          val success = mgr.connect(macAddress, name)
          if (success) {
            Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Connection confirmed! Resolving promise to JS")
            val res = mapOf(
              "id" to macAddress,
              "name" to (name ?: macAddress),
              "macAddress" to macAddress,
              "transport" to "josh-lpapi",
              "sdkId" to "josh"
            )
            promise.resolve(res)
          } else {
            val err = mgr.lastError ?: "Failed to connect to JOSH printer"
            Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Connection failed: $err")
            promise.reject("CONNECT_FAILED", err, null)
          }
        } catch (e: Exception) {
          Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Connection exception", e)
          promise.reject("CONNECT_FAILED", e.message ?: "Connection error", e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        try {
          manager?.disconnect()
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("DISCONNECT_FAILED", e.message ?: "Failed to disconnect", e)
        }
      }
    }

    AsyncFunction("reconnect") { promise: Promise ->
      val mgr = getOrInitManager()
      if (mgr == null) {
        promise.reject("NO_MANAGER", "JOSH printer manager is not initialized.", null)
        return@AsyncFunction
      }

      ioExecutor.execute {
        try {
          val success = mgr.reconnect()
          promise.resolve(success)
        } catch (e: Exception) {
          promise.reject("RECONNECT_FAILED", e.message ?: "Reconnect failed", e)
        }
      }
    }

    Function("getState") {
      val mgr = getOrInitManager()
      mgr?.getStateSnapshot() ?: emptyMap<String, Any?>()
    }

    Function("isConnected") {
      val mgr = getOrInitManager()
      mgr?.isConnected() ?: false
    }

    AsyncFunction("configureParams") { params: Map<String, Any?>, promise: Promise ->
      val mgr = getOrInitManager()
      if (mgr == null) {
        promise.reject("NO_MANAGER", "JOSH printer manager is not initialized.", null)
        return@AsyncFunction
      }

      try {
        val density = (params["density"] as? Number)?.toInt()
        val speed = (params["speed"] as? Number)?.toInt()
        val gapType = (params["gapType"] as? Number)?.toInt()
        val gapLength = (params["gapLength"] as? Number)?.toInt()
        mgr.configureParams(density, speed, gapType, gapLength)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("CONFIG_FAILED", e.message ?: "Failed to configure params", e)
      }
    }

    AsyncFunction("printTestText") { text: String?, promise: Promise ->
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText() called with text=\"$text\"")
      val mgr = getOrInitManager()
      if (mgr == null) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] JOSH printer manager is not initialized")
        promise.reject("NOT_INITIALIZED", "JOSH printer manager is not initialized", null)
        return@AsyncFunction
      }
      if (!mgr.isConnected()) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Cannot test print: JOSH printer is not connected")
        promise.reject("NOT_CONNECTED", "JOSH printer is not connected", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val success = mgr.printTestText(text ?: "Sez Print JOSH OK")
          if (success) {
            Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText completed successfully")
            promise.resolve(true)
          } else {
            Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText failed")
            promise.reject("PRINT_FAILED", "Test print failed", null)
          }
        } catch (e: Exception) {
          Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText exception", e)
          promise.reject("PRINT_FAILED", e.message ?: "Test print error", e)
        }
      }
    }

    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 40.0
      val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
      val copies = (options["copies"] as? Number)?.toInt() ?: 1
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printPngLabel() called: ${widthMm}x${heightMm}mm, copies=$copies")

      val mgr = getOrInitManager()
      if (mgr == null) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printPngLabel: JOSH printer manager is not initialized")
        promise.reject("NOT_INITIALIZED", "JOSH printer manager is not initialized", null)
        return@AsyncFunction
      }
      if (!mgr.isConnected()) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printPngLabel: JOSH printer is not connected")
        promise.reject("NOT_CONNECTED", "JOSH printer is not connected", null)
        return@AsyncFunction
      }

      val pngBase64 = options["pngBase64"] as? String
      if (pngBase64.isNullOrEmpty()) {
        promise.reject("INVALID_PARAMS", "Missing pngBase64 parameter", null)
        return@AsyncFunction
      }

      val dpi = (options["dpi"] as? Number)?.toDouble() ?: 203.0
      val density = (options["density"] as? Number)?.toInt() ?: -1
      val speed = (options["speed"] as? Number)?.toInt() ?: -1
      val direction = (options["direction"] as? Number)?.toInt()
        ?: (options["orientation"] as? Number)?.toInt()
        ?: 0
      val gapType = (options["gapType"] as? Number)?.toInt() ?: -1
      val gapLength = (options["gapLength"] as? Number)?.toInt() ?: -1

      ioExecutor.execute {
        try {
          val pngBytes = Base64.decode(pngBase64, Base64.DEFAULT)
          Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Decoded ${pngBytes.size} PNG bytes, delegating to mgr.printBitmap")
          val result = mgr.printBitmap(
            pngBytes = pngBytes,
            widthMm = widthMm,
            heightMm = heightMm,
            dpi = dpi,
            copies = copies,
            paramDensity = density,
            paramSpeed = speed,
            direction = direction,
            paramGapType = gapType,
            paramGapLength = gapLength
          )

          if (result != null) {
            Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printBitmap completed successfully")
            promise.resolve(result)
          } else {
            val err = mgr.lastError ?: "Print failed"
            Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printBitmap failed: $err")
            promise.reject("PRINT_FAILED", err, null)
          }
        } catch (e: Exception) {
          Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printBitmap exception", e)
          promise.reject("PRINT_ERROR", e.message ?: "Failed to print label", e)
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
