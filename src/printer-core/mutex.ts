/**
 * printer-core / mutex
 *
 * There is one Bluetooth radio and one active connection. Every operation that
 * touches either runs through here, serialised, so a connect cannot interleave
 * with a print or with another connect.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  private depth = 0;

  get locked(): boolean {
    return this.depth > 0;
  }

  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.tail.then(
      () => {
        this.depth++;
        return fn();
      },
      () => {
        this.depth++;
        return fn();
      },
    );
    // The tail must never reject, or every later waiter inherits the rejection.
    this.tail = run.then(
      () => {
        this.depth--;
      },
      () => {
        this.depth--;
      },
    );
    return run;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hard timeout around a promise. A hung vendor SDK call must never block the UI —
 * the plan's rule 4 ("6-8 s per attempt, then fall through") is enforced with this.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms} ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
