import assert from 'node:assert/strict';

import {
  is991495ShippingLabelSize,
  tsplDirectionForLabel,
} from '@/constants/shipping-template-elements';

assert.equal(is991495ShippingLabelSize(99, 149.5), true);
assert.equal(is991495ShippingLabelSize(99.0, 149.5), true);
assert.equal(is991495ShippingLabelSize(50, 30), false);
assert.equal(is991495ShippingLabelSize(100, 150), false);

assert.equal(tsplDirectionForLabel(null, 99, 149.5), 1);
assert.equal(tsplDirectionForLabel({ widthMm: 99, heightMm: 149.5 }), 1);
assert.equal(tsplDirectionForLabel({ widthMm: 50, heightMm: 30 }, 50, 30), 1);
assert.equal(tsplDirectionForLabel({ widthMm: 99, heightMm: 149.5 }, 99, 149.5), 1);
assert.equal(
  tsplDirectionForLabel({ widthMm: 99, heightMm: 149.5 }, 100, 150),
  1,
  'doc 99×149.5 wins when paper preset differs',
);

console.log('ok shipping-tspl-direction');
