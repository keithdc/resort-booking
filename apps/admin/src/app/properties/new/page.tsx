/**
 * @file apps/admin/src/app/properties/new/page.tsx
 * @feature property
 * @dependencies PropertyListingForm, AdminOnly
 */

import AddHomeWorkOutlinedIcon from '@mui/icons-material/AddHomeWorkOutlined';
import { PropertyListingForm } from '@/features/property/components/property-listing-form';
import { AdminOnly } from '@/shared/components/admin-only';
import { PageHeader } from '@/shared/components/page-header';

export const dynamic = 'force-dynamic';

/**
 * Add a property under the operator account.
 */
export default function NewPropertyRoute(): React.JSX.Element {
  return (
    <AdminOnly what="Adding a property">
      <PageHeader
        icon={<AddHomeWorkOutlinedIcon />}
        title="Add a property"
        description="Search the street to place it on the guest map. You can add stays after this step."
      />
      <PropertyListingForm property={null} />
    </AdminOnly>
  );
}
