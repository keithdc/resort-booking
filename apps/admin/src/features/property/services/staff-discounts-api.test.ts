/**
 * @file apps/admin/src/features/property/services/staff-discounts-api.test.ts
 * @feature property
 */

import type { Discount, DiscountWrite } from '@resort-booking/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscount, deleteDiscount, fetchDiscounts, updateDiscount } from './staff-discounts-api';

const client = vi.hoisted(() => ({
  getStaffApiOk: vi.fn<(path: string) => Promise<unknown>>(),
  mutateStaffApiOk: vi.fn<(path: string, method: string, body?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/shared/services/api-client', () => client);

const WRITE: DiscountWrite = {
  label: 'Long stay',
  effect: { kind: 'percent', percent: 10 },
  conditions: [{ kind: 'min_nights', nights: 7 }],
  alwaysOn: false,
  houseIds: null,
  combinable: false,
  priority: 100,
  active: true,
  maxRedemptions: null,
  promoted: true,
  oncePerGuest: false,
};

/** What an API that was not restarted since "show on the website" was added sends: no `promoted`. */
function oldApiDiscount(): Omit<Discount, 'promoted' | 'oncePerGuest'> {
  return {
    id: 'd1',
    propertyId: 'p1',
    redemptions: 0,
    label: WRITE.label,
    effect: WRITE.effect,
    conditions: WRITE.conditions,
    alwaysOn: WRITE.alwaysOn,
    houseIds: WRITE.houseIds,
    combinable: WRITE.combinable,
    priority: WRITE.priority,
    active: WRITE.active,
    maxRedemptions: WRITE.maxRedemptions,
  };
}

describe('staff-discounts-api', () => {
  beforeEach(() => {
    client.getStaffApiOk.mockReset();
    client.mutateStaffApiOk.mockReset();
  });

  it('reads a discount without the field as not promoted instead of leaving it undefined', async () => {
    client.getStaffApiOk.mockResolvedValue([oldApiDiscount(), { ...oldApiDiscount(), id: 'd2', promoted: true }]);

    const found = await fetchDiscounts('p1');

    expect(client.getStaffApiOk).toHaveBeenCalledWith('/staff/properties/p1/discounts');
    expect(found.map((discount) => discount.promoted)).toEqual([false, true]);
    expect(found.map((discount) => discount.oncePerGuest)).toEqual([false, false]);
  });

  it('reads the once-per-guest switch when the server sends it', async () => {
    client.getStaffApiOk.mockResolvedValue([{ ...oldApiDiscount(), oncePerGuest: true }]);

    expect((await fetchDiscounts('p1'))[0]?.oncePerGuest).toBe(true);
  });

  it('sends the choice when creating and updating, and defaults the answer', async () => {
    client.mutateStaffApiOk.mockResolvedValue(oldApiDiscount());

    const created = await createDiscount('p1', WRITE);
    const updated = await updateDiscount('d1', WRITE);

    expect(client.mutateStaffApiOk).toHaveBeenNthCalledWith(1, '/staff/properties/p1/discounts', 'POST', WRITE);
    expect(client.mutateStaffApiOk).toHaveBeenNthCalledWith(2, '/staff/discounts/d1', 'PATCH', WRITE);
    expect(created.promoted).toBe(false);
    expect(updated.promoted).toBe(false);
  });

  it('removes a discount', async () => {
    client.mutateStaffApiOk.mockResolvedValue(null);
    await deleteDiscount('d1');
    expect(client.mutateStaffApiOk).toHaveBeenCalledWith('/staff/discounts/d1', 'DELETE');
  });
});
