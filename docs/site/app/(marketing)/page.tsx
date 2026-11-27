import Link from 'next/link';
import { Fragment } from 'react';
import { HeroGrid } from '../../components/HeroGrid';
import { JsonLd } from '../../components/JsonLd';
import { formatMetric, loadLandingBaseline } from '../../lib/landing-metrics';
import { renderCodeBlock } from '../../lib/markdown';
import { pageMetadata } from '../../lib/seo';
import { countComponents, DEMOS_PATH, getComponentFamilies } from '../../lib/site';
import { prerelease, siteRepoUrl } from '../../lib/site-config';
import { softwareSourceCodeJsonLd } from '../../lib/structured-data';

// The landing page of the whole library. The hero
// grid is the only client island; every other section is server markup read
// from the catalog, so a new family appears here without editing the page.

const TAGLINE = 'the React 19 component library';

export const metadata = pageMetadata({
  title: TAGLINE,
  description:
    'Salmon UI is a React 19 component library: a virtualized data grid, charts, scheduler and Gantt, pivot table, editors, inputs, navigation and more, server-rendered, themed with five colors and measured against performance budgets.',
  path: '/',
  kind: 'landing',
});

const INSTALL = `# One package per category, for example the buttons
npm install @salmonui/buttons

# More categories as you need them; keep every @salmonui/* package on one version
npm install @salmonui/data-grid @salmonui/charts

# Optional: remote and offline data sources, XLSX and PDF export
npm install @salmonui/data @salmonui/export`;

const QUICK_START = `import '@salmonui/core/styles.css'; // once per app: the theme colors
import '@salmonui/buttons/button/styles.css'; // the family's stylesheet: everything it renders
import { Button } from '@salmonui/buttons/button';

export function SaveButton({ onSave }: { onSave: () => void }) {
  return (
    <Button tone="primary" onClick={onSave}>
      Save
    </Button>
  );
}

// Every family follows the same pattern:
// import { DataGrid } from '@salmonui/data-grid';
// import '@salmonui/data-grid/styles.css';`;

type Feature = { title: string; line: string; href?: string };

