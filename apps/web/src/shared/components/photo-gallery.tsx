/**
 * @file apps/web/src/shared/components/photo-gallery.tsx
 * @shared Property and house photo gallery
 * @dependencies @mui/material
 */

'use client';

import { Box, Dialog } from '@mui/material';
import { useState } from 'react';
import type { Photo } from '@resort-booking/shared-types';

interface PhotoGalleryProps {
  photos: Photo[];
  altFallback: string;
}

/**
 * Renders a gallery; first image is the hero. Empty lists show a message, never a blank slot.
 */
export function PhotoGallery({ photos, altFallback }: PhotoGalleryProps): React.JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 4,
          color: 'text.secondary',
        }}
      >
        Photos for this listing are not available yet.
      </Box>
    );
  }

  const hero = photos[0];
  const rest = photos.slice(1);

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(): void => {
          setOpenIndex(0);
        }}
        sx={{
          display: 'block',
          width: '100%',
          p: 0,
          border: 0,
          borderRadius: 1,
          overflow: 'hidden',
          cursor: 'pointer',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          component="img"
          src={hero.url}
          alt={hero.altText || altFallback}
          sx={{ width: '100%', height: { xs: 220, md: 420 }, objectFit: 'cover', display: 'block' }}
        />
      </Box>
      {rest.length > 0 ? (
        <Box sx={{ display: 'flex', gap: 1, mt: 1, overflowX: 'auto' }}>
          {rest.map((photo, index): React.JSX.Element => (
            <Box
              key={photo.id}
              component="button"
              type="button"
              onClick={(): void => {
                setOpenIndex(index + 1);
              }}
              sx={{ p: 0, border: 0, borderRadius: 1, overflow: 'hidden', cursor: 'pointer' }}
            >
              <Box
                component="img"
                src={photo.url}
                alt={photo.altText}
                sx={{ width: 120, height: 80, objectFit: 'cover', display: 'block' }}
              />
            </Box>
          ))}
        </Box>
      ) : null}
      <Dialog
        open={openIndex !== null}
        onClose={(): void => {
          setOpenIndex(null);
        }}
        maxWidth="md"
        fullWidth
      >
        {openIndex !== null ? (
          <Box
            component="img"
            src={photos[openIndex]?.url}
            alt={photos[openIndex]?.altText ?? altFallback}
            sx={{ width: '100%', display: 'block' }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
