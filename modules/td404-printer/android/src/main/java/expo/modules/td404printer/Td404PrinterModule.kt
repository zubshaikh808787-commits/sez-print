package expo.modules.td404printer

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
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.content.ContextCompat
import com.ninestar.printer.command.LabelCommand
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.Vector
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * TD-404 / Ninestar classic Bluetooth (SPP) bridge.
 * Lists bonded (paired) devices + nearby discovery, then connects via SPP
 * (same profile as SppBluetoothPort in labelprinter.aar).
 */
class Td404PrinterModule : Module() {
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  private val ioExecutor = Executors.newCachedThreadPool()
  private val connectTimeoutMs = 8_000L
  private val printChunk = 32 * 1024
  private var socket: BluetoothSocket? = null
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
    Name("Td404Printer")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged")

    OnCreate {
      ensureReceiver()
    }

    OnDestroy {
      unregisterReceiverSafe()
      closeSocket()
    }

    Function("isAvailable") {
      getAdapter() != null
    }

    /** Adapter power only — does not start scan, discovery, or connect. */
    Function("isBluetoothEnabled") {
      val adapter = getAdapter()
      adapter != null && adapter.isEnabled
    }

    /** Baseline perf logs — tag PIPELINE for `adb logcat -s PIPELINE`. */
    Function("logPipelineTrace") { message: String ->
      android.util.Log.i("PIPELINE", message)
    }

