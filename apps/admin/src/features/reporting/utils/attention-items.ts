/**
 * @file apps/admin/src/features/reporting/utils/attention-items.ts
 * @feature reporting
 * @dependencies shared-types, metric-definitions
 */

import type { ReportAttention } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';
import type { MetricKey, ReportTabKey } from './metric-definitions';
import type { BookingFilter } from './report-labels';

export interface AttentionItem {
  key: 'unpaidHolds' | 'unpaidAtHotel' | 'refundsToPay' | 'arrivalsToday' | 'arrivalsNext7Days';
  metric: MetricKey;
  count: number;
  /** "2 unpaid holds". */
  text: string;
  /** Extra line, e.g. the money still to send. */
  detail: string | null;
  /** Another page to open, or null when the item opens a tab of this page. */
  href: string | null;
  /** The tab of this page to open when there is no href. */
  tab: ReportTabKey | null;
  /** The Bookings tab's status filter to open with, or null for its default. */
  filter: BookingFilter | null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The second line of "unpaid at hotel": what is still to collect (admins only), how many guests arrive within a week,
 * and how many already passed their check-in without being marked paid.
 */
function unpaidAtHotelDetail(attention: ReportAttention, currencyCode: string, moneyHidden: boolean): string | null {
  const parts: string[] = [];
  if (!moneyHidden) {
    parts.push(`${formatCents(attention.unpaidAtHotelCents, currencyCode)} to collect`);
  }
  if (attention.unpaidAtHotelArrivalsNext7DaysCount > 0) {
    parts.push(`${String(attention.unpaidAtHotelArrivalsNext7DaysCount)} arriving within 7 days`);
  }
  if (attention.unpaidAtHotelPastCount > 0) {
    parts.push(`${String(attention.unpaidAtHotelPastCount)} already past check-in`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * The things that need a person today. Only items with something to do are returned, so an empty
 * list means "all clear".
 */
export function buildAttentionItems(attention: ReportAttention, currencyCode: string, moneyHidden = false): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: 'unpaidHolds',
      metric: 'unpaidHolds',
      count: attention.unpaidHoldCount,
      text: plural(attention.unpaidHoldCount, 'unpaid hold', 'unpaid holds'),
      detail: 'Waiting for payment or a bank transfer',
      href: null,
      tab: 'bookings',
      filter: 'awaiting_payment',
    },
    {
      key: 'unpaidAtHotel',
      metric: 'unpaidAtHotel',
      count: attention.unpaidAtHotelCount,
      text: `${String(attention.unpaidAtHotelCount)} unpaid at hotel`,
      detail: unpaidAtHotelDetail(attention, currencyCode, moneyHidden),
      href: null,
      tab: 'bookings',
      filter: 'unpaid_at_hotel',
    },
    {
      key: 'refundsToPay',
      metric: 'refundsToPay',
      count: attention.refundsToPayCount,
      text: plural(attention.refundsToPayCount, 'refund to pay', 'refunds to pay'),
      detail: moneyHidden ? null : `${formatCents(attention.refundsToPayCents, currencyCode)} to send back`,
      href: '/refunds',
      tab: null,
      filter: null,
    },
    {
      key: 'arrivalsToday',
      metric: 'arrivalsToday',
      count: attention.arrivalsTodayCount,
      text: plural(attention.arrivalsTodayCount, 'arrival today', 'arrivals today'),
      detail: null,
      href: '/',
      tab: null,
      filter: null,
    },
    {
      key: 'arrivalsNext7Days',
      metric: 'arrivalsNext7Days',
      count: attention.arrivalsNext7DaysCount,
      text: plural(attention.arrivalsNext7DaysCount, 'arrival in the next 7 days', 'arrivals in the next 7 days'),
      detail: null,
      href: '/',
      tab: null,
      filter: null,
    },
  ];
  return items.filter((item: AttentionItem): boolean => item.count > 0);
}
