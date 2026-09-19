/**
 * printer-core / queue
 *
 * One serial FIFO, persisted. This is where bulk reliability is actually won.
 *
 * Design notes that matter:
 *
 *  - Never fire hundreds of writes back to back. These printer buffers are
 *    single-digit KB; overrun gives truncated labels, garbage, or a silent stall
 *    that looks like a hang. Every item waits for the strongest completion signal
 *    the active bridge can give.
 *
 *  - What is persisted is the ROW DATA, not the rendered PNG. Five hundred base64
 *    rasters will not fit anywhere sensible, and re-rendering is cheap. Killed at
 *    label 300 of 500 resumes at 301 because the row data is still on disk.
 *
 *  - A write that failed mid-label is NOT safe to retry blindly — you can get a
 *    half label followed by a full one and silently corrupt a numbered run. The
 *    item is marked failed and left for an explicit, audited reprint.
 */
import { PrintResult, RasterJob, StaleRouteError } from './contract';
import { sleep } from './mutex';
import { registry } from './registry';
import { PrinterRouter } from './router';

export type QueueItemState = 'pending' | 'rendered' | 'sent' | 'confirmed' | 'failed';

export interface QueueItem<TData = unknown> {
  id: string;
  /** 1-based position in the run, as the operator counts physical labels. */
  index: number;
  state: QueueItemState;
  /** JSON-serialisable source row. Re-rendered on resume. */
  data: TData;
  attempts: number;
  error?: string;
  updatedAt: number;
}

export interface QueueBatch<TData = unknown> {
  id: string;
  label: string;
  driverId: string;
  createdAt: number;
  items: QueueItem<TData>[];
}

export interface QueueStorage {
  load(): Promise<QueueBatch | undefined>;
  save(batch: QueueBatch): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory fallback. The app swaps in a file- or AsyncStorage-backed implementation. */
export class MemoryQueueStorage implements QueueStorage {
  private batch: QueueBatch | undefined;

  async load(): Promise<QueueBatch | undefined> {
    return this.batch;
  }

  async save(batch: QueueBatch): Promise<void> {
    this.batch = batch;
  }

  async clear(): Promise<void> {
    this.batch = undefined;
  }
}

export interface QueueProgress {
  batchId: string;
  total: number;
  confirmed: number;
  failed: number;
  current?: number;
  state: 'idle' | 'running' | 'paused' | 'done' | 'aborted';
  message?: string;
}

export type QueueListener = (progress: QueueProgress) => void;

/** Append-only record of what physically happened, so the operator can reconcile. */
export interface AuditEntry {
  at: number;
  batchId: string;
  itemId: string;
  index: number;
  event: 'sent' | 'confirmed' | 'failed' | 'skipped';
  attempt: number;
  detail?: string;
}

export interface QueueOptions<TData = unknown> {
  router: PrinterRouter;
  storage?: QueueStorage;
  /** Turns one persisted row into a print-ready raster. The render engine, untouched. */
  render: (data: TData, index: number) => Promise<RasterJob>;
  /**
   * What to do when an item fails mid-run.
   *  'stop' — halt and keep the batch resumable (default; safest for numbered runs)
   *  'skip' — mark failed, carry on, reconcile at the end
   */
  onError?: 'stop' | 'skip';
  /** Breathing room between labels even when the bridge confirms completion. */
  interLabelDelayMs?: number;
  onAudit?: (entry: AuditEntry) => void;
}

export class PrintQueue<TData = unknown> {
  private readonly router: PrinterRouter;
  private readonly storage: QueueStorage;
  private readonly render: (data: TData, index: number) => Promise<RasterJob>;
  private readonly onErrorPolicy: 'stop' | 'skip';
  private readonly interLabelDelayMs: number;
  private readonly onAudit?: (entry: AuditEntry) => void;

  private batch: QueueBatch<TData> | undefined;
  private running = false;
  private cancelRequested = false;
  private readonly listeners = new Set<QueueListener>();

  constructor(options: QueueOptions<TData>) {
    this.router = options.router;
    this.storage = options.storage ?? new MemoryQueueStorage();
    this.render = options.render;
    this.onErrorPolicy = options.onError ?? 'stop';
    this.interLabelDelayMs = options.interLabelDelayMs ?? 60;
    this.onAudit = options.onAudit;
  }

