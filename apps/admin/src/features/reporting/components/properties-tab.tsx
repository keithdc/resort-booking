/**
 * @file apps/admin/src/features/reporting/components/properties-tab.tsx
 * @feature reporting
 * @dependencies report-properties
 */

'use client';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import {
  Box,
  Collapse,
  IconButton,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import type { StaffReport } from '@resort-booking/shared-types';
import { Fragment, useMemo, useState } from 'react';
import { formatCents } from '@/shared/utils/money';
import {
  buildPropertyRows,
  sortPropertyRows,
  type PropertyRow,
  type PropertySortKey,
  type SortDirection,
  type StayRow,
} from '../utils/report-properties';
import { MetricInfo } from './metric-info';
import { useMoneyHidden } from './money-visibility';
import { EmptyNote, ReportSection } from './report-section';
import type { ReportDetail } from './report-detail-dialog';

interface PropertiesTabProps {
  report: StaffReport;
  onOpenDetail: (detail: ReportDetail) => void;
}

const COLUMNS: { key: PropertySortKey; label: string; numeric: boolean }[] = [
  { key: 'bookings', label: 'Bookings', numeric: true },
  { key: 'nights', label: 'Nights', numeric: true },
  { key: 'occupancy', label: 'Occupancy', numeric: true },
  { key: 'revenue', label: 'Revenue', numeric: true },
];

/**
 * One table: each property with its stays inside, sortable by any number, with each one's share of
 * the revenue as a bar.
 */
export function PropertiesTab({ report, onOpenDetail }: PropertiesTabProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  // Revenue is withheld for employees, so the first sort is by nights instead.
  const [sortKey, setSortKey] = useState<PropertySortKey>(moneyHidden ? 'nights' : 'revenue');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    (): PropertyRow[] => sortPropertyRows(buildPropertyRows(report), sortKey, direction),
    [report, sortKey, direction],
  );

  const sortBy = (key: PropertySortKey): void => {
    if (key === sortKey) {
      setDirection(direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setDirection(key === 'name' ? 'asc' : 'desc');
  };

  const toggle = (id: string): void => {
    const next = new Set(open);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setOpen(next);
  };

  const showBookings = (title: string, matches: (stayPropertyId: string, stayHouseId: string) => boolean): void => {
    onOpenDetail({
      title,
      caption: 'Confirmed bookings in this period.',
      stays: report.stays.filter((stay): boolean => matches(stay.propertyId, stay.houseId)),
    });
  };

  if (rows.length === 0) {
    return (
      <ReportSection section="propertiesTable">
        <EmptyNote state="noProperties" />
      </ReportSection>
    );
  }

  return (
    <ReportSection section="propertiesTable">
      <TableContainer>
        <Table size="small" aria-label="Properties and stays">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48 }} />
              <TableCell sortDirection={sortKey === 'name' ? direction : false}>
                <TableSortLabel active={sortKey === 'name'} direction={sortKey === 'name' ? direction : 'asc'} onClick={(): void => sortBy('name')}>
                  Property / stay
                </TableSortLabel>
              </TableCell>
              {(moneyHidden ? COLUMNS.filter((column): boolean => column.key !== 'revenue') : COLUMNS).map((column): React.JSX.Element => (
                <TableCell key={column.key} align="right" sortDirection={sortKey === column.key ? direction : false}>
                  <TableSortLabel active={sortKey === column.key} direction={sortKey === column.key ? direction : 'desc'} onClick={(): void => sortBy(column.key)}>
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              {moneyHidden ? null : (
                <TableCell sx={{ minWidth: 180 }}>
                  Share of revenue <MetricInfo metric="revenueShare" />
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((property: PropertyRow): React.JSX.Element => {
              const isOpen = open.has(property.id);
              return (
                <Fragment key={property.id}>
                  <TableRow hover sx={{ '& > td': { borderBottom: isOpen ? 0 : undefined } }}>
                    <TableCell>
                      <IconButton
                        size="small"
                        aria-label={`${isOpen ? 'Hide' : 'Show'} the stays of ${property.name}`}
                        aria-expanded={isOpen}
                        onClick={(): void => toggle(property.id)}
                        data-print="hide"
                      >
                        {isOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <MuiLink component="button" type="button" underline="hover" sx={{ fontWeight: 600, textAlign: 'left' }} onClick={(): void => showBookings(property.name, (propertyId): boolean => propertyId === property.id)}>
                        {property.name}
                      </MuiLink>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {property.stayCount} {property.stayCount === 1 ? 'stay' : 'stays'}
                      </Typography>
                    </TableCell>
                    <Numbers row={property} currencyCode={property.currencyCode} moneyHidden={moneyHidden} />
                  </TableRow>
                  <TableRow sx={{ display: isOpen ? undefined : { xs: 'none', '@media print': 'table-row' } }}>
                    <TableCell colSpan={moneyHidden ? 5 : 7} sx={{ p: 0, borderBottom: isOpen ? undefined : 0 }}>
                      <Collapse in={isOpen} timeout="auto" sx={{ '@media print': { height: 'auto !important', visibility: 'visible !important', overflow: 'visible' } }}>
                        <Table size="small" aria-label={`Stays of ${property.name}`}>
                          <TableBody>
                            {property.stays.map((stay: StayRow): React.JSX.Element => (
                              <TableRow key={stay.id} hover>
                                <TableCell sx={{ width: 48 }} />
                                <TableCell sx={{ pl: 4 }}>
                                  <MuiLink component="button" type="button" underline="hover" sx={{ textAlign: 'left' }} onClick={(): void => showBookings(stay.name, (_propertyId, houseId): boolean => houseId === stay.id)}>
                                    {stay.name}
                                  </MuiLink>
                                </TableCell>
                                <Numbers row={stay} currencyCode={property.currencyCode} moneyHidden={moneyHidden} />
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </ReportSection>
  );
}

interface NumbersProps {
  row: StayRow;
  currencyCode: string;
  moneyHidden: boolean;
}

function Numbers({ row, currencyCode, moneyHidden }: NumbersProps): React.JSX.Element {
  return (
    <>
      <TableCell align="right">{row.bookings}</TableCell>
      <TableCell align="right">{row.nights}</TableCell>
      <TableCell align="right">{row.occupancyPercent}%</TableCell>
      {moneyHidden ? null : <TableCell align="right">{formatCents(row.revenueCents, currencyCode)}</TableCell>}
      {moneyHidden ? null : <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box aria-hidden sx={{ flexGrow: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden', minWidth: 80 }}>
            <Box sx={{ width: `${row.sharePercent}%`, height: '100%', bgcolor: 'secondary.main' }} />
          </Box>
          <Typography variant="body2" sx={{ minWidth: 44, textAlign: 'right' }}>
            {row.sharePercent}%
          </Typography>
        </Box>
      </TableCell>}
    </>
  );
}
