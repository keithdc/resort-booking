/**
 * @file apps/api/src/modules/identity/identity.device-label.ts
 * @feature identity
 * @dependencies none
 *
 * A coarse, human label for a browser ("Chrome on macOS") out of a User-Agent. Only this label is stored with a
 * session, never the raw User-Agent (it is a fingerprinting aid and says more than a person needs to recognise a device).
 */

export const UNKNOWN_DEVICE = 'Unknown device';
const MAX_LABEL_LENGTH = 80;

/** The browser family, most specific first (Edge and Opera also say "Chrome"; Chrome also says "Safari"). */
function browserOf(agent: string): string | null {
  if (/\bEdg(e|A|iOS)?\//.test(agent)) {
    return 'Edge';
  }
  if (/\bOPR\/|\bOpera\b/.test(agent)) {
    return 'Opera';
  }
  if (/\bFirefox\/|\bFxiOS\//.test(agent)) {
    return 'Firefox';
  }
  // No leading word boundary: headless and embedded builds say "HeadlessChrome/".
  if (/\bCriOS\/|Chrome\//.test(agent)) {
    return 'Chrome';
  }
  if (/\bSafari\//.test(agent)) {
    return 'Safari';
  }
  return null;
}

/** The operating system family; iOS before macOS (an iPad says "like Mac OS X"), Android before Linux. */
function systemOf(agent: string): string | null {
  if (/iPhone/.test(agent)) {
    return 'iPhone';
  }
  if (/iPad/.test(agent)) {
    return 'iPad';
  }
  if (/Android/.test(agent)) {
    return 'Android';
  }
  if (/Windows/.test(agent)) {
    return 'Windows';
  }
  if (/Macintosh|Mac OS X/.test(agent)) {
    return 'macOS';
  }
  if (/CrOS/.test(agent)) {
    return 'ChromeOS';
  }
  if (/Linux|X11/.test(agent)) {
    return 'Linux';
  }
  return null;
}

/**
 * "Chrome on macOS", "Safari on iPhone", "Chrome" or "macOS" when only one part is known, else "Unknown device".
 */
export function deviceLabelFromUserAgent(userAgent: string | undefined): string {
  if (userAgent === undefined || userAgent.trim() === '') {
    return UNKNOWN_DEVICE;
  }
  const agent = userAgent.slice(0, 512);
  const browser = browserOf(agent);
  const system = systemOf(agent);
  const label = browser !== null && system !== null ? `${browser} on ${system}` : (browser ?? system ?? UNKNOWN_DEVICE);
  return label.slice(0, MAX_LABEL_LENGTH);
}
