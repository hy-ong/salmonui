'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { SidebarMenu, type SidebarMenuEntry } from '@salmonui/navigation/sidebar-menu';

// Placeholder links target this demo's own title (no dangling links in the static export).
const DEMO_ANCHOR = '#demo-sidebar-menu-nested-title';

const count = (n: number) => <span style={{ minInlineSize: 20, paddingInline: 6, borderRadius: 999, background: 'var(--salmon-color-primary-subtle)', color: 'var(--salmon-color-primary-text)', textAlign: 'center' }}>{n}</span>;

const ITEMS: SidebarMenuEntry[] = [
  { id: 'inbox', label: 'Inbox', href: DEMO_ANCHOR, badge: count(4) },
  {
    id: 'projects',
    label: 'Projects',
    children: [
      {
        id: 'web',
        label: 'Website',
        children: [
          { id: 'web-roadmap', label: 'Roadmap', href: DEMO_ANCHOR },
          { id: 'web-issues', label: 'Issues', href: DEMO_ANCHOR, badge: count(12) },
        ],
      },
      {
        id: 'mobile',
        label: 'Mobile app',
        children: [
          { id: 'mobile-releases', label: 'Releases', href: DEMO_ANCHOR },
          { id: 'mobile-crashes', label: 'Crash reports', href: DEMO_ANCHOR },
        ],
      },
      { id: 'archive', label: 'Archive', href: DEMO_ANCHOR, disabled: true },
    ],
  },
  { id: 'reports', label: 'Reports', children: [{ id: 'weekly', label: 'Weekly', href: DEMO_ANCHOR }, { id: 'quarterly', label: 'Quarterly', href: DEMO_ANCHOR }] },
  { id: 'sign-out', label: 'Sign out' },
];

const ALL = ['projects', 'web', 'mobile', 'reports'];

export default function SidebarMenuNestedDemo() {
  const [expanded, setExpanded] = useState<readonly string[]>(['projects', 'web']);
  const [log, setLog] = useState<string[]>([]);
  const push = (line: string) => setLog((l) => [line, ...l].slice(0, 5));
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ inlineSize: 240, border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)', background: 'var(--salmon-surface-raised)' }}>
        <SidebarMenu
          aria-label="Projects"
          items={ITEMS}
          defaultSelected="web-issues"
          expanded={expanded}
          onExpandedChange={(ids, event) => {
            setExpanded(ids);
            push(`${event.expanded ? 'opened' : 'closed'} ${event.id} (${event.source})`);
          }}
          onSelectedChange={(id, event) => push(`selected ${id} (${event.source})`)}
        />
      </div>
      <div className="demo-stack">
        <div className="demo-toolbar">
          <Button onClick={() => setExpanded(ALL)}>Expand all</Button>
          <Button onClick={() => setExpanded([])}>Collapse all</Button>
        </div>
        <ul className="demo-log" aria-live="polite">
          {log.length ? log.map((line, i) => <li key={i}>{line}</li>) : <li>No events yet</li>}
        </ul>
      </div>
    </div>
  );
}
