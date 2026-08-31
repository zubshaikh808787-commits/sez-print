/**
 * Shared contract every printer SDK adapter must implement.
 * Add new SDKs under backend/sdks/<name>/ and register them in registry.js.
 */

/** @typedef {'bluetooth-spp' | 'bluetooth-ble' | 'wifi' | 'usb' | 'serial'} Transport */

/**
 * @typedef {Object} PrinterEndpoint
 * @property {string} id
 * @property {string} sdkId
 * @property {string} name
 * @property {Transport} transport
 * @property {string=} macAddress
 * @property {string=} ip
 * @property {number=} port
 * @property {string=} model
 * @property {Record<string, unknown>=} meta
 */

/**
 * @typedef {Object} ConnectOptions
 * @property {Transport} transport
 * @property {string=} macAddress
 * @property {string=} blueName
 * @property {string=} ip
 * @property {number=} port
 * @property {string=} name
 * @property {Record<string, unknown>=} meta
 */

/**
 * @typedef {Object} PrintJob
 * @property {Buffer|Uint8Array|string} data  Raw printer bytes, or base64 string
 * @property {'raw'|'base64'} [encoding]
 * @property {boolean} [awaitAck]
 */

/**
 * @typedef {Object} SdkCapabilities
 * @property {string} id
 * @property {string} displayName
 * @property {string} vendor
 * @property {Transport[]} transports
 * @property {string[]} platforms  e.g. ['android','ios','node-wifi']
 * @property {string[]} commandSets  e.g. ['TSC/LabelCommand','ESC/POS','CPCL']
 * @property {string} notes
 */

/**
 * @typedef {Object} PrinterSdkAdapter
 * @property {SdkCapabilities} capabilities
 * @property {() => Promise<PrinterEndpoint[]>} listKnown
 * @property {(opts: ConnectOptions) => Promise<PrinterEndpoint>} connect
 * @property {(printerId: string) => Promise<void>} disconnect
 * @property {(printerId: string) => Promise<boolean>} isConnected
 * @property {(printerId: string, job: PrintJob) => Promise<{ bytesSent: number }>} print
 */

module.exports = {};
