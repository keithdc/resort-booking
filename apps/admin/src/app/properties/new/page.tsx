/**
 * @file apps/admin/src/app/properties/new/page.tsx
 * @feature property
 * @dependencies PropertyListingForm
 */

import { Typography } from '@mui/material';
import { PropertyListingForm } from '@/features/property/components/property-listing-form';

export const dynamic = 'force-dynamic';

/**
 * Add a property under the operator account.
 */
export default function NewPropertyRoute(): React.JSX.Element {
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Add a property
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Search the street to place it on the guest map. You can add stays after this step.
      </Typography>
      <PropertyListingForm property={null} />
    </>
  );
}
