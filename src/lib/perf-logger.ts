import { Platform } from 'react-native';

let lastLogStr = '';
const listeners = new Set<(s: string) => void>();

export function subscribePerf(cb: (s: string) => void) {
  listeners.add(cb);
  if (lastLogStr) cb(lastLogStr);
  return () => {
    listeners.delete(cb);
  };
}

export function logPerf(msg: string) {
  const ts = performance?.now ? performance.now().toFixed(2) : Date.now().toString();
  const formatted = `[PERF @ ${ts}ms] ${msg}`;
  console.log(formatted);
  lastLogStr = formatted;
  listeners.forEach((cb) => cb(formatted));

  const hosts = Platform.OS === 'web' ? ['localhost'] : ['192.168.1.9', '127.0.0.1', '10.0.2.2'];
  for (const host of hosts) {
    fetch(`http://${host}:9999/`, {
      method: 'POST',
      body: formatted,
    }).catch(() => {});
  }
}
