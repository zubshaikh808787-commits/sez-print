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
import android.graphics.Matrix
import android.os.Build
import androidx.core.content.ContextCompat
import com.ninestar.printer.command.LabelCommand
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
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
  private val connectTimeoutMs = 5_000L
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
        promise.reject("BT_OFF", "Bluetooth is turned off. Enable Bluetooth and try again.", null)
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
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) adapter.cancelDiscovery()
          closeSocket()

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
    // Write in 4096-byte chunks with a micro-pause (3ms).
    // This allows the printer's 115200-baud UART buffer to drain smoothly without
    // overflowing its hardware FIFO, preventing the printer Bluetooth chip from crashing or resetting.
    val chunkSize = 4096
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
    android.util.Log.i("Td404Printer", "SPP paced write ${bytes.size} bytes in ${totalMs}ms (stable)")
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
    val density = (options["density"] as? Number)?.toInt() ?: 8
    val speed = (options["speed"] as? Number)?.toInt() ?: 6
    val xDots = (options["xDots"] as? Number)?.toInt() ?: 0
    val yDots = (options["yDots"] as? Number)?.toInt() ?: 0
    val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
    val media = (options["media"] as? String) ?: "gap"
    val orientation = (options["orientation"] as? Number)?.toInt() ?: 0
    val dpi = (options["dpi"] as? Number)?.toInt() ?: 203

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

    // Scale to integer-mm media size (matches TSPL SIZE). 4×6 in → 102×152 mm.
    val mediaW = Math.max(1.0, Math.round(widthMm).toDouble())
    val mediaH = Math.max(1.0, Math.round(heightMm).toDouble())
    val targetDotsW = Math.max(1, Math.round(mediaW * dpi / 25.4).toInt())
    val targetDotsH = Math.max(1, Math.round(mediaH * dpi / 25.4).toInt())
    if (bitmap.width != targetDotsW || bitmap.height != targetDotsH) {
      val scaled = Bitmap.createScaledBitmap(bitmap, targetDotsW, targetDotsH, true)
      if (scaled !== bitmap) {
        bitmap.recycle()
        bitmap = scaled
      }
    }

    // SIZE must match the same integer mm used for dots.
    val sizeW = formatSizeMm(mediaW)
    val sizeH = formatSizeMm(mediaH)

    val contentW = bitmap.width
    val contentH = bitmap.height
    // Byte-align width; center the 0–7 pad columns L/R (no stretch).
    val rasterW = Math.max(8, ((contentW + 7) / 8) * 8)
    val padLeft = (rasterW - contentW) / 2
    val bytesPerRow = rasterW / 8
    val pixels = IntArray(contentW * contentH)
    bitmap.getPixels(pixels, 0, contentW, 0, 0, contentW, contentH)
    val rawBmp = ByteArray(bytesPerRow * contentH)

    // Direct high-speed 1-bit packing in native code:
    // TSPL BITMAP mode 0: bit 0 = black (print dot), bit 1 = white (no print)
    // Pre-fill white (bit 1 set) so pad columns stay blank.
    java.util.Arrays.fill(rawBmp, 0xFF.toByte())
    for (y in 0 until contentH) {
      val rowOffset = y * bytesPerRow
      val pixRowOffset = y * contentW
      for (x in 0 until contentW) {
        val c = pixels[pixRowOffset + x]
        val r = (c shr 16) and 0xFF
        val g = (c shr 8) and 0xFF
        val b = c and 0xFF
        val lum = (77 * r + 150 * g + 29 * b) shr 8
        val rx = x + padLeft
        val byteIndex = rowOffset + (rx shr 3)
        val bitIndex = 7 - (rx and 7)
        if (lum >= 128) {
          rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() or (1 shl bitIndex)).toByte()
        } else {
          rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
        }
      }
    }

    val gapCmd = when (media) {
      "bline" -> "BLINE ${formatGap(gapMm)} mm,0 mm\r\n"
      "continuous" -> "GAP 0 mm,0 mm\r\n"
      else -> "GAP ${formatGap(gapMm)} mm,0 mm\r\n"
    }

    val header = "\r\n" +
      "SIZE $sizeW mm,$sizeH mm\r\n" +
      gapCmd +
      "SPEED $speed\r\n" +
      "DENSITY $density\r\n" +
      "DIRECTION 0,0\r\n" +
      "REFERENCE 0,0\r\n" +
      "CLS\r\n" +
      "BITMAP $xDots,$yDots,$bytesPerRow,$contentH,0,"
    val footer = "\r\nPRINT 1,1\r\n"

    val headerBytes = header.toByteArray(Charsets.US_ASCII)
    val footerBytes = footer.toByteArray(Charsets.US_ASCII)

    val job = ByteArray(headerBytes.size + rawBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(rawBmp, 0, job, headerBytes.size, rawBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + rawBmp.size, footerBytes.size)
    val tEncode = System.currentTimeMillis()

    var totalSent = 0
    for (i in 0 until copies) {
      totalSent += writeBytesToSocketSync(job)
    }
    val tWrite = System.currentTimeMillis()

    android.util.Log.i(
      "Td404Printer",
      "SDK fast print: decode=${tDecode - t0}ms rotate=${tRotate - tDecode}ms " +
        "encode=${tEncode - tRotate}ms write=${tWrite - tEncode}ms " +
        "job=${job.size}B copies=$copies bmp=${bitmap.width}x${bitmap.height} " +
        "target=${targetDotsW}x${targetDotsH} size=${sizeW}x${sizeH}mm padL=$padLeft",
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

  private fun formatSizeMm(mm: Double): String {
    // Integer mm only — TD-404 / Ninestar addSize(w,h). Decimals are often ignored.
    return Math.max(1, Math.round(mm).toInt()).toString()
  }

  private fun formatGap(gapMm: Double): String {
    val rounded = Math.round(gapMm * 100.0) / 100.0
    return if (rounded == rounded.toLong().toDouble()) {
      rounded.toLong().toString()
    } else {
      rounded.toString()
    }
  }



  @SuppressLint("MissingPermission")
  private fun openSppSocket(device: BluetoothDevice): BluetoothSocket {
    val attempts = listOf(
      { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
      { device.createRfcommSocketToServiceRecord(sppUuid) },
      {
        val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        method.invoke(device, 1) as BluetoothSocket
      },
    )
    var lastError: Exception? = null
    for (makeSocket in attempts) {
      var sock: BluetoothSocket? = null
      try {
        sock = makeSocket()
        connectWithTimeout(sock, connectTimeoutMs)
        return sock
      } catch (e: Exception) {
        lastError = e
        try {
          sock?.close()
        } catch (_: Exception) {
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