    /** Always-available paired list (even when not discoverable / already connected in system BT). */
    AsyncFunction("getBondedDevices") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      // Bonded list only needs BLUETOOTH_CONNECT (not SCAN / location).
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
      // Prefer full scan perms; fall back to bonded-only if SCAN is missing.
      val canDiscover = hasPermissions(context)
      if (!hasConnectPermission(context)) {
        promise.reject(
          "PERMISSION",
          "Bluetooth permissions are required to scan for TD-404 printers.",
          null,
        )
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found on this device.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        // Resolve (do not reject) so JS `void startScan()` cannot surface LogBox.
        sendEvent("onScanFinished", emptyMap<String, Any?>())
        promise.resolve(
          mapOf(
            "discoveryStarted" to false,
            "bondedCount" to 0,
            "reason" to "BT_OFF",
          ),
        )
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
        promise.reject("BT_OFF", "Bluetooth is turned off. Enable Bluetooth and try again.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          closeSocket()
          try { Thread.sleep(100) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }

          val device = adapter.getRemoteDevice(macAddress.uppercase())
          val sock = openSppSocket(device)
          socket = sock
          connectedMac = device.address
          @SuppressLint("MissingPermission")
          val resolvedName = name ?: device.name ?: device.address
          connectedName = resolvedName
          sendEvent(
            "onConnectionChanged",
            mapOf(
              "connected" to true,
              "id" to device.address,
              "name" to resolvedName,
              "transport" to "bluetooth-spp",
              "sdkId" to "td404",
            ),
          )
          promise.resolve(
            mapOf(
              "id" to device.address,
              "name" to resolvedName,
              "transport" to "bluetooth-spp",
              "sdkId" to "td404",
            ),
          )
        } catch (e: Exception) {
          closeSocket()
          promise.reject("CONNECT_FAILED", e.message ?: "Failed to connect to TD-404 printer.", e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        closeSocket()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "td404"),
        )
        promise.resolve(null)
      }
    }

    Function("isConnected") {
      isSocketAlive()
    }

    Function("getConnectedDevice") {
      if (isSocketAlive() && connectedMac != null) {
        mapOf(
          "id" to connectedMac,
          "name" to connectedName,
          "transport" to "bluetooth-spp",
          "sdkId" to "td404",
        )
      } else {
        null
      }
    }

    /** Lightweight health check: verifies the socket and output stream are still viable. */
    Function("isSocketAlive") {
      isSocketAlive()
    }

    /** Returns connection diagnostics for the debug screen. */
    Function("getConnectionInfo") {
      mapOf(
        "connected" to isSocketAlive(),
        "mac" to connectedMac,
        "name" to connectedName,
        "transport" to "bluetooth-spp",
        "sdkId" to "td404",
        "socketClass" to (socket?.javaClass?.simpleName ?: "none"),
      )
    }

    AsyncFunction("printBase64") { base64: String, promise: Promise ->
      try {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        writeBytesToSocket(bytes, promise)
      } catch (e: Exception) {
        promise.reject("DECODE_FAILED", e.message, e)
      }
    }

    AsyncFunction("printRaw") { bytes: ByteArray, promise: Promise ->
      writeBytesToSocket(bytes, promise)
    }

    /**
     * Fast SDK-style print: PNG → LabelCommand (native) → SPP write without waiting
     * for printer ACK. Skips the slow JS PNG→gray→1-bit→TSPL path.
     *
     * Mirrors Ninestar demo: LabelCommand.addSize/addGap/addBitmap/addPrint then
     * writeDataImmediately(..., isReadReceive=false).
     */
    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      val sock = socket
      if (sock == null || !sock.isConnected) {
        promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val result = printPngLabelNative(options)
          promise.resolve(result)
        } catch (e: Exception) {
          android.util.Log.e("Td404Printer", "printPngLabel failed: ${e.message}", e)
          if (e is IOException) {
            closeSocket()
            sendEvent(
              "onConnectionChanged",
              mapOf("connected" to false, "sdkId" to "td404"),
            )
          }
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Native Android hardware-accelerated PDF renderer.
     * Converts any PDF URI (content:// or file://) into page Bitmaps/PNGs at target DPI.
     */
    AsyncFunction("renderPdfPages") { uriString: String, options: Map<String, Any?>?, promise: Promise ->
      ioExecutor.execute {
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        var tempFile: File? = null
        try {
          val context = appContext.reactContext ?: throw IllegalStateException("No Android React Context available")
          val uri = Uri.parse(uriString)
          val targetDpi = (options?.get("dpi") as? Number)?.toDouble() ?: 203.0
          val maxPages = (options?.get("maxPages") as? Number)?.toInt() ?: 100

          val file = if (uri.scheme == "content" || (uri.scheme == null && !uriString.startsWith("/"))) {
            val tmp = File.createTempFile("pdf_render_", ".pdf", context.cacheDir)
            tempFile = tmp
            context.contentResolver.openInputStream(uri)?.use { input ->
              tmp.outputStream().use { output ->
                input.copyTo(output)
              }
            } ?: throw IOException("Cannot open input stream for: $uriString")
            tmp
          } else {
            val path = if (uri.scheme == "file") uri.path ?: uriString else uriString
            File(path)
          }

          pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
          renderer = PdfRenderer(pfd)
          val totalPages = renderer.pageCount
          val renderCount = minOf(totalPages, maxPages)
          val pagesList = mutableListOf<Map<String, Any?>>()
          val scale = targetDpi / 72.0

          for (i in 0 until renderCount) {
            val page = renderer.openPage(i)
            val pageW = page.width
            val pageH = page.height
            val w = Math.max(1, Math.round(pageW * scale).toInt())
            val h = Math.max(1, Math.round(pageH * scale).toInt())
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            val matrix = android.graphics.Matrix()
            matrix.setScale(w.toFloat() / pageW.toFloat(), h.toFloat() / pageH.toFloat())
            page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            page.close()

            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream)
            val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
            bitmap.recycle()

            pagesList.add(
              mapOf(
                "pageIndex" to i,
                "widthPx" to w,
                "heightPx" to h,
                "widthMm" to (pageW * 25.4 / 72.0),
                "heightMm" to (pageH * 25.4 / 72.0),
                "base64" to base64,
              )
            )
          }

          promise.resolve(
            mapOf(
              "pageCount" to totalPages,
              "pages" to pagesList,
            )
          )
        } catch (e: Exception) {
          android.util.Log.e("Td404Printer", "renderPdfPages failed: ${e.message}", e)
          promise.reject("PDF_RENDER_FAILED", e.message, e)
        } finally {
          try { renderer?.close() } catch (_: Exception) {}
          try { pfd?.close() } catch (_: Exception) {}
          try { tempFile?.delete() } catch (_: Exception) {}
        }
      }
    }
  }

  private fun writeBytesToSocket(bytes: ByteArray, promise: Promise) {
    val sock = socket
    if (sock == null || !sock.isConnected) {
      promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
      return
    }
    ioExecutor.execute {
      try {
        val written = writeBytesToSocketSync(bytes)
        promise.resolve(mapOf("bytesSent" to written))
      } catch (e: IOException) {
        android.util.Log.e("Td404Printer", "SPP write failed, closing dead socket: ${e.message}")
        closeSocket()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "td404"),
        )
        promise.reject("PRINT_FAILED", e.message, e)
      }
    }
  }

  /** Fire-and-forget SPP stream with pacing for large payloads to prevent UART buffer overrun. */
  private fun writeBytesToSocketSync(bytes: ByteArray): Int {
    val sock = socket
    if (sock == null || !sock.isConnected) {
      throw IOException("No TD-404 printer connected.")
    }
    val rawOut = sock.outputStream ?: throw IOException("Printer output stream unavailable.")
    val startMs = System.currentTimeMillis()

    // Fast path: small payloads (test prints, small labels <= 32KB) fit in printer RAM.
    // Stream directly with zero delay.
    if (bytes.size <= 32 * 1024) {
      rawOut.write(bytes)
      rawOut.flush()
      val totalMs = System.currentTimeMillis() - startMs
      android.util.Log.i("Td404Printer", "SPP fast write ${bytes.size} bytes in ${totalMs}ms")
      return bytes.size
    }

    // Paced path for large payloads (4x6 labels, 100KB–300KB):
    // Write in 1024-byte chunks with a micro-pause (3ms) — Ninestar vendor reference.
    val chunkSize = 1024
    var offset = 0
    while (offset < bytes.size) {
      val count = minOf(chunkSize, bytes.size - offset)
      rawOut.write(bytes, offset, count)
      rawOut.flush()
      offset += count
      if (offset < bytes.size) {
        try {
          Thread.sleep(3) // 3ms breather between 4KB packets prevents UART RX overrun
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }
    val totalMs = System.currentTimeMillis() - startMs
    android.util.Log.i("Td404Printer", "SPP paced write ${bytes.size} bytes in ${totalMs}ms chunk=${1024}")
    return bytes.size
  }

  /**
   * Build a TSPL job with Ninestar LabelCommand (native bitmap packing) and
   * stream it over the open SPP socket. Matches vendor demo PrintContent.getLabel.
   */
  private fun printPngLabelNative(options: Map<String, Any?>): Map<String, Any?> {
    val pngBase64 = options["pngBase64"] as? String
      ?: throw IllegalArgumentException("pngBase64 is required")
    val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
    val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
    val gapMm = (options["gapMm"] as? Number)?.toDouble() ?: 2.0
    val density = (options["density"] as? Number)?.toInt() ?: 10
    val speed = (options["speed"] as? Number)?.toInt() ?: 3
    val threshold = (options["threshold"] as? Number)?.toInt() ?: 160
    val xDots = (options["xDots"] as? Number)?.toInt() ?: 0
    val yDots = (options["yDots"] as? Number)?.toInt() ?: 0
    val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
    val media = (options["media"] as? String) ?: "gap"
    val orientation = (options["orientation"] as? Number)?.toInt() ?: 0
    val dpi = (options["dpi"] as? Number)?.toDouble() ?: 304.0
    // DIRECTION 1 matches the JS TSPL pipeline default. DIRECTION 0 mirrors the
    // bitmap along the feed axis, causing apparent zoom/offset vs the on-screen preview.
    val direction = (options["direction"] as? Number)?.toInt() ?: 1

    val t0 = System.currentTimeMillis()
    val raw = android.util.Base64.decode(pngBase64, android.util.Base64.DEFAULT)
    var bitmap = BitmapFactory.decodeByteArray(raw, 0, raw.size)
      ?: throw IllegalArgumentException("Could not decode PNG for print.")
    val tDecode = System.currentTimeMillis()

    val deg = ((orientation % 360) + 360) % 360
    if (deg == 90 || deg == 180 || deg == 270) {
      val matrix = Matrix().apply { postRotate(deg.toFloat()) }
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated !== bitmap) {
        bitmap.recycle()
        bitmap = rotated
      }
    }
    val tRotate = System.currentTimeMillis()

    // 304 DPI heads are 12 dots/mm. 54 mm × 12 = 648 (byte-aligned). Using
    // dpi/25.4 (54 × 304/25.4 = 646) then packing up to 648 clips after SIZE.
    val dpm = if (dpi == 304.0) 12.0 else if (dpi == 203.0) 8.0 else dpi / 25.4
    val sizeDotsW = Math.max(1, Math.round(widthMm * dpm).toInt())
    val sizeDotsH = Math.max(1, Math.round(heightMm * dpm).toInt())
    // TSPL BITMAP is bytes×8. Never pack UP past SIZE-in-dots.
    val packedW = Math.max(8, (sizeDotsW / 8) * 8)
    val packedH = sizeDotsH
    // If incoming capture is density-inflated (e.g. ViewShot rendered at screen
    // density 2.625x / 3x) or differently sized, scale to target packed dots
    // rather than blindly cropping. If difference is within 8 dots, it is just byte-alignment;
    // preserve exact pixels to prevent bilinear blur on crisp lines and dithers.
    val srcW = bitmap.width
    val srcH = bitmap.height
    if (srcW != packedW || srcH != packedH) {
      val diffW = Math.abs(srcW - packedW)
      val diffH = Math.abs(srcH - packedH)
      if (diffW > 8 || diffH > 8) {
        android.util.Log.w(
          "Td404Printer",
          "PRINT-TRACE BITMAP_FIT src=${srcW}x${srcH} packed=${packedW}x${packedH} sizeDots=${sizeDotsW}x${sizeDotsH} (scaling to packed dots)",
        )
        val scaled = Bitmap.createScaledBitmap(bitmap, packedW, packedH, true)
        if (scaled !== bitmap) {
          bitmap.recycle()
          bitmap = scaled
        }
      }
    }

    val sizeCmd = "SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm\r\n"

    // TSPL BITMAP x,y must be >= 0. Bake any negative (or mixed) offset into pixels.
    var bitmapX = xDots
    var bitmapY = yDots
    if (xDots < 0 || yDots < 0) {
      val shifted = Bitmap.createBitmap(packedW, packedH, Bitmap.Config.ARGB_8888)
      shifted.eraseColor(Color.WHITE)
      Canvas(shifted).drawBitmap(bitmap, xDots.toFloat(), yDots.toFloat(), null)
      if (shifted !== bitmap) {
        bitmap.recycle()
        bitmap = shifted
      }
      bitmapX = 0
      bitmapY = 0
      android.util.Log.i(
        "Td404Printer",
        "PRINT-TRACE OFFSET_BAKED raw=${xDots},${yDots} → BITMAP 0,0",
      )
    }

    val dither = (options["dither"] as? Boolean) ?: false
    val contentW = minOf(bitmap.width, packedW)
    val contentH = minOf(bitmap.height, packedH)
    val bytesPerRow = packedW / 8
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    val rawBmp = ByteArray(bytesPerRow * contentH)

    // Pre-fill white (bit 1 set) so unused trailing bits stay blank
    java.util.Arrays.fill(rawBmp, 0xFF.toByte())

    if (!dither) {
      for (y in 0 until contentH) {
        val rowOffset = y * bytesPerRow
        val pixRowOffset = y * bitmap.width
        for (x in 0 until contentW) {
          val c = pixels[pixRowOffset + x]
          val r = (c shr 16) and 0xFF
          val g = (c shr 8) and 0xFF
          val b = c and 0xFF
          val lum = (77 * r + 150 * g + 29 * b) shr 8
          if (lum < threshold) {
            val byteIndex = rowOffset + (x shr 3)
            val bitIndex = 7 - (x and 7)
            rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
          }
        }
      }
    } else {
      // Native Floyd-Steinberg error diffusion for photo & halftone print quality
      val work = IntArray(contentW * contentH)
      for (y in 0 until contentH) {
        val pixRowOffset = y * bitmap.width
        val workRowOffset = y * contentW
        for (x in 0 until contentW) {
          val c = pixels[pixRowOffset + x]
          val r = (c shr 16) and 0xFF
          val g = (c shr 8) and 0xFF
          val b = c and 0xFF
          work[workRowOffset + x] = (77 * r + 150 * g + 29 * b) shr 8
        }
      }
      for (y in 0 until contentH) {
        val rowOffset = y * bytesPerRow
        val workRowOffset = y * contentW
        val hasNextRow = y + 1 < contentH
        val nextWorkRowOffset = workRowOffset + contentW
        for (x in 0 until contentW) {
          val idx = workRowOffset + x
          val oldLum = work[idx]
          val black = oldLum < threshold
          if (black) {
            val byteIndex = rowOffset + (x shr 3)
            val bitIndex = 7 - (x and 7)
            rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
          }
          val error = if (black) oldLum else (oldLum - 255)
          if (error != 0) {
            if (x + 1 < contentW) {
              work[idx + 1] += (error * 7) shr 4
            }
            if (hasNextRow) {
              if (x > 0) {
                work[nextWorkRowOffset + x - 1] += (error * 3) shr 4
              }
              work[nextWorkRowOffset + x] += (error * 5) shr 4
              if (x + 1 < contentW) {
                work[nextWorkRowOffset + x + 1] += error shr 4
              }
            }
          }
        }
      }
    }

    val gapCmd = when (media) {
      "bline" -> "BLINE ${formatGap(gapMm)} mm,0 mm\r\n"
      "continuous" -> "GAP 0.00 mm,0 mm\r\n"
      else -> "GAP ${formatGap(gapMm)} mm,0 mm\r\n"
    }

    val header = "\r\n" +
      sizeCmd +
      gapCmd +
      "SPEED $speed\r\n" +
      "DENSITY $density\r\n" +
      "DIRECTION $direction\r\n" +
      "SET TEAR ON\r\n" +
      "OFFSET 0 mm\r\n" +
      "REFERENCE 0,0\r\n" +
      "CLS\r\n" +
      "BITMAP $bitmapX,$bitmapY,$bytesPerRow,$contentH,0,"
    // TSPL PRINT m,n — one socket write for all copies (avoids re-sending bitmap per copy).
    val printCmd = if (copies <= 1) "PRINT 1\r\n" else "PRINT 1,$copies\r\n"
    val footer = "\r\n$printCmd"

    val headerBytes = header.toByteArray(Charsets.US_ASCII)
    val footerBytes = footer.toByteArray(Charsets.US_ASCII)

    val job = ByteArray(headerBytes.size + rawBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(rawBmp, 0, job, headerBytes.size, rawBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + rawBmp.size, footerBytes.size)
    val tEncode = System.currentTimeMillis()

    val totalSent = writeBytesToSocketSync(job)
    val tWrite = System.currentTimeMillis()

    android.util.Log.i(
      "Td404Printer",
      "PRINT-TRACE SDK png=${srcW}x${srcH} packed=${packedW}x${packedH} sizeDots=${sizeDotsW}x${sizeDotsH} " +
        "dpm=$dpm dpi=$dpi SIZE=${formatMm(widthMm)}x${formatMm(heightMm)}mm " +
        "BITMAP=${bytesPerRow}x${contentH} DIRECTION=$direction job=${job.size}B copies=$copies " +
        "decode=${tDecode - t0}ms rotate=${tRotate - tDecode}ms encode=${tEncode - tRotate}ms write=${tWrite - tEncode}ms",
    )

    if (!bitmap.isRecycled) bitmap.recycle()

    return mapOf(
      "bytesSent" to totalSent,
      "jobBytes" to job.size,
      "copies" to copies,
      "decodeMs" to (tDecode - t0),
      "encodeMs" to (tEncode - tRotate),
      "writeMs" to (tWrite - tEncode),
      "path" to "labelcommand-sdk",
    )
  }


  private fun formatGap(gapMm: Double): String = formatMm(gapMm)

  private fun formatMm(mm: Double): String {
    val rounded = Math.round(mm * 100.0) / 100.0
    return String.format(java.util.Locale.US, "%.2f", rounded)
  }



  @SuppressLint("MissingPermission")
  private fun openSppSocket(device: BluetoothDevice): BluetoothSocket {
    val isBonded = try {
      device.bondState == BluetoothDevice.BOND_BONDED
    } catch (_: SecurityException) {
      false
    }

    val attempts = if (isBonded) {
      listOf(
        "secure-rfcomm" to { device.createRfcommSocketToServiceRecord(sppUuid) },
        "insecure-rfcomm" to { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
        "channel-1" to {
          val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          method.invoke(device, 1) as BluetoothSocket
        },
      )
    } else {
      listOf(
        "insecure-rfcomm" to { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
        "secure-rfcomm" to { device.createRfcommSocketToServiceRecord(sppUuid) },
        "channel-1" to {
          val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          method.invoke(device, 1) as BluetoothSocket
        },
      )
    }

    var lastError: Exception? = null
    for ((name, makeSocket) in attempts) {
      var sock: BluetoothSocket? = null
      try {
        android.util.Log.i("Td404Printer", "Opening SPP socket via $name...")
        sock = makeSocket()
        connectWithTimeout(sock, connectTimeoutMs)
        android.util.Log.i("Td404Printer", "SPP socket connected successfully via $name")
        return sock
      } catch (e: Exception) {
        android.util.Log.w("Td404Printer", "SPP attempt via $name failed: ${e.message}")
        lastError = e
        try {
          sock?.close()
        } catch (_: Exception) {
        }
        try {
          Thread.sleep(200)
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }
    throw lastError ?: IOException("Could not open Bluetooth SPP socket.")
  }

  private fun connectWithTimeout(sock: BluetoothSocket, timeoutMs: Long) {
    val done = CountDownLatch(1)
    var error: Exception? = null
    val worker = Thread({
      try {
        sock.connect()
      } catch (e: Exception) {
        error = e
      } finally {
        done.countDown()
      }
    }, "td404-spp-connect")
    worker.isDaemon = true
    worker.start()
    if (!done.await(timeoutMs, TimeUnit.MILLISECONDS)) {
      try {
        sock.close()
      } catch (_: Exception) {
      }
      throw IOException("Printer did not accept the connection in time. Keep it on and close other phone connections.")
    }
    error?.let { throw it }
  }

  private fun ensureReceiver() {
    if (receiverRegistered) return
    val context = appContext.reactContext ?: return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
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
      // Location helps classic discovery on some OEMs but must not block bonded listing.
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
    return mapOf(
      "id" to device.address,
      "name" to displayName,
      "rawName" to name,
      "bonded" to bonded,
      "transport" to "bluetooth-spp",
      "sdkId" to "td404",
      "likelyTd404" to (isLikelyTd404(name) || isLikelyTd404(displayName)),
    )
  }

  @SuppressLint("MissingPermission")
  private fun emitDevice(device: BluetoothDevice, bonded: Boolean) {
    sendEvent("onDeviceFound", deviceToMap(device, bonded))
  }

  private fun isLikelyTd404(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    val n = name.lowercase()
    return n.contains("td-404") ||
      n.contains("td404") ||
      n.contains("td 404") ||
      n.contains("ninestar") ||
      n.contains("nsprinter") ||
      n.contains("labelprinter") ||
      n.contains("label printer") ||
      n.contains("tpl") ||
      n.startsWith("btprinter") ||
      n.contains("gp-") ||
      n.contains("printer")
  }

  /**
   * Non-destructive socket health check.
   * Verifies both socket.isConnected and that the outputStream is accessible.
   * On some Android devices, socket.isConnected stays true even after the
   * physical BT link drops — checking outputStream catches those cases.
   */
  private fun isSocketAlive(): Boolean {
    val sock = socket ?: return false
    return try {
      sock.isConnected && sock.outputStream != null
    } catch (_: Exception) {
      false
    }
  }

  private fun closeSocket() {
    try {
      socket?.close()
    } catch (_: Exception) {
    }
    socket = null
    connectedMac = null
    connectedName = null
  }
}
