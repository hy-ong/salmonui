// ContextMenu and Menubar browser page (tests/browser/menubar*.spec.ts, context-menu.spec.ts):
//
//   ?dir=rtl            right-to-left
//   ?scheme=dark        dark color scheme
//   ?submenuOpen=click  submenus (and menubar hover switching) need a click
//   ?hoverDelay=<ms>    hover intent of submenus
//   ?n=<count>          items of the #long context menu (default 200)
//   ?mode=hydrate       renderToString, then hydrateRoot (window.__ssrHtml, __hydrated)
//
// Every callback appends to window.__events. window.__ctx(open, x?, y?) drives
// the controlled #controlled-target context menu; window.__bar(value) drives
// the controlled #bar-controlled menubar.
import { StrictMode, useRef, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/menu/styles.css';
import { ThemeProvider } from '@salmonui/core/theme';
import { ContextMenu, Menu, MenuCheckboxItem, MenuItem, MenuSeparator, Menubar, MenubarItem, MenubarMenu, Submenu, type ContextMenuPoint, type MenuItemData, type MenuSubmenuOpen } from '@salmonui/buttons/menu';

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const submenuOpen = (params.get('submenuOpen') ?? 'hover') as MenuSubmenuOpen;
const hoverDelay = params.has('hoverDelay') ? Number(params.get('hoverDelay')) : undefined;
const count = Number(params.get('n') ?? 200);

const win = window as unknown as { __events: unknown[][]; __ctx?: (open: boolean, x?: number, y?: number) => void; __bar?: (value: string | null) => void };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const longItems: MenuItemData[] = Array.from({ length: count }, (_, i) => ({ id: `l${i}`, label: `Line ${i}` }));

function CanvasMenu() {
  // Items per target: the handler records which shape was right-clicked.
  const [shape, setShape] = useState<string | null>(null);
  return (
    <ContextMenu
      id="canvas"
      tabIndex={0}
      role="group"
      aria-label="Canvas"
      className="demo-canvas"
      style={{ inlineSize: 360, blockSize: 160, border: '1px dashed var(--salmon-border-default)', padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}
      submenuOpen={submenuOpen}
      {...(hoverDelay !== undefined ? { hoverDelay } : {})}
      onBeforeOpen={(event) => {
        log('beforeOpen', (event.target as HTMLElement).id || event.target.tagName.toLowerCase(), event.source, Math.round(event.point.x) > 0, Math.round(event.point.y) > 0);
        if (event.target.closest('[data-native]')) {
          event.preventDefault();
          return;
        }
        setShape(event.target.closest('[data-shape]')?.getAttribute('data-shape') ?? null);
      }}
      onBeforeClose={(event) => {
        log('beforeClose', event.reason, event.source);
        if (event.reason === 'action' && params.has('vetoClose')) event.preventDefault();
      }}
      onOpenChange={(open, event) => log('open', open, event.reason, event.source)}
      onAction={(event) => log('action', event.id, event.source)}
      menu={
        <Menu aria-label="Canvas actions">
          {shape ? (
            <MenuItem id={`delete-${shape}`}>
              Delete {shape}
            </MenuItem>
          ) : null}
          <MenuItem id="cut">Cut</MenuItem>
          <MenuItem id="copy" icon={<span>©</span>}>
            <span className="custom-label">Copy</span> <kbd>Ctrl+C</kbd>
          </MenuItem>
          <MenuItem id="disabled" disabled>
            Paste
          </MenuItem>
          <MenuItem id="docs" href="#docs">
            Docs
          </MenuItem>
          <MenuSeparator />
          <Submenu label="Arrange" id="arrange">
            <MenuItem id="front">Bring to front</MenuItem>
            <MenuItem id="back">Send to back</MenuItem>
          </Submenu>
        </Menu>
      }
    >
      <button type="button" id="shape-a" data-shape="circle">
        Circle
      </button>
      <button type="button" id="shape-b" data-shape="square">
        Square
      </button>
      <span id="native" data-native="">
        Native
      </span>
    </ContextMenu>
  );
}

function ExternalTarget() {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div id="external" ref={ref} tabIndex={0} style={{ inlineSize: 200, padding: 12, border: '1px solid var(--salmon-border-default)' }}>
        External target
      </div>
      <ContextMenu targetRef={ref} items={[{ id: 'ext-1', label: 'External one' }, { id: 'ext-2', label: 'External two' }]} onAction={(event) => log('external', event.id)} />
    </>
  );
}

function ControlledContextMenu() {
  const [state, setState] = useState<{ open: boolean; point?: ContextMenuPoint }>({ open: false });
  win.__ctx = (open, x, y) => setState(open ? { open, ...(x !== undefined && y !== undefined ? { point: { x, y } } : {}) } : { open });
  return (
    <ContextMenu
      id="controlled-target"
      tabIndex={0}
      style={{ inlineSize: 200, padding: 12, border: '1px solid var(--salmon-border-default)' }}
      open={state.open}
      {...(state.point ? { anchorPoint: state.point } : {})}
      onOpenChange={(open, event) => {
        log('controlled', open, event.reason);
        setState((s) => ({ ...s, open }));
      }}
      items={[{ id: 'c1', label: 'Controlled one' }]}
    >
      Controlled target
    </ContextMenu>
  );
}

function ControlledMenubar() {
  const [value, setValue] = useState<string | null>(null);
  win.__bar = setValue;
  return (
    <Menubar id="bar-controlled" aria-label="Controlled" value={value} onValueChange={(next, event) => (log('bar-controlled', next, event.reason), setValue(next))}>
      <MenubarMenu value="one" label="One">
        <Menu>
          <MenuItem id="one-a">One A</MenuItem>
        </Menu>
      </MenubarMenu>
      <MenubarMenu value="two" label="Two">
        <MenuItem id="two-a">Two A</MenuItem>
      </MenubarMenu>
    </Menubar>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={dir} data-salmon-a11y-root="" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start', minHeight: '100vh', boxSizing: 'border-box', background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <button id="before" type="button">
          Before
        </button>
        <Menubar
          id="bar"
          aria-label="Editor"
          submenuOpen={submenuOpen}
          {...(hoverDelay !== undefined ? { hoverDelay } : {})}
          onValueChange={(value, event) => log('value', value, event.reason, event.source)}
          onBeforeValueChange={(event) => {
            if (event.value === 'locked') {
              log('vetoed', event.value, event.previousValue);
              event.preventDefault();
            }
          }}
          onAction={(event) => log('bar-action', event.id, event.source)}
        >
          <MenubarMenu value="file" label="File" id="m-file">
            <Menu onAction={(event) => log('file-action', event.id)}>
              <MenuItem id="new">New</MenuItem>
              <MenuItem id="open">Open…</MenuItem>
              <Submenu label="Recent" id="recent">
                <MenuItem id="recent-a">a.txt</MenuItem>
                <MenuItem id="recent-b">b.txt</MenuItem>
              </Submenu>
              <MenuSeparator />
              <MenuItem id="quit">Quit</MenuItem>
            </Menu>
          </MenubarMenu>
          <MenubarMenu value="edit" label={<em>Edit</em>} textValue="Edit" id="m-edit" icon={<span>✎</span>}>
            <Menu>
              <MenuItem id="undo">Undo</MenuItem>
              <MenuItem id="redo">Redo</MenuItem>
            </Menu>
          </MenubarMenu>
          <MenubarMenu value="view" label="View" id="m-view">
            <MenuCheckboxItem id="wrap">Word wrap</MenuCheckboxItem>
            <MenuItem id="zoom">Zoom</MenuItem>
          </MenubarMenu>
          <MenubarMenu value="locked" label="Locked" id="m-locked">
            <MenuItem id="never">Never</MenuItem>
          </MenubarMenu>
          <MenubarMenu value="off" label="Disabled" id="m-off" disabled>
            <MenuItem id="off-a">Off</MenuItem>
          </MenubarMenu>
          <MenubarItem id="save" onAction={(event) => log('save', event.source)}>
            Save
          </MenubarItem>
          <MenubarItem id="help" href="#help">
            Help
          </MenubarItem>
        </Menubar>
        <button id="after" type="button">
          After
        </button>
        <div style={{ inlineSize: 220 }}>
          <Menubar id="bar-scroll" aria-label="Scrolling" overflow="scroll">
            {['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'].map((label) => (
              <MenubarMenu key={label} value={label.toLowerCase()} label={label} id={`s-${label.toLowerCase()}`}>
                <MenuItem id={`${label.toLowerCase()}-1`}>{label} 1</MenuItem>
              </MenubarMenu>
            ))}
          </Menubar>
        </div>
        <ControlledMenubar />
        <CanvasMenu />
        <ExternalTarget />
        <ControlledContextMenu />
        <ContextMenu id="long" tabIndex={0} style={{ inlineSize: 200, padding: 12, border: '1px solid var(--salmon-border-default)' }} items={longItems} onAction={(event) => log('long', event.id)}>
          Long menu target
        </ContextMenu>
      </main>
    </ThemeProvider>
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
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
