/**
 * @file apps/admin/src/features/reporting/components/combined-chart.tsx
 * @feature reporting
 * @dependencies chart-geometry, report-chart
 */

'use client';

import { Box, Typography, useTheme } from '@mui/material';
import { usePhoneLayout } from '@/shared/hooks/use-compact-layout';
import { formatCents } from '@/shared/utils/money';
import { chartGeometry, polylinePoints } from '../utils/chart-geometry';
import type { ChartBucket } from '../utils/report-chart';

const AREA = { width: 800, height: 280, left: 64, right: 44, top: 16, bottom: 34 };
/** Phone: drawn at about the screen's own width so the text stays readable and nothing scrolls sideways. */
const PHONE_AREA = { width: 330, height: 250, left: 50, right: 34, top: 14, bottom: 30 };

const VISUALLY_HIDDEN = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

interface CombinedChartProps {
  buckets: ChartBucket[];
  currencyCode: string;
  onSelect: (bucket: ChartBucket) => void;
}

/**
 * ONE chart: bars for revenue (left scale) and a line for how full the stays were (right scale, 0 to
 * 100%). Each column can be opened with the keyboard or a click; a hidden table repeats the numbers
 * for screen readers.
 */
export function CombinedChart({ buckets, currencyCode, onSelect }: CombinedChartProps): React.JSX.Element {
  const theme = useTheme();
  const phone = usePhoneLayout();
  const area = phone ? PHONE_AREA : AREA;
  const geometry = chartGeometry(buckets, area);
  const barColor = theme.palette.secondary.main;
  const lineColor = theme.palette.success.dark;
  const axisColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / (phone ? 7 : 16)));
  const summary = `Revenue as bars and occupancy as a line, ${buckets.length} ${buckets.length === 1 ? 'bar' : 'bars'}.`;

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', columnGap: 3, rowGap: 0.5, mb: 1, flexWrap: 'wrap' }}>
        <Legend color={barColor} label="Revenue (left scale)" shape="bar" />
        <Legend color={lineColor} label="Occupancy (right scale)" shape="line" />
      </Box>
      <svg viewBox={`0 0 ${String(area.width)} ${String(area.height)}`} role="img" aria-label={summary} style={{ width: '100%', minWidth: phone ? 0 : 520, height: 'auto' }}>
        {[0, 0.5, 1].map((fraction: number): React.JSX.Element => {
          const y = geometry.plotBottom - fraction * (geometry.plotBottom - geometry.plotTop);
          return (
            <g key={fraction}>
              <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={y} y2={y} stroke={axisColor} strokeWidth={1} />
              <text x={geometry.plotLeft - 8} y={y + 4} textAnchor="end" fontSize={11} fill={textColor}>
                {formatCents(Math.round(geometry.maxRevenueCents * fraction), currencyCode).replace(/,00/, '')}
              </text>
              <text x={geometry.plotRight + 8} y={y + 4} textAnchor="start" fontSize={11} fill={textColor}>
                {Math.round(fraction * 100)}%
              </text>
            </g>
          );
        })}
        {geometry.bars.map((bar, index): React.JSX.Element => {
          const bucket = buckets[index];
          if (bucket === undefined) {
            return <g key={bar.key} />;
          }
          return (
            <g
              key={bar.key}
              role="button"
              tabIndex={0}
              aria-label={`${bucket.title}: revenue ${formatCents(bucket.revenueCents, currencyCode)}, occupancy ${bucket.occupancyPercent}%. Open the bookings.`}
              style={{ cursor: 'pointer', outline: 'none' }}
              onClick={(): void => {
                onSelect(bucket);
              }}
              onKeyDown={(event): void => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(bucket);
                }
              }}
            >
              <title>{`${bucket.title}: ${formatCents(bucket.revenueCents, currencyCode)} · ${bucket.occupancyPercent}% occupied`}</title>
              <rect x={bar.columnX} y={geometry.plotTop} width={bar.columnWidth} height={geometry.plotBottom - geometry.plotTop} fill="transparent" />
              <rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={2} fill={barColor} />
              {index % labelEvery === 0 ? (
                <text x={bar.columnX + bar.columnWidth / 2} y={area.height - 10} textAnchor="middle" fontSize={11} fill={textColor}>
                  {bucket.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {geometry.line.length > 1 ? <polyline points={polylinePoints(geometry.line)} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" /> : null}
        {geometry.line.map((point, index): React.JSX.Element => (
          <circle key={buckets[index]?.key ?? index} cx={point.x} cy={point.y} r={3} fill={lineColor} />
        ))}
      </svg>
      <Box component="table" sx={VISUALLY_HIDDEN}>
        <caption>Revenue and occupancy for each bar of the chart</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Revenue</th>
            <th scope="col">Occupancy</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket: ChartBucket): React.JSX.Element => (
            <tr key={bucket.key}>
              <th scope="row">{bucket.title}</th>
              <td>{formatCents(bucket.revenueCents, currencyCode)}</td>
              <td>{bucket.occupancyPercent}%</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

interface LegendProps {
  color: string;
  label: string;
  shape: 'bar' | 'line';
}

function Legend({ color, label, shape }: LegendProps): React.JSX.Element {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box aria-hidden sx={{ width: 16, height: shape === 'bar' ? 12 : 3, bgcolor: color, borderRadius: 0.5 }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
