/**
 * @file apps/admin/src/features/reporting/utils/metric-definitions.ts
 * @feature reporting
 * @dependencies none
 *
 * ONE place that says, in plain words, what every number on the Reports page means. The screen shows
 * these in info tooltips and the printed report repeats them. No jargon: an owner reads this.
 */

export type MetricKey =
  | 'revenue'
  | 'grossRevenue'
  | 'refunded'
  | 'bookings'
  | 'occupancy'
  | 'averageNightlyRate'
  | 'nights'
  | 'guests'
  | 'cancelledBookings'
  | 'cancellationRate'
  | 'keptFromCancellations'
  | 'refundsToPay'
  | 'unpaidHolds'
  | 'unpaidAtHotel'
  | 'toCollect'
  | 'arrivalsToday'
  | 'arrivalsNext7Days'
  | 'revenueShare'
  | 'paymentMethod'
  | 'discountGiven'
  | 'discountUses';

export interface MetricDefinition {
  label: string;
  definition: string;
}

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  revenue: {
    label: 'Revenue',
    definition:
      'The money you kept in this period: what guests paid for nights in the period, minus what you refunded. Nights are counted on the day they are slept. A pay-at-hotel booking counts once it is marked as paid; until then it is shown as “To collect”.',
  },
  grossRevenue: {
    label: 'Paid by guests',
    definition:
      'Everything guests paid for nights in this period, before refunds. It includes cancelled bookings where you kept part of the payment. A pay-at-hotel booking counts once it is marked as paid.',
  },
  refunded: {
    label: 'Refunded',
    definition: 'Money you gave back to guests for bookings cancelled in this period, including refunds still waiting to be sent.',
  },
  bookings: {
    label: 'Bookings',
    definition:
      'Confirmed bookings that have at least one night in this period, including pay-at-hotel bookings that are not paid yet. Cancelled bookings and unpaid online holds are not included.',
  },
  occupancy: {
    label: 'Occupancy',
    definition: 'Booked nights as a share of all nights you could have sold: every stay times every night in the period.',
  },
  averageNightlyRate: {
    label: 'Average nightly rate',
    definition: 'Revenue from confirmed bookings divided by the nights booked. It shows what a night really sold for, after discounts.',
  },
  nights: {
    label: 'Nights booked',
    definition: 'Nights in this period that belong to a confirmed booking.',
  },
  guests: {
    label: 'Guests',
    definition: 'The guest numbers added up across confirmed bookings in this period.',
  },
  cancelledBookings: {
    label: 'Cancelled bookings',
    definition: 'Bookings cancelled by the guest or by you with nights in this period. A booking whose dates were changed is not a cancellation.',
  },
  cancellationRate: {
    label: 'Cancellation rate',
    definition: 'Cancelled bookings as a share of all bookings, confirmed and cancelled, in this period.',
  },
  keptFromCancellations: {
    label: 'Kept from cancellations',
    definition: 'The part of a cancelled booking that you did not refund, as set by your refund rules.',
  },
  refundsToPay: {
    label: 'Refunds to pay',
    definition: 'Refunds that still need someone to send the money or fix a failed payment. Counted as of today, whatever period is shown.',
  },
  unpaidHolds: {
    label: 'Unpaid holds',
    definition: 'Guests who started a booking and are holding dates, but have not paid yet. Bank transfers stay here until the money arrives.',
  },
  unpaidAtHotel: {
    label: 'Unpaid at hotel',
    definition:
      'Confirmed bookings made for guests who pay at the property that nobody has marked as paid yet, whatever their dates. Counted as of today, whatever period is shown. Mark a booking as paid when the guest has paid you.',
  },
  toCollect: {
    label: 'To collect',
    definition:
      'The part of this period’s booked value that comes from pay-at-hotel bookings not marked as paid yet. It is not in “Paid by guests” or “Revenue” until someone marks the booking as paid.',
  },
  arrivalsToday: {
    label: 'Arrivals today',
    definition: 'Confirmed bookings checking in today that are not yet marked as arrived.',
  },
  arrivalsNext7Days: {
    label: 'Arrivals in the next 7 days',
    definition: 'Confirmed bookings checking in during the next 7 days, not counting today.',
  },
  revenueShare: {
    label: 'Share of revenue',
    definition: 'How much of the confirmed revenue in this period came from this property or stay.',
  },
  paymentMethod: {
    label: 'Payment method',
    definition: 'How guests paid for confirmed bookings: card or wallet, or bank transfer.',
  },
  discountGiven: {
    label: 'Discount given',
    definition: 'The money taken off prices by a discount or promo code on confirmed bookings in this period.',
  },
  discountUses: {
    label: 'Times used',
    definition: 'The number of confirmed bookings that used this discount.',
  },
};

