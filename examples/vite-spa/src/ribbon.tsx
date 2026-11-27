// Ribbon recipe browser page (tests/browser/ribbon.spec.ts):
// Tabs whose panels hold a Toolbar of labelled groups with multi-size items,
// a group launcher, a File MenuButton before the TabList, a contextual tab,
// the classic / simplified layout switch, minimize with a Popover, item
// tooltips and other Salmon controls as items.
//
//   ?width=<px>     width of the ribbon (default 1000)
//   ?mode=hydrate   server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//   ?dir=rtl
//
// Every callback appends to window.__events; window.__setWidth(px) resizes the ribbon.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/dropdowns/listbox/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/inputs/checkbox/styles.css';
import '@salmonui/inputs/color-picker/styles.css';
import '@salmonui/navigation/tabs/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/overlays/popover/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { ColorPicker } from '@salmonui/inputs/color-picker';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { MenuButton, SplitButton } from '@salmonui/buttons/menu';
import { Listbox } from '@salmonui/dropdowns/listbox';
import { Popover } from '@salmonui/overlays/popover';
import { Select } from '@salmonui/dropdowns/select';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { Toolbar, ToolbarGroup, ToolbarItem, type ToolbarItemSize } from '@salmonui/navigation/toolbar';
import { Tooltip, type TooltipTriggerProps } from '@salmonui/overlays/tooltip';

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const initialWidth = Number(params.get('width') ?? 1000);

const win = window as unknown as {
  __events: unknown[];
  __setWidth?: (px: number) => void;
};
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);
const GALLERY = ['Normal', 'Title', 'Heading 1', 'Heading 2', 'Quote', 'Code'].map((label) => ({ value: label.toLowerCase().replace(' ', '-'), label }));

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PASTE = icon('M5 2h6v2H5zM3 4h10v10H3z');
const CUT = icon('M4 4l8 8M12 4l-8 8');
const COPY = icon('M5 5h8v8H5zM3 3h8');
const BOLD = icon('M4 3h5a3 3 0 0 1 0 6H4zM4 9h6a3 3 0 0 1 0 6H4z');
const TABLE = icon('M2 3h12v10H2zM2 7h12M6 3v10');
const PICTURE = icon('M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3');
const LAUNCH = icon('M6 10l6-6M8 4h4v4');

type Layout = 'classic' | 'simplified';

interface ActionProps {
  readonly id: string;
  readonly label: string;
  readonly glyph: ReactNode;
  readonly sizes: readonly ToolbarItemSize[];
  readonly priority?: number;
  readonly tip?: string;
}

/**
 * A ribbon command: large (icon over label), medium (icon and label) or small
 * (icon only, named by aria-label). Called as a function, so the ToolbarItem
 * is a direct child of its ToolbarGroup (a component child would be wrapped
 * in a second, measured item).
 */
function action(props: ActionProps) {
  const { id, label, glyph, sizes, priority, tip } = props;
  // `trigger`: the Tooltip's trigger props (its `render` form keeps the Button a direct child of the item).
  const button = (size: ToolbarItemSize, trigger?: TooltipTriggerProps) =>
    size === 'sm' ? (
      <Button {...trigger} id={id} variant="ghost" size="sm" iconOnly aria-label={label} onClick={() => log('click', id)}>
        {glyph}
      </Button>
    ) : (
      // 'lg': the toolbar stacks the icon over the label; 'md': icon and label in a row at the small button size.
      <Button {...trigger} id={id} variant="ghost" size={size === 'lg' ? 'md' : 'sm'} iconStart={glyph} onClick={() => log('click', id)}>
        {label}
      </Button>
    );
  return (
    <ToolbarItem key={id} label={label} icon={glyph} sizes={sizes} overflowPriority={priority}>
      {(size) =>
        tip ? (
          <Tooltip
            content={
              <span id={`${id}-tip`}>
                <strong>{label}</strong>
                <br />
                {tip}
              </span>
            }
            render={(trigger) => button(size, trigger)}
          />
        ) : (
          button(size)
        )
      }
    </ToolbarItem>
  );
}

