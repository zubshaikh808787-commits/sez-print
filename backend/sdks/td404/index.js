/**
 * Ninestar / TD-404 label printer SDK adapter.
 *
 * The official SDK ships as native binaries (not Node modules):
 *   - Android: vendor/android/labelprinter.aar  (com.ninestar.printer.*)
 *   - iOS:     vendor/docs + TplSdkTest demo
 *
 * Native AAR I/O classes (from classes.jar):
 *   SppBluetoothPort  — classic Bluetooth SPP
 *   BleBluetoothPort  — Bluetooth Low Energy GATT
 *   EthernetPort      — Wi‑Fi / LAN TCP (demo uses port 9100)
 *   UsbPort           — USB
 *   SerialPort*       — serial
 *
 * Command builders: LabelCommand (TSC), EscCommand (ESC/POS), CpclCommand
 *
 * This Node adapter implements Wi‑Fi TCP (same as EthernetPort).
 * Bluetooth/USB must be invoked from the Expo app via a native module wrapping the AAR / iOS SDK.
 */

const net = require('net');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_WIFI_PORT = 9100;
const CONNECT_TIMEOUT_MS = 5000;

/** @type {Map<string, { socket: import('net').Socket, endpoint: object }>} */
const sessions = new Map();

const capabilities = {
  id: 'td404',
  displayName: 'TD-404 / Ninestar Label Printer',
  vendor: 'Ninestar (labelprinter.aar / TPL SDK)',
  transports: ['wifi', 'bluetooth-spp', 'bluetooth-ble', 'usb', 'serial'],
  platforms: ['android', 'ios', 'node-wifi'],
  commandSets: ['TSC/LabelCommand', 'ESC/POS/EscCommand', 'CPCL/CpclCommand'],
  notes:
    'Native AAR exposes SppBluetoothPort, BleBluetoothPort, EthernetPort, UsbPort, SerialPort. Node drives WiFi TCP :9100 only.',
};

function toBuffer(job) {
  if (Buffer.isBuffer(job.data)) return job.data;
  if (job.data instanceof Uint8Array) return Buffer.from(job.data);
  if (typeof job.data === 'string') {
    if (job.encoding === 'base64') {
      return Buffer.from(job.data.replace(/\s/g, ''), 'base64');
    }
    return Buffer.from(job.data, 'utf8');
  }
  throw new Error('Unsupported print payload');
}

function connectWifi(opts) {
  const ip = opts.ip;
  const port = Number(opts.port || DEFAULT_WIFI_PORT);
  if (!ip) {
    return Promise.reject(new Error('WiFi connect requires opts.ip'));
  }

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('timeout', () => fail(new Error(`WiFi connect timeout ${ip}:${port}`)));
    socket.once('error', fail);
    socket.connect(port, ip, () => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      const id = uuidv4();
      const endpoint = {
        id,
        sdkId: capabilities.id,
        name: opts.name || `TD-404 ${ip}:${port}`,
        transport: 'wifi',
        ip,
        port,
        model: 'TD-404',
        meta: { ...(opts.meta || {}), connectedAt: Date.now() },
      };
      sessions.set(id, { socket, endpoint });
      socket.on('close', () => sessions.delete(id));
      resolve(endpoint);
    });
  });
}

function buildSampleTscLabel(opts = {}) {
  const { buildSampleTscLabel: build } = require('../../src/services/printPayload');
  return build(opts);
}

const td404Adapter = {
  capabilities,
  DEFAULT_WIFI_PORT,
  buildSampleTscLabel,

  async listKnown() {
    return [...sessions.values()].map((s) => s.endpoint);
  },

  async connect(opts) {
    if (opts.transport === 'wifi') {
      return connectWifi(opts);
    }

    const err = new Error(
      `Transport "${opts.transport}" for TD-404 must run on the mobile native SDK ` +
        `(Android labelprinter.aar / iOS TPL SDK). Node only supports transport "wifi" (TCP ${DEFAULT_WIFI_PORT}).`,
    );
    err.code = 'TRANSPORT_REQUIRES_NATIVE';
    err.hint = {
      android: {
        aar: path.join(__dirname, 'vendor/android/labelprinter.aar'),
        demo: path.join(__dirname, 'vendor/android-demo'),
        spp: 'DeviceType.BLUETOOTH → SppBluetoothPort(mac, blueName)',
        ble: 'BleBluetoothPort (GATT) — present in AAR',
        wifi: 'DeviceType.WIFI → EthernetPort(ip, port=9100)',
        usb: 'UsbPort',
        connect: 'PrinterManager.connectPrinter(devices) → openPort()',
        print: 'sendDataToPrinter(byte[], isReadReceive)',
      },
      ios: {
        docs: path.join(__dirname, 'vendor/docs/IOS Interface Documentation-EN.pdf'),
        note: 'Use TplSdkTest Bluetooth connect flow from the vendor iOS package.',
      },
    };
    throw err;
  },

  async disconnect(printerId) {
    const session = sessions.get(printerId);
    if (!session) return;
    session.socket.destroy();
    sessions.delete(printerId);
  },

  async isConnected(printerId) {
    const session = sessions.get(printerId);
    return Boolean(session && !session.socket.destroyed && session.socket.writable);
  },

  async print(printerId, job) {
    const session = sessions.get(printerId);
    if (!session || session.socket.destroyed) {
      throw new Error(`Printer ${printerId} is not connected`);
    }
    const buf = toBuffer(job);
    await new Promise((resolve, reject) => {
      session.socket.write(buf, (err) => (err ? reject(err) : resolve()));
    });
    return { bytesSent: buf.length };
  },
};

module.exports = td404Adapter;
