import { joshEffectiveDpi, joshHeadWidthMm, JOSH_HARDWARE_DPI } from '../josh-print';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

console.log('--- josh print DPI helpers ---');

assert(joshEffectiveDpi() === JOSH_HARDWARE_DPI, 'default is 203');
assert(joshEffectiveDpi(304) === JOSH_HARDWARE_DPI, 'leaked TD-404 304 must not size Josh');
assert(joshEffectiveDpi(300) === 300, 'explicit 300 when query failed');
assert(joshEffectiveDpi(300, 203) === 203, 'device 203 wins over explicit 300');
assert(joshEffectiveDpi(300, 300) === 300, 'explicit 300 when device is 300');
assert(joshEffectiveDpi(undefined, 203) === 203, 'device 203 used when no setting');
assert(joshEffectiveDpi(undefined, 300) === 300, 'device 300 used when no setting');

assert(joshHeadWidthMm(50, 108) === 50, 'device width wins');
assert(joshHeadWidthMm(null, 108) === 50, '108 mm is leaked TD-404 default');
assert(joshHeadWidthMm(null, 48) === 48, 'explicit Josh width kept');
assert(joshHeadWidthMm() === 50, 'default Josh head 50 mm');

console.log('--- all josh print DPI helper tests passed ---');
