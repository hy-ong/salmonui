'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

const TABS = ['Preview', 'Source', 'Notes'] as const;
type Tab = (typeof TABS)[number];

/**
 * Preview / Source / Notes tabs of a demo page.
 * Every panel is server-rendered and always mounted; inactive panels are
 * hidden with the `hidden` attribute, so demo state survives a tab switch.
 * Preview is the default in server markup and after hydration.
 */
export function DemoTabs({ preview, source, notes }: { preview: ReactNode; source: ReactNode; notes: ReactNode }) {
  const [active, setActive] = useState<Tab>('Preview');
  const base = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const panels: Record<Tab, ReactNode> = { Preview: preview, Source: source, Notes: notes };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(active);
    const next =
      event.key === 'ArrowRight' ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? TABS.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(TABS[next]!);
    tabs.current[next]?.focus();
  };

  return (
    <div className="demo-tabs">
      <div role="tablist" aria-label="Demo views" className="demo-tabs__list" onKeyDown={onKeyDown}>
        {TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab}`}
            aria-controls={`${base}-panel-${tab}`}
            aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab}
          role="tabpanel"
          id={`${base}-panel-${tab}`}
          aria-labelledby={`${base}-tab-${tab}`}
          className={`demo-tabs__panel demo-tabs__panel--${tab.toLowerCase()}`}
          hidden={active !== tab}
        >
          {panels[tab]}
        </div>
      ))}
    </div>
  );
}
