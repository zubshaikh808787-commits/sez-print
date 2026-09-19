/**
 * printer-core / router
 *
 * ISOLATION. One path open, every other path closed.
 *
 * Three rules carry the whole design:
 *
 *  1. `epoch++` happens BEFORE the disconnects, not after. Any job already sitting
 *     in the queue is invalidated the instant a switch begins — otherwise a job
 *     queued for printer A can land on printer B mid-switch.
 *
 *  2. `closeAll()` iterates EVERY registered driver, not just the one we believe
 *     is open. TypeScript state and a native handle will desync (app backgrounded,
 *     process restarted, SDK dropped the link silently). Closing only the driver
 *     you think is open is how you end up with two bound SPP sockets and a phone
 *     that needs a reboot.
 *
 *  3. The previous driver's onDisconnected subscription is torn down during the
 *     switch. A late callback from the old bridge must not invalidate the new route.
 */
import {
  Dialect,
  NoRouteError,
  PrintResult,
  PrinterDriver,
  PrinterStatus,
  Progress,
  RasterJob,
  StaleRouteError,
  Unsubscribe,
  VectorDoc,
} from './contract';
import { Mutex, sleep, withTimeout } from './mutex';
import { registry } from './registry';

export interface Route {
  driverId: string;
  deviceId: string;
  deviceName: string | null;
  epoch: number;
  dialect: Dialect;
  openedAt: number;
}

export interface RouterOptions {
  /** Radio settle after tearing every path down. Not optional — see closeAll(). */
  settleMs?: number;
  /** Hard ceiling on a single vendor connect call. */
  connectTimeoutMs?: number;
  /** Hard ceiling on a single teardown call, so one wedged SDK cannot block a switch. */
  disconnectTimeoutMs?: number;
}

export type RouteListener = (route: Route | undefined, reason: string) => void;

const DEFAULTS: Required<RouterOptions> = {
  settleMs: 300,
  connectTimeoutMs: 8000,
  disconnectTimeoutMs: 4000,
};

export class PrinterRouter {
  private route: Route | undefined;
  private epoch = 0;
  private readonly lock = new Mutex();
  private readonly options: Required<RouterOptions>;
  private readonly listeners = new Set<RouteListener>();
  /** Teardown for the ACTIVE driver's disconnect subscription only. */
  private driverWatch: Unsubscribe | undefined;

