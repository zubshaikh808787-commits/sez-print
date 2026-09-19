import assert from 'node:assert/strict';

import type {
  ConnectedDevice,
  DiscoveredDevice,
  PrintResult,
  PrinterCapabilities,
  PrinterDriver,
  PrinterStatus,
  RasterJob,
  Unsubscribe,
} from '../contract';
import { StaleRouteError } from '../contract';
import { registry } from '../registry';
import { PrinterRouter } from '../router';
import { Discovery, MemoryDeviceMemory } from '../discovery';
import { MemoryQueueStorage, PrintQueue } from '../queue';
import { OK_STATUS } from '../status';
import { fitToHead, resolveProfile } from '../profiles';

console.log('--- printer-core isolation tests ---');

/** A bridge that records exactly what was asked of it and when. */
class FakeDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities;
  readonly log: string[] = [];
  connected = false;
  disconnectCalls = 0;
  printed: RasterJob[] = [];
  private listeners = new Set<(reason: string) => void>();

  constructor(id: string, overrides: Partial<PrinterCapabilities> = {}, private readonly nameToken = id) {
    this.capabilities = {
      driverId: id,
      displayName: id,
      platforms: ['android'],
      transports: ['spp'],
      dialects: ['tspl'],
      defaultDialect: 'tspl',
      dialectIsDeviceSetting: false,
      dpi: 203,
      headWidthDots: 384,
      maxLabelHeightMm: 1000,
      nativeCopies: true,
      statusQuery: true,
      physicalCompletionCallback: true,
      maxChunkBytes: 2048,
      mediaTypes: ['gap'],
      requiresLicenseKey: false,
      ...overrides,
    };
  }

  claims(device: DiscoveredDevice): boolean {
    return (device.name ?? '').toLowerCase().includes(this.nameToken);
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    this.log.push('connect');
    this.connected = true;
    return { id: deviceId, name: name ?? null, driverId: this.capabilities.driverId, transport: 'spp' };
  }

  async disconnect(): Promise<void> {
    this.log.push('disconnect');
    this.disconnectCalls += 1;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getStatus(): Promise<PrinterStatus> {
    return OK_STATUS;
  }

  async getDialects() {
    return { supported: this.capabilities.dialects, active: this.capabilities.defaultDialect };
  }

  async setDialect(): Promise<void> {
    this.log.push('setDialect');
  }

  async printRaster(job: RasterJob): Promise<PrintResult> {
    if (!this.connected) throw new Error(`${this.capabilities.driverId} printed while disconnected`);
    this.printed.push(job);
    return { success: true, copies: job.copies, durationMs: 1, confirmed: true };
  }

  onDisconnected(cb: (reason: string) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Simulate the printer dropping the link on its own. */
  dropLink(reason = 'radio lost'): void {
    this.connected = false;
    for (const cb of this.listeners) cb(reason);
  }
}

function job(overrides: Partial<RasterJob> = {}): RasterJob {
  return {
    png: 'AAAA',
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    media: 'gap',
    copies: 1,
    density: 10,
    speed: 3,
    rotation: 0,
    ...overrides,
  };
}

async function main() {
  // Test 1: opening one path closes EVERY other registered path.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    const tejas = new FakeDriver('tejas');
    const labelx = new FakeDriver('labelx');
    [dev, tejas, labelx].forEach((d) => registry.register(d));

    const r = new PrinterRouter({ settleMs: 1 });
    await r.open('dev', 'AA:BB');
    assert.equal(dev.connected, true, 'dev must be connected');

    await r.open('tejas', 'CC:DD');
    assert.equal(dev.connected, false, 'dev must be closed when tejas opens');
    assert.equal(labelx.disconnectCalls > 0, true, 'closeAll must touch every driver, not just the open one');
    assert.equal(tejas.connected, true, 'tejas must be connected');
    assert.equal(r.current()?.driverId, 'tejas');
    console.log('✓ Test 1: one path open, every other path closed');
  }

  // Test 2: a job held across a switch is refused, not misrouted.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    const tejas = new FakeDriver('tejas');
    [dev, tejas].forEach((d) => registry.register(d));

    const r = new PrinterRouter({ settleMs: 1 });
    const route = await r.open('dev', 'AA:BB');
    const staleEpoch = route.epoch;

    await r.open('tejas', 'CC:DD');
    await assert.rejects(() => r.send(job(), staleEpoch), StaleRouteError, 'stale job must be rejected');
    assert.equal(tejas.printed.length, 0, 'a job queued for dev must NEVER land on tejas');
    assert.equal(dev.printed.length, 0, 'and must not land on dev either');
    console.log('✓ Test 2: stale job refused instead of misrouted');
  }

  // Test 3: a late onDisconnected from the OLD driver must not kill the NEW route.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    const tejas = new FakeDriver('tejas');
    [dev, tejas].forEach((d) => registry.register(d));

    const r = new PrinterRouter({ settleMs: 1 });
    await r.open('dev', 'AA:BB');
    const active = await r.open('tejas', 'CC:DD');

    dev.dropLink('late callback from the bridge we already closed');
    assert.equal(r.current()?.epoch, active.epoch, 'the live route must survive a stale disconnect callback');

    const result = await r.send(job(), active.epoch);
    assert.equal(result.success, true);
    assert.equal(tejas.printed.length, 1, 'printing must still work after the stale callback');
    console.log('✓ Test 3: stale disconnect callback cannot invalidate the live route');
  }

  // Test 4: a real link loss does invalidate the route.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    registry.register(dev);

    const r = new PrinterRouter({ settleMs: 1 });
    const route = await r.open('dev', 'AA:BB');
    dev.dropLink();

    assert.equal(r.isOpen(), false, 'route must clear when the link genuinely drops');
    await assert.rejects(() => r.send(job(), route.epoch), 'jobs must fail once the link is gone');
    console.log('✓ Test 4: genuine link loss clears the route');
  }

  // Test 5: discovery tags one unified list; memory beats heuristics.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    const tejas = new FakeDriver('tejas');
    [dev, tejas].forEach((d) => registry.register(d));

    const found: DiscoveredDevice[] = [
      { id: '11:11', name: 'Seznik Dev 001', transport: 'spp' },
      { id: '22:22', name: 'Seznik Tejas 002', transport: 'spp' },
      { id: '33:33', name: 'Unrelated Speaker', transport: 'spp' },
    ];

    const discovery = new Discovery({
      platform: 'android',
      memory: new MemoryDeviceMemory(),
      backend: {
        listBonded: async () => found,
        start: async () => {},
        stop: async () => {},
      },
    });

    await discovery.loadBonded();
    const list = discovery.list();
    assert.equal(list.find((d) => d.id === '11:11')?.driverId, 'dev');
    assert.equal(list.find((d) => d.id === '22:22')?.driverId, 'tejas');
    assert.equal(list.find((d) => d.id === '33:33')?.driverId, undefined, 'unclaimed devices stay untagged');

    await discovery.assign('33:33', 'dev');
    assert.equal(discovery.list().find((d) => d.id === '33:33')?.driverId, 'dev', 'user override is remembered');
    console.log('✓ Test 5: one device list, pre-tagged, user override remembered');
  }

  // Test 6: the queue resumes where it stopped and never blind-retries a half label.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    registry.register(dev);

    const r = new PrinterRouter({ settleMs: 1 });
    await r.open('dev', 'AA:BB');

    const storage = new MemoryQueueStorage();
    let failOnRow = 3;
    const queue = new PrintQueue<{ row: number }>({
      router: r,
      storage,
      interLabelDelayMs: 0,
      render: async (data) => {
        if (data.row === failOnRow) throw new Error('render blew up');
        return job();
      },
    });

    await queue.enqueue('run', [{ row: 1 }, { row: 2 }, { row: 3 }, { row: 4 }, { row: 5 }]);
    const stopped = await queue.run();
    assert.equal(stopped.state, 'aborted', 'a failure must halt a numbered run');
    assert.equal(stopped.confirmed, 2, 'rows 1-2 printed');
    assert.equal(stopped.failed, 1, 'row 3 failed');
    assert.equal(dev.printed.length, 2, 'nothing past the failure was sent');

    failOnRow = -1;
    const finished = await queue.retryFailed();
    assert.equal(finished.state, 'done', 'retry resumes the batch');
    assert.equal(finished.confirmed, 5, 'all five labels confirmed');
    assert.equal(dev.printed.length, 5, 'rows 1-2 were NOT reprinted');
    console.log('✓ Test 6: queue halts, resumes at the failed label, never duplicates');
  }

  // Test 7: a route switch mid-run aborts the batch resumably.
  {
    registry.clear();
    const dev = new FakeDriver('dev');
    const tejas = new FakeDriver('tejas');
    [dev, tejas].forEach((d) => registry.register(d));

    const r = new PrinterRouter({ settleMs: 1 });
    await r.open('dev', 'AA:BB');

    const queue = new PrintQueue<{ row: number }>({
      router: r,
      interLabelDelayMs: 0,
      render: async (data) => {
        if (data.row === 2) await r.open('tejas', 'CC:DD'); // user switches printers mid-run
        return job();
      },
    });

    await queue.enqueue('run', [{ row: 1 }, { row: 2 }, { row: 3 }]);
    const progress = await queue.run();
    assert.equal(progress.state, 'aborted', 'a switch must abort the run');
    assert.equal(tejas.printed.length, 0, 'the rest of the batch must NOT land on the new printer');
    console.log('✓ Test 7: switching printers mid-run aborts instead of misprinting');
  }

  // Test 8: geometry comes from profiles, clamped to the real head.
  {
    const devProfile = resolveProfile('dev', 'Seznik Dev 001');
    assert.equal(devProfile?.model, 'DEV-7299');
    assert.equal(devProfile?.headWidthDots, 384);
    assert.equal(devProfile?.printableDots, 378, 'the DEV head prints 378 of its 384 dots');

    const fitted = fitToHead(devProfile!, 60, 30);
    assert.equal(fitted.clamped, true, '60 mm must clamp on a 48 mm head');
    assert.ok(fitted.widthMm <= 48);

    const tejasProfile = resolveProfile('tejas', 'Seznik Tejas 002');
    assert.equal(tejasProfile?.dpi, 304, 'TD-404 is a 304 dpi head, not 300');
    console.log('✓ Test 8: geometry resolved from profiles.json and clamped to the head');
  }

  registry.clear();
  console.log('--- all printer-core tests passed ---');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
