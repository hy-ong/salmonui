'use client';
import { useState, useSyncExternalStore } from 'react';
import { BreadcrumbItem, Breadcrumbs, type BreadcrumbItemRenderProps } from '@salmonui/navigation/breadcrumbs';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Pager } from '@salmonui/navigation/pager';
import { Select } from '@salmonui/dropdowns/select';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';

// Placeholder links target this demo's own title (no dangling links in the static export).
const DEMO_ANCHOR = '#demo-navigation-common-title';

const HOME = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1 1 7h2v7h4v-4h2v4h4V7h2z" />
  </svg>
);

const TEXT = {
  en: {
    breadcrumbs: { label: 'Breadcrumb' },
    tabs: { scrollBackward: 'Scroll tabs backward', scrollForward: 'Scroll tabs forward' },
    pager: { label: 'Pagination', nextPage: 'Next page', previousPage: 'Previous page', pagerInfo: '{page} of {pageCount} pages' },
    crumbs: ['Home', 'Reports', 'Sales'],
    tabNames: ['Overview', 'Regions', 'Products', 'Channels', 'Forecast', 'Returns', 'Archive'],
    showing: 'Showing page',
  },
  de: {
    breadcrumbs: { label: 'Brotkrumen' },
    tabs: { scrollBackward: 'Tabs zurück blättern', scrollForward: 'Tabs vor blättern' },
    pager: { label: 'Seitennavigation', nextPage: 'Nächste Seite', previousPage: 'Vorherige Seite', pagerInfo: 'Seite {page} von {pageCount}' },
    crumbs: ['Start', 'Berichte', 'Umsatz'],
    tabNames: ['Übersicht', 'Regionen', 'Produkte', 'Kanäle', 'Prognose', 'Retouren', 'Archiv'],
    showing: 'Seite',
  },
} as const;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];

const noopSubscribe = () => () => {};

/** Stands in for a router link: `render` hands over the computed props. */
function RouterLink(props: BreadcrumbItemRenderProps) {
  return <a {...props} data-router-link="" />;
}

export default function NavigationCommonDemo() {
  const [rtl, setRtl] = useState(false);
  const [lang, setLang] = useState<'en' | 'de'>('en');
  // Server snapshot false, client snapshot true: flips right after hydration, no mismatch.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const t = TEXT[lang];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
        <label>
          Language{' '}
          <Select aria-label="Language" data={LANGUAGES} value={lang} onValueChange={(value) => value != null && setLang(value as 'en' | 'de')} />
        </label>
        <span>
          Render: <output>{hydrated ? 'server HTML, hydrated' : 'server HTML'}</output>
        </span>
      </div>
      {/* The components switch direction and language; the demo controls stay left to right. */}
      <div dir={rtl ? 'rtl' : 'ltr'} lang={lang} style={{ display: 'grid', gap: 16 }}>
        <Breadcrumbs
          localeText={t.breadcrumbs}
          className="demo-crumbs"
          style={{ fontSize: 14 }}
          data-section="reports"
          onItemClick={(event) => event.preventDefault()}
        >
          <BreadcrumbItem href={DEMO_ANCHOR} icon={HOME}>
            {t.crumbs[0]}
          </BreadcrumbItem>
          <BreadcrumbItem href={DEMO_ANCHOR} render={(props) => <RouterLink {...props} />}>
            {t.crumbs[1]}
          </BreadcrumbItem>
          <BreadcrumbItem>{t.crumbs[2]}</BreadcrumbItem>
        </Breadcrumbs>
        <div style={{ maxWidth: 380 }}>
          <Tabs defaultValue="t0" localeText={t.tabs}>
            <TabList aria-label={t.crumbs[2]}>
              {t.tabNames.map((name, index) => (
                <Tab key={index} value={`t${index}`}>
                  {name}
                </Tab>
              ))}
            </TabList>
            {t.tabNames.map((name, index) => (
              <TabPanel key={index} value={`t${index}`}>
                {name}
              </TabPanel>
            ))}
          </Tabs>
        </div>
        <Pager
          totalCount={240}
          defaultPage={3}
          locale={lang}
          localeText={t.pager}
          renderInfo={(ctx) => (
            <span>
              {t.showing} <strong>{ctx.page}</strong> / {ctx.pageCount}
            </span>
          )}
        />
      </div>
    </div>
  );
}
