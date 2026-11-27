'use client';
import { useState } from 'react';
import { Breadcrumbs, BreadcrumbItem, type BreadcrumbsOverflow } from '@salmonui/navigation/breadcrumbs';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';

// Placeholder links target this demo's own title, which exists on both the
// docs page and the demo page, so no link dangles in the static export.
const DEMO_ANCHOR = '#demo-breadcrumbs-overflow-title';

const PATH = ['Home', 'Products', 'Electronics', 'Computers', 'Laptops', 'Gaming', 'Model X'];
const MODES: BreadcrumbsOverflow[] = ['menu', 'expand', 'wrap', 'scroll', 'none'];
const MAX_ITEMS = [{ value: 0, label: 'unset (measured)' }, ...[2, 3, 4].map((n) => ({ value: n, label: String(n) }))];

export default function BreadcrumbsOverflowDemo() {
  const [overflow, setOverflow] = useState<BreadcrumbsOverflow>('menu');
  const [maxItems, setMaxItems] = useState(0);
  const [width, setWidth] = useState(360);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          overflow
          <Select aria-label="overflow" data={MODES} value={overflow} onValueChange={(value) => value != null && setOverflow(value as BreadcrumbsOverflow)} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          maxItems
          <Select aria-label="maxItems" data={MAX_ITEMS} value={maxItems} onValueChange={(value) => value != null && setMaxItems(Number(value))} />
        </label>
        <Slider label={`width: ${width}px`} min={160} max={720} value={width} onValueChange={setWidth} style={{ inlineSize: 200 }} />
      </div>
      <div style={{ inlineSize: width, maxInlineSize: 'calc(100% - 18px)', padding: 8, border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)' }}>
        <Breadcrumbs key={`${overflow}-${maxItems}`} overflow={overflow} maxItems={maxItems || undefined} onItemClick={(event) => event.preventDefault()}>
          {PATH.map((label, i) => (
            <BreadcrumbItem key={label} href={i < PATH.length - 1 ? DEMO_ANCHOR : undefined}>
              {label}
            </BreadcrumbItem>
          ))}
        </Breadcrumbs>
      </div>
    </div>
  );
}
