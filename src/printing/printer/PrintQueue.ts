type JobFn = () => Promise<void>;

/**
 * One printer connection, one job at a time. No sleeps to hide transport bugs.
 */
export class PrintQueue {
  private running = false;
  private readonly pending: JobFn[] = [];

  get busy(): boolean {
    return this.running || this.pending.length > 0;
  }

  enqueue(run: JobFn): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pending.push(async () => {
        try {
          await run();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;
    this.running = true;
    try {
      await next();
    } finally {
      this.running = false;
      void this.pump();
    }
  }
}

export const defaultPrintQueue = new PrintQueue();