const FEATURES: readonly Feature[] = [
  {
    title: 'Import only what you use',
    line: 'Every component family is its own subpath with its own stylesheet, so one import never pulls in another family.',
  },
  {
    title: 'Server rendering first',
    line: 'Next.js App Router and Vite SSR are first-class targets, and a hydration warning is treated as a bug.',
  },
  {
    title: 'Five colors, light and dark',
    line: 'The theme is five semantic color seeds and a color scheme. No token tables, no CSS-in-JS, no Tailwind.',
  },
  {
    title: 'Keyboard and screen readers',
    line: 'Components follow the ARIA Authoring Practices patterns, with full keyboard operation and visible focus.',
  },
  {
    title: 'Performance budgets',
    line: 'Core paths have measured budgets, and a release does not ship when one is missed.',
    href: '/docs/data-grid/performance',
  },
  {
    title: 'Docs for people and agents',
    line: 'Every docs page is also served as Markdown, indexed by llms.txt for AI assistants.',
    href: '/llms.txt',
  },
];

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function LandingPage() {
  const families = getComponentFamilies();
  const componentCount = countComponents(families);
  const componentPages = families.reduce((sum, { docCount }) => sum + docCount, 0);
  const baseline = loadLandingBaseline();
  return (
    <>
      <JsonLd data={softwareSourceCodeJsonLd()} />
      <main className="lp">
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero__copy">
            <p className="lp-hero__product">Salmon UI</p>
            <h1 id="lp-title" className="lp-hero__title">
              One React library, from a button to a million-row grid.
            </h1>
            <p className="lp-hero__pitch">
              {componentCount} components for React 19: data grid, charts, scheduler and Gantt, pivot table, rich text and
              document editors, inputs, navigation and more. Server-rendered, themed with five colors, and checked against performance
              budgets on every change.
            </p>
            <p className="lp-hero__actions">
              <Link href="/docs" className="lp-button lp-button--primary">
                Get started
              </Link>
              <Link href={DEMOS_PATH} className="lp-button">
                Browse demos
              </Link>
            </p>
          </div>
          <div className="lp-wrap lp-wrap--wide">
            <p className="lp-hero__showcase">
              <strong>Data Grid showcase.</strong> 10,000 live rows; load a million with one click.
            </p>
            <HeroGrid />
          </div>
        </section>

        <section className="lp-section lp-wrap" aria-labelledby="lp-components">
          <header className="lp-section__head">
            <h2 id="lp-components">Components</h2>
            <p>
              {componentCount} components in {families.length} categories across {componentPages} docs pages, each with live demos you can open on their own.
            </p>
          </header>
          <ul className="lp-features lp-components">
            {families.map((family) => (
              <li key={family.family} data-family={family.family}>
                <Link href={family.href} className="lp-feature">
                  <span className="lp-feature__title">{family.title}</span>
                  <span className="lp-feature__line">{family.summary}</span>
                </Link>
                <p className="lp-feature__meta">
                  {family.components.length} {family.components.length === 1 ? 'component' : 'components'} · {family.docCount} docs pages ·{' '}
                  {family.demoCount} {family.demoCount === 1 ? 'demo' : 'demos'}
                </p>
                <p className="lp-feature__links">
                  {family.sections.map((section) =>
                    family.sections.length === 1 ? (
                      <Fragment key={section.section}>
                        <Link href={section.docsHref}>Docs</Link>
                        <Link href={section.demosHref}>Demos</Link>
                      </Fragment>
                    ) : (
                      <Fragment key={section.section}>
                        <Link href={section.docsHref}>{section.title} docs</Link>
                        <Link href={section.demosHref}>{section.title} demos</Link>
                      </Fragment>
                    ),
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-wrap" aria-labelledby="lp-features">
          <header className="lp-section__head">
            <h2 id="lp-features">Built the same way, everywhere</h2>
            <p>Every category follows the same rules, so the second component you adopt works like the first.</p>
          </header>
          <ul className="lp-features lp-properties">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                {feature.href ? (
                  feature.href.endsWith('.txt') ? (
                    <a href={feature.href} type="text/plain" className="lp-feature">
                      <span className="lp-feature__title">{feature.title}</span>
                      <span className="lp-feature__line">{feature.line}</span>
                    </a>
                  ) : (
                    <Link href={feature.href} className="lp-feature">
                      <span className="lp-feature__title">{feature.title}</span>
                      <span className="lp-feature__line">{feature.line}</span>
                    </Link>
                  )
                ) : (
                  <div className="lp-feature">
                    <span className="lp-feature__title">{feature.title}</span>
                    <span className="lp-feature__line">{feature.line}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-perf" aria-labelledby="lp-perf">
          <div className="lp-wrap">
            <header className="lp-section__head">
              <h2 id="lp-perf">Data Grid performance, with receipts</h2>
              <p>
                Every Data Grid core path has a budget, and the release does not ship when one is missed. These are the recorded numbers on a
                100,000 row by 100 column fixture.
              </p>
            </header>
            <dl className="lp-metrics">
              {baseline.metrics.map((metric) => (
                <div key={metric.key} className="lp-metric" data-metric={metric.key}>
                  <dt>
                    <span className="lp-metric__label">{metric.label}</span>
                    <span className="lp-metric__detail">{metric.detail}</span>
                  </dt>
                  <dd>
                    <span className="lp-metric__value">{formatMetric(metric.value)}</span>
                    <span className="lp-metric__unit">{metric.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="lp-perf__source">
              Recorded {dateFormat.format(new Date(baseline.date))} on {baseline.machine} with Node {baseline.node}, commit{' '}
              <code>{baseline.sha.slice(0, 7)}</code>. Scroll frames are capped by the 60 Hz display. <Link href="/docs/data-grid/performance">How the budgets are measured</Link>
            </p>
          </div>
        </section>

        <section className="lp-section lp-wrap lp-install" aria-labelledby="lp-install">
          <header className="lp-section__head">
            <h2 id="lp-install">Install and render a component</h2>
            <p>
              One package per category for React 19, all on one version. Import the theme stylesheet once, then each component from its
              own subpath with its stylesheet, which carries everything the component renders.
            </p>
          </header>
          {prerelease ? (
            <p className="lp-note" role="note">
              <strong>Pre-release: not yet published on npm.</strong> The commands below work once v1 is published.
            </p>
          ) : null}
          <div className="lp-install__code">
            <div>
              <h3>Install</h3>
              <div className="lp-code" dangerouslySetInnerHTML={{ __html: renderCodeBlock(INSTALL, 'sh') }} />
            </div>
            <div>
              <h3>Quick start</h3>
              <div className="lp-code" dangerouslySetInnerHTML={{ __html: renderCodeBlock(QUICK_START, 'tsx') }} />
            </div>
          </div>
          <p>
            Next: <Link href="/docs">browse the components</Link>, <Link href="/docs/buttons/button">read the Button guide</Link> or{' '}
            <Link href="/docs/data-grid/appearance">set the theme colors</Link>.
          </p>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <p className="lp-footer__brand">Salmon UI</p>
          <nav aria-label="Footer">
            <ul>
              <li>
                <Link href="/docs">Docs</Link>
              </li>
              <li>
                <Link href="/docs/reference">Reference</Link>
              </li>
              <li>
                <Link href="/demos">Demos</Link>
              </li>
              <li>
                <a href="/llms.txt" type="text/plain">
                  llms.txt
                </a>
              </li>
              {siteRepoUrl ? (
                <li>
                  <a href={siteRepoUrl}>Repository</a>
                </li>
              ) : null}
            </ul>
          </nav>
          <p className="lp-footer__license">Released under the MIT License.</p>
        </div>
      </footer>
    </>
  );
}