  get isRunning(): boolean {
    return this.running;
  }

  current(): QueueBatch<TData> | undefined {
    return this.batch;
  }

  onProgress(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(state: QueueProgress['state'], current?: number, message?: string): void {
    const batch = this.batch;
    if (!batch) return;
    const progress: QueueProgress = {
      batchId: batch.id,
      total: batch.items.length,
      confirmed: batch.items.filter((i) => i.state === 'confirmed').length,
      failed: batch.items.filter((i) => i.state === 'failed').length,
      current,
      state,
      message,
    };
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch {
        // A listener must never be able to break the run.
      }
    }
  }

  private audit(entry: Omit<AuditEntry, 'at'>): void {
    if (!this.onAudit) return;
    try {
      this.onAudit({ ...entry, at: Date.now() });
    } catch {
      // ignore
    }
  }

  private async persist(): Promise<void> {
    if (this.batch) await this.storage.save(this.batch as QueueBatch);
  }

  /** Rebuild an interrupted batch from disk. Returns undefined when there is nothing to resume. */
  async restore(): Promise<QueueBatch<TData> | undefined> {
    const saved = (await this.storage.load()) as QueueBatch<TData> | undefined;
    if (!saved || saved.items.every((i) => i.state === 'confirmed')) return undefined;

    // An item left in 'sent' was in flight when the process died: we do not know
    // whether paper came out. Surface it as failed so the operator decides.
    for (const item of saved.items) {
      if (item.state === 'sent') {
        item.state = 'failed';
        item.error = 'Interrupted while printing — physical outcome unknown.';
      } else if (item.state === 'rendered') {
        item.state = 'pending';
      }
    }
    this.batch = saved;
    await this.persist();
    this.emit('paused', undefined, 'Resumable batch restored.');
    return saved;
  }

  /** Stage a new run. Replaces any completed batch; refuses to clobber unfinished work. */
  async enqueue(label: string, rows: TData[], opts: { force?: boolean } = {}): Promise<QueueBatch<TData>> {
    if (this.running) throw new Error('A print run is already in progress.');
    const unfinished = this.batch?.items.some((i) => i.state !== 'confirmed');
    if (unfinished && !opts.force) {
      throw new Error('An unfinished batch is still queued. Resume, discard, or pass force.');
    }

    const route = this.router.current();
    if (!route) throw new Error('Connect a printer before queueing a run.');

    const batchId = `batch-${Date.now().toString(36)}`;
    this.batch = {
      id: batchId,
      label,
      driverId: route.driverId,
      createdAt: Date.now(),
      items: rows.map((data, i) => ({
        id: `${batchId}-${i + 1}`,
        index: i + 1,
        state: 'pending' as const,
        data,
        attempts: 0,
        updatedAt: Date.now(),
      })),
    };
    await this.persist();
    this.emit('paused', undefined, `${rows.length} labels queued.`);
    return this.batch;
  }

  /** Discard the batch and its persisted state. */
  async discard(): Promise<void> {
    if (this.running) this.cancel();
    this.batch = undefined;
    await this.storage.clear();
  }

  /** Ask the current run to stop after the label in flight. */
  cancel(): void {
    this.cancelRequested = true;
  }

