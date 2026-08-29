/**
 * Start Metro for the Expo development build.
 *
 * The terminal QR uses exp+sez-print:// — the stock Camera app cannot open it.
 * Connect from inside the sez-print development app instead.
 */
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const METRO_PORT = 8081;
const useUsb = process.argv.includes('--usb');

function lanIp() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'YOUR_PC_IP';
}

function freePort(port) {
  if (process.platform !== 'win32') return;
  const netstat = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
  if (netstat.status !== 0) return;
  const pids = new Set();
  for (const line of netstat.stdout.split('\n')) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (pid && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', pid, '/F'], { shell: true, stdio: 'ignore' });
    console.log(`Freed port ${port} (stopped PID ${pid})`);
  }
}

function runAdbReverse(port) {
  const result = spawnSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], {
    shell: true,
    encoding: 'utf8',
  });
  if (result.status === 0) {
    console.log(`\n✓ USB: adb reverse tcp:${port} tcp:${port}\n`);
    return true;
  }
  console.warn(
    `\n⚠ USB: adb reverse failed. Plug in the phone, enable USB debugging, then run:\n` +
      `   adb reverse tcp:${port} tcp:${port}\n`,
  );
  return false;
}

function printConnectHelp(port) {
  const ip = lanIp();
  const manualUrl = useUsb ? `http://localhost:${port}` : `http://${ip}:${port}`;
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  DO NOT scan the terminal QR with the Camera app.                ║
║  Camera cannot open exp+sez-print:// (shows "No usable data").   ║
╠══════════════════════════════════════════════════════════════════╣
║  Connect for live reload (scan QR *inside* the sez-print app):     ║
║  1. Install APK from: npm run build:android:dev  (NOT preview)   ║
║  2. Open sez-print → dev launcher → tap "Scan QR code"           ║
║     (Do NOT use the phone Camera app or Expo Go.)                ║
║  3. Scan the QR shown in this terminal, OR enter manually:        ║
║     ${manualUrl.padEnd(52)}║
║                                                                  ║
║  Standalone testing (no Metro): npm run build:android            ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

freePort(METRO_PORT);
if (useUsb) {
  runAdbReverse(METRO_PORT);
}

printConnectHelp(METRO_PORT);

const expoArgs = [
  'expo',
  'start',
  '--dev-client',
  '--port',
  String(METRO_PORT),
  useUsb ? '--localhost' : '--lan',
];

const child = spawn('npx', expoArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
