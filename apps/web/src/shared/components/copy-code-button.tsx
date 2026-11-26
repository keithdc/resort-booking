/**
 * @file apps/web/src/shared/components/copy-code-button.tsx
 * @shared Copy-code icon button with a polite confirmation
 * @dependencies MUI
 */

'use client';

import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const MESSAGE_MS = 3000;

type CopyStatus = 'idle' | 'copied' | 'failed';

interface CopyCodeButtonProps {
  code: string;
}

/**
 * Copies a promo code to the clipboard. The result is announced in a polite live region; when the
 * clipboard is unavailable (insecure page, blocked permission) it says so and the code stays on
 * screen to select by hand.
 */
export function CopyCodeButton({ code }: CopyCodeButtonProps): React.JSX.Element {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    (): (() => void) => (): void => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const show = (next: CopyStatus): void => {
    setStatus(next);
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout((): void => setStatus('idle'), MESSAGE_MS);
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      show('copied');
    } catch {
      show('failed');
    }
  };

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={status === 'copied' ? 'Copied' : 'Copy code'}>
        <IconButton
          size="small"
          color={status === 'copied' ? 'success' : 'inherit'}
          aria-label={`Copy code ${code}`}
          onClick={(event): void => {
            // Inside a chip or a link the click must not trigger the parent.
            event.stopPropagation();
            void copy();
          }}
          // Phone: 44px hit area, but negative margins keep the chip as short as before.
          sx={{ p: 0.5, my: { xs: '-9px', md: 0 } }}
        >
          {status === 'copied' ? <CheckIcon fontSize="inherit" /> : <ContentCopyIcon fontSize="inherit" />}
        </IconButton>
      </Tooltip>
      <Box component="span" role="status" aria-live="polite" sx={{ typography: 'caption', color: 'text.secondary' }}>
        {status === 'copied' ? 'Code copied' : status === 'failed' ? 'Could not copy. Select the code and copy it by hand.' : ''}
      </Box>
    </Box>
  );
}
