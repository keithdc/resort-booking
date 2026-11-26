/**
 * @file packages/ui/src/security/security-headers.ts
 * @shared Pure security header and Content-Security-Policy builders for the Next apps
 * @dependencies none (no Node or DOM API: usable from next.config, middleware and tests)
 */

export interface HeaderEntry {
  key: string;
  value: string;
}

export interface CspOptions {
  /** Fresh per request. Scripts without it (and not loaded by a trusted script) are blocked. */
  nonce: string;
  /** Development needs 'unsafe-eval' (React refresh) and a websocket for hot reload. Never true in production. */
  isDevelopment: boolean;
  /** Origin of the Nest API the browser calls (from NEXT_PUBLIC_API_URL). Empty when unknown. */
  apiOrigin: string;
  /** Extra origins for `connect-src` (a self-hosted map style, tile servers). Only http(s) origins are kept. */
  extraConnectOrigins?: readonly string[];
}

/** Google Fonts (CSS and font files): the only third-party font host until fonts are self-hosted (S-20). */
export const FONT_STYLE_HOST = 'https://fonts.googleapis.com';
export const FONT_FILE_HOST = 'https://fonts.gstatic.com';

/** OpenFreeMap serves the default map style, sprites, glyphs and vector tiles. */
export const MAP_TILE_HOST = 'https://tiles.openfreemap.org';
/** The raster fallback basemap (used once if the vector style fails to load). */
export const MAP_RASTER_FALLBACK_HOST = 'https://*.tile.openstreetmap.org';
/** MapTiler, when NEXT_PUBLIC_MAPTILER_KEY is set. */
export const MAPTILER_HOST = 'https://api.maptiler.com';

/**
 * Normalises a URL to its origin ("https://api.example.com"), or '' when it is not an http(s) URL.
 */
export function originOf(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    return '';
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

/**
 * Splits a space/comma separated list of origins (env var) into valid, de-duplicated origins.
 */
export function parseOriginList(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  const origins = value
    .split(/[\s,]+/)
    .map((entry: string): string => originOf(entry))
    .filter((origin: string): boolean => origin !== '');
  return [...new Set(origins)];
}

/**
 * A random nonce for one response. `crypto.getRandomValues` exists in the Edge runtime and in browsers.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * The Content-Security-Policy for one response.
 *
 * Scripts: nonce + 'strict-dynamic' (Next adds the nonce to its own scripts when the policy is on the request),
 * so no 'unsafe-inline' for scripts. Styles keep 'unsafe-inline' because MUI/emotion inject style tags at runtime.
 * Images allow any https host on purpose: staff paste photo URLs from anywhere (see docs/10 S-20); tighten this
 * when photos are uploaded and self-hosted. 'unsafe-eval' is development only.
 */
export function buildCsp(options: CspOptions): string {
  const connect = new Set<string>(["'self'", MAP_TILE_HOST, MAP_RASTER_FALLBACK_HOST, MAPTILER_HOST]);
  if (options.apiOrigin !== '') {
    connect.add(options.apiOrigin);
  }
  for (const origin of options.extraConnectOrigins ?? []) {
    const safe = originOf(origin);
    if (safe !== '') {
      connect.add(safe);
    }
  }
  if (options.isDevelopment) {
    connect.add('ws:');
    connect.add('wss:');
  }

  const script = ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'"];
  if (options.isDevelopment) {
    script.push("'unsafe-eval'");
  }

  const directives: [string, readonly string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', script],
    ['style-src', ["'self'", "'unsafe-inline'", FONT_STYLE_HOST]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:', FONT_FILE_HOST]],
    ['connect-src', [...connect]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  if (!options.isDevelopment) {
    directives.push(['upgrade-insecure-requests', []]);
  }
  return directives
    .map(([name, values]: [string, readonly string[]]): string => (values.length === 0 ? name : `${name} ${values.join(' ')}`))
    .join('; ');
}

/**
 * `CSP_REPORT_ONLY=true` ships the same policy without enforcing it, to watch for violations first.
 */
export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}

/**
 * Headers that do not change per request (everything except the CSP, which carries a nonce).
 * HSTS is production only: sending it from http://localhost would pin the browser to https.
 */
export function buildStaticSecurityHeaders(options: { isProduction: boolean }): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  if (options.isProduction) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
  }
  return headers;
}
