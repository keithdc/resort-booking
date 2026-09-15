/**
 * @file apps/admin/src/features/property/components/photo-rank-editor.tsx
 * @feature property
 * @dependencies PhotoWrite — list order is sort_order on save
 */

'use client';

import type { PhotoWrite } from '@resort-booking/shared-types';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { Box, Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';

interface PhotoRankEditorProps {
  photos: PhotoWrite[];
  onChange: (photos: PhotoWrite[]) => void;
}

/**
 * Ranked photo list. Index 0 is the cover; up/down persist as sort_order on save.
 */
export function PhotoRankEditor({ photos, onChange }: PhotoRankEditorProps): React.JSX.Element {
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Rank 1 is the cover on search cards and the first image guests see. Use the arrows to change order.
      </Typography>
      {photos.map((photo, index): React.JSX.Element => (
        <Stack
          key={`photo-${index}`}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        >
          {photo.url.trim() !== '' ? (
            <Box
              component="img"
              src={photo.url}
              alt={photo.altText === '' ? 'Photo preview' : photo.altText}
              sx={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 1, bgcolor: 'action.hover' }}
            />
          ) : (
            <Box sx={{ width: 96, height: 72, borderRadius: 1, bgcolor: 'action.hover' }} />
          )}
          <Chip
            size="small"
            label={index === 0 ? '1 · Cover' : String(index + 1)}
            sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
          />
          <Stack direction="row" spacing={0.5} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
            <IconButton
              aria-label="Move photo up"
              size="small"
              disabled={index === 0}
              onClick={(): void => {
                onChange(movePhotoRank(photos, index, -1));
              }}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="Move photo down"
              size="small"
              disabled={index === photos.length - 1}
              onClick={(): void => {
                onChange(movePhotoRank(photos, index, 1));
              }}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </Stack>
          <TextField
            label="Photo URL"
            fullWidth
            value={photo.url}
            onChange={(event): void => {
              const url = event.target.value;
              onChange(
                photos.map((row, rowIndex): PhotoWrite => (rowIndex === index ? { ...row, url } : row)),
              );
            }}
          />
          <TextField
            label="Caption"
            fullWidth
            value={photo.altText}
            onChange={(event): void => {
              const altText = event.target.value;
              onChange(
                photos.map((row, rowIndex): PhotoWrite => (rowIndex === index ? { ...row, altText } : row)),
              );
            }}
          />
          <Button
            onClick={(): void => {
              onChange(photos.filter((_row, rowIndex): boolean => rowIndex !== index));
            }}
          >
            Remove
          </Button>
        </Stack>
      ))}
      <Button
        variant="outlined"
        onClick={(): void => {
          onChange([...photos, { url: '', altText: '' }]);
        }}
      >
        Add photo
      </Button>
    </Stack>
  );
}

export function movePhotoRank(photos: PhotoWrite[], from: number, direction: -1 | 1): PhotoWrite[] {
  const to = from + direction;
  if (from < 0 || from >= photos.length || to < 0 || to >= photos.length) {
    return photos;
  }
  const next = [...photos];
  const moving = next[from];
  const swapped = next[to];
  if (moving === undefined || swapped === undefined) {
    return photos;
  }
  next[from] = swapped;
  next[to] = moving;
  return next;
}
