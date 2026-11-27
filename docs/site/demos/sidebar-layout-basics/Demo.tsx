'use client';
import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';

// Placeholder links target this demo's own title, which exists on both the
// docs page and the demo page, so no link dangles in the static export.
const DEMO_ANCHOR = '#demo-sidebar-layout-basics-title';

const glyph = (d: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path d={d} />
  </svg>
);
const links = [
  { label: 'Inbox', icon: glyph('M1.75 9.5 3.5 3h9l1.75 6.5v3.5H1.75zM1.75 9.5h3.5l1 1.5h3.5l1-1.5h3.5') },
  { label: 'Drafts', icon: glyph('M10.5 2.5l3 3-7.5 7.5H3v-3zM8.5 4.5l3 3') },
  { label: 'Sent', icon: glyph('M14.25 1.75 7 9M14.25 1.75 9.75 14.25 7 9 1.75 6.25z') },
  { label: 'Archive', icon: glyph('M1.75 2.75h12.5v3H1.75zM2.75 5.75v7.5h10.5v-7.5M6.25 8.5h3.5') },
];

export default function SidebarLayoutBasicsDemo() {
  const [keepOpen, setKeepOpen] = useState(false);
  const [last, setLast] = useState('nothing yet');
  const [rail, setRail] = useState(false);
  return (
    <SidebarLayout
      collapseBelow={640}
      size="14rem"
      style={{ blockSize: 320, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
      onCollapsedChange={(collapsed) => setRail(collapsed)}
      onBeforeOpenChange={(event) => {
        if (keepOpen && !event.open) event.preventDefault();
      }}
      onOpenChange={(open, event) => setLast(`${open ? 'opened' : 'closed'} (${event.reason}, ${event.source})`)}
    >
      <SidebarPanel navigation aria-label="Mail folders">
        <ul style={{ display: 'grid', gap: 2, listStyle: 'none', margin: 0, padding: 8 }}>
          {links.map((link, index) => (
            <li key={link.label}>
              <a
                href={DEMO_ANCHOR}
                aria-current={index === 0 ? 'page' : undefined}
                aria-label={rail ? link.label : undefined}
                title={rail ? link.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minBlockSize: 32,
                  paddingInline: 12,
                  borderRadius: 'var(--salmon-radius-sm)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textDecoration: 'none',
                  color: index === 0 ? 'var(--salmon-color-primary-text)' : 'var(--salmon-text-primary)',
                  background: index === 0 ? 'var(--salmon-surface-selected)' : undefined,
                }}
              >
                {link.icon}
                {/* The icon rail keeps only the icons. */}
                {rail ? null : link.label}
              </a>
            </li>
          ))}
        </ul>
      </SidebarPanel>
      <SidebarMain style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SidebarTrigger />
          <SidebarTrigger action="collapse" />
          <Checkbox checked={keepOpen} onCheckedChange={(checked) => setKeepOpen(checked)}>
            Keep open
          </Checkbox>
        </div>
        <p className="demo-status">Last change: {last}</p>
      </SidebarMain>
    </SidebarLayout>
  );
}
