// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/offer-chips.test.tsx
 * @shared Offer chips
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeOffer } from '@/features/property/test-fixtures';
import { OfferChips } from './offer-chips';

const CODE = makeOffer({ id: 'c', promoCode: 'WELCOME10', headline: 'Use code WELCOME10 for 10% off' });

describe('OfferChips', () => {
  afterEach(cleanup);

  it('renders nothing without offers', () => {
    const { container } = render(<OfferChips offers={[]} />);
    expect(container.textContent).toBe('');
  });

  it('lists each headline in a real list', () => {
    render(<OfferChips offers={[makeOffer(), CODE]} />);

    expect(screen.getByRole('list', { name: 'Current offers' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Save 10% when you stay 7 or more nights')).toBeTruthy();
    expect(screen.getByText('Use code WELCOME10 for 10% off')).toBeTruthy();
  });

  it('adds a copy button to code offers only when asked', () => {
    const { rerender } = render(<OfferChips offers={[makeOffer(), CODE]} />);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<OfferChips offers={[makeOffer(), CODE]} copyable />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Copy code WELCOME10' })).toBeTruthy();
  });
});
