// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/booking-records.test.tsx
 * @feature reservations
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { staffCancellation, staffChange, staffRefund } from '@/test/fixtures';
import { CancellationBlock, HistoryBlock, RefundsBlock } from './booking-records';

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

describe('CancellationBlock', () => {
  afterEach(cleanup);

  it('says who cancelled, why, when, and shows the note', () => {
    render(
      <CancellationBlock
        cancellation={staffCancellation({ initiatedBy: 'staff', staffName: 'Marie', reason: 'goodwill', note: 'Burst pipe, apologised' })}
      />,
    );

    expect(screen.getByText('Cancelled by staff (Marie): Goodwill')).toBeTruthy();
    expect(screen.getByText('1 Jun 2027, 09:00 UTC')).toBeTruthy();
    expect(screen.getByText('Burst pipe, apologised')).toBeTruthy();
  });

  it('says there was no note rather than leaving a gap', () => {
    render(<CancellationBlock cancellation={staffCancellation()} />);

    expect(screen.getByText('No note')).toBeTruthy();
    expect(screen.getByText('Cancelled by the guest: Guest asked')).toBeTruthy();
  });
});

describe('RefundsBlock', () => {
  afterEach(cleanup);

  it('says so when there are no refunds', () => {
    render(<RefundsBlock refunds={[]} />);

    expect(screen.getByText('No refunds recorded')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists each refund with amount, percentage, kind and status', () => {
    render(
      <RefundsBlock
        refunds={[
          staffRefund({ id: 'a', status: 'succeeded', provider: 'mock' }),
          staffRefund({ id: 'b', kind: 'rebook_difference', amountCents: 12000, percent: 100, status: 'pending' }),
        ]}
      />,
    );

    const items = within(screen.getByRole('list', { name: 'Refunds' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(plain(items[0]?.textContent)).toContain('Cancellation refund: 720,00 € (75%)');
    expect(items[0]?.textContent).toContain('Done');
    expect(plain(items[1]?.textContent)).toContain('Date-change refund: 120,00 € (100%)');
    expect(items[1]?.textContent).toContain('Pending');
  });

  it('makes a hand refund obvious and a provider refund name its provider', () => {
    render(<RefundsBlock refunds={[staffRefund({ id: 'a', provider: 'manual' }), staffRefund({ id: 'b', provider: 'mock' })]} />);

    expect(screen.getByText(/To be sent by hand/)).toBeTruthy();
    expect(screen.getByText(/Via mock/)).toBeTruthy();
  });

  it('shows why a refund failed and what staff did by hand', () => {
    render(
      <RefundsBlock
        refunds={[
          staffRefund({ id: 'a', status: 'failed', failureReason: 'card_closed' }),
          staffRefund({ id: 'b', status: 'succeeded', resolvedByName: 'Marie', resolutionNote: 'Bank transfer 3 June' }),
        ]}
      />,
    );

    expect(screen.getByText('Failed: card_closed')).toBeTruthy();
    expect(screen.getByText('Marked as sent by Marie: Bank transfer 3 June')).toBeTruthy();
  });
});

describe('HistoryBlock', () => {
  afterEach(cleanup);

  const base = { changes: [], currencyCode: 'EUR', replacedByReference: null, rebookOfReference: null };

  it('says there were no date changes', () => {
    render(<HistoryBlock stay={base} />);

    expect(screen.getByText('No date changes')).toBeTruthy();
  });

  it('links to the booking that replaced this one', () => {
    render(<HistoryBlock stay={{ ...base, replacedByReference: 'BK-NEW0000000' }} />);

    expect(screen.getByText('Replaced by BK-NEW0000000')).toBeTruthy();
  });

  it('links back to the booking this one replaced', () => {
    render(<HistoryBlock stay={{ ...base, rebookOfReference: 'BK-OLD0000000' }} />);

    expect(screen.getByText('Replaces BK-OLD0000000')).toBeTruthy();
  });

  it('lists each change with who made it, when, and the note', () => {
    render(
      <HistoryBlock
        stay={{
          ...base,
          changes: [staffChange({ initiatedBy: 'staff', staffName: 'Marie', note: 'Guest called from the road' })],
        }}
      />,
    );

    const item = within(screen.getByRole('list', { name: 'Date changes' })).getByRole('listitem');
    expect(plain(item.textContent)).toContain('2027-07-10 to 2027-07-12 → 2027-07-20 to 2027-07-23');
    expect(item.textContent).toContain('By staff (Marie)');
    expect(item.textContent).toContain('Guest called from the road');
  });
});
