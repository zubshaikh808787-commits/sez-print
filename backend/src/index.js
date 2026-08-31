const express = require('express');
const cors = require('cors');
const printersRouter = require('./routes/printers');
const { listSdks } = require('../sdks/registry');

const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

function buildStatus() {
  return {
    ok: true,
    service: 'sez-print-backend',
    time: new Date().toISOString(),
    port: PORT,
    sdks: listSdks().map((s) => ({ id: s.id, displayName: s.displayName })),
    endpoints: [
      { method: 'GET', path: '/', description: 'This status page' },
      { method: 'GET', path: '/health', description: 'Health check' },
      { method: 'GET', path: '/api/sdks', description: 'List registered printer SDKs' },
      { method: 'GET', path: '/api/sdks/:sdkId', description: 'SDK detail + native hints' },
      { method: 'GET', path: '/api/printers', description: 'Active printer sessions' },
      {
        method: 'POST',
        path: '/api/printers/connect',
        description: 'Connect printer (wifi / bluetooth / usb)',
      },
      { method: 'GET', path: '/api/printers/:id', description: 'Printer session status' },
      { method: 'DELETE', path: '/api/printers/:id', description: 'Disconnect printer' },
      { method: 'POST', path: '/api/printers/:id/print', description: 'Print raw bytes' },
      {
        method: 'POST',
        path: '/api/printers/:id/print-sample',
        description: 'Print TSC sample label',
      },
    ],
  };
}

app.get('/', (req, res) => {
  const status = buildStatus();
  const acceptsHtml = String(req.headers.accept || '').includes('text/html');
  if (!acceptsHtml) {
    return res.json(status);
  }

  const sdkRows = status.sdks
    .map(
      (s) =>
        `<tr><td><code>${s.id}</code></td><td>${s.displayName}</td></tr>`
    )
    .join('');
  const endpointRows = status.endpoints
    .map(
      (e) =>
        `<tr><td><span class="m">${e.method}</span></td><td><a href="${e.path.startsWith('/api') && e.method === 'GET' && !e.path.includes(':') ? e.path : '#'}">${e.path}</a></td><td>${e.description}</td></tr>`
    )
    .join('');

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sez Print Backend</title>
  <style>
    :root { color-scheme: light; --bg:#0f1419; --card:#1a2332; --text:#e7eef8; --muted:#8b9bb4; --accent:#3d9cf0; --ok:#3ecf8e; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, Segoe UI, sans-serif; background: radial-gradient(1200px 600px at 10% -10%, #1e3a5f 0%, var(--bg) 55%); color: var(--text); min-height:100vh; padding: 32px 20px 48px; }
    .wrap { max-width: 820px; margin: 0 auto; }
    h1 { font-size: 1.6rem; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.02em; }
    .sub { color: var(--muted); margin: 0 0 24px; font-size: 0.95rem; }
    .pill { display:inline-flex; align-items:center; gap:8px; background: rgba(62,207,142,.12); color: var(--ok); border:1px solid rgba(62,207,142,.35); padding:6px 12px; border-radius:999px; font-size:0.85rem; font-weight:500; margin-bottom: 20px; }
    .pill::before { content:""; width:8px; height:8px; border-radius:50%; background: var(--ok); box-shadow:0 0 0 3px rgba(62,207,142,.25); }
    .card { background: var(--card); border:1px solid rgba(255,255,255,.06); border-radius:14px; padding:18px 20px; margin-bottom:16px; }
    h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 12px; font-weight: 600; }
    table { width:100%; border-collapse: collapse; font-size: 0.92rem; }
    td, th { text-align:left; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
    th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: ui-monospace, Consolas, monospace; font-size: 0.88em; }
    .m { display:inline-block; min-width: 3.4rem; color: #9ad1ff; font-family: ui-monospace, Consolas, monospace; font-size: 0.8rem; }
    .note { color: var(--muted); font-size: 0.88rem; line-height: 1.45; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="pill">Online · port ${PORT}</div>
    <h1>Sez Print Backend</h1>
    <p class="sub">Printer SDK API · ${status.time}</p>

    <div class="card">
      <h2>Registered SDKs</h2>
      <table>
        <thead><tr><th>ID</th><th>Name</th></tr></thead>
        <tbody>${sdkRows || '<tr><td colspan="2">None</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Endpoints</h2>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>${endpointRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Quick links</h2>
      <p class="note">
        <a href="/health">/health</a> ·
        <a href="/api/sdks">/api/sdks</a> ·
        <a href="/api/printers">/api/printers</a>
      </p>
      <p class="note" style="margin-top:10px">
        This is the <strong>API</strong> server. The Expo app runs separately
        (Metro, usually port 8081/8082) — open that URL or scan the QR code for the UI.
      </p>
    </div>
  </div>
</body>
</html>`);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sez-print-backend', time: new Date().toISOString() });
});

app.use('/api', printersRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

const server = app.listen(PORT, () => {
  console.log(`Sez Print backend listening on http://localhost:${PORT}`);
  console.log(`Status:  GET http://localhost:${PORT}/`);
  console.log(`SDKs:    GET http://localhost:${PORT}/api/sdks`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Run "npm run free-port" then "npm run dev", or set PORT to another value.`,
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
