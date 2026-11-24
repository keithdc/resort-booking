/**
 * @file apps/web/src/features/houses/components/search-results-view.tsx
 * @feature houses
 * @dependencies house-listing-card, search-results-map, map-pins
 */

'use client';

import type { HouseSearchResult } from '@resort-booking/shared-types';
import { Box, Button, Typography } from '@mui/material';
import { BlurFade } from '@resort-booking/ui';
import { useMemo, useState } from 'react';
import type { StayQuery } from '@/shared/utils/stay-query';
import { groupByLocation, toPinViews } from '../utils/map-pins';
import { HouseListingCard } from './house-listing-card';
import { SearchResultsMap } from './search-results-map';

interface SearchResultsViewProps {
  results: HouseSearchResult[];
  stay: StayQuery;
}

type MobileView = 'list' | 'map';

/**
 * Search results as a list with a map beside it (desktop) or behind a toggle (phone). Every stay
 * appears on the map with its price; hovering a card lights up its chip and hovering a chip lights
 * up its card.
 */
export function SearchResultsView({ results, stay }: SearchResultsViewProps): React.JSX.Element {
  const pins = useMemo(() => groupByLocation(results), [results]);
  const views = useMemo(() => toPinViews(pins, stay), [pins, stay]);
  // The stay under the mouse, on a card or on the map. Both sides light up together.
  const [activeHouseId, setActiveHouseId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const hasMap = views.length > 0;

  return (
    <Box data-mobile-view={mobileView}>
      {hasMap ? (
        <Button
          variant="outlined"
          sx={{ display: { xs: 'inline-flex', md: 'none' }, mb: 2 }}
          onClick={(): void => setMobileView(mobileView === 'list' ? 'map' : 'list')}
        >
          {mobileView === 'list' ? 'Show map' : 'Show list'}
        </Button>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: hasMap ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: { xs: mobileView === 'list' || !hasMap ? 'block' : 'none', md: 'block' } }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: hasMap ? '1fr' : '1fr 1fr', xl: hasMap ? '1fr 1fr' : '1fr 1fr 1fr' },
            }}
          >
            {results.map((result, index) => {
              const active = result.house.id === activeHouseId;
              return (
                <BlurFade key={result.house.id} delay={index * 0.06}>
                  <Box
                    id={`stay-${result.house.id}`}
                    data-active={active ? 'true' : 'false'}
                    onMouseEnter={(): void => setActiveHouseId(result.house.id)}
                    onMouseLeave={(): void => setActiveHouseId(null)}
                    onFocus={(): void => setActiveHouseId(result.house.id)}
                    onBlur={(): void => setActiveHouseId(null)}
                    sx={{
                      borderRadius: 1,
                      outline: active ? '2px solid' : '2px solid transparent',
                      outlineColor: active ? 'primary.main' : 'transparent',
                      outlineOffset: 2,
                    }}
                  >
                    <HouseListingCard house={result.house} quote={result.quote} stay={stay} />
                  </Box>
                </BlurFade>
              );
            })}
          </Box>
        </Box>
        {hasMap ? (
          <Box
            sx={{
              display: { xs: mobileView === 'map' ? 'block' : 'none', md: 'block' },
              position: { md: 'sticky' },
              top: { md: 96 },
              height: { xs: 'calc(100vh - 220px)', md: 'calc(100vh - 140px)' },
              minHeight: 380,
            }}
          >
            <SearchResultsMap pins={views} activeHouseId={activeHouseId} onHoverHouse={setActiveHouseId} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Each chip is a stay and its total price for your dates.
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
