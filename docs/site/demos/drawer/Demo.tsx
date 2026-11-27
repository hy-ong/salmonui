'use client';
import { Button } from '@salmonui/buttons/button';
import { Drawer } from '@salmonui/overlays/drawer';

// Placeholder links target this demo's own title, which exists on both the
// docs page and the demo page, so no link dangles in the static export.
const DEMO_ANCHOR = '#demo-drawer-title';

const links = ['Orders', 'Customers', 'Products', 'Reports'];

export default function DrawerDemo() {
  return (
    <Drawer trigger={<Drawer.Trigger render={(p) => <Button {...p}>Menu</Button>} />} side="start" size={280} title="Navigation" closeButton>
      <Drawer.Body>
        <nav aria-label="Main">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {links.map((label) => (
              <li key={label}>
                <a href={DEMO_ANCHOR} style={{ display: 'block', paddingBlock: 6 }}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer.Body>
    </Drawer>
  );
}
