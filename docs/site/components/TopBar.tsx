import Link from 'next/link';
import { siteRepoUrl } from '../lib/site-config';
import { NavLink } from './NavLink';
import { SearchSlot } from './SearchSlot';
import { SchemeSelect } from './SiteTheme';

/** Top navigation shared by the marketing and docs layouts. */
export function TopBar() {
  return (
    <header className="site-header">
      <Link href="/" className="site-brand">
        Salmon <span>UI</span>
      </Link>
      <nav className="site-topnav" aria-label="Main">
        <NavLink href="/docs" section exclude={['/docs/reference']}>
          Docs
        </NavLink>
        <NavLink href="/docs/reference" section>
          Reference
        </NavLink>
        <NavLink href="/demos" section>
          Demos
        </NavLink>
        {siteRepoUrl ? <a href={siteRepoUrl}>Repository</a> : null}
      </nav>
      <div className="site-header__tools">
        <SearchSlot />
        <SchemeSelect />
      </div>
    </header>
  );
}
