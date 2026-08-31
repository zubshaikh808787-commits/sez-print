import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Backend base URL for Wi‑Fi print / payload helpers.
 * - Android emulator → 10.0.2.2
 * - Physical device → your PC LAN IP (set EXPO_PUBLIC_PRINT_API_URL)
 */
export function getBackendBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PRINT_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri ??
    '';
  const lanHost = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';

  if (Platform.OS === 'android' && (!lanHost || lanHost === 'localhost' || lanHost === '127.0.0.1')) {
    return 'http://10.0.2.2:8787';
  }
  if (lanHost && lanHost !== '127.0.0.1') {
    return `http://${lanHost}:8787`;
  }
  return 'http://localhost:8787';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getBackendBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new Error('Could not reach the print service. Check Wi‑Fi and that the printer is on.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      body.error ||
        (res.status === 0 || res.status >= 500
          ? 'Print service is unavailable. Check Wi‑Fi and try again.'
          : `Backend ${res.status}`),
    );
    (err as Error & { code?: string }).code = body.code;
    throw err;
  }
  return body as T;
}

export async function backendHealth(): Promise<boolean> {
  try {
    const data = await api<{ ok?: boolean }>('/health');
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function fetchTestTscPayload(opts?: {
  widthMm?: number;
  heightMm?: number;
  text?: string;
}): Promise<Uint8Array> {
  const data = await api<{ encoding: string; data: string; bytes: number }>(
    '/api/print/test-payload',
    {
      method: 'POST',
      body: JSON.stringify({ format: 'tsc', ...opts }),
    },
  );
  // base64 → bytes
  const bin = atob(data.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function connectWifiPrinter(opts: {
  ip: string;
  port?: number;
  name?: string;
}): Promise<{ id: string; name: string; ip: string; port: number }> {
  const data = await api<{ printer: { id: string; name: string; ip: string; port: number } }>(
    '/api/printers/connect',
    {
      method: 'POST',
      body: JSON.stringify({
        sdkId: 'td404',
        transport: 'wifi',
        ip: opts.ip,
        port: opts.port ?? 9100,
        name: opts.name,
      }),
    },
  );
  return data.printer;
}

export async function wifiPrintSample(printerId: string, opts?: { text?: string }) {
  return api<{ bytesSent: number }>(`/api/printers/${printerId}/print-sample`, {
    method: 'POST',
    body: JSON.stringify(opts || {}),
  });
}

export async function wifiPrintRaw(printerId: string, bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const data = btoa(binary);
  return api<{ bytesSent: number }>(`/api/printers/${printerId}/print`, {
    method: 'POST',
    body: JSON.stringify({ encoding: 'base64', data }),
  });
}
