import Link from 'next/link';
import { pageMetadata } from '../lib/seo';

// The 404 page,
// exported as `404.html`: `noindex`, never in the sitemap.
export const metadata = pageMetadata({
  title: 'Page not found',
  description: 'This Salmon UI page does not exist. Browse the documentation, the demos or search the docs.',
  path: '/404',
  kind: 'not-found',
});

export default function NotFound() {
  return (
    <main className="site-main not-found">
      <h1>Page not found</h1>
      <p className="doc__lede">The page you asked for does not exist or has moved.</p>
      <ul>
        <li>
          <Link href="/docs">Browse the documentation</Link>
        </li>
        <li>
          <Link href="/demos">Browse every demo</Link>
        </li>
        <li>
          Search the docs with the search button in the top bar (Ctrl+K or Cmd+K).
        </li>
      </ul>
    </main>
  );
}
