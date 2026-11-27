// Page metadata. Every page builds its `Metadata` through
// `pageMetadata()`; no page builds `Metadata` by hand. It covers the title,
// description, canonical URL, robots, Open Graph and Twitter card tags.
// JSON-LD builders live in `structured-data.ts`.
import type { Metadata } from 'next';
import { siteIndexable } from './site-config';
import { absoluteUrl } from './site-url';

export const SITE_NAME = 'Salmon UI';

/** The default Open Graph image (`app/og.png/route.tsx`), shared by every page. */
export const OG_IMAGE = {
  path: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Salmon UI: one React library, from a button to a million-row grid',
} as const;

export type PageKind = 'landing' | 'docs' | 'reference' | 'demo' | 'not-found';

export type PageMetadataInput = {
  /** Page title without the site suffix; for the landing page, the tagline. */
  title: string;
  description: string;
  /** Site path, for example `/docs/data-grid/sorting` (`/` for the landing page). */
  path: string;
  kind: PageKind;
  /**
   * Site path of the page's Markdown version, emitted as `<link rel="alternate" type="text/markdown">`.
   */
  markdownPath?: string;
};

/** `<page title> | Salmon UI`; the landing page is `Salmon UI: <tagline>`. */
export function pageTitle(title: string, kind: PageKind): string {
  return kind === 'landing' ? `${SITE_NAME}: ${title}` : `${title} | ${SITE_NAME}`;
}

export function pageMetadata({ title, description, path, kind, markdownPath }: PageMetadataInput): Metadata {
  const fullTitle = pageTitle(title, kind);
  const url = absoluteUrl(path);
  const image = { url: absoluteUrl(OG_IMAGE.path), width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt, type: 'image/png' };
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: url, ...(markdownPath ? { types: { 'text/markdown': absoluteUrl(markdownPath) } } : {}) },
    ...(kind === 'not-found' || !siteIndexable ? { robots: { index: false } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      type: kind === 'landing' ? 'website' : 'article',
      locale: 'en_US',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
