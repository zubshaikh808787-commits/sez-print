const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const buildId = process.argv[2];
if (!buildId) {
  console.error('Usage: node fetch-eas-log.js <build-id>');
  process.exit(1);
}

const view = spawnSync('eas', ['build:view', buildId, '--json'], {
  encoding: 'utf8',
  shell: true,
});
const jsonText = view.stdout.replace(/^\uFEFF?-+\s*\n?/m, '').trim();
const data = JSON.parse(jsonText);
const url = data.logFiles?.[0];
if (!url) {
  console.error('No log URL');
  process.exit(1);
}

https.get(url, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    let text;
    try {
      text = zlib.brotliDecompressSync(buf).toString('utf8');
    } catch {
      try {
        text = zlib.gunzipSync(buf).toString('utf8');
      } catch {
        text = buf.toString('utf8');
      }
    }
    const out = 'eas-build-log.txt';
    fs.writeFileSync(out, text);
    const hits = text
      .split('\n')
      .filter(
        (line) =>
          /FAILED|error:|What went wrong|BUILD FAILED|Compilation error/i.test(line),
      );
    console.log('Wrote', out, 'bytes', text.length);
    console.log(hits.slice(-80).join('\n'));
  });
});
