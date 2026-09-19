/**
 * printer-core — pure TypeScript. No native code, no `react-native`, no brand packages.
 *
 * Everything singular at the OS level (the Bluetooth radio, the active connection,
 * the job queue) lives here exactly once. It cannot live inside a bridge, because
 * bridge A has no way to know bridge B just took the radio.
 *
 * App screens import from here and nowhere else.
 */
export * from './contract';
export { Mutex, sleep, withTimeout } from './mutex';
export { registry } from './registry';
export type { PrinterRegistry } from './registry';
export { PrinterRouter, router } from './router';
export type { Route, RouteListener, RouterOptions } from './router';
export {
  Discovery,
  MemoryDeviceMemory,
} from './discovery';
export type {
  DeviceMemory,
  DevicesListener,
  DiscoveryOptions,
  KnownDevice,
  ScanBackend,
  ScanStateListener,
  TaggedDevice,
} from './discovery';
export { MemoryQueueStorage, PrintQueue, canUseNativeCopies } from './queue';
export type {
  AuditEntry,
  QueueBatch,
  QueueItem,
  QueueItemState,
  QueueListener,
  QueueOptions,
  QueueProgress,
  QueueStorage,
} from './queue';
export {
  DISCONNECTED_STATUS,
  LUCK_STATUS,
  OK_STATUS,
  describeStatus,
  fromFlags,
  fromLuckCode,
  isBlocking,
  makeStatus,
} from './status';
export {
  allProfiles,
  defaultProfileFor,
  dotsPerMm,
  dotsToMm,
  fitToHead,
  getProfile,
  loadProfiles,
  mmToDots,
  profilesVersion,
  resetProfiles,
  resolveProfile,
} from './profiles';
export type { PrinterProfile } from './profiles';
