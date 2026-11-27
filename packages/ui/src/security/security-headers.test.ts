/**
 * @file packages/ui/src/security/security-headers.test.ts
 * @shared Security header builders
 */

import { describe, expect, it } from 'vitest';
import {
  buildCsp,
  buildStaticSecurityHeaders,
  cspHeaderName,
  generateNonce,
  originOf,
  parseOriginList,
} from './security-headers';

const BASE = { nonce: 'abc123', isDevelopment: false, apiOrigin: 'https://api.example.com' };

function directive(csp: string, name: string): string[] {
  const part = csp.split('; ').find((entry: string): boolean => entry === name || entry.startsWith(`${name} `));
  return part === undefined ? [] : part.split(' ').slice(1);
}

describe('originOf', () => {
  it('keeps only the origin of an http(s) URL', () => {
    expect(originOf('https://api.example.com/path?x=1')).toBe('https://api.example.com');
    expect(originOf('http://localhost:3002')).toBe('http://localhost:3002');
  });

  it.each([undefined, '', '   ', 'not a url', 'javascript:alert(1)', 'ftp://x.example', 'data:text/html,hi'])(
    'rejects %s',
    (value) => {
      expect(originOf(value)).toBe('');
    },
  );
});

describe('parseOriginList', () => {
  it('splits on spaces and commas, drops junk and duplicates', () => {
    expect(parseOriginList('https://a.example, https://b.example/x https://a.example nope')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseOriginList(undefined)).toEqual([]);
    expect(parseOriginList('')).toEqual([]);
  });
});

describe('generateNonce', () => {
  it('is base64 of 16 random bytes and differs between calls', () => {
    const first = generateNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(first);
  });
});

describe('buildCsp (production)', () => {
  const csp = buildCsp(BASE);

  it('allows scripts only from self with the nonce and strict-dynamic, never unsafe-inline or unsafe-eval', () => {
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('blocks framing, plugins, base tag and foreign form targets', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
  });

  it('lets the browser reach the API, the map style/tiles and the raster fallback, and nothing else', () => {
    expect(directive(csp, 'connect-src')).toEqual([
      "'self'",
      'https://tiles.openfreemap.org',
      'https://*.tile.openstreetmap.org',
      'https://api.maptiler.com',
      'https://api.example.com',
    ]);
  });

  it('allows the map worker (served from self, or a blob)', () => {
    expect(directive(csp, 'worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('allows styles inline (MUI/emotion) plus the font stylesheet host, fonts from the font file host', () => {
    expect(directive(csp, 'style-src')).toEqual(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
    expect(directive(csp, 'font-src')).toEqual(["'self'", 'data:', 'https://fonts.gstatic.com']);
  });

  it('documents the one deliberate relaxation: images from any https host', () => {
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:', 'blob:', 'https:']);
  });

  it('upgrades insecure requests in production', () => {
    expect(csp.split('; ')).toContain('upgrade-insecure-requests');
  });

  it('adds extra connect origins but only valid http(s) ones', () => {
    const extra = buildCsp({ ...BASE, extraConnectOrigins: ['https://maps.example.org/style.json', 'javascript:alert(1)'] });
    expect(directive(extra, 'connect-src')).toContain('https://maps.example.org');
    expect(extra).not.toContain('javascript:');
  });

  it('leaves out an unknown API origin', () => {
    expect(directive(buildCsp({ ...BASE, apiOrigin: '' }), 'connect-src')).not.toContain('');
  });
});

describe('buildCsp (development)', () => {
  const csp = buildCsp({ ...BASE, isDevelopment: true });

  it('adds unsafe-eval and websockets for hot reload only in development', () => {
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:']));
    expect(csp.split('; ')).not.toContain('upgrade-insecure-requests');
  });
});

describe('cspHeaderName', () => {
  it('switches to report-only on request', () => {
    expect(cspHeaderName(false)).toBe('Content-Security-Policy');
    expect(cspHeaderName(true)).toBe('Content-Security-Policy-Report-Only');
  });
});

describe('buildStaticSecurityHeaders', () => {
  const production = Object.fromEntries(buildStaticSecurityHeaders({ isProduction: true }).map((h) => [h.key, h.value]));
  const development = Object.fromEntries(buildStaticSecurityHeaders({ isProduction: false }).map((h) => [h.key, h.value]));

  it('lets the admin app send no Referer at all, so an invitation page never leaks its address', () => {
    const admin = Object.fromEntries(buildStaticSecurityHeaders({ isProduction: true, referrerPolicy: 'no-referrer' }).map((h) => [h.key, h.value]));

    expect(admin['Referrer-Policy']).toBe('no-referrer');
  });

  it('sets the fixed headers', () => {
    expect(production['X-Content-Type-Options']).toBe('nosniff');
    expect(production['X-Frame-Options']).toBe('DENY');
    expect(production['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(production['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(production['Permissions-Policy']).toContain('camera=()');
    expect(production['Permissions-Policy']).toContain('microphone=()');
    expect(production['Permissions-Policy']).toContain('geolocation=()');
  });

  it('sends HSTS in production only', () => {
    expect(production['Strict-Transport-Security']).toContain('max-age=');
    expect(development['Strict-Transport-Security']).toBeUndefined();
  });
});
