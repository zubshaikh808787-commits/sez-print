/**
 * High-resolution probe for the tap -> drag path on the label canvas.
 *
 * Why this exists: "tap an unselected element and immediately drag it" used to
 * stall, because selecting the element ran a React commit on the JS thread whose
 * Fabric mount phase lands on the *UI* thread — the same thread Reanimated uses
 * to move the element and to fade the contextual toolbar in. The probe records
 * both sides of that fence so the stall is a number, not a feeling.
 *
 * Slots written on the UI runtime are plain mutables (no allocation per mark).
 * Slots written on the JS runtime are module scalars. One flush at gesture end
 * prints every mark as a delta from T_BEGIN, so a single tap-and-drag produces a
 * single line-per-mark block in Metro.
 *
 * Flip GESTURE_TRACE_ENABLED to false (or ship a release build) to compile the
 * marks down to early returns.
 */

import { makeMutable, runOnJS, runOnUI } from 'react-native-reanimated';

export const GESTURE_TRACE_ENABLED = __DEV__;

/** Monotonic clock, callable from either runtime. */
function traceNow() {
  'worklet';
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

// ---------------------------------------------------------------------------
// UI-runtime slots
// ---------------------------------------------------------------------------

const uiBegin = makeMutable(0);
const uiStart = makeMutable(0);
const uiUpdate1 = makeMutable(0);
const uiUpdate2 = makeMutable(0);
const uiUpdate3 = makeMutable(0);
const uiUpdateCount = makeMutable(0);
const uiUpdateLast = makeMutable(0);
const uiUpdateWorstGap = makeMutable(0);
const uiToolbarFlag = makeMutable(0);
const uiToolbarPainted = makeMutable(0);
const uiToolbarCleared = makeMutable(0);
const uiToolbarPrior = makeMutable(0);
const uiSeq = makeMutable(0);

// ---------------------------------------------------------------------------
// JS-runtime slots
// ---------------------------------------------------------------------------

let jsSelectIn = 0;
let jsSelectOut = 0;
let jsScreenCommitEnd = 0;
let jsScreenRenderMs = 0;
let jsScreenCommits = 0;
let jsToolbarCommitEnd = 0;
let jsToolbarRenderMs = 0;
let jsToolbarCommits = 0;

/**
 * JS clock minus UI clock. Both runtimes read a monotonic source, but nothing
 * guarantees a shared epoch, so probe it once and subtract it out of every
 * cross-thread delta. The probe costs one runOnUI hop at module load.
 */
let clockSkewMs = 0;
let clockSkewKnown = false;

function recordClockSkew(uiSampledAt: number) {
  clockSkewMs = traceNow() - uiSampledAt;
  clockSkewKnown = true;
}

if (GESTURE_TRACE_ENABLED) {
  try {
    runOnUI(() => {
      'worklet';
      runOnJS(recordClockSkew)(traceNow());
    })();
  } catch {
    // Probing the skew is best-effort; a missing offset only shifts the
    // cross-thread rows, it never stops the trace from printing.
  }
}

/** UI-clock timestamp expressed on the JS clock. */
function uiToJs(t: number) {
  return t === 0 ? 0 : t + clockSkewMs;
}

// ---------------------------------------------------------------------------
// UI-thread marks (call from worklets)
// ---------------------------------------------------------------------------

export function traceGestureBegin() {
  'worklet';
  if (!GESTURE_TRACE_ENABLED) return;
  uiSeq.value = uiSeq.value + 1;
  uiBegin.value = traceNow();
  uiStart.value = 0;
  uiUpdate1.value = 0;
  uiUpdate2.value = 0;
  uiUpdate3.value = 0;
  uiUpdateCount.value = 0;
  uiUpdateLast.value = 0;
  uiUpdateWorstGap.value = 0;
  uiToolbarFlag.value = 0;
  uiToolbarPainted.value = 0;
  uiToolbarCleared.value = 0;
  uiToolbarPrior.value = 0;
}

export function traceGestureStart() {
  'worklet';
  if (!GESTURE_TRACE_ENABLED) return;
  uiStart.value = traceNow();
}

export function traceGestureUpdate() {
  'worklet';
  if (!GESTURE_TRACE_ENABLED || uiBegin.value === 0) return;
  const t = traceNow();
  const n = uiUpdateCount.value + 1;
  uiUpdateCount.value = n;
  if (n === 1) uiUpdate1.value = t;
  else if (n === 2) uiUpdate2.value = t;
  else if (n === 3) uiUpdate3.value = t;
  if (uiUpdateLast.value !== 0) {
    const gap = t - uiUpdateLast.value;
    if (gap > uiUpdateWorstGap.value) uiUpdateWorstGap.value = gap;
  }
  uiUpdateLast.value = t;
}

/** Whether the toolbar was already on screen when this gesture started. */
export function traceToolbarPrior(visible: boolean) {
  'worklet';
  if (!GESTURE_TRACE_ENABLED) return;
  uiToolbarPrior.value = visible ? 1 : 0;
}

/**
 * Something drove the toolbar back to hidden. If this lands *inside* a gesture
 * window it means a second handler is fighting the one that selected.
 */
export function traceToolbarCleared() {
  'worklet';
  if (!GESTURE_TRACE_ENABLED || uiBegin.value === 0) return;
  uiToolbarCleared.value = traceNow();
}

/** The moment the toolbar's driving shared value flips to visible. */
export function traceToolbarFlag() {
  'worklet';
  if (!GESTURE_TRACE_ENABLED || uiToolbarFlag.value !== 0) return;
  uiToolbarFlag.value = traceNow();
}

/**
 * The moment the UI thread actually evaluates the toolbar's style worklet with
 * opacity 1 — i.e. the frame the toolbar becomes visible. This is the number
 * that matters; the flag above only says when we *asked* for it.
 */
export function traceToolbarPainted() {
  'worklet';
  if (!GESTURE_TRACE_ENABLED || uiToolbarPainted.value !== 0 || uiBegin.value === 0) return;
  uiToolbarPainted.value = traceNow();
}

// ---------------------------------------------------------------------------
// JS-thread marks
// ---------------------------------------------------------------------------

export function traceSelectDispatchIn() {
  if (!GESTURE_TRACE_ENABLED) return;
  jsSelectIn = traceNow();
}

export function traceSelectDispatchOut() {
  if (!GESTURE_TRACE_ENABLED) return;
  jsSelectOut = traceNow();
}

/** React Profiler onRender for the whole editor screen. */
export function traceScreenRender(_id: string, _phase: string, actualDuration: number) {
  if (!GESTURE_TRACE_ENABLED) return;
  jsScreenCommits += 1;
  jsScreenRenderMs += actualDuration;
  jsScreenCommitEnd = traceNow();
}

/** React Profiler onRender for the contextual toolbar subtree. */
export function traceToolbarRender(_id: string, phase: string, actualDuration: number) {
  if (!GESTURE_TRACE_ENABLED) return;
  jsToolbarCommits += 1;
  jsToolbarRenderMs += actualDuration;
  jsToolbarCommitEnd = traceNow();
  if (phase === 'mount') {
    console.log('[gesture-trace] contextual toolbar MOUNTED (should happen once, at screen mount)');
  }
}

function resetJsSlots() {
  jsSelectIn = 0;
  jsSelectOut = 0;
  jsScreenCommitEnd = 0;
  jsScreenRenderMs = 0;
  jsScreenCommits = 0;
  jsToolbarCommitEnd = 0;
  jsToolbarRenderMs = 0;
  jsToolbarCommits = 0;
}

/** Call once when a gesture begins, from the JS side, to clear the JS slots. */
export function traceResetJs() {
  if (!GESTURE_TRACE_ENABLED) return;
  resetJsSlots();
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

type FlushArgs = {
  seq: number;
  begin: number;
  start: number;
  u1: number;
  u2: number;
  u3: number;
  updates: number;
  worstGap: number;
  toolbarFlag: number;
  toolbarPainted: number;
  toolbarCleared: number;
  toolbarPrior: number;
  moved: boolean;
};

/**
 * The flush is queued from the gesture's onEnd, which lands on the JS thread in
 * the same batch as the selection/commit dispatches — i.e. before React has
 * rendered them. Wait a few hundred ms so the Profiler slots are populated.
 */
function printTrace(a: FlushArgs) {
  setTimeout(() => emitTrace(a), 400);
}

function emitTrace(a: FlushArgs) {
  const base = uiToJs(a.begin);
  const d = (t: number) => (t === 0 ? '   —  ' : `${(uiToJs(t) - base).toFixed(1)}ms`);
  const dJs = (t: number) => (t === 0 ? '   —  ' : `${(t - base).toFixed(1)}ms`);
  const lines = [
    `[gesture-trace] #${a.seq} ${a.moved ? 'TAP+DRAG' : 'TAP'}  (skew ${clockSkewKnown ? clockSkewMs.toFixed(1) : '?'}ms)`,
    `  T_BEGIN                    0.0ms`,
    `  T_START                    ${d(a.start)}`,
    `  T_UPDATE_1                 ${d(a.u1)}`,
    `  T_UPDATE_2                 ${d(a.u2)}`,
    `  T_UPDATE_3                 ${d(a.u3)}`,
    `  T_TOOLBAR_FLAG             ${d(a.toolbarFlag)}`,
    `  T_TOOLBAR_VISIBLE          ${a.toolbarPainted === 0 && a.toolbarPrior === 1 ? 'already visible' : d(a.toolbarPainted)}   <- opacity:1 evaluated on UI thread`,
    `  T_TOOLBAR_CLEARED          ${a.toolbarCleared === 0 ? '   —  ' : `${d(a.toolbarCleared)}   <- SOMETHING HID IT MID-GESTURE`}`,
    `  T_SELECT_DISPATCH_IN       ${dJs(jsSelectIn)}`,
    `  T_SELECT_DISPATCH_OUT      ${dJs(jsSelectOut)}`,
    `  T_SCREEN_RENDER_COMPLETE   ${dJs(jsScreenCommitEnd)}   (${jsScreenCommits} commit(s), ${jsScreenRenderMs.toFixed(1)}ms React render)`,
    `  T_TOOLBAR_RENDER_COMPLETE  ${dJs(jsToolbarCommitEnd)}   (${jsToolbarCommits} commit(s), ${jsToolbarRenderMs.toFixed(1)}ms React render)`,
    `  frames: ${a.updates} onUpdate, worst gap ${a.worstGap.toFixed(1)}ms`,
  ];
  console.log(lines.join('\n'));
  resetJsSlots();
}

export function traceGestureFlush(moved: boolean) {
  'worklet';
  if (!GESTURE_TRACE_ENABLED || uiBegin.value === 0) return;
  runOnJS(printTrace)({
    seq: uiSeq.value,
    begin: uiBegin.value,
    start: uiStart.value,
    u1: uiUpdate1.value,
    u2: uiUpdate2.value,
    u3: uiUpdate3.value,
    updates: uiUpdateCount.value,
    worstGap: uiUpdateWorstGap.value,
    toolbarFlag: uiToolbarFlag.value,
    toolbarPainted: uiToolbarPainted.value,
    toolbarCleared: uiToolbarCleared.value,
    toolbarPrior: uiToolbarPrior.value,
    moved,
  });
  uiBegin.value = 0;
}
