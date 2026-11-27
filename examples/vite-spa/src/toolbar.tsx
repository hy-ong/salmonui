// Toolbar browser page (tests/browser/toolbar.spec.ts, toolbar-a11y.spec.ts):
//
//   ?dir=rtl        renders the page right-to-left
//   ?width=<px>     width of the #main and #priority toolbars (default 640)
//   ?mode=hydrate   server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//   ?scheme=dark    dark color scheme (ThemeProvider)
//
// Every callback appends to window.__events; window.__setWidth(px) resizes
// #main and #priority; window.__commits counts React commits inside #main (Profiler);
// window.__block = true makes #main's onKeyDown call preventDefault() on ArrowRight.
import { Profiler, StrictMode, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { MenuButton } from '@salmonui/buttons/menu';
import { ThemeProvider } from '@salmonui/core/theme';
import { Toolbar, ToolbarGroup, ToolbarItem, ToolbarSeparator, ToolbarSpacer } from '@salmonui/navigation/toolbar';

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const initialWidth = Number(params.get('width') ?? 640);

const win = window as unknown as {
  __events: unknown[];
  __setWidth?: (px: number) => void;
  __commits: number;
  __block?: boolean;
};
win.__events = [];
win.__commits = 0;
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d={d} />
  </svg>
);

function Main({ width }: { width: number }) {
  const [bold, setBold] = useState(false);
  return (
    <Toolbar
      id="main"
      aria-label="Formatting"
      style={{ width }}
      onKeyDown={(event) => {
        log('keydown', event.key);
        if (win.__block && event.key === 'ArrowRight') event.preventDefault();
      }}
    >
      <ToggleButton id="bold" aria-label="Bold" iconOnly pressed={bold} onPressedChange={(next) => (setBold(next), log('bold', next))}>
        {icon('M4 3h5a3 3 0 0 1 0 6H4zM4 9h6a3 3 0 0 1 0 6H4z')}
      </ToggleButton>
      <Button id="italic" onClick={() => log('click', 'italic')}>
        Italic
      </Button>
      <ToolbarSeparator />
      <ToolbarItem label="Find" overflow="never">
        <input id="find" aria-label="Find" defaultValue="abc" size={8} />
      </ToolbarItem>
      <Button id="cut" onClick={() => log('click', 'cut')}>
        Cut
      </Button>
      <Button id="copy" disabled onClick={() => log('click', 'copy')}>
        Copy
      </Button>
      <ToolbarItem label="Paste special" icon={icon('M3 3h10v10H3z')}>
        <Button id="paste" onClick={() => log('click', 'paste')}>
          Paste
        </Button>
      </ToolbarItem>
      <ToolbarSeparator />
      <Button id="undo" title="Undo the last change" onClick={() => log('click', 'undo')}>
        Undo
      </Button>
      <Button id="redo" onClick={() => log('click', 'redo')}>
        Redo
      </Button>
      <ToolbarItem overflow="always">
        <Button id="settings" onClick={() => log('click', 'settings')}>
          Settings
        </Button>
      </ToolbarItem>
    </Toolbar>
  );
}

function Page() {
  const [width, setWidth] = useState(initialWidth);
  win.__setWidth = setWidth;
  return (
    <ThemeProvider
      theme={{
        colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light',
      }}
    >
      <div dir={dir} data-salmon-a11y-root="">
        <header id="app-bar" className="salmon-app-bar" data-sticky="" data-tone="primary">
          <Toolbar aria-label="Application" overflow="wrap">
            <Button id="app-home" variant="ghost">
              Home
            </Button>
            <ToolbarSpacer />
            <ToolbarItem overflow="never">
              <input id="app-search" aria-label="Search" placeholder="Search" />
            </ToolbarItem>
          </Toolbar>
        </header>
        <footer id="app-bar-bottom" className="salmon-app-bar" data-position="bottom">
          <Toolbar aria-label="Bottom bar" overflow="wrap">
            <Button id="app-b">Action</Button>
          </Toolbar>
        </footer>
        <main style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 900 }}>
          <button id="before" type="button">
            Before
          </button>
          <Profiler id="main" onRender={() => void win.__commits++}>
            <Main width={width} />
          </Profiler>
          <button id="after" type="button">
            After
          </button>
          <Toolbar id="priority" aria-label="Priority" style={{ width: Math.min(width, 400) }}>
            <ToolbarItem overflowPriority={1}>
              <Button id="p-a">Alpha</Button>
            </ToolbarItem>
            <Button id="p-b">Bravo</Button>
            <ToolbarItem overflowPriority={5}>
              <Button id="p-c">Charlie</Button>
            </ToolbarItem>
            <Button id="p-d">Delta</Button>
            <Button id="p-e">Echo</Button>
          </Toolbar>
          <Toolbar id="scroll" aria-label="Scrolling" overflow="scroll" scrollStep={80} style={{ width: 260 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <Button key={i} id={`s-${i}`}>
                Item {i}
              </Button>
            ))}
          </Toolbar>
          <Toolbar id="wrap" aria-label="Wrapping" overflow="wrap" style={{ width: 260 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <Button key={i} id={`w-${i}`}>
                Item {i}
              </Button>
            ))}
          </Toolbar>
          <Toolbar id="vertical" aria-label="Vertical" orientation="vertical" overflow="wrap" style={{ width: 120 }}>
            <Button id="v-a">Top</Button>
            <ToolbarSeparator />
            <Button id="v-b">Middle</Button>
            <Button id="v-c">Bottom</Button>
          </Toolbar>
          <Toolbar id="aligned" aria-label="Aligned" overflow="wrap" style={{ width: 600 }}>
            <ToolbarGroup aria-label="Start">
              <Button id="a-start">Start</Button>
            </ToolbarGroup>
            <ToolbarGroup align="center">
              <Button id="a-center">Center</Button>
            </ToolbarGroup>
            <ToolbarGroup align="end">
              <MenuButton id="a-menu" items={[{ id: 'one', label: 'One' }]}>
                Options
              </MenuButton>
            </ToolbarGroup>
          </Toolbar>
          <Toolbar id="disabled" aria-label="Disabled" disabled>
            <Button id="d-a">One</Button>
            <Button id="d-b">Two</Button>
          </Toolbar>
        </main>
      </div>
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
