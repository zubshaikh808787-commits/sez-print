package expo.modules.labelxprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.luckprinter.sdk_new.PrinterStatus
import com.luckprinter.sdk_new.callback.OnClientConnectionListener
import com.luckprinter.sdk_new.callback.OnPrintCallback
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener
import com.luckprinter.sdk_new.device.BaseDevice
import com.luckprinter.sdk_new.device.PrinterHelper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class LabelXPrinterModule : Module() {
  private val TAG = "LabelXPrinter"
  private val ioExecutor = Executors.newCachedThreadPool()

  // Default abroad app key from LuckPrinter SDK demo
  private val DEFAULT_AS_KEY = "7fec7c4703824444a8bcf8b24b148dec"

  private var isInitialized = false
  private var lastStatus: Int = -1
  private var connectedName: String? = null
  private var connectedMac: String? = null
  private var receiverRegistered = false

  private val bluetoothAdapter: BluetoothAdapter? by lazy {
    val context = appContext.reactContext ?: return@lazy null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
  }

  private val discoveryReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_FOUND -> {
          val device: BluetoothDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
              @Suppress("DEPRECATION")
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
          if (device != null) {
            emitDevice(device, bonded = false)
          }
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
          sendEvent("onScanFinished", emptyMap<String, Any?>())
        }
      }
    }
  }

  private val connectionListener = object : OnClientConnectionListener {
    override fun onLuckConnected(name: String?, address: String?) {
      Log.i(TAG, "LuckPrinter connected: name=$name mac=$address")
      connectedName = name
      connectedMac = address
      sendEvent(
        "onConnectionChanged",
        mapOf(
          "connected" to true,
          "name" to (name ?: ""),
          "mac" to (address ?: "")
        )
      )
    }

    override fun onLuckDisConnected() {
      Log.i(TAG, "LuckPrinter disconnected")
      connectedName = null
      connectedMac = null
      sendEvent(
        "onConnectionChanged",
        mapOf(
          "connected" to false,
          "name" to "",
          "mac" to ""
        )
      )
    }
  }

  private val statusListener = OnReceiveDeviceStatusListener { status ->
    Log.d(TAG, "LuckPrinter device status changed: $status")
    lastStatus = status
    sendEvent(
      "onStatusChanged",
      mapOf(
        "statusCode" to status,
        "statusMessage" to decodeStatus(status),
        "paperOut" to (status == PrinterStatus.PRINTER_STATUS_OUTPAPER),
        "coverOpen" to (status == PrinterStatus.PRINTER_STATUS_OPENCOVER),
        "overheating" to (status == PrinterStatus.PRINTER_STATUS_OVERHEAT),
        "lowBattery" to (status == PrinterStatus.PRINTER_STATUS_LOWVAL),
        "printing" to (status == PrinterStatus.PRINTER_STATUS_PRINTTING)
      )
    )
  }

  private fun ensureSdkInitialized(asKey: String? = null) {
    if (isInitialized) return
    val context = appContext.reactContext ?: return
    val key = if (!asKey.isNullOrBlank()) asKey else DEFAULT_AS_KEY
    try {
      PrinterHelper.getInstance().init(context.applicationContext, key, false)
      PrinterHelper.getInstance().addConnectListener(connectionListener)
      PrinterHelper.getInstance().addDeviceStatusListener(statusListener)
      isInitialized = true
      Log.i(TAG, "LuckPrinter SDK initialized successfully with key=${key.take(8)}...")
    } catch (e: Throwable) {
      Log.e(TAG, "Failed to initialize LuckPrinter SDK", e)
    }
  }

  private fun decodeStatus(code: Int): String {
    return when (code) {
      PrinterStatus.PRINTER_STATUS_OUTPAPER -> "Out of paper"
      PrinterStatus.PRINTER_STATUS_OPENCOVER -> "Cover / lid is open"
      PrinterStatus.PRINTER_STATUS_OVERHEAT -> "Printer is overheating"
      PrinterStatus.PRINTER_STATUS_LOWVAL -> "Low battery"
      PrinterStatus.PRINTER_STATUS_PRINTTING -> "Printing in progress"
      PrinterStatus.PRINTER_STATUS_RECHARGE -> "Battery charging"
      PrinterStatus.PRINTER_STATUS_NOT_LABEL -> "Label not detected"
      else -> if (code == 0) "Ready" else "Status code $code"
    }
  }

  override fun definition() = ModuleDefinition {
    Name("LabelXPrinter")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged", "onStatusChanged")

    Function("isAvailable") {
      try {
        ensureSdkInitialized()
        true
      } catch (_: Throwable) {
        false
      }
    }

    Function("isBluetoothEnabled") {
      bluetoothAdapter?.isEnabled == true
    }

    Function("isConnected") {
      try {
        PrinterHelper.getInstance().isConnectedLuck
      } catch (_: Throwable) {
        false
      }
    }

    Function("initSdk") { asKey: String? ->
      ensureSdkInitialized(asKey)
      true
    }

    AsyncFunction("getBondedDevices") { promise: Promise ->
      val adapter = bluetoothAdapter
      if (adapter == null || !adapter.isEnabled) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@AsyncFunction
      }
      try {
        val bonded = adapter.bondedDevices ?: emptySet()
        val list = bonded.map { dev ->
          @SuppressLint("MissingPermission")
          val name = dev.name ?: "Unknown"
          @SuppressLint("MissingPermission")
          val mac = dev.address ?: ""
          mapOf(
            "name" to name,
            "mac" to mac,
            "bonded" to true,
            "type" to dev.type
          )
        }
        promise.resolve(list)
      } catch (e: Throwable) {
        promise.reject("GET_BONDED_FAILED", e.message, e)
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      ensureSdkInitialized()
      val context = appContext.reactContext
      val adapter = bluetoothAdapter
      if (context == null || adapter == null || !adapter.isEnabled) {
        promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to 0, "reason" to "Bluetooth not available"))
        return@AsyncFunction
      }

      if (!hasBluetoothPermissions(context)) {
        promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to 0, "reason" to "Bluetooth permissions missing"))
        return@AsyncFunction
      }

      try {
        registerDiscoveryReceiver(context)
        @SuppressLint("MissingPermission")
        val bonded = adapter.bondedDevices ?: emptySet()
        for (dev in bonded) {
          emitDevice(dev, bonded = true)
        }

        @SuppressLint("MissingPermission")
        val started = adapter.startDiscovery()
        promise.resolve(mapOf("discoveryStarted" to started, "bondedCount" to bonded.size))
      } catch (e: Throwable) {
        promise.reject("SCAN_FAILED", e.message, e)
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      val context = appContext.reactContext
      val adapter = bluetoothAdapter
      try {
        if (adapter != null && adapter.isDiscovering) {
          @SuppressLint("MissingPermission")
          adapter.cancelDiscovery()
        }
        unregisterDiscoveryReceiver(context)
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject("STOP_SCAN_FAILED", e.message, e)
      }
    }

    AsyncFunction("connect") { macAddress: String, deviceName: String?, btType: Int?, promise: Promise ->
      ensureSdkInitialized()
      val name = deviceName ?: "LabelX"
      val type = btType ?: BluetoothDevice.DEVICE_TYPE_CLASSIC

      ioExecutor.execute {
        try {
          val helper = PrinterHelper.getInstance()
          if (helper.isConnectedLuck) {
            val curMac = connectedMac
            if (curMac != null && curMac.equals(macAddress, ignoreCase = true)) {
              promise.resolve(
                mapOf(
                  "success" to true,
                  "name" to (connectedName ?: name),
                  "mac" to macAddress,
                  "type" to type
                )
              )
              return@execute
            }
            helper.disconnectLuck()
            Thread.sleep(300)
          }

          Log.i(TAG, "Connecting to LuckPrinter name=$name mac=$macAddress type=$type...")
          val result = helper.connectLuck(name, macAddress, type)
          if (result) {
            connectedName = name
            connectedMac = macAddress
            promise.resolve(
              mapOf(
                "success" to true,
                "name" to name,
                "mac" to macAddress,
                "type" to type
              )
            )
          } else {
            promise.reject("CONNECT_FAILED", "Failed to connect to printer $name ($macAddress)", null)
          }
        } catch (e: Throwable) {
          promise.reject("CONNECT_EXCEPTION", e.message, e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        try {
          val helper = PrinterHelper.getInstance()
          val success = helper.disconnectLuck()
          connectedName = null
          connectedMac = null
          promise.resolve(success)
        } catch (e: Throwable) {
          promise.reject("DISCONNECT_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("getStatus") { promise: Promise ->
      val helper = PrinterHelper.getInstance()
      val isConn = helper.isConnectedLuck
      promise.resolve(
        mapOf(
          "connected" to isConn,
          "name" to (connectedName ?: ""),
          "mac" to (connectedMac ?: ""),
          "statusCode" to lastStatus,
          "statusMessage" to decodeStatus(lastStatus),
          "paperOut" to (lastStatus == PrinterStatus.PRINTER_STATUS_OUTPAPER),
          "coverOpen" to (lastStatus == PrinterStatus.PRINTER_STATUS_OPENCOVER),
          "overheating" to (lastStatus == PrinterStatus.PRINTER_STATUS_OVERHEAT),
          "lowBattery" to (lastStatus == PrinterStatus.PRINTER_STATUS_LOWVAL),
          "printing" to (lastStatus == PrinterStatus.PRINTER_STATUS_PRINTTING)
        )
      )
    }

    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      ensureSdkInitialized()
      val helper = PrinterHelper.getInstance()
      if (!helper.isConnectedLuck) {
        promise.reject("NOT_CONNECTED", "Printer is not connected", null)
        return@AsyncFunction
      }

      val pngBase64 = options["pngBase64"] as? String
      if (pngBase64.isNullOrEmpty()) {
        promise.reject("INVALID_DATA", "Missing pngBase64 parameter", null)
        return@AsyncFunction
      }

      val copies = (options["copies"] as? Number)?.toInt() ?: 1
      val paperType = (options["paperType"] as? String)?.lowercase() ?: "tag" // "tag", "continuous", "blacktag"
      val density = (options["density"] as? Number)?.toInt() ?: 1 // 0, 1, 2
      val threshold = (options["threshold"] as? Number)?.toInt() ?: 145
      val dither = (options["dither"] as? Boolean) ?: true

      ioExecutor.execute {
        try {
          // Set density if supported
          try {
            helper.setDensityLuck(density, null)
          } catch (_: Throwable) {}

          // Decode base64 PNG
          val rawBytes = Base64.decode(pngBase64.substringAfter("base64,"), Base64.DEFAULT)
          val srcBitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size)
            ?: throw IllegalArgumentException("Could not decode PNG data into Bitmap")

          // Target dots calculation:
          // If explicit widthDots passed (or widthMm provided), use it; otherwise get from printer device
          val widthMm = (options["widthMm"] as? Number)?.toDouble()
          val requestedWidthDots = (options["widthDots"] as? Number)?.toInt()
            ?: (if (widthMm != null && widthMm > 0) (widthMm * 8.0).toInt() else null)

          val deviceMaxDots = try {
            val maxW = helper.printWidth
            if (maxW > 0) maxW else 384
          } catch (_: Throwable) {
            384
          }

          val targetWidthDots = requestedWidthDots ?: deviceMaxDots

          val srcW = srcBitmap.width
          val srcH = srcBitmap.height
          val targetHeightDots = if (srcW > 0) {
            (srcH.toDouble() / srcW.toDouble() * targetWidthDots).toInt()
          } else {
            srcH
          }

          // Scale bitmap smoothly
          val scaledBmp = Bitmap.createScaledBitmap(srcBitmap, targetWidthDots, targetHeightDots, true)
          if (srcBitmap != scaledBmp) {
            srcBitmap.recycle()
          }

          // Binarize or Dither for thermal printhead
          val finalBmp = if (dither) {
            applyFloydSteinbergDithering(scaledBmp)
          } else {
            applyThresholdBinarization(scaledBmp, threshold)
          }

          val printCallback = object : OnPrintCallback {
            override fun onStartPrint() {
              Log.i(TAG, "Print job started")
            }

            override fun onPrinting(page: Int, total: Int) {
              Log.d(TAG, "Printing progress: $page/$total")
            }

            override fun onPrintIndexStart(bmp: Bitmap?, page: Int, total: Int) {
              Log.d(TAG, "Print index start: $page/$total")
            }

            override fun onPrintIndexEnd(bmp: Bitmap?, page: Int, total: Int) {
              Log.d(TAG, "Print index end: $page/$total")
            }

            override fun onPrintSuccess() {
              Log.i(TAG, "Print job completed successfully")
              try {
                if (!finalBmp.isRecycled) finalBmp.recycle()
              } catch (_: Throwable) {}
              promise.resolve(
                mapOf(
                  "success" to true,
                  "pagesPrinted" to copies
                )
              )
            }

            override fun onPrintFail(status: Int) {
              Log.e(TAG, "Print job failed with status: $status (${decodeStatus(status)})")
              try {
                if (!finalBmp.isRecycled) finalBmp.recycle()
              } catch (_: Throwable) {}
              promise.reject("PRINT_FAILED", "Print failed: ${decodeStatus(status)} (code $status)", null)
            }
          }

          // Dispatch print according to device type and paper type
          if (helper.isSheetLabelPrinter()) {
            when (paperType) {
              "continuous", "receipt" -> helper.print(finalBmp, copies, printCallback)
              else -> helper.printTag(finalBmp, copies, printCallback)
            }
          } else {
            when (paperType) {
              "continuous", "receipt" -> helper.print(finalBmp, copies, printCallback)
              "blacktag", "blackmark" -> helper.printBlackTag(finalBmp, copies, printCallback)
              else -> helper.printTag(finalBmp, copies, printCallback)
            }
          }

        } catch (e: Throwable) {
          Log.e(TAG, "Error executing print", e)
          promise.reject("PRINT_EXCEPTION", e.message, e)
        }
      }
    }

    AsyncFunction("printTestLabel") { text: String?, promise: Promise ->
      ensureSdkInitialized()
      val helper = PrinterHelper.getInstance()
      if (!helper.isConnectedLuck) {
        promise.reject("NOT_CONNECTED", "Printer is not connected", null)
        return@AsyncFunction
      }

      val displayText = if (text.isNullOrBlank()) "SEZNIK PRINT TEST" else text

      ioExecutor.execute {
        try {
          val width = if (helper.isSheetLabelPrinter()) 400 else 384
          val height = 240
          val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bmp)
          canvas.drawColor(Color.WHITE)

          val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 3f
          }
          // Border
          canvas.drawRect(Rect(10, 10, width - 10, height - 10), paint)

          // Inner title
          paint.style = Paint.Style.FILL
          paint.textSize = 28f
          paint.isFakeBoldText = true
          val titleText = "SEZNIK - LABEL X"
          val titleW = paint.measureText(titleText)
          canvas.drawText(titleText, (width - titleW) / 2f, 60f, paint)

          // Subtitle / message
          paint.textSize = 22f
          paint.isFakeBoldText = false
          val msgW = paint.measureText(displayText)
          canvas.drawText(displayText, (width - msgW) / 2f, 110f, paint)

          // Status & date/info
          paint.textSize = 16f
          val infoText = "203 DPI · LuckPrinter SDK OEM"
          val infoW = paint.measureText(infoText)
          canvas.drawText(infoText, (width - infoW) / 2f, 165f, paint)

          val finalBmp = applyThresholdBinarization(bmp, 145)
          bmp.recycle()

          helper.printTag(finalBmp, 1, object : OnPrintCallback {
            override fun onStartPrint() {}
            override fun onPrinting(page: Int, total: Int) {}
            override fun onPrintIndexStart(b: Bitmap?, page: Int, total: Int) {}
            override fun onPrintIndexEnd(b: Bitmap?, page: Int, total: Int) {}
            override fun onPrintSuccess() {
              try {
                if (!finalBmp.isRecycled) finalBmp.recycle()
              } catch (_: Throwable) {}
              promise.resolve(mapOf("success" to true))
            }
            override fun onPrintFail(status: Int) {
              try {
                if (!finalBmp.isRecycled) finalBmp.recycle()
              } catch (_: Throwable) {}
              promise.reject("PRINT_FAILED", "Test print failed: ${decodeStatus(status)}", null)
            }
          })
        } catch (e: Throwable) {
          promise.reject("PRINT_EXCEPTION", e.message, e)
        }
      }
    }
  }

  private fun emitDevice(device: BluetoothDevice, bonded: Boolean) {
    try {
      @SuppressLint("MissingPermission")
      val name = device.name ?: return
      @SuppressLint("MissingPermission")
      val mac = device.address ?: return
      sendEvent(
        "onDeviceFound",
        mapOf(
          "name" to name,
          "mac" to mac,
          "bonded" to bonded,
          "type" to device.type
        )
      )
    } catch (_: Throwable) {}
  }

  private fun registerDiscoveryReceiver(context: Context) {
    if (receiverRegistered) return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(discoveryReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterDiscoveryReceiver(context: Context?) {
    if (!receiverRegistered || context == null) return
    try {
      context.unregisterReceiver(discoveryReceiver)
    } catch (_: Throwable) {}
    receiverRegistered = false
  }

  private fun hasBluetoothPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
  }

  // Floyd-Steinberg error-diffusion dithering for crisp photo/graphic printing
  private fun applyFloydSteinbergDithering(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    val grayPixels = IntArray(w * h)
    src.getPixels(grayPixels, 0, w, 0, 0, w, h)

    val gray = FloatArray(w * h)
    for (i in grayPixels.indices) {
      val c = grayPixels[i]
      val r = (c shr 16) and 0xFF
      val g = (c shr 8) and 0xFF
      val b = c and 0xFF
      gray[i] = (0.299f * r + 0.587f * g + 0.114f * b)
    }

    val outPixels = IntArray(w * h)
    for (y in 0 until h) {
      for (x in 0 until w) {
        val idx = y * w + x
        val oldVal = gray[idx]
        val newVal = if (oldVal < 128f) 0f else 255f
        outPixels[idx] = if (newVal == 0f) Color.BLACK else Color.WHITE
        val err = oldVal - newVal

        if (x + 1 < w) gray[idx + 1] += err * 7f / 16f
        if (y + 1 < h) {
          if (x - 1 >= 0) gray[(y + 1) * w + (x - 1)] += err * 3f / 16f
          gray[(y + 1) * w + x] += err * 5f / 16f
          if (x + 1 < w) gray[(y + 1) * w + (x + 1)] += err * 1f / 16f
        }
      }
    }

    val dithered = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    dithered.setPixels(outPixels, 0, w, 0, 0, w, h)
    if (src != dithered) {
      src.recycle()
    }
    return dithered
  }

  // Threshold binarization for ultra-sharp barcode & text labels
  private fun applyThresholdBinarization(src: Bitmap, threshold: Int): Bitmap {
    val w = src.width
    val h = src.height
    val pixels = IntArray(w * h)
    src.getPixels(pixels, 0, w, 0, 0, w, h)

    val out = IntArray(w * h)
    for (i in pixels.indices) {
      val c = pixels[i]
      val r = (c shr 16) and 0xFF
      val g = (c shr 8) and 0xFF
      val b = c and 0xFF
      val lum = (0.299f * r + 0.587f * g + 0.114f * b).toInt()
      out[i] = if (lum < threshold) Color.BLACK else Color.WHITE
    }

    val binarized = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    binarized.setPixels(out, 0, w, 0, 0, w, h)
    if (src != binarized) {
      src.recycle()
    }
    return binarized
  }
}
