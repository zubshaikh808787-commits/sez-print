/**
 * Frees TCP port before start so `node --watch` does not die with EADDRINUSE
 * and sit on "Waiting for file changes…".
 */
const net = require('net');
const { execSync } = require('child_process');

const PORT = Number(process.env.PORT || 8787);

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

function killPortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[free-port] killed PID ${pid} on :${port}`);
      } catch {
        // ignore
      }
    }
  } catch {
    // no listeners
  }
}

function killPortUnix(port) {
  try {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore' });
    console.log(`[free-port] cleared :${port}`);
  } catch {
    // ignore
  }
}

(async () => {
  if (await portFree(PORT)) {
    process.exit(0);
  }
  console.log(`[free-port] port ${PORT} busy — freeing…`);
  if (process.platform === 'win32') killPortWindows(PORT);
  else killPortUnix(PORT);

  // brief wait for OS to release the socket
  await new Promise((r) => setTimeout(r, 800));
  if (!(await portFree(PORT))) {
    console.error(
      `[free-port] still cannot bind :${PORT}. Close the other process or set PORT=…`,
    );
    process.exit(1);
  }
  process.exit(0);
})();
