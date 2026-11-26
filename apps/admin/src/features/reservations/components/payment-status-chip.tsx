/**
 * @file apps/admin/src/features/reservations/components/payment-status-chip.tsx
 * @feature reservations
 * @dependencies payment-status, MUI (icon + words + colour, never colour alone)
 */

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import { Chip } from '@mui/material';
import type { StaffReservation } from '@resort-booking/shared-types';
import { paymentChipStyle } from '../utils/payment-status';

interface PaymentStatusChipProps {
  stay: Pick<StaffReservation, 'paymentMethod' | 'paymentStatus'>;
  /** Also show "Paid" for an online booking (the booking card). Lists leave it off to stay quiet. */
  showPaid?: boolean;
}

/**
 * "Pay at hotel · Pending" (warning) or "Paid at hotel" / "Paid" (success). Shows nothing when there is nothing to say.
 */
export function PaymentStatusChip({ stay, showPaid = false }: PaymentStatusChipProps): React.JSX.Element | null {
  const style = paymentChipStyle(stay, showPaid);
  if (style === null) {
    return null;
  }
  return (
    <Chip
      size="small"
      color={style.tone}
      icon={style.tone === 'warning' ? <PaymentsOutlinedIcon /> : <CheckCircleOutlineIcon />}
      label={style.label}
    />
  );
}
