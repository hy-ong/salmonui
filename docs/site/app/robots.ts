import type { MetadataRoute } from 'next';
import { siteIndexable } from '../lib/site-config';
import { absoluteUrl } from '../lib/site-url';

// Allow all and point to the sitemap;
// preview builds (`SITE_INDEXABLE=0`) disallow everything.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  if (!siteIndexable) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' }, sitemap: absoluteUrl('/sitemap.xml') };
}
