/**
 * @file apps/admin/src/features/property/components/staff-home-page.tsx
 * @feature property
 * @dependencies staff-property-api
 */

import { Container, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { fetchStaffProperties } from '../services/staff-property-api';

/**
 * Staff landing: properties plus an unrestricted date field (past days stay enabled).
 */
export async function StaffHomePage(): Promise<React.JSX.Element> {
  const properties = await fetchStaffProperties();

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Properties
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Admin calendars do not disable past days. Guest pickers do.
      </Typography>
      <TextField
        label="Block or correct a past date"
        type="date"
        defaultValue="2020-01-15"
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ mb: 3 }}
        helperText="Past dates stay selectable for staff."
      />
      {properties.length === 0 ? (
        <Typography>No properties yet.</Typography>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>City</TableCell>
              <TableCell>Published</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => (
              <TableRow key={property.id} hover>
                <TableCell>{property.name}</TableCell>
                <TableCell>{property.city}</TableCell>
                <TableCell>{property.published ? 'Yes' : 'No'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  );
}
