/**
 * @file apps/web/src/shared/components/photo-gallery.tsx
 * @shared Property and house photo gallery
 * @dependencies @mui/material, responsive utils
 */

'use client';

import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Chip, Dialog, IconButton, SvgIcon, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import type { Photo } from '@resort-booking/shared-types';
import { useCompactScreen } from '../hooks/use-compact-screen';
import { photoSrcSet, swipeDirection } from '../utils/responsive';

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

const ARROW_SX = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 44,
  height: 44,
  bgcolor: 'background.paper',
  color: 'text.primary',
  border: 1,
  borderColor: 'divider',
  '&:hover': {
    bgcolor: 'background.paper',
    color: 'primary.main',
    borderColor: 'primary.main',
  },
} as const;

/** Photo widths for `sizes`: the strip is full width on a phone, the mosaic's big tile is about 60% on desktop. */
const HERO_SIZES = '(max-width: 899px) 100vw, 60vw';
const TILE_SIZES = '(max-width: 899px) 100vw, 20vw';

/**
 * Photography-led gallery. Desktop shows a mosaic. A phone shows a swipeable strip of every photo
 * (scroll-snap, fixed 4:3 ratio so nothing shifts as photos load) and a full-screen viewer you can
 * swipe or close with a 44px button. Empty lists show a message, never a blank slot.
 */
export function PhotoGallery({ photos, altFallback }: PhotoGalleryProps): React.JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const compact = useCompactScreen();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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

  const mosaicCount = Math.min(photos.length, 5);
  const extraCount = photos.length - mosaicCount;
  const step = (delta: number): void => {
    setOpenIndex((current): number | null =>
      current === null ? 0 : (current + delta + photos.length) % photos.length,
    );
  };

  return (
    <>
      <Box sx={{ position: 'relative' }}>
        <Box
          onScroll={(event): void => {
            const strip = event.currentTarget;
            if (strip.clientWidth > 0) {
              setSlide(Math.round(strip.scrollLeft / strip.clientWidth));
            }
          }}
          sx={{
            display: { xs: 'flex', md: 'grid' },
            gap: 1,
            height: { xs: 'auto', md: 460 },
            // Phone: one photo per screen, snapping as you swipe.
            overflowX: { xs: 'auto', md: 'hidden' },
            overflowY: 'hidden',
            scrollSnapType: { xs: 'x mandatory', md: 'none' },
            overscrollBehaviorX: 'contain',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            gridTemplateColumns: {
              md: photos.length === 1 ? '1fr' : '2fr 1fr 1fr',
            },
            gridTemplateRows: { md: mosaicCount > 2 ? '1fr 1fr' : '1fr' },
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
          }}
        >
          {photos.map((photo, index): React.JSX.Element => {
            const isHero = index === 0;
            return (
              <Box
                key={photo.id}
                component="button"
                type="button"
                aria-label={`Open photo ${String(index + 1)} of ${String(photos.length)}`}
                onClick={(): void => {
                  setOpenIndex(index);
                }}
                sx={{
                  // The mosaic only has room for five tiles; the phone strip carries them all.
                  display: { xs: 'block', md: index < 5 ? 'block' : 'none' },
                  flex: { xs: '0 0 100%', md: 'none' },
                  scrollSnapAlign: 'start',
                  aspectRatio: { xs: '4 / 3', md: 'auto' },
                  gridColumn: isHero && mosaicCount > 1 ? { md: '1 / 2' } : undefined,
                  gridRow: isHero && mosaicCount > 2 ? { md: '1 / 3' } : undefined,
                  p: 0,
                  border: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  bgcolor: 'action.hover',
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <Box
                  component="img"
                  src={photo.url}
                  srcSet={photoSrcSet(photo.url)}
                  sizes={isHero ? HERO_SIZES : TILE_SIZES}
                  alt={photo.altText || altFallback}
                  loading={isHero ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </Box>
            );
          })}
        </Box>
        {photos.length > 1 ? (
          <Chip
            size="small"
            label={`${String(Math.min(slide, photos.length - 1) + 1)} / ${String(photos.length)}`}
            aria-hidden
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              position: 'absolute',
              left: 12,
              bottom: 12,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: 'common.white',
              pointerEvents: 'none',
            }}
          />
        ) : null}
        <Button
          variant="contained"
          onClick={(): void => {
            setOpenIndex(0);
          }}
          sx={{ position: 'absolute', right: { xs: 12, md: 16 }, bottom: { xs: 12, md: 16 } }}
        >
          {extraCount > 0 ? `Show all ${String(photos.length)} photos` : 'View photos'}
        </Button>
      </Box>
      <Dialog
        open={openIndex !== null}
        onClose={(): void => {
          setOpenIndex(null);
        }}
        onKeyDown={(event): void => {
          if (event.key === 'ArrowLeft') {
            step(-1);
          } else if (event.key === 'ArrowRight') {
            step(1);
          }
        }}
        maxWidth="md"
        fullWidth
        fullScreen={compact}
        aria-label="Photo viewer"
      >
        {openIndex !== null ? (
          <Box
            sx={{
              position: 'relative',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              height: { xs: '100%', md: 'auto' },
              pt: { xs: 'env(safe-area-inset-top)', md: 0 },
              pb: { xs: 'env(safe-area-inset-bottom)', md: 0 },
            }}
          >
            <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', justifyContent: 'space-between', pl: 2, pr: 1 }}>
              <Typography color="text.secondary">
                {openIndex + 1} / {photos.length}
              </Typography>
              <IconButton
                aria-label="Close photo viewer"
                onClick={(): void => {
                  setOpenIndex(null);
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
            <Box
              onTouchStart={(event): void => {
                const touch = event.touches[0];
                touchStart.current = touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
              }}
              onTouchEnd={(event): void => {
                const start = touchStart.current;
                const touch = event.changedTouches[0];
                touchStart.current = null;
                if (start === null || touch === undefined) {
                  return;
                }
                const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
                if (direction !== null) {
                  step(direction === 'left' ? 1 : -1);
                }
              }}
              sx={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', minHeight: 0, touchAction: 'pan-y' }}
            >
              <Box
                component="img"
                src={photos[openIndex]?.url}
                srcSet={photoSrcSet(photos[openIndex]?.url ?? '')}
                sizes="(max-width: 899px) 100vw, 900px"
                alt={photos[openIndex]?.altText ?? altFallback}
                sx={{ width: '100%', display: 'block', maxHeight: { xs: '100%', md: '80vh' }, objectFit: 'contain' }}
              />
              {photos.length > 1 ? (
                <>
                  <IconButton aria-label="Previous photo" onClick={(): void => step(-1)} sx={{ ...ARROW_SX, left: 8 }}>
                    <ChevronLeftIcon />
                  </IconButton>
                  <IconButton aria-label="Next photo" onClick={(): void => step(1)} sx={{ ...ARROW_SX, right: 8 }}>
                    <ChevronRightIcon />
                  </IconButton>
                </>
              ) : null}
            </Box>
            <Typography sx={{ px: 2, py: 1.5 }} color="text.secondary">
              {photos[openIndex]?.altText ?? altFallback}
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                {' '}
                · {openIndex + 1} / {photos.length}
              </Box>
            </Typography>
          </Box>
        ) : null}
      </Dialog>
    </>
  );
}
