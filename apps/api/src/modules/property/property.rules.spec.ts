/**
 * @file apps/api/src/modules/property/property.rules.spec.ts
 * @feature property
 * @dependencies property.rules
 */

import { resolveMapPoint, slugifyPropertyName } from './property.rules';

describe('property.rules', (): void => {
  it('slugifies resort names', (): void => {
    expect(slugifyPropertyName('Pine Coast Resort')).toBe('pine-coast-resort');
  });

  it('strips accents and punctuation', (): void => {
    expect(slugifyPropertyName('Château d’Annecy!')).toBe('chateau-d-annecy');
  });

  it('falls back when the name has no letters', (): void => {
    expect(slugifyPropertyName('***')).toBe('property');
    expect(slugifyPropertyName('   ')).toBe('property');
  });

  describe('resolveMapPoint', (): void => {
    it('pins a stay at its own coordinates when it has a complete pair', (): void => {
      expect(resolveMapPoint('45.9', '6.12', '45.0', '6.0')).toEqual({ latitude: 45.9, longitude: 6.12 });
    });

    it('falls back to the property when the stay has no coordinates', (): void => {
      expect(resolveMapPoint(null, null, '45.899', '6.129')).toEqual({ latitude: 45.899, longitude: 6.129 });
    });

    it('never mixes half a stay pair with half the property pair', (): void => {
      expect(resolveMapPoint('45.9', null, '45.0', '6.0')).toEqual({ latitude: 45, longitude: 6 });
      expect(resolveMapPoint(null, '6.12', '45.0', '6.0')).toEqual({ latitude: 45, longitude: 6 });
    });

    it('ignores unreadable or impossible stay coordinates', (): void => {
      expect(resolveMapPoint('abc', '6.1', '45.0', '6.0')).toEqual({ latitude: 45, longitude: 6 });
      expect(resolveMapPoint('95', '6.1', '45.0', '6.0')).toEqual({ latitude: 45, longitude: 6 });
      expect(resolveMapPoint('45.9', '181', '45.0', '6.0')).toEqual({ latitude: 45, longitude: 6 });
    });

    it('accepts zero and negative coordinates, which are real places', (): void => {
      expect(resolveMapPoint('0', '-1.5', '45.0', '6.0')).toEqual({ latitude: 0, longitude: -1.5 });
    });
  });
});
