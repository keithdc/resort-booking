/**
 * @file apps/api/src/shared/http/client-ip.ts
 * @shared The caller's IP for rate limits, and the TRUST_PROXY setting
 * @dependencies none
 */

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

/** The only part of a request this needs. */
export interface IpCarrier {
  ip?: string | undefined;
}

/**
 * The client IP as Express worked it out, normalised for limits and hashes (see `normalizeIp`). With TRUST_PROXY
 * unset that is the socket address (a client cannot spoof it with X-Forwarded-For); with TRUST_PROXY=<hops>
 * Express takes the address that many proxies back. Undefined when there is none.
 */
export function clientIp(request: IpCarrier): string | undefined {
  return request.ip === undefined || request.ip.trim() === '' ? undefined : normalizeIp(request.ip);
}

/** The upper bound for a string that is not an IP at all (it ends up in a Redis key). */
const MAX_UNPARSED_LENGTH = 64;

/**
 * One key per network instead of per address (docs/13 R2-13). IPv4 stays as it is. An IPv4-mapped IPv6 address
 * (`::ffff:203.0.113.9`, which a dual-stack socket reports for an IPv4 client, in dotted or hex form) becomes the
 * plain IPv4 address, so the same client is one key either way. Every other IPv6 address becomes its /64 prefix
 * (`2001:db8:1:2::/64`): a home or mobile connection owns a whole /64, so keying by the full address would let it
 * rotate through 2^64 values. A zone id (`%eth0`) and brackets are dropped. Anything that is not an IP is returned
 * lower-cased and cut to 64 characters (it only keys a counter).
 */
export function normalizeIp(raw: string): string {
  const trimmed = raw.trim().replace(/^\[|\]$/g, '');
  const withoutZone = trimmed.includes('%') ? trimmed.slice(0, trimmed.indexOf('%')) : trimmed;
  const version = isIP(withoutZone);
  if (version === 4) {
    return withoutZone;
  }
  const groups = version === 6 ? parseIpv6(withoutZone) : null;
  if (groups === null) {
    return trimmed.toLowerCase().slice(0, MAX_UNPARSED_LENGTH);
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return `${String(g6 >> 8)}.${String(g6 & 0xff)}.${String(g7 >> 8)}.${String(g7 & 0xff)}`;
  }
  return `${[g0, g1, g2, g3].map((group): string => group.toString(16)).join(':')}::/64`;
}

type Ipv6Groups = readonly [number, number, number, number, number, number, number, number];

/** Expands a valid IPv6 text form (with `::` and an optional dotted IPv4 tail) into its eight 16-bit groups. */
function parseIpv6(address: string): Ipv6Groups | null {
  let text = address;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted !== null) {
    const [, a, b, c, d] = dotted.map(Number);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      return null;
    }
    text = `${text.slice(0, dotted.index)}${(a * 256 + b).toString(16)}:${(c * 256 + d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const toGroups = (part: string): number[] => (part === '' ? [] : part.split(':').map((group): number => Number.parseInt(group, 16)));
  const head = toGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const all = [...head, ...new Array<number>(Math.max(fill, 0)).fill(0), ...tail];
  if (all.some((group): boolean => Number.isNaN(group) || group < 0 || group > 0xffff)) {
    return null;
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7, ...extra] = all;
  if (g7 === undefined || extra.length > 0) {
    return null;
  }
  return [g0 ?? 0, g1 ?? 0, g2 ?? 0, g3 ?? 0, g4 ?? 0, g5 ?? 0, g6 ?? 0, g7];
}

/**
 * Express `trust proxy` value from TRUST_PROXY: a whole number of proxy hops, or false (no proxy).
 * Anything else (including "true", which would trust every hop and so every spoofed header) is false.
 */
export function trustProxySetting(raw: string | undefined): number | false {
  if (raw === undefined || !/^\d{1,2}$/.test(raw.trim())) {
    return false;
  }
  const hops = Number(raw.trim());
  return hops > 0 ? hops : false;
}

/**
 * One-way hash of a value for storing or keying by it without keeping it readable (IPs, emails). A salt
 * (IP_HASH_SALT) stops a precomputed table of the small IPv4 space from reversing it.
 */
export function fingerprint(value: string, salt: string = ''): string {
  return createHash('sha256').update(`${salt}:${value.trim().toLowerCase()}`).digest('hex');
}
