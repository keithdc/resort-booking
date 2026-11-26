/**
 * @file apps/admin/src/features/account/utils/clipboard.ts
 * @feature account
 * @dependencies none
 */

/** Copies text to the clipboard; false when the browser refuses (insecure page, permissions). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Offers a text file for download without any server round trip. */
export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
