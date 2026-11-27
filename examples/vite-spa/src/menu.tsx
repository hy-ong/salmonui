// Menu family browser page (tests/browser/menu.spec.ts, menu-perf.spec.ts):
//
//   ?n=<count>          the #perf MenuButton gets <count> items (default 100)
//   ?dir=rtl            renders the page right-to-left
//   ?placement=<p>      placement of the #main MenuButton
//   ?mode=hydrate       server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//   ?defaultOpen        the #default-open MenuButton starts open
//   ?warnings           development warnings: children with items, controlled switch
//   ?mode=plain         no StrictMode (timing runs)
//
// Every callback appends to window.__events; window.__setOpen(bool) drives
// the controlled #controlled MenuButton (its onOpenChange only records).
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import { Button, ButtonGroup } from '@salmonui/buttons/button';
import { Menu, MenuButton, MenuCheckboxItem, MenuGroup, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, SplitButton, Submenu, type MenuItemData, type MenuPlacement } from '@salmonui/buttons/menu';

const params = new URLSearchParams(location.search);
const count = Number(params.get('n') ?? 100);
const placement = (params.get('placement') ?? 'bottom-start') as MenuPlacement;
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

const win = window as unknown as { __events: unknown[]; __setOpen?: (open: boolean) => void };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const perfItems: MenuItemData[] = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, label: `${['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'][i % 5]} ${i}` }));
const dataItems: MenuItemData[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'copy', label: 'Copy' },
  { type: 'separator' },
  { id: 'share', label: 'Share', items: [{ id: 'mail', label: 'Mail' }, { id: 'chat', label: 'Chat' }] },
];

function Controlled() {
  const [open, setOpen] = useState(false);
  win.__setOpen = setOpen;
  return (
    <MenuButton id="controlled" open={open} onOpenChange={(next, event) => log('controlled', next, event.reason, event.source)} items={dataItems}>
      Controlled
    </MenuButton>
  );
}

// ?warnings: both menu children and `items`, and a MenuButton whose `open` switches from uncontrolled to controlled.
function Warnings() {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  return (
    <>
      <Menu aria-label="Both" items={[{ id: 'from-items', label: 'From items' }]}>
        <MenuItem id="from-children">From children</MenuItem>
      </Menu>
      <MenuButton id="switch" open={open} items={dataItems}>
        Switch
      </MenuButton>
      <button id="make-controlled" type="button" onClick={() => setOpen(false)}>
        Make controlled
      </button>
    </>
  );
}

function Page() {
  return (
    <div dir={dir} style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start', minHeight: '100vh', boxSizing: 'border-box', background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <button id="before" type="button">
          Before
        </button>
        <MenuButton
          id="main"
          placement={placement}
          onOpenChange={(open, event) => log('open', open, event.reason, event.source)}
          onAction={(event) => {
            log('action', event.id, event.source);
            if (event.id === 'keep') event.preventDefault();
          }}
          menu={
            <>
              <MenuItem id="new">New file</MenuItem>
              <MenuItem id="open" onAction={(event) => log('item-action', event.id)}>
                Open…
              </MenuItem>
              <MenuItem id="disabled" disabled>
                Delete
              </MenuItem>
              <MenuItem id="keep">Keep open</MenuItem>
              <MenuItem id="link" href="#linked">
                Link
              </MenuItem>
              <MenuSeparator />
              <Submenu label="Export" id="export">
                <MenuItem id="pdf">PDF</MenuItem>
                <MenuItem id="csv">CSV</MenuItem>
                <Submenu label="More formats">
                  <MenuItem id="xml">XML</MenuItem>
                </Submenu>
              </Submenu>
              <MenuGroup label="View">
                <MenuCheckboxItem id="wrap" onCheckedChange={(checked, event) => log('checked', checked, event.source)}>
                  Word wrap
                </MenuCheckboxItem>
                <MenuRadioGroup label="Zoom" defaultValue="100" onValueChange={(value, event) => log('value', value, event.source)}>
                  <MenuRadioItem value="50">50%</MenuRadioItem>
                  <MenuRadioItem value="100">100%</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
              <MenuItem id="zebra">Zebra</MenuItem>
            </>
          }
        >
          File
        </MenuButton>
        <button id="after" type="button">
          After
        </button>
      </div>
      <MenuButton id="perf" items={perfItems} onAction={(event) => log('perf', event.id)}>
        Perf menu
      </MenuButton>
      <MenuButton id="all-disabled" menu={<MenuItem id="x" disabled>Nothing</MenuItem>}>
        All disabled
      </MenuButton>
      <Controlled />
      <SplitButton id="save" onClick={() => log('primary')} items={dataItems} onAction={(event) => log('split', event.id)}>
        Save
      </SplitButton>
      <MenuButton id="default-open" defaultOpen={params.has('defaultOpen')} items={[{ id: 'd1', label: 'Default open item' }]}>
        Default open
      </MenuButton>
      <ButtonGroup id="row-group" aria-label="Row actions" variant="outline">
        <Button id="row-first">Edit</Button>
        <MenuButton id="row-menu" items={dataItems}>
          More
        </MenuButton>
        <SplitButton id="row-split" items={dataItems}>
          Share
        </SplitButton>
      </ButtonGroup>
      <ButtonGroup id="column-group" aria-label="Column actions" orientation="vertical" style={{ width: 220 }}>
        <Button id="column-first">Copy</Button>
        <SplitButton id="column-split" items={dataItems}>
          Paste
        </SplitButton>
        <Button id="column-last">Delete</Button>
      </ButtonGroup>
      {params.has('warnings') ? <Warnings /> : null}
      <Menu id="standalone" aria-label="Standalone" onAction={(event) => log('standalone', event.id)}>
        <MenuItem id="s1">One</MenuItem>
        <MenuItem id="s2">Two</MenuItem>
      </Menu>
    </div>
  );
}

const root = document.getElementById('root');
const mode = params.get('mode');
if (root && mode === 'hydrate') {
  const html = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  (window as unknown as { __ssrHtml: string }).__ssrHtml = html;
  root.innerHTML = html;
  hydrateRoot(
    root,
    <StrictMode>
      <Page />
    </StrictMode>,
    { onRecoverableError: (error) => console.error('recoverable', error) },
  );
  requestAnimationFrame(() => ((window as unknown as { __hydrated: boolean }).__hydrated = true));
} else if (root) {
  createRoot(root).render(
    mode === 'plain' ? (
      <Page />
    ) : (
      <StrictMode>
        <Page />
      </StrictMode>
    ),
  );
}
