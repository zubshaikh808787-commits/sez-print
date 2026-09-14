package expo.modules.devprinter

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
import java.util.concurrent.Executors

class DevPrinterModule : Module() {
  private val TAG = "DevPrinter"
  private val ioExecutor = Executors.newCachedThreadPool()

  private var printerHandle: Pointer? = null
  private var connectedMac: String? = null
  private var connectedName: String? = null
  private var receiverRegistered = false

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

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged")

    OnCreate {
      ensureReceiver()
    }

    OnDestroy {
      unregisterReceiverSafe()
      closeHandle()
    }

    Function("isAvailable") {
      try {
        AutoReplyPrint.INSTANCE != null
      } catch (e: Throwable) {
        Log.w(TAG, "AutoReplyPrint SDK not available: ${e.message}")
        false
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
      val canDiscover = hasPermissions(context)
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
          if (adapter.isDiscovering) adapter.cancelDiscovery()

          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          for (device in bonded) {
            emitDevice(device, bonded = true)
          }

          if (!canDiscover) {
            sendEvent("onScanFinished", emptyMap<String, Any?>())
            promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to bonded.size))
            return@execute
          }

          @SuppressLint("MissingPermission")
          val started = adapter.startDiscovery()
          if (!started) {
            sendEvent("onScanFinished", emptyMap<String, Any?>())
            promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to bonded.size))
            return@execute
          }
          promise.resolve(mapOf("discoveryStarted" to true, "bondedCount" to bonded.size))
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
          val isBonded = try {
            @SuppressLint("MissingPermission")
            device?.bondState == BluetoothDevice.BOND_BONDED
          } catch (_: Exception) {
            false
          }

          // Prioritize secure (1) for bonded devices, standard (0) for unbonded devices
          val modeAttempts = if (isBonded) listOf(1, 0) else listOf(0, 1)
          Log.i(TAG, "Connecting to DEV printer $formattedMac (isBonded=$isBonded, modes=$modeAttempts)...")

          var h: Pointer? = null
          var lastError: Exception? = null
          val maxPasses = 2

          for (pass in 1..maxPasses) {
            for (mode in modeAttempts) {
              try {
                Log.i(TAG, "Opening AutoReplyPrint SPP port to $formattedMac (pass $pass, mode $mode)...")
                val attemptHandle = AutoReplyPrint.INSTANCE.CP_Port_OpenBtSpp(formattedMac, mode)
                if (attemptHandle != null && Pointer.nativeValue(attemptHandle) != 0L) {
                  val isValid = try {
                    AutoReplyPrint.INSTANCE.CP_Port_IsConnectionValid(attemptHandle)
                  } catch (_: Exception) {
                    true
                  }
                  if (isValid) {
                    h = attemptHandle
                    Log.i(TAG, "AutoReplyPrint SPP connected successfully via mode $mode (pass $pass)")
                    break
                  } else {
                    Log.w(TAG, "Handle created via mode $mode but connection validation failed, closing...")
                    try { AutoReplyPrint.INSTANCE.CP_Port_Close(attemptHandle) } catch (_: Exception) {}
                  }
                }
              } catch (e: Exception) {
                Log.w(TAG, "Mode $mode attempt failed: ${e.message}")
                lastError = e
              }
              try { Thread.sleep(200) } catch (_: InterruptedException) { Thread.currentThread().interrupt(); break }
            }
            if (h != null) break
            if (pass < maxPasses) {
              Log.i(TAG, "Retrying SPP connection to $formattedMac after 300ms pause...")
              try { Thread.sleep(300) } catch (_: InterruptedException) { Thread.currentThread().interrupt(); break }
            }
          }

          if (h == null || Pointer.nativeValue(h) == 0L) {
            throw (lastError ?: Exception("Failed to establish stable Bluetooth connection to DEV printer at $formattedMac"))
          }

          printerHandle = h
          connectedMac = formattedMac
          val resolvedName = name ?: "SEZNIK DEV"
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
      val h = printerHandle
      if (h == null || !isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val errRef = LongByReference()
          val infoRef = LongByReference()
          val tsRef = LongByReference()
          val ok = AutoReplyPrint.INSTANCE.CP_Printer_GetPrinterStatusInfo(h, errRef, infoRef, tsRef)
          if (!ok) {
            promise.resolve(mapOf("ready" to false, "error" to "STATUS_QUERY_FAILED"))
            return@execute
          }
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
              "cutterError" to statusHelper.ERROR_CUTTER(),
              "lowVoltage" to statusHelper.ERROR_VOLTAGE(),
              "isLabelPaper" to statusHelper.INFO_LABELPAPER(),
              "isLabelMode" to statusHelper.INFO_LABELMODE(),
              "rawErrorStatus" to errStatus,
              "rawInfoStatus" to infoStatus,
            ),
          )
        } catch (e: Exception) {
          promise.reject("STATUS_ERROR", e.message, e)
        }
      }
    }

    AsyncFunction("calibrate") { paperTypeParam: Any?, promise: Promise ->
      val h = printerHandle
      if (h == null || !isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          Log.i(TAG, "Starting DEV printer label calibration...")
          AutoReplyPrint.INSTANCE.CP_Label_EnableLabelMode(h)
          val calOk = AutoReplyPrint.INSTANCE.CP_Label_CalibrateLabel(h)
          val feedOk = AutoReplyPrint.INSTANCE.CP_Label_FeedLabel(h)
          promise.resolve(
            mapOf(
              "success" to (calOk || feedOk),
              "calibrated" to calOk,
              "fed" to feedOk,
            ),
          )
        } catch (e: Exception) {
          promise.reject("CALIBRATE_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      val h = printerHandle
      if (h == null || !isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      val pngBase64 = options["pngBase64"] as? String
        ?: throw IllegalArgumentException("pngBase64 is required")
      val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
      val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
      val gapMm = (options["gapMm"] as? Number)?.toDouble() ?: 2.0
      val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
      val density = ((options["density"] as? Number)?.toInt() ?: 8).coerceIn(1, 15)

      ioExecutor.execute {
        try {
          val t0 = System.currentTimeMillis()
          val raw = Base64.decode(pngBase64, Base64.DEFAULT)
          val decoded = BitmapFactory.decodeByteArray(raw, 0, raw.size)
            ?: throw IllegalArgumentException("Could not decode PNG for print.")

          val sdk = AutoReplyPrint.INSTANCE

          // --- Compute target dot dimensions at 203 DPI (8 dots/mm) ---
          val DPM = 8.0
          val rawW = Math.max(64, Math.round(widthMm * DPM).toInt())
          val rawH = Math.max(64, Math.round(heightMm * DPM).toInt())
          val maxHeadDots = if (widthMm > 58.0) 576 else 384
          val targetW = Math.min(maxHeadDots, rawW)
          val widthDots = ((targetW + 7) / 8) * 8
          val heightDots = Math.max(64, Math.round(rawH * (widthDots.toDouble() / rawW)).toInt())
          val widthBytes = widthDots / 8

          Log.i(TAG, "Printing DEV ${widthMm}x${heightMm}mm (${decoded.width}x${decoded.height}px -> ${widthDots}x${heightDots}dots), gap=${gapMm}mm, copies=$copies, density=$density")

          // --- Scale bitmap to exact dot dimensions ---
          val scaled = if (decoded.width != widthDots || decoded.height != heightDots) {
            Bitmap.createScaledBitmap(decoded, widthDots, heightDots, true)
          } else {
            decoded
          }

          // --- Flatten alpha onto white background ---
          val solidBitmap = Bitmap.createBitmap(widthDots, heightDots, Bitmap.Config.ARGB_8888)
          val canvas = android.graphics.Canvas(solidBitmap)
          canvas.drawColor(android.graphics.Color.WHITE)
          canvas.drawBitmap(scaled, 0f, 0f, null)

          // --- Convert to 1-bit monochrome: black=1, white=0 (SDK convention) ---
          val pixels = IntArray(widthDots * heightDots)
          solidBitmap.getPixels(pixels, 0, widthDots, 0, 0, widthDots, heightDots)

          val bmpData = ByteArray(widthBytes * heightDots)
          for (y in 0 until heightDots) {
            val rowOffset = y * widthBytes
            val pixRowOffset = y * widthDots
            for (byteCol in 0 until widthBytes) {
              var byteVal = 0
              for (bit in 0 until 8) {
                val x = byteCol * 8 + bit
                if (x < widthDots) {
                  val color = pixels[pixRowOffset + x]
                  val r = (color shr 16) and 0xFF
                  val g = (color shr 8) and 0xFF
                  val b = color and 0xFF
                  val a = (color shr 24) and 0xFF
                  val isBlack = if (a < 50) false else ((77 * r + 150 * g + 29 * b) shr 8) < 128
                  if (isBlack) {
                    byteVal = byteVal or (1 shl (7 - bit))
                  }
                }
              }
              bmpData[rowOffset + byteCol] = byteVal.toByte()
            }
          }

          if (!solidBitmap.isRecycled && solidBitmap != decoded) solidBitmap.recycle()
          if (!scaled.isRecycled && scaled != decoded && scaled != solidBitmap) scaled.recycle()

          // --- Use the AutoReplyPrint SDK Label API ---
          // Step 1: Enable label mode
          sdk.CP_Label_EnableLabelMode(h)
          Log.i(TAG, "CP_Label_EnableLabelMode done")

          // Step 2: Set print density
          sdk.CP_Pos_SetPrintDensity(h, density)
          Log.i(TAG, "CP_Pos_SetPrintDensity($density) done")

          // Step 3: Begin label page (startx, starty, widthDots, heightDots, rotation)
          val gapDots = Math.max(0, Math.round(gapMm * DPM).toInt())
          val pageOk = sdk.CP_Label_PageBegin(h, 0, 0, widthDots, heightDots + gapDots, 0)
          Log.i(TAG, "CP_Label_PageBegin(0, 0, ${widthDots}, ${heightDots + gapDots}, 0) = $pageOk")

          // Step 4: Draw the bitmap image
          // CP_Label_DrawImageFromData(handle, x, y, width, height, data, widthBytes, algorithm)
          val drawOk = sdk.CP_Label_DrawImageFromData(h, 0, 0, widthDots, heightDots, bmpData, widthBytes, 0)
          Log.i(TAG, "CP_Label_DrawImageFromData(0, 0, $widthDots, $heightDots, ${bmpData.size}bytes, $widthBytes, 0) = $drawOk")

          // Step 5: Print the page
          val printOk = sdk.CP_Label_PagePrint(h, copies)
          Log.i(TAG, "CP_Label_PagePrint($copies) = $printOk")

          val tTotal = System.currentTimeMillis() - t0
          Log.i(TAG, "Print DEV complete via SDK Label API in ${tTotal}ms, pageBegin=$pageOk, draw=$drawOk, print=$printOk")

          promise.resolve(
            mapOf(
              "success" to printOk,
              "widthDots" to widthDots,
              "heightDots" to heightDots,
              "copies" to copies,
              "durationMs" to tTotal,
              "pageBeginOk" to pageOk,
              "drawOk" to drawOk,
              "printOk" to printOk,
            ),
          )
        } catch (e: Exception) {
          Log.e(TAG, "printPngLabel failed: ${e.message}", e)
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("printReceiptText") { text: String, options: Map<String, Any?>?, promise: Promise ->
      val h = printerHandle
      if (h == null || !isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val initCmd = byteArrayOf(0x1B, 0x40) // ESC @
          AutoReplyPrint.INSTANCE.CP_Port_Write(h, initCmd, 0, initCmd.size)

          val textBytes = text.toByteArray(Charsets.UTF_8)
          val written = AutoReplyPrint.INSTANCE.CP_Port_Write(h, textBytes, 0, textBytes.size)
          
          val feedCutCmd = byteArrayOf(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x01) // Feed + partial cut
          AutoReplyPrint.INSTANCE.CP_Port_Write(h, feedCutCmd, 0, feedCutCmd.size)

          promise.resolve(mapOf("success" to (written > 0)))
        } catch (e: Exception) {
          promise.reject("PRINT_RECEIPT_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("testPrint") { promise: Promise ->
      val h = printerHandle
      if (h == null || !isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val sdk = AutoReplyPrint.INSTANCE
          sdk.CP_Label_EnableLabelMode(h)
          sdk.CP_Pos_SetPrintDensity(h, 8)
          // 50mm x 30mm label at 8 dots/mm
          sdk.CP_Label_PageBegin(h, 0, 0, 400, 256, 0)
          sdk.CP_Label_DrawTextInUTF8(h, 30, 20, 24, 0, WString("SEZNIK DEV 2-IN-1"))
          sdk.CP_Label_DrawTextInUTF8(h, 30, 60, 24, 0, WString("TEST PRINT SUCCESS"))
          sdk.CP_Label_DrawBarcode(h, 30, 100, AutoReplyPrint.CP_Label_BarcodeType_CODE128, 50, 2, AutoReplyPrint.CP_Label_BarcodeTextPrintPosition_BelowBarcode, 0, "DEV-7299")
          val printOk = sdk.CP_Label_PagePrint(h, 1)
          promise.resolve(mapOf("success" to printOk))
        } catch (e: Exception) {
          promise.reject("TEST_PRINT_FAILED", e.message, e)
        }
      }
    }
  }

  private data class PrintJobResult(val data: ByteArray, val widthDots: Int, val heightDots: Int)

  /**
   * Hardware TSPL label job generator matching inventort-seznik's BluetoothTscPrinter.printLabel
   */
  private fun buildTsplPrintJob(
    bitmap: Bitmap,
    widthMm: Double,
    heightMm: Double,
    gapMm: Double,
    copies: Int,
    density: Int,
    speed: Int
  ): PrintJobResult {
    val dpm = 8.0 // 203 DPI = 8 dots/mm
    val rawW = Math.max(64, Math.round(widthMm * dpm).toInt())
    val rawH = Math.max(64, Math.round(heightMm * dpm).toInt())

    // Clamp head width: 384 dots for 58mm printer, 576 dots for 80mm
    val maxHeadDots = if (widthMm > 58.0) 576 else 384
    val targetW = Math.min(maxHeadDots, rawW)
    val width = ((targetW + 7) / 8) * 8
    val height = Math.max(64, Math.round(rawH * (width.toDouble() / rawW)).toInt())
    val widthBytes = width / 8

    val scaled = if (bitmap.width != width || bitmap.height != height) {
      Bitmap.createScaledBitmap(bitmap, width, height, true)
    } else {
      bitmap
    }

    val solidBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(solidBitmap)
    canvas.drawColor(android.graphics.Color.WHITE)
    canvas.drawBitmap(scaled, 0f, 0f, null)

    val pixels = IntArray(width * height)
    solidBitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    val rawBmp = ByteArray(widthBytes * height)
    for (y in 0 until height) {
      val rowOffset = y * widthBytes
      val pixRowOffset = y * width
      for (byteCol in 0 until widthBytes) {
        var byteVal = 0
        for (bit in 0 until 8) {
          val x = byteCol * 8 + bit
          if (x < width) {
            val color = pixels[pixRowOffset + x]
            val r = (color shr 16) and 0xFF
            val g = (color shr 8) and 0xFF
            val b = color and 0xFF
            val a = (color shr 24) and 0xFF
            // Luminance: black dot = 0 in TSPL, white = 1 (matching pixToTscCmd: ~temp)
            val isBlack = if (a < 50) false else ((77 * r + 150 * g + 29 * b) shr 8) < 128
            if (!isBlack) {
              byteVal = byteVal or (1 shl (7 - bit))
            }
          } else {
            byteVal = byteVal or (1 shl (7 - bit))
          }
        }
        rawBmp[rowOffset + byteCol] = byteVal.toByte()
      }
    }

    if (!solidBitmap.isRecycled && solidBitmap != bitmap) solidBitmap.recycle()
    if (!scaled.isRecycled && scaled != bitmap && scaled != solidBitmap) scaled.recycle()

    val wInt = Math.max(1, Math.round(widthMm).toInt())
    val hInt = Math.max(1, Math.round(heightMm).toInt())
    val gInt = Math.max(0, Math.round(gapMm).toInt())

    val sb = StringBuilder()
    sb.append("SIZE ").append(wInt).append(" mm,").append(hInt).append(" mm\r\n")
    sb.append("GAP ").append(gInt).append(" mm,0 mm\r\n")
    sb.append("SPEED ").append(speed).append("\r\n")
    sb.append("DENSITY ").append(density).append("\r\n")
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

    return PrintJobResult(job, width, height)
  }

  /**
   * Sliced line-by-line ESC/POS raster job generator matching inventort-seznik POS_PrintBMP
   */
  private fun buildEscPosRasterJob(bitmap: Bitmap, widthMm: Double): PrintJobResult {
    val dpm = 8.0
    val rawW = Math.max(64, Math.round(widthMm * dpm).toInt())
    val maxHeadDots = if (widthMm > 58.0) 576 else 384
    val targetW = Math.min(maxHeadDots, rawW)
    val width = ((targetW + 7) / 8) * 8
    val height = Math.max(64, Math.round(bitmap.height * (width.toDouble() / bitmap.width)).toInt())
    val widthBytes = width / 8

    val scaled = if (bitmap.width != width || bitmap.height != height) {
      Bitmap.createScaledBitmap(bitmap, width, height, true)
    } else {
      bitmap
    }

    val solidBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(solidBitmap)
    canvas.drawColor(android.graphics.Color.WHITE)
    canvas.drawBitmap(scaled, 0f, 0f, null)

    val pixels = IntArray(width * height)
    solidBitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    val outStream = ByteArrayOutputStream()
    outStream.write(byteArrayOf(0x1B, 0x40)) // ESC @

    for (y in 0 until height) {
      val pixRowOffset = y * width
      val rowCmd = ByteArray(8 + widthBytes)
      rowCmd[0] = 0x1D
      rowCmd[1] = 0x76
      rowCmd[2] = 0x30
      rowCmd[3] = 0x00
      rowCmd[4] = (widthBytes and 0xFF).toByte()
      rowCmd[5] = ((widthBytes shr 8) and 0xFF).toByte()
      rowCmd[6] = 0x01
      rowCmd[7] = 0x00

      for (byteCol in 0 until widthBytes) {
        var byteVal = 0
        for (bit in 0 until 8) {
          val x = byteCol * 8 + bit
          if (x < width) {
            val color = pixels[pixRowOffset + x]
            val r = (color shr 16) and 0xFF
            val g = (color shr 8) and 0xFF
            val b = color and 0xFF
            val a = (color shr 24) and 0xFF
            val isBlack = if (a < 50) false else ((77 * r + 150 * g + 29 * b) shr 8) < 128
            if (isBlack) {
              byteVal = byteVal or (1 shl (7 - bit))
            }
          }
        }
        rowCmd[8 + byteCol] = byteVal.toByte()
      }
      outStream.write(rowCmd)
    }

    outStream.write(byteArrayOf(0x1B, 0x64, 0x04)) // ESC d 4
    if (!solidBitmap.isRecycled && solidBitmap != bitmap) solidBitmap.recycle()
    if (!scaled.isRecycled && scaled != bitmap && scaled != solidBitmap) scaled.recycle()

    return PrintJobResult(outStream.toByteArray(), width, height)
  }

  private fun isHandleAlive(): Boolean {
    val h = printerHandle ?: return false
    return try {
      AutoReplyPrint.INSTANCE.CP_Port_IsConnectionValid(h)
    } catch (_: Exception) {
      false
    }
  }

  private fun closeHandle() {
    try {
      printerHandle?.let {
        AutoReplyPrint.INSTANCE.CP_Port_Close(it)
      }
    } catch (_: Exception) {
    }
    printerHandle = null
    connectedMac = null
    connectedName = null
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
    if (n.contains("tejas") || n.contains("rudra") || n.contains("josh")) return false
    return n.contains("dev") ||
      n.contains("veer") ||
      n.contains("2in1") ||
      n.contains("2-in-1") ||
      n.contains("2 in 1") ||
      n.contains("seznik dev") ||
      n.contains("seznik veer") ||
      n.contains("autoreply") ||
      n.contains("caysn") ||
      n.contains("pos-58") ||
      n.contains("pos-80") ||
      n.contains("printer_58") ||
      n.contains("printer_80")
  }
}
