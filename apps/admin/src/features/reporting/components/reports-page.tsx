/**
 * @file apps/admin/src/features/reporting/components/reports-page.tsx
 * @feature reporting
 * @dependencies staff reports API
 */

'use client';

import type { PropertySummary, StaffReport, StaffReservation } from '@resort-booking/shared-types';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchStaffProperties } from '@/features/property/services/staff-property-api';
import { fetchStaffReport } from '@/features/reservations/services/staff-reservations-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { formatCents } from '@/shared/utils/money';
import { ReportDetailDialog, type ReportDetail } from './report-detail-dialog';
import { ReportTotals } from './report-totals';
import {
  DEFAULT_REPORT_PRESET,
  isRangePreset,
  rangeFromPreset,
  REPORT_RANGE_OPTIONS,
  type RangePreset,
} from '../utils/report-range';
import { stayOccupiesDay, isInHouseStay, isUpcomingArrivalStay } from '../utils/stay-window';

const ALL_PROPERTIES = 'all';

/**
 * Filters and charts over confirmed stays. Figures come from Nest.
 */
export function ReportsPage(): React.JSX.Element {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [preset, setPreset] = useState<RangePreset>(DEFAULT_REPORT_PRESET);
  const [report, setReport] = useState<StaffReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);

  const range = useMemo((): { from: string; to: string } => rangeFromPreset(preset, new Date()), [preset]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [list, next] = await Promise.all([
        fetchStaffProperties(),
        fetchStaffReport(range.from, range.to, propertyId),
      ]);
      setProperties(list);
      setReport(next);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load reports');
    } finally {
      setLoading(false);
    }
  }, [propertyId, range.from, range.to]);

  useEffect((): void => {
    void load();
  }, [load]);

  const stays = report?.stays ?? [];
  const selectedName =
    properties.find((property): boolean => property.id === propertyId)?.name ?? 'All properties';

  const openStays = (title: string, caption: string, rows: StaffReservation[]): void => {
    setDetail({ title, caption, stays: rows });
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <AssessmentOutlinedIcon color="primary" />
        <Typography variant="h4" component="h1">
          Reports
        </Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 760 }}>
        Figures come from the API for the dates and property you pick. Click a tile, bar, or row for the bookings
        behind it.
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }} useFlexGap flexWrap="wrap">
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="report-range">Dates</InputLabel>
          <Select
            labelId="report-range"
            label="Dates"
            value={preset}
            onChange={(event): void => {
              const next = event.target.value;
              if (isRangePreset(next)) {
                setPreset(next);
              }
            }}
          >
            {REPORT_RANGE_OPTIONS.map((option): React.JSX.Element => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 260 }}>
          <InputLabel id="report-property">Property</InputLabel>
          <Select
            labelId="report-property"
            label="Property"
            value={propertyId === '' ? ALL_PROPERTIES : propertyId}
            onChange={(event): void => {
              const next = event.target.value;
              setPropertyId(next === ALL_PROPERTIES ? '' : next);
            }}
          >
            <MenuItem value={ALL_PROPERTIES}>All properties</MenuItem>
            {properties.map((property): React.JSX.Element => (
              <MenuItem key={property.id} value={property.id}>
                {property.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={(): void => void load()} disabled={loading}>
          Refresh
        </Button>
      </Stack>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {loading && report === null ? (
        <CircularProgress />
      ) : report === null ? (
        <Typography color="text.secondary">No report loaded.</Typography>
      ) : (
        <>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {report.from} → {report.to}
            {loading ? ' · Updating…' : ''}
            {' · '}
            {selectedName}
          </Typography>
          <ReportSection
            title="1. Sold bookings"
            caption="Paid reservations. Occupancy is occupied stay-nights ÷ (stays in this filter × nights in the window)."
          >
            <ReportTotals
              stays={report.reservationCount}
              nights={report.occupiedNights}
              revenueLabel={formatCents(report.revenueCents, report.currencyCode)}
              onStays={(): void => {
                openStays('Bookings', 'Every confirmed booking in this window.', stays);
              }}
              onNights={(): void => {
                openStays('Occupied nights', 'Bookings that occupy at least one night in the window.', stays);
              }}
              onRevenue={(): void => {
                openStays('Revenue', 'Confirmed booking totals in this window.', stays);
              }}
            />
            <KpiGrid>
            <Kpi
              label="Confirmed bookings"
              value={String(report.reservationCount)}
              tone="primary"
              hint="Paid bookings overlapping this window"
              onOpen={(): void => {
                openStays('Confirmed bookings', 'Every confirmed booking overlapping this window.', stays);
              }}
            />
            <Kpi
              label="Properties with bookings"
              value={String(report.propertyBookedCount)}
              tone="secondary"
              hint="Distinct destinations with a confirmed booking"
              onOpen={(): void => {
                openStays(
                  'Properties with bookings',
                  'Confirmed bookings grouped by destination in this window.',
                  stays,
                );
              }}
            />
            <Kpi
              label="Guest headcount"
              value={String(report.guestCount)}
              tone="info"
              hint="Sum of booked guest counts on confirmed bookings"
              onOpen={(): void => {
                openStays('Guest headcount', 'Booked guest counts on confirmed bookings.', stays);
              }}
            />
            <Kpi
              label="Stays in occupancy pool"
              value={String(report.houseCount)}
              tone="primary"
              hint="Denominator for occupancy, not booked stays"
              onOpen={(): void => {
                openStays(
                  'Stays in occupancy pool',
                  `${report.houseCount} stays in the filter. Occupancy uses these stays × nights in the window.`,
                  stays,
                );
              }}
            />
            <Kpi
              label="Occupancy"
              value={`${report.occupancyPercent}%`}
              tone="primary"
              hint={`${report.occupiedNights} of ${report.availableNights} stay-nights`}
              onOpen={(): void => {
                openStays(
                  'Occupancy',
                  `${report.occupiedNights} occupied nights of ${report.availableNights} available.`,
                  stays,
                );
              }}
            />
            <Kpi
              label="Average night"
              value={formatCents(report.averageNightlyCents, report.currencyCode)}
              tone="secondary"
              hint="Confirmed revenue ÷ occupied nights"
              onOpen={(): void => {
                openStays('Average night', 'Revenue divided by occupied nights in this window.', stays);
              }}
            />
            </KpiGrid>
            <ChartCard title="Revenue by day" tone="secondary.main" hint="Click a bar for that day’s paid bookings.">
              <BarRow
                values={chartValues(report.daily, 'revenueCents')}
                barColor="secondary.main"
                onSelect={(dates, label): void => {
                  openStays(
                    `Revenue · ${label}`,
                    'Bookings occupying these dates.',
                    stays.filter((stay): boolean => dates.some((date): boolean => stayOccupiesDay(stay, date))),
                  );
                }}
              />
            </ChartCard>
            <ChartCard title="Occupied stays by day" tone="success.main" hint="Click a bar for who is in-house that day.">
              <BarRow
                values={chartValues(report.daily, 'occupiedNights')}
                barColor="success.main"
                onSelect={(dates, label): void => {
                  openStays(
                    `Occupied · ${label}`,
                    'Bookings occupying these dates.',
                    stays.filter((stay): boolean => dates.some((date): boolean => stayOccupiesDay(stay, date))),
                  );
                }}
              />
            </ChartCard>
          </ReportSection>
          <ReportSection title="2. On the ground" caption="Who is in-house today, and who still has to arrive.">
            <KpiGrid>
            <Kpi
              label="In-house now"
              value={String(report.inHouseStayCount)}
              tone="success"
              hint={`Confirmed bookings occupying ${report.asOfDate}, or checked in`}
              onOpen={(): void => {
                openStays(
                  'In-house now',
                  `Occupying ${report.asOfDate}, or staff checked in.`,
                  stays.filter((stay): boolean => isInHouseStay(stay, report.asOfDate)),
                );
              }}
            />
            <Kpi
              label="Upcoming arrivals"
              value={String(report.upcomingStayCount)}
              tone="warning"
              hint="Confirmed check-in after today, not yet arrived"
              onOpen={(): void => {
                openStays(
                  'Upcoming arrivals',
                  `Check-in after ${report.asOfDate}, excluding completed and in-house bookings.`,
                  stays.filter((stay): boolean => isUpcomingArrivalStay(stay, report.asOfDate)),
                );
              }}
            />
            </KpiGrid>
          </ReportSection>
          <ReportSection
            title="3. Pipeline"
            caption="Unpaid holds, cancelled bookings, rebooks, and expired holds. These are not occupancy."
          >
            <KpiGrid>
            <Kpi
              label="Pending payment"
              value={String(report.pendingPaymentCount)}
              tone="warning"
              hint="Active holds still unpaid"
              onOpen={(): void => {
                openStays(
                  'Pending payment',
                  'Active holds whose booking overlaps this window.',
                  report.pipeline.filter((row): boolean => row.status === 'active'),
                );
              }}
            />
            <Kpi
              label="Cancelled"
              value={String(report.cancelledCount)}
              tone="info"
              hint="Cancelled bookings and released holds"
              onOpen={(): void => {
                openStays(
                  'Cancelled',
                  'Cancelled reservations and released holds overlapping this window.',
                  report.pipeline.filter(
                    (row): boolean => row.status === 'cancelled' || row.status === 'released',
                  ),
                );
              }}
            />
            <Kpi
              label="Rebooks"
              value={String(report.rebookCount)}
              tone="secondary"
              hint="Bookings linked to a previous booking"
              onOpen={(): void => {
                openStays(
                  'Rebooks',
                  'Holds or bookings with a previous booking id in this window.',
                  report.pipeline.filter((row): boolean => row.rebookOfId !== null),
                );
              }}
            />
            <Kpi
              label="Expired holds"
              value={String(report.expiredHoldCount)}
              tone="info"
              hint="Holds that timed out unpaid"
              onOpen={(): void => {
                openStays(
                  'Expired holds',
                  'Expired holds overlapping this window.',
                  report.pipeline.filter((row): boolean => row.status === 'expired'),
                );
              }}
            />
            </KpiGrid>
            <ChartCard title="Pipeline mix" tone="warning.main" hint="Paid vs unpaid vs cancelled vs rebook for this window.">
              <BarRow
                values={[
                  {
                    key: 'confirmed',
                    label: 'Paid',
                    amount: report.reservationCount,
                    dates: [],
                  },
                  {
                    key: 'pending',
                    label: 'Unpaid',
                    amount: report.pendingPaymentCount,
                    dates: [],
                  },
                  {
                    key: 'cancelled',
                    label: 'Cancel',
                    amount: report.cancelledCount,
                    dates: [],
                  },
                  {
                    key: 'rebook',
                    label: 'Rebook',
                    amount: report.rebookCount,
                    dates: [],
                  },
                ]}
                barColor="warning.main"
                onSelect={(_dates, label): void => {
                  if (label === 'Unpaid') {
                    openStays(
                      'Pending payment',
                      'Active holds overlapping this window.',
                      report.pipeline.filter((row): boolean => row.status === 'active'),
                    );
                    return;
                  }
                  if (label === 'Cancel') {
                    openStays(
                      'Cancelled',
                      'Cancelled bookings and released holds.',
                      report.pipeline.filter(
                        (row): boolean => row.status === 'cancelled' || row.status === 'released',
                      ),
                    );
                    return;
                  }
                  if (label === 'Rebook') {
                    openStays(
                      'Rebooks',
                      'Rows with a previous booking id.',
                      report.pipeline.filter((row): boolean => row.rebookOfId !== null),
                    );
                    return;
                  }
                  openStays('Confirmed bookings', 'Paid bookings in this window.', stays);
                }}
              />
            </ChartCard>
            <ChartCard title="Unpaid holds by day" tone="warning.main" hint="Active holds that would occupy that night if paid.">
              <BarRow
                values={chartValues(report.daily, 'pendingCount')}
                barColor="warning.main"
                onSelect={(dates, label): void => {
                  openStays(
                    `Pending · ${label}`,
                    'Active holds occupying these dates.',
                    report.pipeline.filter(
                      (row): boolean =>
                        row.status === 'active' &&
                        dates.some((date): boolean => stayOccupiesDay(row, date)),
                    ),
                  );
                }}
              />
            </ChartCard>
            <ChartCard title="Cancelled by day" tone="info.main" hint="Cancelled bookings and released holds on those nights.">
              <BarRow
                values={chartValues(report.daily, 'cancelledCount')}
                barColor="info.main"
                onSelect={(dates, label): void => {
                  openStays(
                    `Cancelled · ${label}`,
                    'Cancelled or released rows occupying these dates.',
                    report.pipeline.filter(
                      (row): boolean =>
                        (row.status === 'cancelled' || row.status === 'released') &&
                        dates.some((date): boolean => stayOccupiesDay(row, date)),
                    ),
                  );
                }}
              />
            </ChartCard>
          </ReportSection>
          <ReportSection title="4. How guests paid" caption="Confirmed booking revenue by method.">
            {report.paymentMethods.length === 0 ? (
              <Typography color="text.secondary">No payments in this window.</Typography>
            ) : (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                {report.paymentMethods.map((slice) => (
                  <Chip
                    key={slice.paymentMethod}
                    clickable
                    color={
                      slice.paymentMethod === 'card'
                        ? 'primary'
                        : slice.paymentMethod === 'bank_transfer'
                          ? 'secondary'
                          : 'default'
                    }
                    onClick={(): void => {
                      const method = slice.paymentMethod;
                      openStays(
                        paymentLabel(method),
                        'Bookings that used this method.',
                        stays.filter((stay): boolean => (stay.paymentMethod ?? 'unknown') === method),
                      );
                    }}
                    label={`${paymentLabel(slice.paymentMethod)} · ${slice.reservationCount} bookings · ${formatCents(slice.revenueCents, report.currencyCode)}`}
                  />
                ))}
              </Stack>
            )}
          </ReportSection>
          <ReportSection title="5. By destination" caption="Confirmed bookings rolled up by property, then stay.">
          {report.properties.length === 0 ? (
            <Typography>No confirmed bookings in this window.</Typography>
          ) : (
            report.properties.map((property) => (
              <Box
                key={property.propertyId}
                sx={{
                  mb: 4,
                  p: 2,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'primary.main',
                  cursor: 'pointer',
                }}
                onClick={(): void => {
                  openStays(
                    property.propertyName,
                    'Confirmed bookings at this property in the window.',
                    stays.filter((stay): boolean => stay.propertyId === property.propertyId),
                  );
                }}
              >
                <Typography variant="h6" color="primary.main">
                  {property.propertyName}
                </Typography>
                <ReportTotals
                  stays={property.reservationCount}
                  nights={property.occupiedNights}
                  revenueLabel={formatCents(property.revenueCents, property.currencyCode)}
                />
                <Table size="small" sx={{ mb: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Stay</TableCell>
                      <TableCell>Bookings</TableCell>
                      <TableCell>Nights</TableCell>
                      <TableCell>Revenue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {property.houses.map((house) => (
                      <TableRow
                        key={house.houseId}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={(event): void => {
                          event.stopPropagation();
                          openStays(
                            house.houseName,
                            `Bookings in ${property.propertyName}.`,
                            stays.filter((stay): boolean => stay.houseId === house.houseId),
                          );
                        }}
                      >
                        <TableCell>{house.houseName}</TableCell>
                        <TableCell>{house.reservationCount}</TableCell>
                        <TableCell>{house.occupiedNights}</TableCell>
                        <TableCell>{formatCents(house.revenueCents, property.currencyCode)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Typography variant="caption" color="text.secondary">
                  Click the card or a stay row for the guest list.
                </Typography>
              </Box>
            ))
          )}
          </ReportSection>
        </>
      )}
      <ReportDetailDialog
        detail={detail}
        onClose={(): void => {
          setDetail(null);
        }}
      />
    </Box>
  );
}

interface ReportSectionProps {
  title: string;
  caption: string;
  children: React.ReactNode;
}

function ReportSection({ title, caption, children }: ReportSectionProps): React.JSX.Element {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
        {caption}
      </Typography>
      {children}
    </Box>
  );
}

function KpiGrid({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        mb: 2,
      }}
    >
      {children}
    </Box>
  );
}

interface ChartCardProps {
  title: string;
  hint: string;
  tone: 'primary.main' | 'secondary.main' | 'success.main' | 'info.main' | 'warning.main';
  children: React.ReactNode;
}

function ChartCard({ title, hint, tone, children }: ChartCardProps): React.JSX.Element {
  return (
    <Box
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 1,
        border: 2,
        borderColor: tone,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="h6" gutterBottom sx={{ color: tone }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        {hint}
      </Typography>
      {children}
    </Box>
  );
}

interface KpiProps {
  label: string;
  value: string;
  hint: string;
  tone: 'primary' | 'secondary' | 'success' | 'info' | 'warning';
  onOpen: () => void;
}

function Kpi({ label, value, hint, tone, onOpen }: KpiProps): React.JSX.Element {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event): void => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      sx={{
        borderRadius: 1,
        p: 2,
        bgcolor: `${tone}.main`,
        color: `${tone}.contrastText`,
        cursor: 'pointer',
        '&:hover': { filter: 'brightness(1.06)' },
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.9 }}>
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
      <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
        {hint}
      </Typography>
    </Box>
  );
}

interface ChartValue {
  key: string;
  label: string;
  amount: number;
  dates: string[];
}

interface BarRowProps {
  values: ChartValue[];
  barColor: 'primary.main' | 'secondary.main' | 'success.main' | 'info.main' | 'warning.main';
  onSelect: (dates: string[], label: string) => void;
}

function BarRow({ values, barColor, onSelect }: BarRowProps): React.JSX.Element {
  if (values.length === 0) {
    return <Typography color="text.secondary">No days in this range.</Typography>;
  }
  const max = Math.max(1, ...values.map((item) => item.amount));
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(values.length, 31)}, minmax(8px, 1fr))`,
        gap: 0.5,
        alignItems: 'end',
        height: 160,
        mb: 1,
        overflowX: 'auto',
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    >
      {values.map((item): React.JSX.Element => (
        <Box
          key={item.key}
          role="button"
          tabIndex={0}
          onClick={(): void => {
            onSelect(item.dates, item.label);
          }}
          onKeyDown={(event): void => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(item.dates, item.label);
            }
          }}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            height: '100%',
            cursor: 'pointer',
          }}
        >
          <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <Box
              sx={{
                width: '100%',
                height: `${Math.max(4, Math.round((item.amount / max) * 100))}%`,
                bgcolor: barColor,
                borderRadius: 1,
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {item.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function chartValues(
  daily: StaffReport['daily'],
  metric: 'revenueCents' | 'occupiedNights' | 'pendingCount' | 'cancelledCount',
): ChartValue[] {
  if (daily.length <= 45) {
    return daily.map((point) => ({
      key: `${point.date}-${metric}`,
      label: point.date.slice(8),
      amount: point[metric],
      dates: [point.date],
    }));
  }
  const months = new Map<string, { amount: number; dates: string[] }>();
  for (const point of daily) {
    const key = point.date.slice(0, 7);
    const current = months.get(key) ?? { amount: 0, dates: [] };
    current.amount += point[metric];
    current.dates.push(point.date);
    months.set(key, current);
  }
  return [...months.entries()].map(([key, item]) => ({
    key: `${key}-${metric}`,
    label: key.slice(5),
    amount: item.amount,
    dates: item.dates,
  }));
}

function paymentLabel(method: 'card' | 'bank_transfer' | 'unknown'): string {
  if (method === 'card') {
    return 'Card / wallets';
  }
  if (method === 'bank_transfer') {
    return 'Bank transfer';
  }
  return 'Unknown';
}

