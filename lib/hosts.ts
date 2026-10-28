/**
 * Local-origin policy for host permissions.
 *
 * Default granted hosts stay localhost / 127.0.0.1 / [::1]. Extra origins the
 * user adds (Valet/Herd `*.test`, `*.local`, `*.localhost`, LAN IPs, …) are
 * requested at runtime via optional_host_permissions, one origin at a time.
 * Non-local hosts are refused — this is the companion to the recipe origin
 * guard, so a seed file cannot widen access to the public internet.
 */

export const DEFAULT_HOST_PERMISSIONS = [
  'http://localhost/*',
  'https://localhost/*',
  'http://127.0.0.1/*',
  'https://127.0.0.1/*',
  'http://[::1]/*',
  'https://[::1]/*',
] as const;

/**
 * Content-script match list. Chrome injects only where host permission is
 * granted. Patterns are explicit local TLDs rather than a site-wide http(s)
 * wildcard, which keeps the store listing honest. LAN IPs still get cookie
 * access via optional host permission; storage injection there needs a matching
 * content-script pattern (add the origin's TLD, or use localhost).
 */
export const CONTENT_SCRIPT_MATCHES = [
  ...DEFAULT_HOST_PERMISSIONS,
  'http://*.localhost/*',
  'https://*.localhost/*',
  'http://*.local/*',
  'https://*.local/*',
  'http://*.test/*',
  'https://*.test/*',
  'http://*.internal/*',
  'https://*.internal/*',
  'http://*.lan/*',
  'https://*.lan/*',
  'http://*.home/*',
  'https://*.home/*',
  'http://*.localdomain/*',
  'https://*.localdomain/*',
] as const;

/** What the manifest may request at runtime; actual requests are per-origin. */
export const OPTIONAL_HOST_PERMISSIONS = ['http://*/*', 'https://*/*'] as const;

const LOCAL_TLDS = new Set(['localhost', 'local', 'test', 'internal', 'lan', 'home', 'localdomain']);

export function hostnameOf(origin: string): string {
  return new URL(origin).hostname;
}

/** Chrome match patterns cannot include a port; IPv6 must be bracketed. */
export function originToMatchPattern(origin: string): string {
  const url = new URL(origin);
  const host = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;
  return `${url.protocol}//${host}/*`;
}

export function isDefaultHostPattern(pattern: string): boolean {
  return (DEFAULT_HOST_PERMISSIONS as readonly string[]).includes(pattern);
}

export function isIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function ipv4Bytes(host: string): [number, number, number, number] | null {
  if (!isIPv4(host)) return null;
  const [a, b, c, d] = host.split('.').map(Number);
  return [a!, b!, c!, d!];
}

export function isLoopbackIPv4(host: string): boolean {
  const bytes = ipv4Bytes(host);
  return bytes !== null && bytes[0] === 127;
}

export function isPrivateIPv4(host: string): boolean {
  const bytes = ipv4Bytes(host);
  if (!bytes) return false;
  const [a, b] = bytes;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isIPv6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  return bare.includes(':');
}

export function isLoopbackIPv6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  return bare === '::1';
}

/** Unique local fc00::/7 (fcxx / fdxx). */
export function isUniqueLocalIPv6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!bare.includes(':')) return false;
  const first = (bare.split(':')[0] ?? '').padStart(4, '0');
  return first.startsWith('fc') || first.startsWith('fd');
}

export function isLocalHostname(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (isLoopbackIPv4(h) || isPrivateIPv4(h) || isLoopbackIPv6(h) || isUniqueLocalIPv6(h)) return true;
  if (h === 'host.docker.internal' || h === 'host.containers.internal') return true;
  const labels = h.split('.').filter(Boolean);
  if (labels.length >= 2 && labels.slice(-2).join('.') === 'home.arpa') return true;
  if (labels.length >= 2 && LOCAL_TLDS.has(labels[labels.length - 1]!)) return true;
  return false;
}

export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

export function extraPermissionPatterns(origins: string[]): string[] {
  const extra = new Set<string>();
  for (const origin of origins) {
    const pattern = originToMatchPattern(origin);
    if (!isDefaultHostPattern(pattern)) extra.add(pattern);
  }
  return [...extra];
}

export function assertLocalOrigins(origins: string[]): void {
  const bad = [...new Set(origins.filter((origin) => !isLocalOrigin(origin)))];
  if (bad.length === 0) return;
  throw new Error(
    `Only local origins are allowed (localhost, *.localhost, *.local, *.test, *.internal, loopback/LAN IPs). Refusing: ${bad.join(', ')}`,
  );
}

export function localOriginIssue(origin: string): string | null {
  if (isLocalOrigin(origin)) return null;
  return `"${origin}" is not a local origin (localhost, *.test, *.local, *.localhost, LAN/loopback).`;
}
