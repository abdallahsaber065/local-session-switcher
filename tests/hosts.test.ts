import { describe, expect, it } from 'vitest';
import {
  CONTENT_SCRIPT_MATCHES,
  DEFAULT_HOST_PERMISSIONS,
  OPTIONAL_HOST_PERMISSIONS,
  assertLocalOrigins,
  extraPermissionPatterns,
  isLocalHostname,
  isLocalOrigin,
  originToMatchPattern,
} from '../lib/hosts';

describe('isLocalHostname', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '127.0.0.2',
    '::1',
    '[::1]',
    'myapp.test',
    'api.myapp.test',
    'app.local',
    'foo.localhost',
    'service.internal',
    'nas.lan',
    'router.home',
    'box.localdomain',
    'my.home.arpa',
    'host.docker.internal',
    'host.containers.internal',
    '10.0.0.5',
    '192.168.1.20',
    '172.16.0.2',
    '172.31.255.1',
    '169.254.1.1',
    'fd12:3456:789a:1::1',
  ])('accepts %s', (host) => {
    expect(isLocalHostname(host)).toBe(true);
  });

  it.each([
    'example.com',
    'google.com',
    'myapp.dev',
    'staging.acme.io',
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '11.0.0.1',
    '2001:4860:4860::8888',
    'evil.test.example.com',
  ])('rejects %s', (host) => {
    expect(isLocalHostname(host)).toBe(false);
  });
});

describe('isLocalOrigin', () => {
  it('accepts http(s) local origins', () => {
    expect(isLocalOrigin('http://myapp.test')).toBe(true);
    expect(isLocalOrigin('https://app.localhost:3443')).toBe(true);
    expect(isLocalOrigin('http://192.168.0.10:8080')).toBe(true);
  });

  it('rejects non-http schemes and remote hosts', () => {
    expect(isLocalOrigin('ftp://localhost')).toBe(false);
    expect(isLocalOrigin('https://example.com')).toBe(false);
    expect(isLocalOrigin('not-a-url')).toBe(false);
  });
});

describe('originToMatchPattern', () => {
  it('drops the port and maps to a host match pattern', () => {
    expect(originToMatchPattern('http://myapp.test:8080')).toBe('http://myapp.test/*');
    expect(originToMatchPattern('https://127.0.0.1:8443')).toBe('https://127.0.0.1/*');
    expect(originToMatchPattern('http://localhost:3456')).toBe('http://localhost/*');
  });

  it('brackets IPv6 hosts', () => {
    expect(originToMatchPattern('http://[::1]:3000')).toBe('http://[::1]/*');
  });
});

describe('extraPermissionPatterns', () => {
  it('returns nothing for default localhost / 127.0.0.1 / [::1]', () => {
    expect(
      extraPermissionPatterns(['http://localhost:3000', 'http://127.0.0.1:8000', 'http://[::1]:5173']),
    ).toEqual([]);
  });

  it('returns one pattern per extra host, never a site-wide wildcard', () => {
    const extra = extraPermissionPatterns([
      'http://localhost:3000',
      'http://myapp.test',
      'http://myapp.test:8080',
      'http://192.168.1.10:3000',
    ]);
    expect(extra).toEqual(['http://myapp.test/*', 'http://192.168.1.10/*']);
    expect(extra.some((pattern) => pattern === 'http://*/*' || pattern === 'https://*/*')).toBe(false);
  });
});

describe('assertLocalOrigins', () => {
  it('allows a mix of default and extra local hosts', () => {
    expect(() =>
      assertLocalOrigins(['http://localhost:3000', 'http://myapp.test', 'http://10.0.0.4:4000']),
    ).not.toThrow();
  });

  it('refuses remote hosts so a seed cannot widen access', () => {
    expect(() => assertLocalOrigins(['http://localhost:3000', 'https://api.example.com'])).toThrow(
      /api\.example\.com/,
    );
  });
});

describe('manifest constants', () => {
  it('keeps default grants on loopback only', () => {
    expect(DEFAULT_HOST_PERMISSIONS).toEqual([
      'http://localhost/*',
      'https://localhost/*',
      'http://127.0.0.1/*',
      'https://127.0.0.1/*',
      'http://[::1]/*',
      'https://[::1]/*',
    ]);
  });

  it('declares optional patterns without granting them', () => {
    expect(OPTIONAL_HOST_PERMISSIONS).toEqual(['http://*/*', 'https://*/*']);
  });

  it('content-script matches stay on loopback plus local TLDs, never the whole web', () => {
    expect(CONTENT_SCRIPT_MATCHES).toContain('http://localhost/*');
    expect(CONTENT_SCRIPT_MATCHES).toContain('http://*.test/*');
    expect(CONTENT_SCRIPT_MATCHES).toContain('http://*.local/*');
    expect((CONTENT_SCRIPT_MATCHES as readonly string[]).includes('http://*/*')).toBe(false);
    expect((CONTENT_SCRIPT_MATCHES as readonly string[]).includes('<all_urls>')).toBe(false);
  });
});
