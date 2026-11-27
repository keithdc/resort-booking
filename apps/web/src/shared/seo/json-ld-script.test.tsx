// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/seo/json-ld-script.test.tsx
 * @shared The structured-data script tag
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonLd } from './json-ld-script';

afterEach(cleanup);

describe('JsonLd', () => {
  it('renders one ld+json script whose text stays data, whatever the names contain', () => {
    const { container } = render(<JsonLd data={{ '@type': 'Thing', name: '</script><img src=x onerror=alert(1)>' }} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(container.querySelector('img')).toBeNull();
    expect(JSON.parse(scripts[0]?.textContent ?? '')).toEqual({ '@type': 'Thing', name: '</script><img src=x onerror=alert(1)>' });
  });

  it('renders nothing without data', () => {
    const { container } = render(<JsonLd data={null} />);
    expect(container.innerHTML).toBe('');
  });
});
