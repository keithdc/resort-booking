// @vitest-environment jsdom
/**
 * @file packages/ui/src/map/place-pin.test.ts
 * @shared The single-place map pin
 */

import { afterEach, describe, expect, it } from 'vitest';
import { PIN_CSS, PIN_STYLE_ID, PULSE_CLASS, createPlacePin, ensurePinStyles } from './place-pin';

const COLORS = { background: 'rgb(10, 20, 30)', icon: 'rgb(255, 255, 255)', ring: 'rgba(10, 20, 30, 0.3)', border: 'rgb(255, 255, 255)' };

describe('createPlacePin', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('is an image with the place name, a hidden house icon and a pulse ring', () => {
    const pin = createPlacePin(document, COLORS, 'Alpine Lake');

    expect(pin.getAttribute('role')).toBe('img');
    expect(pin.getAttribute('aria-label')).toBe('Alpine Lake');
    const icon = pin.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('path')?.getAttribute('fill')).toBe(COLORS.icon);
    const ring = pin.querySelector(`.${PULSE_CLASS}`);
    expect(ring?.getAttribute('aria-hidden')).toBe('true');
  });

  it('paints the circle and ring with the given colors', () => {
    const pin = createPlacePin(document, COLORS, 'x');

    const [ring, circle] = Array.from(pin.children) as HTMLElement[];
    expect(ring.style.background).toBe(COLORS.ring);
    expect(circle.style.background).toBe(COLORS.background);
  });

  it('puts the label in text attributes only, never as markup', () => {
    const pin = createPlacePin(document, COLORS, '<img src=x onerror=alert(1)>');

    expect(pin.querySelector('img')).toBeNull();
    expect(pin.getAttribute('aria-label')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('ensurePinStyles', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('adds the style once, however many pins are made', () => {
    createPlacePin(document, COLORS, 'a');
    createPlacePin(document, COLORS, 'b');
    ensurePinStyles(document);

    expect(document.querySelectorAll(`#${PIN_STYLE_ID}`)).toHaveLength(1);
  });

  it('stops the pulse for people who prefer reduced motion', () => {
    expect(PIN_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    const reduced = PIN_CSS.slice(PIN_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('animation: none');
  });
});
