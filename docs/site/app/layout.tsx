import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getThemeHash, ThemeStyle } from '@salmonui/core/server';
// The theme stylesheet once, then the package stylesheet of every category
// the demos use, as an app that renders all of them would (each package's
// styles.css is its family stylesheets; a family stylesheet carries every
// family it renders, and the production minifier merges the modules several
// of them repeat). The lazy rich-text and pdf-viewer demos import their own
// stylesheets.
import '@salmonui/core/styles.css';
import '@salmonui/buttons/styles.css';
import '@salmonui/notifications/styles.css';
import '@salmonui/calendars/styles.css';
import '@salmonui/dropdowns/styles.css';
import '@salmonui/kanban/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/overlays/styles.css';
import '@salmonui/layout/styles.css';
import '@salmonui/navigation/styles.css';
import '@salmonui/inputs/styles.css';
import '@salmonui/query-builder/styles.css';
import '@salmonui/charts/styles.css';
import '@salmonui/charts/viz-animations.css';
import '@salmonui/charts/viz-rtl.css';
import '@salmonui/chat/styles.css';
import '@salmonui/editors/styles.css';
import '@salmonui/pivot-table/styles.css';
import '@salmonui/scheduler/styles.css';
import '@salmonui/gantt/styles.css';
import { HydrationMarker } from '../components/HydrationMarker';
import { JsonLd } from '../components/JsonLd';
import { SiteTheme } from '../components/SiteTheme';
import { TopBar } from '../components/TopBar';
import { SITE_NAME } from '../lib/seo';
import { SITE_URL } from '../lib/site-url';
import { websiteJsonLd } from '../lib/structured-data';
import { siteTheme } from '../lib/theme';
import './site.css';
import './docs-chrome.css';
import './code.css';
import './search.css';
// Route-specific styles load site-wide: a prefetched link to a route would
// otherwise inject a <link rel=preload as=style> for CSS the current page
// never uses. Classes are prefixed (.lp-*, .api-*).
import './marketing.css';
import './reference.css';

// Defaults only; every page sets its own title, description and canonical
// URL through pageMetadata() (lib/seo.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Site-wide WebSite + SearchAction. */}
        <JsonLd data={websiteJsonLd()} />
        <ThemeStyle theme={siteTheme} />
        <SiteTheme themeHash={getThemeHash(siteTheme)}>
          <TopBar />
          {children}
        </SiteTheme>
        <HydrationMarker />
      </body>
    </html>
  );
}
