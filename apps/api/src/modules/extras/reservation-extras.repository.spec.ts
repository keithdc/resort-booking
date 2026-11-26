/**
 * @file apps/api/src/modules/extras/reservation-extras.repository.spec.ts
 * @feature extras
 */

import { Client } from 'pg';
import { ReservationExtrasRepository } from './reservation-extras.repository';

describe('ReservationExtrasRepository', () => {
  const query = jest.fn();
  const client = Object.assign(new Client(), { release: (): void => undefined, query });
  const repository = new ReservationExtrasRepository();

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it('does nothing for an empty list', async () => {
    await repository.insertAll(client, { organizationId: 'org', propertyId: 'prop', bookingId: 'b', lines: [] });

    expect(query).not.toHaveBeenCalled();
  });

  it('saves one row per line with a copy of what was offered, the booking\'s organization and property, and the right status', async () => {
    await repository.insertAll(client, {
      organizationId: 'org',
      propertyId: 'prop',
      bookingId: 'b',
      lines: [
        { extraId: 'x1', name: 'Breakfast', kind: 'instant', quantity: 2, unitPriceCents: 1800, lineCents: 3600, currencyCode: 'EUR' },
        { extraId: 'x2', name: 'Pillows', kind: 'on_request', quantity: 1, unitPriceCents: 0, lineCents: 0, currencyCode: 'EUR' },
      ],
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain('INSERT INTO reservation_extras');
    expect(query.mock.calls[0]?.[1]).toEqual(['org', 'prop', 'b', 'x1', 'Breakfast', 'instant', 2, 1800, 3600, 'EUR', 'confirmed']);
    expect(query.mock.calls[1]?.[1]).toEqual(['org', 'prop', 'b', 'x2', 'Pillows', 'on_request', 1, 0, 0, 'EUR', 'pending']);
  });
});
