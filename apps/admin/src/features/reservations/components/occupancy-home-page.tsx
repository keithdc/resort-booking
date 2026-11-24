/**
 * @file apps/admin/src/features/reservations/components/occupancy-home-page.tsx
 * @feature reservations
 * @dependencies properties + calendar
 */

import { fetchStaffProperties } from '@/features/property/services/staff-property-api';
import { RefundsAlert } from '@/features/refunds';
import { OccupancyCalendar } from './occupancy-calendar';

/**
 * Staff home: a heads-up about refunds that need a person, then the calendar of confirmed stays.
 */
export async function OccupancyHomePage(): Promise<React.JSX.Element> {
  const properties = await fetchStaffProperties();
  return (
    <>
      <RefundsAlert />
      <OccupancyCalendar properties={properties} />
    </>
  );
}