function HomeToolbar(props: { readonly layout: Layout; readonly id: string }) {
  const sizes: readonly ToolbarItemSize[] = props.layout === 'classic' ? ['lg', 'md', 'sm'] : ['sm'];
  return (
    <Toolbar id={props.id} aria-label="Home commands">
      <ToolbarGroup
        label="Clipboard"
        action={
          <Button id={`${props.id}-launch`} variant="ghost" size="sm" iconOnly aria-label="Clipboard options" onClick={() => log('launch', 'clipboard')}>
            {LAUNCH}
          </Button>
        }
      >
        {action({
          id: `${props.id}-paste`,
          label: 'Paste',
          glyph: PASTE,
          sizes,
          priority: 3,
          tip: 'Add content from the clipboard.',
        })}
        {action({
          id: `${props.id}-cut`,
          label: 'Cut',
          glyph: CUT,
          sizes,
          priority: 1,
        })}
        {action({
          id: `${props.id}-copy`,
          label: 'Copy',
          glyph: COPY,
          sizes,
          priority: 1,
        })}
      </ToolbarGroup>
      <ToolbarGroup label="Font">
        <ToolbarItem overflow="never">
          <Select id={`${props.id}-font`} aria-label="Font" data={['Inter', 'Serif', 'Mono']} defaultValue="Inter" />
        </ToolbarItem>
        <ToolbarItem overflow="never">
          <ToggleButtonGroup aria-label="Text style" selectionMode="multiple" name="style">
            <ToggleButton value="bold" iconOnly aria-label="Bold">
              {BOLD}
            </ToggleButton>
            <ToggleButton value="italic">I</ToggleButton>
          </ToggleButtonGroup>
        </ToolbarItem>
        <ToolbarItem overflow="never">
          <ColorPicker aria-label="Font color" defaultValue="#c2410c" />
        </ToolbarItem>
      </ToolbarGroup>
      <ToolbarGroup label="Editing">
        {action({
          id: `${props.id}-find`,
          label: 'Find',
          glyph: icon('M7 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M10 10l4 4'),
          sizes: sizes,
        })}
        <ToolbarItem label="Replace">
          <SplitButton id={`${props.id}-replace`} variant="ghost" items={[{ id: 'all', label: 'Replace all' }]} onClick={() => log('click', 'replace')}>
            Replace
          </SplitButton>
        </ToolbarItem>
        <ToolbarItem label="Track changes">
          <Checkbox id={`${props.id}-track`}>Track</Checkbox>
        </ToolbarItem>
      </ToolbarGroup>
    </Toolbar>
  );
}

