'use client';

import Link from 'next/link';
import { useState } from 'react';
import { InlineCode } from './InlineCode';

export type DemoBrowserGroup = { category: string; anchor: string; demos: { id: string; href: string; title: string; description: string }[] };

/**
 * `/demos/data-grid` list with a title filter. The list is server-rendered unfiltered
 * (the filter starts empty in both renders); filtering only hides entries.
 */
export function DemoBrowser({ groups }: { groups: readonly DemoBrowserGroup[] }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (title: string) => needle === '' || title.toLowerCase().includes(needle);
  const visible = groups.map((group) => ({ ...group, demos: group.demos.filter((demo) => matches(demo.title)) }));
  const count = visible.reduce((n, group) => n + group.demos.length, 0);
  return (
    <div className="demo-browser">
      <label className="demo-browser__filter">
        <span>Filter demos by title</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <p className="demo-browser__count" aria-live="polite">
        {count} {count === 1 ? 'demo' : 'demos'}
      </p>
      {visible.map((group) =>
        group.demos.length === 0 ? null : (
          <section key={group.category} className="home-section" aria-labelledby={group.anchor}>
            <h2 id={group.anchor}>{group.category}</h2>
            <ul className="home-cards">
              {group.demos.map((demo) => (
                <li key={demo.id}>
                  <Link href={demo.href}>{demo.title}</Link>
                  <p>
                    <InlineCode text={demo.description} />
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
