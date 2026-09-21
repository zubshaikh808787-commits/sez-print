package expo.modules.devprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.caysn.autoreplyprint.AutoReplyPrint
import com.sun.jna.Pointer
import com.sun.jna.WString
import com.sun.jna.ptr.LongByReference
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Native Expo module for SEZNIK DEV 2-in-1 POS Receipt & Label Printer.
 * Supports hardware TSPL commands for die-cut label rolls and ESC/POS raster for receipts,
 * perfectly matching the reference implementation in inventort-seznik.
 */
class DevPrinterModule : Module() {
  private val TAG = "DevPrinter"
  private val ioExecutor = Executors.newCachedThreadPool()

  private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  private var printerHandle: Pointer? = null
  private var bluetoothSocket: BluetoothSocket? = null
  private var socketOutStream: OutputStream? = null

  private var connectedMac: String? = null
  private var connectedName: String? = null
  private var receiverRegistered = false
  private var aclReceiverRegistered = false

  private val aclReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_ACL_CONNECTED,
        BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
          val device: BluetoothDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
              @Suppress("DEPRECATION")
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
          val mac = device?.address ?: return
          val connected = intent.action == BluetoothDevice.ACTION_ACL_CONNECTED
          Log.i(TAG, "ACL link ${if (connected) "CONNECTED" else "DISCONNECTED"}: $mac")
          sendEvent(
            "onAclLinkChanged",
            mapOf(
              "mac" to mac,
              "connected" to connected,
            ),
          )
        }
      }
    }
  }

  // 16x16 Bayer / Floyd ordered dithering matrix matching inventort-seznik PrintPicture.Floyd16x16
  private val Floyd16x16 = arrayOf(
    intArrayOf(0, 128, 32, 160, 8, 136, 40, 168, 2, 130, 34, 162, 10, 138, 42, 170),
    intArrayOf(192, 64, 224, 96, 200, 72, 232, 104, 194, 66, 226, 98, 202, 74, 234, 106),
    intArrayOf(48, 176, 16, 144, 56, 184, 24, 152, 50, 178, 18, 146, 58, 186, 26, 154),
    intArrayOf(240, 112, 208, 80, 248, 120, 216, 88, 242, 114, 210, 82, 250, 122, 218, 90),
    intArrayOf(12, 140, 44, 172, 4, 132, 36, 164, 14, 142, 46, 174, 6, 134, 38, 166),
    intArrayOf(204, 76, 236, 108, 196, 68, 228, 100, 206, 78, 238, 110, 198, 70, 230, 102),
    intArrayOf(60, 188, 28, 156, 52, 180, 20, 148, 62, 190, 30, 158, 54, 182, 22, 150),
    intArrayOf(252, 124, 220, 92, 244, 116, 212, 84, 254, 126, 222, 94, 246, 118, 214, 86),
    intArrayOf(3, 131, 35, 163, 11, 139, 43, 171, 1, 129, 33, 161, 9, 137, 41, 169),
    intArrayOf(195, 67, 227, 99, 203, 75, 235, 107, 193, 65, 225, 97, 201, 73, 233, 105),
    intArrayOf(51, 179, 19, 147, 59, 187, 27, 155, 49, 177, 17, 145, 57, 185, 25, 153),
    intArrayOf(243, 115, 211, 83, 251, 123, 219, 91, 241, 113, 209, 81, 249, 121, 217, 89),
    intArrayOf(15, 143, 47, 175, 7, 135, 39, 167, 13, 141, 45, 173, 5, 133, 37, 165),
    intArrayOf(207, 79, 239, 111, 199, 71, 231, 103, 205, 77, 237, 109, 197, 69, 229, 101),
    intArrayOf(63, 191, 31, 159, 55, 183, 23, 151, 61, 189, 29, 157, 53, 181, 21, 149),
    intArrayOf(254, 127, 223, 95, 247, 119, 215, 87, 253, 125, 221, 93, 245, 117, 213, 85)
  )

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

  override fun definition() = ModuleDefinition {
    Name("DevPrinter")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged", "onAclLinkChanged")

    OnCreate {
      ensureReceiver()
      ensureAclReceiver()
    }

    OnDestroy {
      unregisterReceiverSafe()
      unregisterAclReceiverSafe()
      closeHandle()
    }

    Function("isAvailable") {
      try {
        AutoReplyPrint.INSTANCE != null
      } catch (e: Throwable) {
        Log.w(TAG, "AutoReplyPrint SDK not available: ${e.message}")
        true
      }
    }

    Function("isBluetoothEnabled") {
      val adapter = getAdapter()
      adapter != null && adapter.isEnabled
    }

    AsyncFunction("getBondedDevices") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      if (!hasConnectPermission(context)) {
        promise.reject("PERMISSION", "Bluetooth Connect permission is required.", null)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          val list = bonded.map { deviceToMap(it, bonded = true) }
          promise.resolve(list)
        } catch (e: Exception) {
          promise.reject("BONDED_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      if (!hasConnectPermission(context)) {
        promise.reject("PERMISSION", "Bluetooth permissions are required to scan for DEV printers.", null)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        sendEvent("onScanFinished", emptyMap<String, Any?>())
        promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to 0, "reason" to "BT_OFF"))
        return@AsyncFunction
      }

      ensureReceiver()

      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          for (dev in bonded) {
            emitDevice(dev, bonded = true)
          }

          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          @SuppressLint("MissingPermission")
          val started = adapter.startDiscovery()
          promise.resolve(mapOf("discoveryStarted" to started, "bondedCount" to bonded.size))
        } catch (e: Exception) {
          promise.reject("SCAN_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      ioExecutor.execute {
        try {
          getAdapter()?.let { adapter ->
            @SuppressLint("MissingPermission")
            if (adapter.isDiscovering) adapter.cancelDiscovery()
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("STOP_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("connect") { macAddress: String, name: String?, promise: Promise ->
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        promise.reject("BT_OFF", "Bluetooth is turned off.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(200) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          closeHandle()
          try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }

          val formattedMac = macAddress.uppercase()
          val device = try { adapter.getRemoteDevice(formattedMac) } catch (_: Exception) { null }
            ?: throw Exception("Could not find Bluetooth device $formattedMac")
          val isBonded = try {
            @SuppressLint("MissingPermission")
            device.bondState == BluetoothDevice.BOND_BONDED
          } catch (_: Exception) {
            false
          }

          Log.i(TAG, "Connecting to DEV printer $formattedMac (isBonded=$isBonded)...")

          var handle: Pointer? = null
          var socket: BluetoothSocket? = null
          var lastError: Exception? = null

          // 1. First attempt: AutoReplyPrint CP_Port_OpenBtSpp (fast, proven on DEV-7299)
          val modeAttempts = if (isBonded) listOf(1, 0) else listOf(0, 1)
          for (mode in modeAttempts) {
            try {
              Log.i(TAG, "Opening port via CP_Port_OpenBtSpp($formattedMac, mode=$mode)...")
              val attemptHandle = AutoReplyPrint.INSTANCE.CP_Port_OpenBtSpp(formattedMac, mode)
              if (attemptHandle != null && Pointer.nativeValue(attemptHandle) != 0L) {
                val isValid = try {
                  AutoReplyPrint.INSTANCE.CP_Port_IsConnectionValid(attemptHandle)
                } catch (_: Exception) {
                  true
                }
                if (isValid) {
                  handle = attemptHandle
                  Log.i(TAG, "AutoReplyPrint SPP port connected successfully (mode=$mode)")
                  break
                } else {
                  try { AutoReplyPrint.INSTANCE.CP_Port_Close(attemptHandle) } catch (_: Exception) {}
                }
              }
            } catch (e: Exception) {
              Log.w(TAG, "CP_Port_OpenBtSpp attempt (mode=$mode) failed: ${e.message}")
              if (lastError == null) lastError = e
            }
          }

          // 2. Direct RFCOMM socket connection (exact match to inventort-seznik BluetoothService)
          if (handle == null || Pointer.nativeValue(handle) == 0L) {
            try {
              Log.i(TAG, "Attempting direct Bluetooth RFCOMM socket fallback to $formattedMac...")
              @SuppressLint("MissingPermission")
              val sock = device.createRfcommSocketToServiceRecord(SPP_UUID)
              sock.connect()
              socket = sock
              socketOutStream = sock.outputStream
              Log.i(TAG, "Direct Bluetooth RFCOMM socket connected successfully")
            } catch (e: Exception) {
              Log.w(TAG, "Direct Bluetooth RFCOMM socket failed: ${e.message}")
              if (lastError == null) lastError = e
            }
          }

          if ((handle == null || Pointer.nativeValue(handle) == 0L) && socket == null) {
            throw (lastError ?: Exception("Failed to establish Bluetooth connection to DEV printer at $formattedMac"))
          }

          printerHandle = handle
          bluetoothSocket = socket
          connectedMac = formattedMac
          @SuppressLint("MissingPermission")
          val resolvedName = name ?: device.name ?: "SEZNIK DEV"
          connectedName = resolvedName

          sendEvent(
            "onConnectionChanged",
            mapOf(
              "connected" to true,
              "id" to formattedMac,
              "name" to resolvedName,
              "transport" to "dev-spp",
              "sdkId" to "dev",
            ),
          )
          promise.resolve(
            mapOf(
              "id" to formattedMac,
              "name" to resolvedName,
              "transport" to "dev-spp",
              "sdkId" to "dev",
            ),
          )
        } catch (e: Exception) {
          closeHandle()
          promise.reject("CONNECT_FAILED", e.message ?: "Failed to connect to DEV printer.", e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        closeHandle()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "dev"),
        )
        promise.resolve(true)
      }
    }

    Function("isConnected") {
      isHandleAlive()
    }

    Function("getConnectedDevice") {
      if (isHandleAlive() && connectedMac != null) {
        mapOf(
          "id" to connectedMac,
          "name" to connectedName,
          "transport" to "dev-spp",
          "sdkId" to "dev",
        )
      } else {
        null
      }
    }

    AsyncFunction("getStatus") { promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val h = printerHandle
          if (h != null && Pointer.nativeValue(h) != 0L) {
            val errRef = LongByReference()
            val infoRef = LongByReference()
            val tsRef = LongByReference()
            val ok = AutoReplyPrint.INSTANCE.CP_Printer_GetPrinterStatusInfo(h, errRef, infoRef, tsRef)
            if (ok) {
              val errStatus = errRef.value
              val infoStatus = infoRef.value
              val statusHelper = AutoReplyPrint.CP_PrinterStatus(errStatus, infoStatus)

              promise.resolve(
                mapOf(
                  "ready" to !statusHelper.ERROR_OCCURED(),
                  "hasError" to statusHelper.ERROR_OCCURED(),
                  "noPaper" to statusHelper.ERROR_NOPAPER(),
                  "coverOpen" to statusHelper.ERROR_COVERUP(),
                  "overheat" to statusHelper.ERROR_OVERHEAT(),
                  "voltageError" to statusHelper.ERROR_VOLTAGE(),
                  "isLabelMode" to statusHelper.INFO_LABELMODE(),
                  "isLabelPaper" to statusHelper.INFO_LABELPAPER(),
                  "errorStatusHex" to String.format("0x%04X", errStatus and 0xFFFF),
                  "infoStatusHex" to String.format("0x%04X", infoStatus and 0xFFFF),
                ),
              )
              return@execute
            }
          }
          promise.resolve(
            mapOf(
              "ready" to true,
              "hasError" to false,
              "noPaper" to false,
              "coverOpen" to false,
              "isLabelMode" to true,
            ),
          )
        } catch (e: Exception) {
          promise.reject("STATUS_ERROR", e.message, e)
        }
      }
    }

    AsyncFunction("calibrate") { paperTypeParam: Any?, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          Log.i(TAG, "Calibrating DEV printer via TSPL GAPDETECT...")
          val calCmd = "GAPDETECT\r\nAUTO GAP\r\n".toByteArray(Charsets.US_ASCII)
          val ok = writeBytes(calCmd)
          printerHandle?.let {
            try { AutoReplyPrint.INSTANCE.CP_Label_CalibrateLabel(it) } catch (_: Exception) {}
          }
          promise.resolve(mapOf("success" to ok, "calibrated" to ok))
        } catch (e: Exception) {
          promise.reject("CALIBRATE_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("feedLabel") { promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          Log.i(TAG, "Feeding DEV printer via TSPL FORMFEED...")
          val feedCmd = "FORMFEED\r\n".toByteArray(Charsets.US_ASCII)
          val ok = writeBytes(feedCmd)
          promise.resolve(mapOf("success" to ok))
        } catch (e: Exception) {
          promise.reject("FEED_FAILED", e.message, e)
        }
      }
    }

    /**
     * Print PNG Label matching inventort-seznik's hardware TSPL & ESC/POS pipelines.
     * Uses TSPL (SIZE, GAP, SPEED, DENSITY, CLS, BITMAP, PRINT) for label mode and
     * line-by-line ESC/POS raster for receipt continuous mode.
     */
    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      val pngBase64 = options["pngBase64"] as? String
        ?: throw IllegalArgumentException("pngBase64 is required")
      val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
      val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
      val gapMm = (options["gapMm"] as? Number)?.toDouble() ?: 2.0
      val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
      val density = ((options["density"] as? Number)?.toInt() ?: 14).coerceIn(1, 15)
      val speed = ((options["speed"] as? Number)?.toInt() ?: 3).coerceIn(1, 10)
      val media = (options["media"] as? String) ?: "gap"
      val commandSet = (options["commandSet"] as? String) ?: "escpos"
      val hOffsetMm = (options["hOffsetMm"] as? Number)?.toDouble() ?: 0.0
      val vOffsetMm = (options["vOffsetMm"] as? Number)?.toDouble() ?: 0.0
      // Halftone/dither opted into by app for continuous-tone photos only;
      // solid vector labels and text use crisp thresholding to prevent faded stippling.
      val dither = (options["dither"] as? Boolean) ?: false
      val threshold = ((options["threshold"] as? Number)?.toInt() ?: 160).coerceIn(10, 250)
      // Physical printhead width — must come from the connected printer's real
      // hardware, never guessed from the label being printed (that clips/shifts
      // labels that straddle the 58 mm/80 mm class boundary).
      val printheadWidthMm = (options["printheadWidthMm"] as? Number)?.toDouble() ?: 48.0

      ioExecutor.execute {
        try {
          val t0 = System.currentTimeMillis()
          val raw = Base64.decode(pngBase64, Base64.DEFAULT)
          val decoded = BitmapFactory.decodeByteArray(raw, 0, raw.size)
            ?: throw IllegalArgumentException("Could not decode PNG for print.")

          val useEscPos = commandSet != "tspl"
          val feedDots = if (media == "continuous") 0 else Math.max(16, Math.min(48, Math.round(gapMm * 8.0).toInt()))

          val (jobBytes, wDots, hDots) = if (useEscPos) {
            Log.i(TAG, "Building ESC/POS raster job: ${widthMm}x${heightMm}mm feedDots=$feedDots offset=${hOffsetMm}x${vOffsetMm}mm head=${printheadWidthMm}mm...")
            buildEscPosRasterJob(decoded, widthMm, printheadWidthMm, hOffsetMm, vOffsetMm, feedDots, dither, threshold)
          } else {
            Log.i(TAG, "Building TSPL label job: ${widthMm}x${heightMm}mm head=${printheadWidthMm}mm gap=${gapMm}mm copies=$copies offset=${hOffsetMm}x${vOffsetMm}mm density=$density speed=$speed threshold=$threshold...")
            buildTsplPrintJob(decoded, widthMm, heightMm, printheadWidthMm, gapMm, copies, density, speed, hOffsetMm, vOffsetMm, dither, threshold)
          }

          if (!decoded.isRecycled) decoded.recycle()

          var writeOk = true
          val loopCopies = if (useEscPos) copies else 1
          for (c in 0 until loopCopies) {
            val ok = writeBytes(jobBytes)
            if (!ok) {
              writeOk = false
              break
            }
            if (c < loopCopies - 1) {
              try { Thread.sleep(200) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            }
          }
          val tTotal = System.currentTimeMillis() - t0
          Log.i(TAG, "DEV print completed in ${tTotal}ms: engine=${if (useEscPos) "escpos" else "tspl"}, bytes=${jobBytes.size}, copies=$copies, success=$writeOk")

          if (!writeOk) {
            throw Exception("Failed to write print data to DEV printer.")
          }

          promise.resolve(
            mapOf(
              "success" to true,
              "widthDots" to wDots,
              "heightDots" to hDots,
              "copies" to copies,
              "durationMs" to tTotal,
              "bytesSent" to jobBytes.size,
              "commandSet" to (if (useEscPos) "escpos" else "tspl"),
            ),
          )
        } catch (e: Exception) {
          Log.e(TAG, "printPngLabel failed: ${e.message}", e)
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Print POS text receipt matching samplepos
     */
    AsyncFunction("printReceiptText") { text: String, options: Map<String, Any?>?, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val initCmd = byteArrayOf(0x1B, 0x40) // ESC @
          writeBytes(initCmd)

          val textBytes = text.toByteArray(Charsets.UTF_8)
          writeBytes(textBytes)

          val feedCutCmd = byteArrayOf(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x01) // Feed + partial cut
          writeBytes(feedCutCmd)

          promise.resolve(mapOf("success" to true))
        } catch (e: Exception) {
          promise.reject("PRINT_RECEIPT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Test print: renders a clean 384x240 (48x30mm) test ticket with border, text, and barcode,
     * and sends it through the hardware TSPL label pipeline matching inventort-seznik.
     */
    AsyncFunction("testPrint") { optionsParam: Any?, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val w = 384
          val h = 240
          val testBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(testBitmap)
          canvas.drawColor(Color.WHITE)

          val paint = Paint().apply {
            color = Color.BLACK
            isAntiAlias = true
          }

          // Border box
          val boxPaint = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 3f
          }
          canvas.drawRect(4f, 4f, (w - 5).toFloat(), (h - 5).toFloat(), boxPaint)

          // Title
          paint.textSize = 28f
          paint.isFakeBoldText = true
          canvas.drawText("SEZNIK DEV 2-in-1", 20f, 45f, paint)

          // Status & Details
          val options = optionsParam as? Map<*, *>
          val mode = (options?.get("mode") as? String) ?: "escpos"

          paint.textSize = 20f
          paint.isFakeBoldText = false
          canvas.drawText("STATUS: TEST OK", 20f, 85f, paint)
          canvas.drawText("MODE: ${if (mode == "tspl") "TSPL" else "ESC/POS GRAPHIC"}", 20f, 115f, paint)
          canvas.drawText("RESOLUTION: 203 DPI", 20f, 145f, paint)

          // Barcode representation
          paint.style = Paint.Style.FILL
          var barX = 20f
          val barY = 165f
          val barHeight = 45f
          val pattern = intArrayOf(2, 1, 3, 2, 1, 2, 3, 1, 2, 2, 1, 3, 2, 1, 3, 2, 1, 2, 2, 3, 1, 2, 1, 3, 2, 1, 2, 3)
          var isBar = true
          for (width in pattern) {
            if (isBar) {
              canvas.drawRect(barX, barY, barX + width * 4, barY + barHeight, paint)
            }
            barX += width * 4
            isBar = !isBar
          }
          paint.textSize = 16f
          canvas.drawText("* DEV-7299 *", 20f, 225f, paint)

          val (jobBytes, _, _) = if (mode == "tspl") {
            buildTsplPrintJob(testBitmap, 48.0, 30.0, 48.0, 2.0, 1, 14, 3, 0.0, 0.0, false, 160)
          } else {
            buildEscPosRasterJob(testBitmap, 48.0, 48.0, 0.0, 0.0, 30, false, 160)
          }
          testBitmap.recycle()

          val writeOk = writeBytes(jobBytes)
          Log.i(TAG, "Test print completed (mode=$mode): bytes=${jobBytes.size}, success=$writeOk")
          promise.resolve(mapOf("success" to writeOk))
        } catch (e: Exception) {
          Log.e(TAG, "Test print failed: ${e.message}", e)
          promise.reject("TEST_PRINT_FAILED", e.message, e)
        }
      }
    }
  }

  private data class PrintJobResult(val data: ByteArray, val widthDots: Int, val heightDots: Int)

  /** TSPL accepts fractional millimetres; whole-mm rounding drifts against the bitmap. */
  private fun formatMm(mm: Double): String {
    val rounded = Math.round(mm * 100.0) / 100.0
    return String.format(java.util.Locale.US, "%.2f", rounded)
  }

  /**
   * Hardware TSPL label job generator matching inventort-seznik's BluetoothTscPrinter.printLabel
   */
  private fun buildTsplPrintJob(
    bitmap: Bitmap,
    widthMm: Double,
    heightMm: Double,
    printheadWidthMm: Double,
    gapMm: Double,
    copies: Int,
    density: Int,
    speed: Int,
    hOffsetMm: Double,
    vOffsetMm: Double,
    dither: Boolean = false,
    threshold: Int = 160
  ): PrintJobResult {
    val dpm = 8.0 // 203 DPI = 8 dots/mm
    val rawW = Math.max(64, Math.round(widthMm * dpm).toInt())
    val headDots = Math.max(64, ((Math.round(printheadWidthMm * dpm).toInt() + 7) / 8) * 8) // 384 dots for 48mm head

    // Physical DEV thermal head geometry (DEV-7299 / 58mm mechanism):
    // 1. The thermal head has 384 dots (48.0mm).
    // 2. Head dot 0 is mounted at 1.37mm from the left edge of a 50mm label sticker.
    // 3. Head dot 383 is mounted at 0.63mm from the right edge of a 50mm label sticker.
    // 4. Physical symmetry condition for equal left & right margins on the label:
    //    Left margin = 1.37mm + drawX * 0.125mm
    //    Right margin = 0.63mm + (headDots - drawX - targetW) * 0.125mm
    //    Setting Left margin = Right margin yields: 2 * drawX + targetW = 378 dots (47.25mm).
    //    At drawX = 0, targetW = 378 dots gives:
    //    Left margin = 1.37mm, Right margin = 1.38mm (<0.01mm error, perfect centering!).
    val maxSymmetricDots = Math.min(headDots, 378) // 378 dots (47.25mm)
    val fit = if (rawW > maxSymmetricDots) maxSymmetricDots.toDouble() / rawW.toDouble() else 1.0
    val targetW = Math.min(headDots, Math.max(8, Math.round(rawW * fit).toInt()))
    val targetH = Math.max(32, Math.round(bitmap.height * fit).toInt())

    val scaled: Bitmap = if (bitmap.width == targetW && bitmap.height == targetH) {
      bitmap
    } else {
      Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
    }

    // Centering & Alignment:
    // 1. Horizontal centering in the symmetric zone:
    val baseCenterPadX = Math.max(0, (maxSymmetricDots - targetW) / 2)
    val userHOffsetDots = Math.round(hOffsetMm * dpm).toInt()
    val drawX = Math.max(0, Math.min(headDots - targetW, baseCenterPadX + userHOffsetDots))

    // 2. Vertical centering:
    // The physical label height in dots is round(heightMm * dpm).
    // Center targetH inside the physical label height so top and bottom margins match left and right margins (~1.38mm).
    val labelHeightDots = Math.max(targetH, Math.round(heightMm * dpm).toInt())
    val baseCenterPadY = Math.max(0, (labelHeightDots - targetH) / 2)
    val userVOffsetDots = Math.round(vOffsetMm * dpm).toInt()
    val drawY = Math.max(0, baseCenterPadY + userVOffsetDots)

    val printWidth = headDots
    val widthBytes = printWidth / 8
    val height = Math.max(labelHeightDots, targetH + drawY + 4)

    val solidBitmap = Bitmap.createBitmap(printWidth, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(solidBitmap)
    canvas.drawColor(Color.WHITE)
    canvas.drawBitmap(scaled, drawX.toFloat(), drawY.toFloat(), null)

    val pixels = IntArray(printWidth * height)
    solidBitmap.getPixels(pixels, 0, printWidth, 0, 0, printWidth, height)

    val rawBmp = ByteArray(widthBytes * height)
    for (y in 0 until height) {
      val rowOffset = y * widthBytes
      val pixRowOffset = y * printWidth
      for (byteCol in 0 until widthBytes) {
        var byteVal = 0
        for (bit in 0 until 8) {
          val x = byteCol * 8 + bit
          val color = pixels[pixRowOffset + x]
          val r = (color shr 16) and 0xFF
          val g = (color shr 8) and 0xFF
          val b = color and 0xFF
          val a = (color shr 24) and 0xFF
          // Alpha blending against white canvas for sharp anti-aliased edges
          val gray = if (a <= 10) 255 else {
            val alpha = a / 255.0
            val rBlended = (r * alpha + 255 * (1.0 - alpha)).toInt()
            val gBlended = (g * alpha + 255 * (1.0 - alpha)).toInt()
            val bBlended = (b * alpha + 255 * (1.0 - alpha)).toInt()
            (77 * rBlended + 150 * gBlended + 29 * bBlended) shr 8
          }
          // Luminance: black dot = 0 in TSPL mode 0, white = 1
          val isBlack = if (dither) gray <= Floyd16x16[x and 15][y and 15] else gray < threshold
          if (!isBlack) {
            byteVal = byteVal or (1 shl (7 - bit))
          }
        }
        rawBmp[rowOffset + byteCol] = byteVal.toByte()
      }
    }

    if (!solidBitmap.isRecycled && solidBitmap != bitmap) solidBitmap.recycle()
    if (!scaled.isRecycled && scaled != bitmap && scaled != solidBitmap) scaled.recycle()

    // Declare SIZE as the true label dimensions matching physical stock (never artificially inflated)
    val sizeWidthMm = widthMm
    val sizeHeightMm = heightMm
    val gInt = Math.max(0, Math.round(gapMm).toInt())

    val sb = StringBuilder()
    sb.append("SPEED ").append(speed).append("\r\n")
    sb.append("DENSITY ").append(density).append("\r\n")
    sb.append("SIZE ").append(formatMm(sizeWidthMm)).append(" mm,")
      .append(formatMm(sizeHeightMm)).append(" mm\r\n")
    sb.append("GAP ").append(gInt).append(" mm,0 mm\r\n")
    sb.append("DIRECTION 0\r\n")
    sb.append("REFERENCE 0,0\r\n")
    sb.append("SET TEAR ON\r\n")
    sb.append("CLS\r\n")
    sb.append("BITMAP 0,0,").append(widthBytes).append(",").append(height).append(",0,")

    val headerBytes = sb.toString().toByteArray(Charsets.US_ASCII)
    val footerBytes = "\r\nPRINT ${copies},1\r\n".toByteArray(Charsets.US_ASCII)

    val job = ByteArray(headerBytes.size + rawBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(rawBmp, 0, job, headerBytes.size, rawBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + rawBmp.size, footerBytes.size)

    return PrintJobResult(job, printWidth, height)
  }

  /**
   * Sliced line-by-line ESC/POS raster job generator matching inventort-seznik POS_PrintBMP and the @vardrz patch
   */
  private fun buildEscPosRasterJob(
    bitmap: Bitmap,
    widthMm: Double,
    printheadWidthMm: Double,
    hOffsetMm: Double,
    vOffsetMm: Double,
    feedDots: Int = 30,
    dither: Boolean = false,
    threshold: Int = 160
  ): PrintJobResult {
    val dpm = 8.0
    val rawW = Math.max(64, Math.round(widthMm * dpm).toInt())
    // Real hardware raster width for this printer's ESC/POS engine — must come
    // from the connected printer's actual head, never from the label size
    // being printed (that picked the wrong head class for labels near 58mm).
    val headDots = Math.max(64, ((Math.round(printheadWidthMm * dpm).toInt() + 7) / 8) * 8)
    val headBytes = headDots / 8
    val maxSymmetricDots = Math.min(headDots, 378) // 378 dots (47.25mm)

    val fit = if (rawW > maxSymmetricDots) maxSymmetricDots.toDouble() / rawW.toDouble() else 1.0
    val targetW = Math.min(headDots, Math.max(8, Math.round(rawW * fit).toInt()))
    val targetH = Math.max(32, Math.round(bitmap.height * fit).toInt())

    val scaled = if (bitmap.width == targetW && bitmap.height == targetH) {
      bitmap
    } else {
      Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
    }

    val baseCenterPadX = Math.max(0, (maxSymmetricDots - targetW) / 2)
    val userHOffsetDots = Math.round(hOffsetMm * dpm).toInt()
    val userVOffsetDots = Math.round(vOffsetMm * dpm).toInt()
    val drawX = Math.max(0, Math.min(headDots - targetW, baseCenterPadX + userHOffsetDots))
    val drawY = Math.max(0, userVOffsetDots)

    val height = ((targetH + drawY + 7) / 8) * 8
    val solidBitmap = Bitmap.createBitmap(headDots, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(solidBitmap)
    canvas.drawColor(Color.WHITE)
    canvas.drawBitmap(scaled, drawX.toFloat(), drawY.toFloat(), null)

    val pixels = IntArray(headDots * height)
    solidBitmap.getPixels(pixels, 0, headDots, 0, 0, headDots, height)

    val outStream = ByteArrayOutputStream()
    outStream.write(byteArrayOf(0x1B, 0x40)) // ESC @ (init)

    for (y in 0 until height) {
      val pixRowOffset = y * headDots
      val rowCmd = ByteArray(8 + headBytes)
      rowCmd[0] = 0x1D
      rowCmd[1] = 0x76
      rowCmd[2] = 0x30
      rowCmd[3] = 0x00
      rowCmd[4] = (headBytes and 0xFF).toByte()
      rowCmd[5] = ((headBytes shr 8) and 0xFF).toByte()
      rowCmd[6] = 0x01
      rowCmd[7] = 0x00

      for (byteCol in 0 until headBytes) {
        var byteVal = 0
        for (bit in 0 until 8) {
          val x = byteCol * 8 + bit
          if (x < headDots) {
            val color = pixels[pixRowOffset + x]
            val r = (color shr 16) and 0xFF
            val g = (color shr 8) and 0xFF
            val b = color and 0xFF
            val a = (color shr 24) and 0xFF
            val gray = if (a <= 10) 255 else {
              val alpha = a / 255.0
              val rBlended = (r * alpha + 255 * (1.0 - alpha)).toInt()
              val gBlended = (g * alpha + 255 * (1.0 - alpha)).toInt()
              val bBlended = (b * alpha + 255 * (1.0 - alpha)).toInt()
              (77 * rBlended + 150 * gBlended + 29 * bBlended) shr 8
            }
            val isBlack = if (dither) gray <= Floyd16x16[x and 15][y and 15] else gray < threshold
            if (isBlack) {
              byteVal = byteVal or (1 shl (7 - bit))
            }
          }
        }
        rowCmd[8 + byteCol] = byteVal.toByte()
      }
      outStream.write(rowCmd)
    }

    // Trailing feed: matching @vardrz patch POS_Set_PrtAndFeedPaper(feed) -> ESC J feed
    if (feedDots > 0) {
      val feedVal = Math.min(255, feedDots)
      outStream.write(byteArrayOf(0x1B, 0x4A, feedVal.toByte())) // ESC J feed
    }
    outStream.write(byteArrayOf(0x1B, 0x40)) // ESC @ reset

    if (!solidBitmap.isRecycled && solidBitmap != bitmap) solidBitmap.recycle()
    if (!scaled.isRecycled && scaled != bitmap && scaled != solidBitmap) scaled.recycle()

    return PrintJobResult(outStream.toByteArray(), headDots, height)
  }

  /**
   * Universal byte writer supporting both RFCOMM BluetoothSocket and AutoReplyPrint handle
   */
  private fun writeBytes(data: ByteArray): Boolean {
    // 1. Direct Bluetooth RFCOMM socket if active
    val stream = socketOutStream
    if (stream != null) {
      try {
        val chunkSize = 2048
        var offset = 0
        while (offset < data.size) {
          val count = Math.min(chunkSize, data.size - offset)
          stream.write(data, offset, count)
          offset += count
        }
        stream.flush()
        Log.i(TAG, "Wrote ${data.size} bytes to BluetoothSocket stream")
        return true
      } catch (e: Exception) {
        Log.e(TAG, "socketOutStream.write failed: ${e.message}", e)
      }
    }

    // 2. SPP port via AutoReplyPrint handle
    val h = printerHandle
    if (h != null && Pointer.nativeValue(h) != 0L) {
      val chunkSize = 2048
      var offset = 0
      while (offset < data.size) {
        val count = Math.min(chunkSize, data.size - offset)
        val chunk = if (offset == 0 && count == data.size) data else data.copyOfRange(offset, offset + count)
        val written = AutoReplyPrint.INSTANCE.CP_Port_Write(h, chunk, count, 5000)
        if (written <= 0) {
          Log.e(TAG, "CP_Port_Write failed at offset $offset (expected $count, got $written)")
          return false
        }
        offset += count
      }
      Log.i(TAG, "Wrote ${data.size} bytes via CP_Port_Write")
      return true
    }

    Log.e(TAG, "writeBytes failed: no active connection (socket or handle)")
    return false
  }

  private fun isHandleAlive(): Boolean {
    if (bluetoothSocket?.isConnected == true) return true
    val h = printerHandle ?: return false
    return try {
      AutoReplyPrint.INSTANCE.CP_Port_IsConnectionValid(h)
    } catch (_: Exception) {
      false
    }
  }

  private fun closeHandle() {
    try {
      socketOutStream?.close()
    } catch (_: Exception) {}
    socketOutStream = null

    try {
      bluetoothSocket?.close()
    } catch (_: Exception) {}
    bluetoothSocket = null

    try {
      printerHandle?.let {
        AutoReplyPrint.INSTANCE.CP_Port_Close(it)
      }
    } catch (_: Exception) {}
    printerHandle = null
    connectedMac = null
    connectedName = null
  }

  private fun ensureAclReceiver() {
    if (aclReceiverRegistered) return
    val context = appContext.reactContext ?: return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(aclReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(aclReceiver, filter)
    }
    aclReceiverRegistered = true
  }

  private fun unregisterAclReceiverSafe() {
    if (!aclReceiverRegistered) return
    try {
      appContext.reactContext?.unregisterReceiver(aclReceiver)
    } catch (_: Exception) {
    }
    aclReceiverRegistered = false
  }

  private fun ensureReceiver() {
    if (receiverRegistered) return
    val context = appContext.reactContext ?: return
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

  private fun unregisterReceiverSafe() {
    if (!receiverRegistered) return
    try {
      appContext.reactContext?.unregisterReceiver(discoveryReceiver)
    } catch (_: Exception) {
    }
    receiverRegistered = false
  }

  private fun getAdapter(): BluetoothAdapter? {
    val context = appContext.reactContext ?: return null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
  }

  private fun hasConnectPermission(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
  }

  private fun hasPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val scan = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
        PackageManager.PERMISSION_GRANTED
      val connect = hasConnectPermission(context)
      scan && connect
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    }
  }

  @SuppressLint("MissingPermission")
  private fun deviceToMap(device: BluetoothDevice, bonded: Boolean): Map<String, Any?> {
    val name = try {
      device.name
    } catch (_: SecurityException) {
      null
    }
    val displayName = if (name.isNullOrBlank()) "Bluetooth ${device.address}" else name
    val isDev = isLikelyDev(name) || isLikelyDev(displayName)
    return mapOf(
      "id" to device.address,
      "name" to displayName,
      "rawName" to name,
      "bonded" to bonded,
      "transport" to "dev-spp",
      "sdkId" to "dev",
      "likelyDev" to isDev,
    )
  }

  @SuppressLint("MissingPermission")
  private fun emitDevice(device: BluetoothDevice, bonded: Boolean) {
    sendEvent("onDeviceFound", deviceToMap(device, bonded))
  }

  private fun isLikelyDev(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    val n = name.lowercase()
    return n.contains("dev") ||
      n.contains("2in1") ||
      n.contains("2-in-1") ||
      n.contains("2 in 1") ||
      n.contains("seznik dev") ||
      n.contains("autoreply") ||
      n.contains("caysn") ||
      n.contains("pos-58") ||
      n.contains("pos-80") ||
      n.contains("printer_58") ||
      n.contains("printer_80")
  }
}
