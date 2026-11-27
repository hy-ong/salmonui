import { ImageResponse } from 'next/og';
import { OG_IMAGE } from '../../lib/seo';
import { countComponents, getComponentFamilies } from '../../lib/site';

// Default Open Graph image shared by every page, rendered once at build time. A force-static route handler rather
// than the `opengraph-image` file convention: the static export writes it as
// `out/og.png`, so static hosts serve it as `image/png` (the convention's
// file has no extension). Colors follow the site's primary seed; the copy
// matches the landing hero and counts the components from the catalog.
export const dynamic = 'force-static';

export function GET() {
  const componentCount = countComponents(getComponentFamilies());
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#fff7ed',
          color: '#1f1a17',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: '#c2410c' }} />
          <div style={{ fontSize: 56, fontWeight: 700 }}>Salmon UI</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>One React library, from a button to a million-row grid.</div>
          <div style={{ fontSize: 34, color: '#5c4f48' }}>{`${componentCount} components for React 19.`}</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map((column) => (
            <div key={column} style={{ flex: 1, height: 14, borderRadius: 7, background: column === 0 ? '#c2410c' : '#fed7aa' }} />
          ))}
        </div>
      </div>
    ),
    { width: OG_IMAGE.width, height: OG_IMAGE.height },
  );
}
