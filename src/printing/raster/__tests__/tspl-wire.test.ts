import assert from 'node:assert/strict';
import { unpackWireMono1bppToGray, regionDiffPercent, inkBoundingBox } from '../tspl-wire';
import { isolateDocument } from '../ground-truth-parity';
import { createPhase4FrozenDocument } from '../skia-rasterizer';

const w = 8;
const h = 1;
const wire = new Uint8Array([0b10000000]); // MSB white, rest black on wire (0=black)
const gray = unpackWireMono1bppToGray(wire, w, h, 1);
assert.equal(gray[0], 255);
assert.equal(gray[1], 0);

const a = new Uint8Array([0, 255, 0, 255]);
const b = new Uint8Array([0, 0, 0, 255]);
const d = regionDiffPercent(a, b, 2, { x: 0, y: 0, w: 2, h: 2 }, 160);
assert.equal(d.differing, 1);

const box = inkBoundingBox(a, 2, 2, { x: 0, y: 0, w: 2, h: 2 }, 160);
assert.ok(box && box.ink === 2);

const iso = isolateDocument(createPhase4FrozenDocument(), 'barcode');
assert.ok(iso && iso.elements.every((el) => el.type === 'barcode'));
console.log('ok tspl-wire unpack + isolate');