export type SectionKey =
  | 'atAGlance'
  | 'attention'
  | 'revenueChart'
  | 'insights'
  | 'propertiesTable'
  | 'bookingsTable'
  | 'bookingSources'
  | 'cancellationSummary'
  | 'cancellationReasons'
  | 'refundsList'
  | 'paymentMethods'
  | 'discounts';

/** A heading and the sentence or two under it that says what the section shows and how to use it. */
export interface SectionCaption {
  title: string;
  caption: string;
}

export const SECTION_CAPTIONS: Record<SectionKey, SectionCaption> = {
  atAGlance: {
    title: 'At a glance',
    caption:
      'The four numbers that matter most for the period you picked, each compared with the period just before it. The small arrow says whether it is going up or down.',
  },
  attention: {
    title: 'Needs your attention',
    caption: 'Things a person has to do today, such as refunds to pay and guests who still owe money at the hotel; select one to go straight to it. Nothing listed means you are up to date.',
  },
  revenueChart: {
    title: 'Revenue and occupancy',
    caption:
      'Bars show money from confirmed bookings and the line shows how full your stays were. Select a bar to see the bookings behind it.',
  },
  insights: {
    title: 'What stands out',
    caption: 'A few plain sentences written from this period’s numbers. They only say what the data supports.',
  },
  propertiesTable: {
    title: 'Properties and stays',
    caption:
      'How each property and each stay performed. Select a column heading to sort, and the arrow beside a property to see its stays.',
  },
  bookingsTable: {
    title: 'Bookings',
    caption: 'Every booking and unpaid hold with nights in this period. Search by guest or reference, filter by status, and select a row to open it.',
  },
  bookingSources: {
    title: 'Where bookings come from',
    caption:
      'How many confirmed bookings in this period came from your website, from other sites such as Airbnb, and from phone, email or walk-ins, with the nights and the money they brought. Use it to see how much your own website brings.',
  },
  cancellationSummary: {
    title: 'Cancellations and refunds',
    caption: 'Bookings that were cancelled, what was refunded and what you kept. Date changes are not counted as cancellations.',
  },
  cancellationReasons: {
    title: 'Why bookings were cancelled',
    caption: 'The reason recorded when each booking was cancelled, so you can see whether guests or you are behind most of them.',
  },
  refundsList: {
    title: 'Refunds',
    caption: 'Each refund for a cancelled booking and where it stands. A refund marked pending or failed still needs paying from the Refunds page.',
  },
  paymentMethods: {
    title: 'How guests paid',
    caption: 'Confirmed bookings split by card or wallet and bank transfer. Bars show each method’s share of the money.',
  },
  discounts: {
    title: 'Discounts and promo codes',
    caption: 'How often each discount was used and how much money it took off prices. Use it to judge whether an offer is worth keeping.',
  },
};

export type ReportTabKey = 'overview' | 'properties' | 'bookings' | 'cancellations' | 'payments';

/** The one line shown under the tab bar for the open tab. */
export const TAB_PURPOSES: Record<ReportTabKey, string> = {
  overview: 'The big picture for the period: how revenue and occupancy moved, and what stands out.',
  properties: 'Compare your properties and stays side by side to see which ones earn the most.',
  bookings: 'The bookings behind the numbers, which you can search, filter and open one by one.',
  cancellations: 'Who cancelled, why, and what it cost you in refunds.',
  payments: 'How guests paid, and how much your discounts and promo codes gave away.',
};

export type EmptyStateKey =
  | 'noBookings'
  | 'noSearchMatches'
  | 'noProperties'
  | 'noChartData'
  | 'noCancellations'
  | 'noRefunds'
  | 'noPayments'
  | 'noDiscounts'
  | 'nothingNeedsAttention'
  | 'noReport';

/** An empty screen says why it is empty and what to do about it. */
export const EMPTY_STATES: Record<EmptyStateKey, string> = {
  noBookings: 'No bookings in this period. Try a longer period, or pick All properties.',
  noSearchMatches: 'No booking matches your search and filter. Clear the search or choose a different status.',
  noProperties: 'No properties to show. Add a property and its stays under Properties, then come back.',
  noChartData: 'Nothing to draw for this period yet. Bookings will appear here as soon as there are some.',
  noCancellations: 'No bookings were cancelled in this period. That is good news, or try a longer period.',
  noRefunds: 'No refunds for this period. A refund appears here when a booking is cancelled and money is owed back.',
  noPayments: 'No confirmed bookings, so nothing was paid in this period. Try a longer period.',
  noDiscounts: 'No discount or promo code was used in this period. Create offers under Properties, then Discounts.',
  nothingNeedsAttention: 'Nothing needs attention. No refunds to pay, no unpaid holds, nothing unpaid at the hotel and no arrivals coming up.',
  noReport: 'The report could not be shown. Check your connection and select Refresh.',
};

/** Words an owner should never meet on this page. */
export const BANNED_REPORT_WORDS: readonly string[] = ['pipeline', 'occupancy pool', 'stay-nights', 'redemption'];
