import Constants from 'expo-constants';

export function resolveGitSha(): string {
  const fromEnv = process.env.EXPO_PUBLIC_GIT_SHA?.trim();
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { gitSha?: string } | undefined;
  return extra?.gitSha ?? 'unknown';
}

export function resolveBuildTime(): string {
  const extra = Constants.expoConfig?.extra as { buildTime?: string } | undefined;
  if (extra?.buildTime) return extra.buildTime;
  const native = `${Constants.nativeAppVersion ?? ''}+${Constants.nativeBuildVersion ?? ''}`;
  return native !== '+' ? native : 'unknown';
}
