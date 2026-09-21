import { getAmbiguousModelCandidates } from '@/lib/printer/printer-heuristics';
import { normalizePrinterMac } from '@/stores/printer-store';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

console.log('--- printer legacy SDK addendum tests ---');

assert(normalizePrinterMac('313233343536') === '31:32:33:34:35:36', 'normalize compact MAC');
assert(normalizePrinterMac('31:32:33:34:35:36') === '31:32:33:34:35:36', 'normalize colon MAC');
assert(normalizePrinterMac('31-32-33-34-35-36') === '31:32:33:34:35:36', 'normalize dash MAC');

const tejasLike = getAmbiguousModelCandidates('SEZNIK TEJAS', 'bluetooth-spp');
assert(tejasLike.includes('td404'), 'TEJAS name claims td404');
assert(!tejasLike.includes('labelx'), 'TEJAS name must not claim labelx');

const labelxLike = getAmbiguousModelCandidates('Seznik MiniX_1234', 'labelx-spp');
assert(labelxLike.includes('labelx'), 'MiniX claims labelx');

const broad = getAmbiguousModelCandidates('Mini X Label', 'bluetooth-spp');
assert(broad.includes('labelx') && broad.includes('td404'), 'Mini X Label should match labelx and td404');
assert(broad.length >= 2, 'ambiguous name should match multiple drivers');

console.log('--- all printer legacy SDK addendum tests passed ---');
console.log('Manual QA (physical): brand-switch, MAC pin reconnect, ACL power-off, TEJAS 1024-byte chunks in log');
