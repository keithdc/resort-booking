// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/search-results-map.test.tsx
 * @feature houses
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchResultsMap } from './search-results-map';

// The heavy map is loaded on demand; stand in for it so the loading behavior can be tested.
vi.mock('./search-results-map-inner', () => ({
  SearchResultsMapInner: (): React.JSX.Element => <div aria-label="Real map loaded" />,
}));

describe('SearchResultsMap', () => {
  afterEach(cleanup);

  it('shows a placeholder first, then the map once its code has loaded', async () => {
    render(<SearchResultsMap pins={[]} activeHouseId={null} onHoverHouse={vi.fn<(id: string | null) => void>()} />);

    expect(screen.getByLabelText('Loading map')).toBeTruthy();
    expect(await screen.findByLabelText('Real map loaded')).toBeTruthy();
    expect(screen.queryByLabelText('Loading map')).toBeNull();
  });
});
