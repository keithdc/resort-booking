/**
 * @file apps/admin/src/features/account/components/recovery-codes-panel.tsx
 * @feature account
 * @dependencies clipboard utils
 */

'use client';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Alert, Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { copyText, downloadTextFile } from '../utils/clipboard';

interface RecoveryCodesPanelProps {
  codes: string[];
  /** Called once the person says they have saved the codes; the codes are then gone from the screen. */
  onDone: () => void;
}

/**
 * The ten recovery codes, shown ONCE. Copy or download them; the panel can only be closed after the person
 * confirms they are saved, because the server cannot show them again.
 */
export function RecoveryCodesPanel({ codes, onDone }: RecoveryCodesPanelProps): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const text = codes.join('\n');

  const onCopy = async (): Promise<void> => {
    setCopied(await copyText(text));
  };

  return (
    <Stack spacing={2} aria-label="Recovery codes">
      <Alert severity="warning">
        Save these recovery codes now. Each works once if you lose your phone, and they will not be shown again.
      </Alert>
      <Box
        component="ul"
        sx={{
          m: 0,
          p: 2,
          listStyle: 'none',
          display: 'grid',
          gap: 1,
          gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr 1fr' },
          fontFamily: 'monospace',
          fontSize: 15,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.default',
        }}
      >
        {codes.map((code: string): React.JSX.Element => (
          <li key={code}>{code}</li>
        ))}
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <Button variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={(): void => void onCopy()}>
          Copy codes
        </Button>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={(): void => downloadTextFile('humphreys-recovery-codes.txt', `Humphreys staff recovery codes\n\n${text}\n`)}
        >
          Download .txt
        </Button>
        {copied === true ? (
          <Typography variant="body2" color="success.main" role="status">
            Copied
          </Typography>
        ) : null}
        {copied === false ? (
          <Typography variant="body2" color="error" role="status">
            Could not copy. Select the codes and copy them by hand.
          </Typography>
        ) : null}
      </Stack>
      <FormControlLabel
        control={<Checkbox checked={saved} onChange={(event): void => setSaved(event.target.checked)} />}
        label="I have saved these recovery codes somewhere safe"
      />
      <Box>
        <Button variant="contained" disabled={!saved} onClick={onDone}>
          Done
        </Button>
      </Box>
    </Stack>
  );
}