function Ribbon() {
  const [width, setWidth] = useState(initialWidth);
  win.__setWidth = setWidth;
  const [tab, setTab] = useState('home');
  const [layout, setLayout] = useState<Layout>('classic');
  const [collapsed, setCollapsed] = useState(false);
  const [popup, setPopup] = useState(false);
  const [tableSelected, setTableSelected] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const current = tableSelected || tab !== 'table' ? tab : 'home';

  const panel = (value: string, id: string): ReactNode =>
    value === 'home' ? (
      <HomeToolbar layout={layout} id={id} />
    ) : value === 'insert' ? (
      <Toolbar id={`${id}-insert`} aria-label="Insert commands">
        <ToolbarGroup label="Tables">
          {action({
            id: `${id}-table`,
            label: 'Table',
            glyph: TABLE,
            sizes: layout === 'classic' ? ['lg', 'sm'] : ['sm'],
          })}
        </ToolbarGroup>
        <ToolbarGroup label="Illustrations">
          {action({
            id: `${id}-picture`,
            label: 'Picture',
            glyph: PICTURE,
            sizes: layout === 'classic' ? ['lg', 'sm'] : ['sm'],
          })}
          <ToolbarItem overflow="never">
            <Combobox id={`${id}-shape`} aria-label="Shape" data={['Circle', 'Square', 'Arrow']} />
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarGroup label="Gallery">
          <ToolbarItem overflow="never">
            {/* Gallery: a Listbox grid of tiles in a Popover launched from the item. */}
            <Popover placement="bottomStart">
              <Popover.Trigger render={(props) => <Button {...props} id={`${id}-gallery`} variant="ghost" />}>Styles</Popover.Trigger>
              <Popover.Content aria-label="Style gallery">
                <Listbox
                  id={`${id}-gallery-list`}
                  aria-label="Styles"
                  layout="grid"
                  columns={3}
                  data={GALLERY}
                  onValueChange={(value) => log('gallery', value)}
                  styles={{ option: { blockSize: 48 } }}
                />
              </Popover.Content>
            </Popover>
          </ToolbarItem>
        </ToolbarGroup>
      </Toolbar>
    ) : (
      <Toolbar id={`${id}-table-design`} aria-label="Table design commands">
        <ToolbarGroup label="Styles">
          <Button id={`${id}-banded`}>Banded rows</Button>
        </ToolbarGroup>
      </Toolbar>
    );

  return (
    <div dir={dir} data-salmon-a11y-root="" style={{ padding: 16 }}>
      <button id="before" type="button">
        Before
      </button>
      <label style={{ marginInlineStart: 8 }}>
        <input id="table-selected" type="checkbox" checked={tableSelected} onChange={(event) => setTableSelected(event.target.checked)} /> Table selected
      </label>
      <div
        id="ribbon"
        ref={bar}
        style={{
          inlineSize: width,
          maxInlineSize: '100%',
          border: '1px solid var(--salmon-border-subtle)',
        }}
      >
        <Tabs
          value={current}
          onValueChange={(next) => {
            log('tab', next);
            setTab(next);
            if (collapsed) setPopup(true);
          }}
          panelMount="active"
        >
          <div
            style={{
              gridArea: 'list',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <MenuButton
              id="file"
              variant="ghost"
              items={[
                { id: 'new', label: 'New' },
                { id: 'open', label: 'Open' },
                { id: 'save', label: 'Save' },
              ]}
              onAction={(event) => log('file', event.id)}
            >
              File
            </MenuButton>
            <TabList aria-label="Ribbon tabs" style={{ flex: '1 1 auto' }}>
              <Tab value="home" onClick={() => collapsed && setPopup(true)}>
                Home
              </Tab>
              <Tab value="insert" onClick={() => collapsed && setPopup(true)}>
                Insert
              </Tab>
              {tableSelected ? (
                <Tab value="table" onClick={() => collapsed && setPopup(true)}>
                  Table Design
                </Tab>
              ) : null}
            </TabList>
            <Button id="layout" variant="ghost" size="sm" aria-pressed={layout === 'simplified'} onClick={() => setLayout(layout === 'classic' ? 'simplified' : 'classic')}>
              Simplified
            </Button>
            <Button
              id="collapse"
              variant="ghost"
              size="sm"
              aria-pressed={collapsed}
              onClick={() => {
                setCollapsed(!collapsed);
                setPopup(false);
              }}
            >
              Collapse
            </Button>
          </div>
          {['home', 'insert', ...(tableSelected ? ['table'] : [])].map((value) => (
            <TabPanel key={value} value={value} tabIndex={-1} style={collapsed ? { display: 'none' } : {}}>
              {collapsed ? null : panel(value, 'rb')}
            </TabPanel>
          ))}
        </Tabs>
        <Popover open={collapsed && popup} onOpenChange={(open) => setPopup(open)} anchor={bar} placement="bottomStart">
          <Popover.Content className="ribbon-popup" aria-label="Ribbon commands" style={{ inlineSize: width }}>
            {panel(current, 'pop')}
          </Popover.Content>
        </Popover>
      </div>
      <button id="after" type="button">
        After
      </button>
    </div>
  );
}

const root = document.getElementById('root');
const mode = params.get('mode');
if (root && mode === 'hydrate') {
  const html = renderToString(
    <StrictMode>
      <Ribbon />
    </StrictMode>,
  );
  (window as unknown as { __ssrHtml: string }).__ssrHtml = html;
  root.innerHTML = html;
  hydrateRoot(
    root,
    <StrictMode>
      <Ribbon />
    </StrictMode>,
    { onRecoverableError: (error) => console.error('recoverable', error) },
  );
  requestAnimationFrame(() => ((window as unknown as { __hydrated: boolean }).__hydrated = true));
} else if (root) {
  createRoot(root).render(
    <StrictMode>
      <Ribbon />
    </StrictMode>,
  );
}