  /**
   * Run (or resume) the batch. Every item is gated on the strongest completion
   * signal the active bridge offers; a route switch aborts cleanly and resumably.
   */
  async run(): Promise<QueueProgress> {
    const batch = this.batch;
    if (!batch) throw new Error('Nothing queued.');
    if (this.running) throw new Error('A print run is already in progress.');

    const route = this.router.current();
    if (!route) throw new Error('No printer connected.');
    if (route.driverId !== batch.driverId) {
      throw new Error(
        `This batch was queued for ${batch.driverId} but ${route.driverId} is connected. Reconnect the original printer or re-queue.`,
      );
    }

    const driver = registry.get(route.driverId);
    const epoch = route.epoch;

    this.running = true;
    this.cancelRequested = false;
    this.emit('running');

    try {
      for (const item of batch.items) {
        if (item.state === 'confirmed') continue;
        if (this.cancelRequested) {
          this.emit('paused', item.index, 'Cancelled by operator.');
          return this.snapshot('paused');
        }

        this.emit('running', item.index);

        try {
          const job = await this.render(item.data, item.index);
          item.state = 'rendered';
          item.attempts += 1;
          item.updatedAt = Date.now();
          await this.persist();

          item.state = 'sent';
          item.updatedAt = Date.now();
          await this.persist();
          this.audit({ batchId: batch.id, itemId: item.id, index: item.index, event: 'sent', attempt: item.attempts });

          const result = await this.router.send(job, epoch);
          await this.awaitCompletion(driver.capabilities.physicalCompletionCallback, result, job);

          item.state = 'confirmed';
          item.error = undefined;
          item.updatedAt = Date.now();
          await this.persist();
          this.audit({
            batchId: batch.id,
            itemId: item.id,
            index: item.index,
            event: 'confirmed',
            attempt: item.attempts,
            detail: result.confirmed ? 'physical confirmation' : 'computed completion',
          });

          if (this.interLabelDelayMs > 0) await sleep(this.interLabelDelayMs);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          item.state = 'failed';
          item.error = message;
          item.updatedAt = Date.now();
          await this.persist();
          this.audit({
            batchId: batch.id,
            itemId: item.id,
            index: item.index,
            event: 'failed',
            attempt: item.attempts,
            detail: message,
          });

          // A route switch or a lost link ends the run — everything after this
          // item would otherwise be sent to a printer nobody asked for.
          if (error instanceof StaleRouteError) {
            this.emit('aborted', item.index, 'Connection changed mid-run. Batch kept for resume.');
            return this.snapshot('aborted');
          }
          if (this.onErrorPolicy === 'stop') {
            this.emit('aborted', item.index, message);
            return this.snapshot('aborted');
          }
        }
      }

      const done = batch.items.every((i) => i.state === 'confirmed');
      this.emit(done ? 'done' : 'paused', undefined, done ? 'Run complete.' : 'Run finished with failures.');
      return this.snapshot(done ? 'done' : 'paused');
    } finally {
      this.running = false;
    }
  }

  /**
   * Reprint exactly the items that failed, one at a time.
   * Deliberately explicit: a half-printed label must never be silently re-sent
   * inside the original run.
   */
  async retryFailed(): Promise<QueueProgress> {
    const batch = this.batch;
    if (!batch) throw new Error('Nothing queued.');
    for (const item of batch.items) {
      if (item.state === 'failed') item.state = 'pending';
    }
    await this.persist();
    return this.run();
  }

  /**
   * Gate on the strongest available signal.
   * A bridge with a physical completion callback has already told us paper fed out.
   * Otherwise fall back to transfer time plus the mechanical feed time.
   */
  private async awaitCompletion(
    hasPhysicalCallback: boolean,
    result: PrintResult,
    job: RasterJob,
  ): Promise<void> {
    if (!result.success) throw new Error('The printer reported the job did not complete.');
    if (hasPhysicalCallback && result.confirmed) return;

    const mmPerSec = Math.max(1, job.speed) * 25.4; // speed is in inches/sec
    const feedMs = ((job.heightMm + job.gapMm) / mmPerSec) * 1000 * Math.max(1, job.copies);
    await sleep(Math.ceil(feedMs) + 120);
  }

  private snapshot(state: QueueProgress['state']): QueueProgress {
    const batch = this.batch;
    if (!batch) {
      return { batchId: '', total: 0, confirmed: 0, failed: 0, state: 'idle' };
    }
    return {
      batchId: batch.id,
      total: batch.items.length,
      confirmed: batch.items.filter((i) => i.state === 'confirmed').length,
      failed: batch.items.filter((i) => i.state === 'failed').length,
      state,
    };
  }
}

/**
 * Identical labels collapse into one job with native copies where the firmware
 * supports it — one transfer instead of N, and the printer paces itself.
 * Variable data (Excel) never takes this path.
 */
export function canUseNativeCopies(driverId: string, copies: number): boolean {
  if (copies < 2) return false;
  const driver = registry.find(driverId);
  return Boolean(driver?.capabilities.nativeCopies);
}
