/**
 * @file apps/web/src/shared/seo/json-ld-script.tsx
 * @shared Renders a structured-data block
 * @dependencies json-ld
 */

import { serializeJsonLd, type JsonLdNode } from './json-ld';

interface JsonLdProps {
  data: JsonLdNode | null;
}

/**
 * A `<script type="application/ld+json">` block. It is data, not code, so the page's script policy does not
 * apply to it; the text is escaped by `serializeJsonLd`.
 */
export function JsonLd({ data }: JsonLdProps): React.JSX.Element | null {
  if (data === null) {
    return null;
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
