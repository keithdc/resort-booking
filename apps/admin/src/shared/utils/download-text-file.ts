/**
 * @file apps/admin/src/shared/utils/download-text-file.ts
 * @shared Hands a text file to the browser as a download
 * @dependencies browser Blob / URL
 */

/**
 * Saves `content` as a file named `fileName` through a temporary link. The object URL is released
 * right after the click.
 */
export function downloadTextFile(fileName: string, content: string, mimeType = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
