import type { JsonLdObject } from '../lib/structured-data';

/**
 * JSON-LD in the server markup: one
 * `<script type="application/ld+json">` per block. `<` is escaped so no
 * string value can close the script element.
 */
export function JsonLd({ data }: { data: JsonLdObject | readonly JsonLdObject[] }) {
  const blocks = ([] as JsonLdObject[]).concat(data);
  return (
    <>
      {blocks.map((block, index) => (
        <script
          key={`${index}-${block['@type']}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
