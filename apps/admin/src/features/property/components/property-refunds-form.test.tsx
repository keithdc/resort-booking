// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/property-refunds-form.test.tsx
 * @feature property
 * The refund ladder editor: a NEW property shows its single catch-all row (0 days, 0%) with a hint, and saving still works.
 */

import type { PropertyBookingConfig } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyRefundsForm } from './property-refunds-form';

const api = vi.hoisted(() => ({
  savePropertyBookingConfig: vi.fn<(propertyId: string, body: unknown) => Promise<{ config: PropertyBookingConfig; invertedWarning: boolean }>>(),
}));

vi.mock('../services/staff-property-api', () => api);

const NEW_PROPERTY: PropertyBookingConfig = {
  propertyId: 'p1',
  propertyName: 'Lake House',
  rebookable: false,
  rebookFeeType: 'none',
  rebookFeeValue: 0,
  tiers: [{ id: 't1', propertyId: 'p1', minDaysBeforeCheckIn: 0, refundPercent: 0 }],
};

describe('PropertyRefundsForm', () => {
  beforeEach(() => {
    api.savePropertyBookingConfig.mockReset();
  });
  afterEach(cleanup);

  it('shows the one starting row of a new property (0 days before check-in, 0%) and explains it', () => {
    render(<PropertyRefundsForm propertyId="p1" initial={NEW_PROPERTY} />);

    expect(screen.getAllByLabelText('Days before check-in')).toHaveLength(1);
    expect((screen.getByLabelText('Days before check-in') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Refund %') as HTMLInputElement).value).toBe('0');
    expect(screen.getByText(/starts with no refund when a guest cancels/)).toBeTruthy();
  });

  it('does not show the hint for a ladder the owner has set up', () => {
    render(
      <PropertyRefundsForm
        propertyId="p1"
        initial={{
          ...NEW_PROPERTY,
          tiers: [
            { id: 't1', propertyId: 'p1', minDaysBeforeCheckIn: 7, refundPercent: 100 },
            { id: 't2', propertyId: 'p1', minDaysBeforeCheckIn: 0, refundPercent: 0 },
          ],
        }}
      />,
    );

    expect(screen.queryByText(/starts with no refund when a guest cancels/)).toBeNull();
  });

  it('saves the single row without the inverted-ladder warning', async () => {
    api.savePropertyBookingConfig.mockResolvedValue({ config: NEW_PROPERTY, invertedWarning: false });
    render(<PropertyRefundsForm propertyId="p1" initial={NEW_PROPERTY} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save cancellation rules' }));

    await waitFor(() =>
      expect(api.savePropertyBookingConfig).toHaveBeenCalledWith('p1', expect.objectContaining({ tiers: [{ minDaysBeforeCheckIn: 0, refundPercent: 0 }] })),
    );
    expect(await screen.findByText('Refunds saved')).toBeTruthy();
    expect(screen.queryByText(/farther-out tier refunds less/)).toBeNull();
  });
});
