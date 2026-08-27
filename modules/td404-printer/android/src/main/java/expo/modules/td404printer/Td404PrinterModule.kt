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
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID
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
  private val printChunk = 8 * 1024
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
      socket?.isConnected == true
    }

    Function("getConnectedDevice") {
      if (socket?.isConnected == true && connectedMac != null) {
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

    AsyncFunction("printBase64") { base64: String, promise: Promise ->
      val sock = socket
      if (sock == null || !sock.isConnected) {
        promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
          val out = sock.outputStream
          var offset = 0
          while (offset < bytes.size) {
            val end = minOf(offset + printChunk, bytes.size)
            out.write(bytes, offset, end - offset)
            offset = end
          }
          out.flush()
          promise.resolve(mapOf("bytesSent" to bytes.size))
        } catch (e: IOException) {
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
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
