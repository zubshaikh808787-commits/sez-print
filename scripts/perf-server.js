const http = require('http');
const fs = require('fs');

const LOG_FILE = '/tmp/sez_perf.log';
try { fs.unlinkSync(LOG_FILE); } catch {}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    if (body) {
      const line = `[${new Date().toISOString()}] ${body}`;
      console.log(line);
      fs.appendFileSync(LOG_FILE, line + '\n');
    }
    res.end('ok');
  });
});

server.listen(9999, '0.0.0.0', () => {
  console.log('Perf server listening on port 9999');
});
