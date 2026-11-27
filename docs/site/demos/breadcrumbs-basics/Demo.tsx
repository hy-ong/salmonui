'use client';
import { useState } from 'react';
import { Breadcrumbs, BreadcrumbItem, type BreadcrumbItemRenderProps } from '@salmonui/navigation/breadcrumbs';

const HOME = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1 1 7h2v7h4v-4h2v4h4V7h2z" />
  </svg>
);

/** Stands in for a router link (Next `Link`, React Router `Link`). */
function Link(props: BreadcrumbItemRenderProps & { to: string }) {
  const { to, ...rest } = props;
  return <a {...rest} href={to} />;
}

export default function BreadcrumbsBasicsDemo() {
  const [last, setLast] = useState('nothing yet');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Breadcrumbs
        onItemClick={(event) => {
          // Navigate with the application's router instead of the browser.
          event.preventDefault();
          setLast(`${event.href} (${event.source}${event.menu ? ', menu' : ''})`);
        }}
      >
        <BreadcrumbItem href="/" icon={HOME}>
          Home
        </BreadcrumbItem>
        <BreadcrumbItem href="/docs" render={(p) => <Link {...p} to="/docs" />}>
          Docs
        </BreadcrumbItem>
        <BreadcrumbItem href="/docs/navigation" disabled>
          Navigation
        </BreadcrumbItem>
        <BreadcrumbItem>Breadcrumbs</BreadcrumbItem>
      </Breadcrumbs>
      <Breadcrumbs separator="/" currentNavigable onItemClick={(event) => event.preventDefault()}>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/docs">Docs</BreadcrumbItem>
        <BreadcrumbItem href="/docs/navigation">Navigation</BreadcrumbItem>
      </Breadcrumbs>
      <Breadcrumbs disabled aria-label="Disabled breadcrumb">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/archive">Archive</BreadcrumbItem>
        <BreadcrumbItem>2025</BreadcrumbItem>
      </Breadcrumbs>
      <p>Last click: {last}</p>
    </div>
  );
}
