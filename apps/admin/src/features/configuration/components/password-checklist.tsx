/**
 * @file apps/admin/src/features/configuration/components/password-checklist.tsx
 * @feature configuration
 * @dependencies MUI, @resort-booking/ui/password
 */

'use client';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { Box, Typography } from '@mui/material';
import { passwordChecklist, type PasswordRuleResult } from '@resort-booking/ui/password';
import { VISUALLY_HIDDEN } from '@/shared/utils/visually-hidden';

interface PasswordChecklistProps {
  password: string;
  /** The account's sign-in email, for the "does not contain your email name" rule. */
  email: string;
}

/**
 * The password rules as a live checklist under the field. A met rule shows a tick icon and a plain
 * "(met)"; an unmet one an empty circle and "(not yet)", so colour is never the only signal. A polite
 * status line says how many are met.
 */
export function PasswordChecklist({ password, email }: PasswordChecklistProps): React.JSX.Element {
  const rules = passwordChecklist(password, { email });
  const met = rules.filter((rule): boolean => rule.ok).length;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" component="p" role="status" aria-live="polite" color="text.secondary" sx={{ mb: 0.5 }}>
        {met === rules.length ? 'All password rules are met' : `${String(met)} of ${String(rules.length)} password rules met`}
      </Typography>
      <Box component="ul" aria-label="Password rules" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0.5 }}>
        {rules.map((rule: PasswordRuleResult): React.JSX.Element => (
          <Box
            key={rule.id}
            component="li"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, color: rule.ok ? 'success.dark' : 'text.secondary' }}
          >
            {rule.ok ? (
              <CheckCircleOutlineIcon fontSize="small" aria-hidden />
            ) : (
              <RadioButtonUncheckedIcon fontSize="small" aria-hidden />
            )}
            <Typography variant="body2" component="span">
              {rule.label}
              <Box component="span" sx={VISUALLY_HIDDEN}>
                {rule.ok ? ' (met)' : ' (not yet)'}
              </Box>
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
