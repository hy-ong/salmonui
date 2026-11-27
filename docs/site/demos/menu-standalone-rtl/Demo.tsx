'use client';

import { useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuSeparator, Submenu } from '@salmonui/buttons/menu';

// A Menu rendered in place (no button), and a MenuButton with a submenu inside
// a right-to-left container: the popup aligns to the inline start (the right
// edge) and the submenu opens to the left.
export default function MenuStandaloneRtlDemo() {
  const [last, setLast] = useState('nothing yet');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>
        <Menu aria-label="Account" onAction={(event) => setLast(event.id)} style={{ minInlineSize: 200 }}>
          <MenuItem id="profile">Profile</MenuItem>
          <MenuItem id="billing">Billing</MenuItem>
          <Submenu label="Theme">
            <MenuItem id="theme-light">Light</MenuItem>
            <MenuItem id="theme-dark">Dark</MenuItem>
          </Submenu>
          <MenuSeparator />
          <MenuItem id="sign-out">Sign out</MenuItem>
        </Menu>
        <div dir="rtl" lang="ar" style={{ flex: '1 1 240px', display: 'flex' }}>
          <MenuButton
            variant="outline"
            onAction={(event) => setLast(event.id)}
            menu={
              <>
                <MenuItem id="ar-new">جديد</MenuItem>
                <MenuItem id="ar-open">فتح</MenuItem>
                <Submenu label="تصدير">
                  <MenuItem id="ar-pdf">PDF</MenuItem>
                  <MenuItem id="ar-csv">CSV</MenuItem>
                </Submenu>
              </>
            }
          >
            ملف
          </MenuButton>
        </div>
      </div>
      <p style={{ margin: 0 }}>
        Last action: <output>{last}</output>
      </p>
    </div>
  );
}