  constructor(options: RouterOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** The open route, or undefined. Read-only snapshot. */
  current(): Route | undefined {
    return this.route ? { ...this.route } : undefined;
  }

  currentEpoch(): number {
    return this.epoch;
  }

  isOpen(): boolean {
    return this.route !== undefined;
  }

  /** The driver behind the open route, or undefined. */
  activeDriver(): PrinterDriver | undefined {
    return this.route ? registry.find(this.route.driverId) : undefined;
  }

  onRouteChange(listener: RouteListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(reason: string): void {
    const snapshot = this.current();
    for (const listener of this.listeners) {
      try {
        listener(snapshot, reason);
      } catch {
        // A listener must never be able to break routing.
      }
    }
  }

  /**
   * Close EVERY registered driver, not just the one we believe is open.
   * Invalidates queued jobs first, then tears down, then waits for the radio.
   */
  private async closeAll(reason: string): Promise<void> {
    const had = this.route !== undefined;

    // (1) Invalidate before anything else can physically move.
    this.epoch++;
    this.route = undefined;

    // (3) Drop the old driver's disconnect watch so a late callback is inert.
    try {
      this.driverWatch?.();
    } catch {
      // ignore
    }
    this.driverWatch = undefined;

    // (2) Total teardown across all bridges. Timeboxed and never throwing.
    await Promise.allSettled(
      registry.all().map((driver) =>
        withTimeout(
          Promise.resolve().then(() => driver.disconnect()),
          this.options.disconnectTimeoutMs,
          `${driver.capabilities.driverId}.disconnect()`,
        ).catch(() => undefined),
      ),
    );

    await sleep(this.options.settleMs);
    if (had) this.emit(reason);
  }

  /** Public teardown. Safe to call when nothing is open. */
  async close(reason = 'closed by app'): Promise<void> {
    return this.lock.runExclusive(() => this.closeAll(reason));
  }

  /**
   * Open exactly one path. Closes everything else first, connects, reconciles the
   * dialect against hardware truth, and publishes the route with a fresh epoch.
   */
  async open(
    driverId: string,
    deviceId: string,
    opts: { name?: string | null; dialect?: Dialect } = {},
  ): Promise<Route> {
    return this.lock.runExclusive(async () => {
      const driver = registry.get(driverId);
      await this.closeAll(`switching to ${driverId}`);

      const connected = await withTimeout(
        Promise.resolve().then(() => driver.connect(deviceId, opts.name ?? null)),
        this.options.connectTimeoutMs,
        `${driverId}.connect()`,
      );

      const wanted = opts.dialect ?? driver.capabilities.defaultDialect;
      let dialect = wanted;

      if (driver.capabilities.dialectIsDeviceSetting) {
        // The hardware is the source of truth — the setting survives power cycles.
        try {
          const live = await driver.getDialects();
          if (live.active !== wanted) {
            await driver.setDialect(wanted);
            dialect = wanted;
          } else {
            dialect = live.active;
          }
        } catch {
          // Could not read the device: keep the requested dialect rather than
          // writing a persistent hardware setting we are not sure about.
          dialect = wanted;
        }
      }

      const route: Route = {
        driverId,
        deviceId: connected.id || deviceId,
        deviceName: connected.name ?? opts.name ?? null,
        epoch: ++this.epoch,
        dialect,
        openedAt: Date.now(),
      };
      this.route = route;

      const watchedEpoch = route.epoch;
      this.driverWatch = driver.onDisconnected((reason) => {
        // Only the route this subscription was created for may be invalidated.
        if (this.route?.epoch !== watchedEpoch) return;
        this.epoch++;
        this.route = undefined;
        this.driverWatch = undefined;
        this.emit(reason || 'link lost');
      });

      this.emit('connected');
      return { ...route };
    });
  }

  /** Throws unless `epoch` still matches the open route. */
  private requireRoute(epoch: number): Route {
    const route = this.route;
    if (!route) throw new NoRouteError();
    if (route.epoch !== epoch) throw new StaleRouteError(epoch, route.epoch);
    return route;
  }

  /** Send one raster label down the active path. `epoch` is the caller's proof of freshness. */
  async send(job: RasterJob, epoch: number, onProgress?: (p: Progress) => void): Promise<PrintResult> {
    // Checked once up front for a fast, lock-free rejection of stale work...
    this.requireRoute(epoch);
    return this.lock.runExclusive(() => {
      // ...and again inside the lock, because a switch may have won the race.
      const route = this.requireRoute(epoch);
      const driver = registry.get(route.driverId);
      return driver.printRaster({ ...job, dialect: route.dialect }, onProgress);
    });
  }

  /** Vector path. Only valid on a driver that implements it (JOSH). */
  async sendVector(doc: VectorDoc, epoch: number): Promise<PrintResult> {
    this.requireRoute(epoch);
    return this.lock.runExclusive(() => {
      const route = this.requireRoute(epoch);
      const driver = registry.get(route.driverId);
      if (!driver.printVector) {
        throw new Error(`${route.driverId} has no vector path; render to raster and use send().`);
      }
      return driver.printVector(doc);
    });
  }

  async getStatus(): Promise<PrinterStatus> {
    return this.lock.runExclusive(() => {
      const route = this.route;
      if (!route) throw new NoRouteError();
      return registry.get(route.driverId).getStatus();
    });
  }

  /**
   * Change the dialect on the open route. On a device-setting brand this writes to
   * the hardware and persists across power cycles — surface that in the UI.
   */
  async setDialect(dialect: Dialect): Promise<Route> {
    return this.lock.runExclusive(async () => {
      const route = this.route;
      if (!route) throw new NoRouteError();
      const driver = registry.get(route.driverId);
      if (!driver.capabilities.dialects.includes(dialect)) {
        throw new Error(`${route.driverId} does not support dialect "${dialect}".`);
      }
      if (driver.capabilities.dialectIsDeviceSetting) {
        await driver.setDialect(dialect);
      }
      this.route = { ...route, dialect };
      this.emit('dialect changed');
      return { ...this.route };
    });
  }
}

export const router = new PrinterRouter();
