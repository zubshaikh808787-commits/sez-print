/**
 * printer-core / registry
 *
 * driverId -> driver. The only place that knows which bridges exist in this build.
 * `all()` is what makes the router's closeAll() total: it can shut down a driver
 * whose TypeScript state says "closed" while its native handle says otherwise.
 */
import { PrinterDriver, UnknownDriverError } from './contract';

class PrinterRegistry {
  private readonly drivers = new Map<string, PrinterDriver>();

  register(driver: PrinterDriver): void {
    const id = driver.capabilities.driverId;
    if (this.drivers.has(id)) {
      throw new Error(`A driver is already registered under id "${id}".`);
    }
    this.drivers.set(id, driver);
  }

  /** Re-registration wins. Used by tests and by hot reload. */
  replace(driver: PrinterDriver): void {
    this.drivers.set(driver.capabilities.driverId, driver);
  }

  has(driverId: string): boolean {
    return this.drivers.has(driverId);
  }

  get(driverId: string): PrinterDriver {
    const driver = this.drivers.get(driverId);
    if (!driver) throw new UnknownDriverError(driverId);
    return driver;
  }

  find(driverId: string): PrinterDriver | undefined {
    return this.drivers.get(driverId);
  }

  all(): PrinterDriver[] {
    return [...this.drivers.values()];
  }

  ids(): string[] {
    return [...this.drivers.keys()];
  }

  /** Drivers usable on the running platform. */
  forPlatform(platform: 'android' | 'ios'): PrinterDriver[] {
    return this.all().filter((d) => d.capabilities.platforms.includes(platform));
  }

  clear(): void {
    this.drivers.clear();
  }
}

export type { PrinterRegistry };
export const registry = new PrinterRegistry();
