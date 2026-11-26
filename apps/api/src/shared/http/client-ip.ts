/**
 * @file apps/api/src/shared/http/client-ip.ts
 * @shared The caller's IP for rate limits, and the TRUST_PROXY setting
 * @dependencies none
 */

import { createHash } from 'node:crypto';

/** The only part of a request this needs. */
export interface IpCarrier {
  ip?: string | undefined;
}

/**
 * The client IP as Express worked it out. With TRUST_PROXY unset that is the socket address (a client
 * cannot spoof it with X-Forwarded-For); with TRUST_PROXY=<hops> Express takes the address that many proxies
 * back. Undefined when there is none.
 */
export function clientIp(request: IpCarrier): string | undefined {
  return request.ip === undefined || request.ip === '' ? undefined : request.ip;
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
