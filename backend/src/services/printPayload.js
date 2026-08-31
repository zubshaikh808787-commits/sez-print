/**
 * Shared print payload builders used by the HTTP API and mirrored in the Expo app.
 */

function formatTsplSize(widthMm, heightMm) {
  const MM_PER_INCH = 25.4;
  const wIn = widthMm / MM_PER_INCH;
  const hIn = heightMm / MM_PER_INCH;
  const wMmInt = Math.round(widthMm);
  const hMmInt = Math.round(heightMm);
  const integerMmError = Math.abs(wMmInt - widthMm) + Math.abs(hMmInt - heightMm);
  const wInR = Math.round(wIn * 1000) / 1000;
  const hInR = Math.round(hIn * 1000) / 1000;
  const inchError =
    Math.abs(wInR * MM_PER_INCH - widthMm) + Math.abs(hInR * MM_PER_INCH - heightMm);
  if (inchError + 0.01 < integerMmError) {
    return `SIZE ${wInR.toFixed(3)},${hInR.toFixed(3)}`;
  }
  return `SIZE ${wMmInt} mm,${hMmInt} mm`;
}

function buildSampleTscLabel(opts = {}) {
  const widthMm = opts.widthMm ?? 50;
  const heightMm = opts.heightMm ?? 30;
  const gapMm = opts.gapMm ?? 2;
  const density = opts.density ?? 8;
  const text = String(opts.text ?? 'Sez Print TD-404').replace(/"/g, '');
  const cmd =
    '\r\n' +
    `${formatTsplSize(widthMm, heightMm)}\r\n` +
    `GAP ${gapMm} mm,0 mm\r\n` +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    `DENSITY ${density}\r\n` +
    'CLS\r\n' +
    `TEXT 40,40,"0",0,1,1,"${text}"\r\n` +
    'PRINT 1,1\r\n';
  return Buffer.from(cmd, 'ascii');
}

/**
 * Build TSPL BITMAP job from packed 1-bit raster.
 * Incoming bits use ESC/POS polarity (1 = black). TSPL BITMAP is 0 = black, 1 = white.
 * Body fields: widthMm, heightMm, bytesPerRow, height, bitmapBase64, copies, density, gapMm
 */
function buildTscBitmapLabel(opts = {}) {
  const widthMm = Number(opts.widthMm ?? 50);
  const heightMm = Number(opts.heightMm ?? 30);
  const gapMm = Number(opts.gapMm ?? 2);
  const density = Number(opts.density ?? 8);
  const copies = Math.max(1, Number(opts.copies ?? 1));
  const bytesPerRow = Number(opts.bytesPerRow);
  const height = Number(opts.height);
  if (!opts.bitmapBase64 || !bytesPerRow || !height) {
    const err = new Error('bitmapBase64, bytesPerRow, and height are required');
    err.code = 'BAD_BITMAP';
    throw err;
  }
  const bitmap = Buffer.from(String(opts.bitmapBase64).replace(/\s/g, ''), 'base64');
  for (let i = 0; i < bitmap.length; i++) bitmap[i] ^= 0xff;
  const header = Buffer.from(
    '\r\n' +
      `${formatTsplSize(widthMm, heightMm)}\r\n` +
      `GAP ${gapMm} mm,0 mm\r\n` +
      'DIRECTION 0,0\r\n' +
      'REFERENCE 0,0\r\n' +
      `DENSITY ${density}\r\n` +
      'CLS\r\n' +
      `BITMAP 0,0,${bytesPerRow},${height},0,`,
    'ascii',
  );
  const footer = Buffer.from(`\r\nPRINT 1,1\r\n`, 'ascii');
  return Buffer.concat([header, bitmap, footer]);
}

module.exports = {
  buildSampleTscLabel,
  buildTscBitmapLabel,
};
