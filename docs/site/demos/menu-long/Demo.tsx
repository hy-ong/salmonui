'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MenuButton, type MenuItemData } from '@salmonui/buttons/menu';
import { Select } from '@salmonui/dropdowns/select';

const SIZES = [100, 1000] as const;
const SIZE_OPTIONS = SIZES.map((n) => ({ value: String(n), label: n.toLocaleString('en-US') }));

function makeItems(count: number): MenuItemData[] {
  return Array.from({ length: count }, (_, index) => ({ id: `customer-${index + 1}`, label: `Customer ${String(index + 1).padStart(4, '0')}` }));
}

// A menu that is not virtualized: 100 or 1,000 items, with the time from the
// open request to the first frame that shows the menu.
export default function MenuLongDemo() {
  const [size, setSize] = useState<(typeof SIZES)[number]>(1000);
  const items = useMemo(() => makeItems(size), [size]);
  const [open, setOpen] = useState(false);
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [last, setLast] = useState('nothing yet');
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!open || started.current === null) return;
    const begin = started.current;
    started.current = null;
    const frame = requestAnimationFrame(() => setOpenMs(performance.now() - begin));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Items{' '}
          <Select aria-label="Items" data={SIZE_OPTIONS} value={String(size)} onValueChange={(value) => value != null && setSize(Number(value) as (typeof SIZES)[number])} />
        </label>
        <MenuButton
          items={items}
          open={open}
          onOpenChange={(next) => {
            if (next) started.current = performance.now();
            setOpen(next);
          }}
          onAction={(event) => setLast(event.id)}
          styles={{ menu: { maxBlockSize: 320, overflowY: 'auto' } }}
        >
          Assign to customer
        </MenuButton>
      </div>
      <p>
        Open to first frame: <output>{openMs === null ? 'open the menu' : `${openMs.toFixed(1)} ms`}</output>
      </p>
      <p>
        Chosen: <output>{last}</output>
      </p>
    </div>
  );
}
