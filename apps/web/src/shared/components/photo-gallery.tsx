/**
 * @file apps/web/src/shared/components/photo-gallery.tsx
 * @shared Property and house photo gallery
 * @dependencies @mui/material
 */

'use client';

import { Box, Button, Dialog, IconButton, SvgIcon, Typography } from '@mui/material';
import { useState } from 'react';
import type { Photo } from '@resort-booking/shared-types';

function ChevronLeftIcon(): React.JSX.Element {
  return (
    <SvgIcon>
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </SvgIcon>
  );
}

function ChevronRightIcon(): React.JSX.Element {
  return (
    <SvgIcon>
      <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </SvgIcon>
  );
}

interface PhotoGalleryProps {
  photos: Photo[];
  altFallback: string;
}

/**
 * Photography-led mosaic. Empty lists show a message, never a blank slot.
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

  const mosaic = photos.slice(0, 5);
  const extraCount = photos.length - mosaic.length;

  return (
    <>
      <Box sx={{ position: 'relative' }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            height: { xs: 260, md: 460 },
            gridTemplateColumns: {
              xs: '1fr',
              md: mosaic.length === 1 ? '1fr' : '2fr 1fr 1fr',
            },
            gridTemplateRows: { xs: '1fr', md: mosaic.length > 2 ? '1fr 1fr' : '1fr' },
            borderRadius: 1,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
          }}
        >
          {mosaic.map((photo, index): React.JSX.Element => {
            const isHero = index === 0;
            return (
              <Box
                key={photo.id}
                component="button"
                type="button"
                onClick={(): void => {
                  setOpenIndex(index);
                }}
                sx={{
                  display: { xs: isHero ? 'block' : 'none', md: 'block' },
                  gridColumn: isHero && mosaic.length > 1 ? { md: '1 / 2' } : undefined,
                  gridRow: isHero && mosaic.length > 2 ? { md: '1 / 3' } : undefined,
                  p: 0,
                  border: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  bgcolor: 'background.paper',
                  minHeight: 0,
                }}
              >
                <Box
                  component="img"
                  src={photo.url}
                  alt={photo.altText || altFallback}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </Box>
            );
          })}
        </Box>
        <Button
          variant="contained"
          onClick={(): void => {
            setOpenIndex(0);
          }}
          sx={{ position: 'absolute', right: 16, bottom: 16 }}
        >
          {extraCount > 0 ? `Show all ${photos.length} photos` : 'View photos'}
        </Button>
      </Box>
      <Dialog
        open={openIndex !== null}
        onClose={(): void => {
          setOpenIndex(null);
        }}
        maxWidth="md"
        fullWidth
      >
        {openIndex !== null ? (
          <Box sx={{ position: 'relative', bgcolor: 'background.paper' }}>
            <Box
              component="img"
              src={photos[openIndex]?.url}
              alt={photos[openIndex]?.altText ?? altFallback}
              sx={{ width: '100%', display: 'block', maxHeight: '80vh', objectFit: 'contain' }}
            />
            <Typography sx={{ px: 2, py: 1.5 }} color="text.secondary">
              {photos[openIndex]?.altText ?? altFallback} · {openIndex + 1} / {photos.length}
            </Typography>
            {photos.length > 1 ? (
              <>
                <IconButton
                  aria-label="Previous photo"
                  onClick={(): void => {
                    setOpenIndex((current): number | null =>
                      current === null ? 0 : (current + photos.length - 1) % photos.length,
                    );
                  }}
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: 8,
                    transform: 'translateY(-50%)',
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    border: 1,
                    borderColor: 'divider',
                    '&:hover': {
                      bgcolor: 'background.paper',
                      color: 'primary.main',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton
                  aria-label="Next photo"
                  onClick={(): void => {
                    setOpenIndex((current): number | null =>
                      current === null ? 0 : (current + 1) % photos.length,
                    );
                  }}
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    right: 8,
                    transform: 'translateY(-50%)',
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    border: 1,
                    borderColor: 'divider',
                    '&:hover': {
                      bgcolor: 'background.paper',
                      color: 'primary.main',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </>
            ) : null}
          </Box>
        ) : null}
      </Dialog>
    </>
  );
}
