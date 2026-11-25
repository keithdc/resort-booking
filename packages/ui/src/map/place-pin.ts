/**
 * @file packages/ui/src/map/place-pin.ts
 * @shared The single-place map marker: a dark circle with a white house and a soft pulse ring
 * @dependencies none (plain DOM, so guest and admin maps share it)
 */

export interface PlacePinColors {
  /** The circle. */
  background: string;
  /** The house icon. */
  icon: string;
  /** The pulse ring (a translucent version of the circle). */
  ring: string;
  /** A thin border that keeps the circle crisp on any map color. */
  border: string;
}

export const PIN_STYLE_ID = 'rb-place-pin-styles';
export const PULSE_CLASS = 'rb-pin-pulse';

/** The pulse is decoration: it stops for people who ask their system for less motion. */
export const PIN_CSS = `
@keyframes rb-pin-pulse { 0% { transform: scale(0.8); opacity: 0.7; } 70% { transform: scale(1.7); opacity: 0; } 100% { transform: scale(1.7); opacity: 0; } }
.${PULSE_CLASS} { animation: rb-pin-pulse 2.4s ease-out infinite; }
@media (prefers-reduced-motion: reduce) { .${PULSE_CLASS} { animation: none; opacity: 0.35; transform: scale(1.3); } }
`;

const HOUSE_PATH = 'M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3z';
const SIZE = 36;

/** Adds the pulse keyframes once per page. */
export function ensurePinStyles(doc: Document): void {
  if (doc.getElementById(PIN_STYLE_ID) !== null) {
    return;
  }
  const style = doc.createElement('style');
  style.id = PIN_STYLE_ID;
  style.textContent = PIN_CSS;
  doc.head.appendChild(style);
}

function houseIcon(doc: Document, color: string): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', HOUSE_PATH);
  path.setAttribute('fill', color);
  svg.appendChild(path);
  return svg;
}

/**
 * The marker element for one place. `label` is its accessible name. Pass it to a MapLibre Marker
 * with `anchor: 'center'`.
 */
export function createPlacePin(doc: Document, colors: PlacePinColors, label: string): HTMLElement {
  ensurePinStyles(doc);
  const wrapper = doc.createElement('div');
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', label);
  Object.assign(wrapper.style, { position: 'relative', width: `${String(SIZE)}px`, height: `${String(SIZE)}px` });

  const ring = doc.createElement('span');
  ring.className = PULSE_CLASS;
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, { position: 'absolute', inset: '0', borderRadius: '50%', background: colors.ring });

  const circle = doc.createElement('div');
  Object.assign(circle.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: colors.background,
    border: `2px solid ${colors.border}`,
    boxSizing: 'border-box',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  });
  circle.appendChild(houseIcon(doc, colors.icon));

  wrapper.append(ring, circle);
  return wrapper;
}
