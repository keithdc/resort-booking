// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/utils/download-text-file.test.ts
 * @shared
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from './download-text-file';

describe('downloadTextFile', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    createObjectURL.mockReset().mockReturnValue('blob:report');
    revokeObjectURL.mockReset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicks a temporary link with the file name and releases the object URL', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadTextFile('report.csv', 'a,b');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('puts the text in a blob of the given type', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadTextFile('report.csv', 'a,b', 'text/plain');

    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('text/plain');
    expect(await blob?.text()).toBe('a,b');
  });
});
