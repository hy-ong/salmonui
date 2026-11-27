'use client';
import { useRef, useState, type ReactNode } from 'react';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { ColorPicker } from '@salmonui/inputs/color-picker';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { MenuButton, SplitButton } from '@salmonui/buttons/menu';
import { Listbox } from '@salmonui/dropdowns/listbox';
import { Popover } from '@salmonui/overlays/popover';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { Toolbar, ToolbarGroup, ToolbarItem, type ToolbarItemSize } from '@salmonui/navigation/toolbar';
import { Tooltip, type TooltipTriggerProps } from '@salmonui/overlays/tooltip';

const GALLERY = ['Normal', 'Title', 'Heading 1', 'Heading 2', 'Quote', 'Code'].map((label) => ({ value: label.toLowerCase().replace(' ', '-'), label }));

// A ribbon (/docs/navigation/ribbon): Tabs whose panels each hold a
// Toolbar of labelled groups. Commands are multi-size ToolbarItems; the
// classic layout allows lg, md and sm, the simplified layout only sm.

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  paste: icon('M5 2h6v2H5zM3 4h10v10H3z'),
  cut: icon('M4 4l8 8M12 4l-8 8'),
  copy: icon('M5 5h8v8H5zM3 11V3h8'),
  find: icon('M7 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8M10 10l4 4'),
  table: icon('M2 3h12v10H2zM2 7h12M6 3v10'),
  picture: icon('M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3'),
  bold: icon('M4 3h5a3 3 0 0 1 0 6H4zM4 9h6a3 3 0 0 1 0 6H4z'),
  launch: icon('M6 10l6-6M8 4h4v4'),
};

type Layout = 'classic' | 'simplified';
const SIZES: Record<Layout, readonly ToolbarItemSize[]> = { classic: ['lg', 'md', 'sm'], simplified: ['sm'] };

interface Command {
  readonly id: string;
  readonly label: string;
  readonly glyph: ReactNode;
  readonly tip?: string;
  readonly priority?: number;
}

/**
 * One command as a multi-size ToolbarItem. Called as a function (not as a
 * component), so the ToolbarItem is a direct child of its ToolbarGroup.
 */
function command(c: Command, sizes: readonly ToolbarItemSize[], run: (id: string) => void) {
  const button = (size: ToolbarItemSize, trigger?: TooltipTriggerProps) =>
    size === 'sm' ? (
      <Button {...trigger} variant="ghost" iconOnly aria-label={c.label} onClick={() => run(c.id)}>
        {c.glyph}
      </Button>
    ) : (
      <Button {...trigger} variant="ghost" size={size === 'lg' ? 'md' : 'sm'} iconStart={c.glyph} onClick={() => run(c.id)}>
        {c.label}
      </Button>
    );
  return (
    <ToolbarItem key={c.id} label={c.label} icon={c.glyph} sizes={sizes} overflowPriority={c.priority}>
      {(size) =>
        c.tip ? (
          <Tooltip
            content={
              <span>
                <strong>{c.label}</strong>
                <br />
                {c.tip}
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

export default function RibbonRecipeDemo() {
  const [tab, setTab] = useState('home');
  const [layout, setLayout] = useState<Layout>('classic');
  const [collapsed, setCollapsed] = useState(false);
  const [popup, setPopup] = useState(false);
  const [tableSelected, setTableSelected] = useState(false);
  const [width, setWidth] = useState(900);
  const [last, setLast] = useState('nothing yet');
  const frame = useRef<HTMLDivElement>(null);
  const sizes = SIZES[layout];
  const run = (id: string) => setLast(id);
  // A contextual tab that disappears takes the selection back to Home.
  const current = tab === 'table' && !tableSelected ? 'home' : tab;

  const panel = (value: string): ReactNode => {
    if (value === 'insert')
      return (
        <Toolbar aria-label="Insert commands">
          <ToolbarGroup label="Tables">{command({ id: 'table', label: 'Table', glyph: ICONS.table }, layout === 'classic' ? ['lg', 'sm'] : ['sm'], run)}</ToolbarGroup>
          <ToolbarGroup label="Illustrations">
            {command({ id: 'picture', label: 'Picture', glyph: ICONS.picture, tip: 'Insert a picture from this device.' }, layout === 'classic' ? ['lg', 'sm'] : ['sm'], run)}
            <ToolbarItem overflow="never">
              <Combobox aria-label="Shape" data={['Circle', 'Square', 'Arrow']} placeholder="Shape" />
            </ToolbarItem>
          </ToolbarGroup>
        </Toolbar>
      );
    if (value === 'table')
      return (
        <Toolbar aria-label="Table design commands">
          <ToolbarGroup label="Table style options">
            <ToolbarItem label="Header row">
              <Checkbox defaultChecked>Header row</Checkbox>
            </ToolbarItem>
            <ToolbarItem label="Banded rows">
              <Checkbox>Banded rows</Checkbox>
            </ToolbarItem>
          </ToolbarGroup>
        </Toolbar>
      );
    return (
      <Toolbar aria-label="Home commands">
        <ToolbarGroup
          label="Clipboard"
          action={
            <Button variant="ghost" iconOnly aria-label="Clipboard options" onClick={() => run('clipboard options')}>
              {ICONS.launch}
            </Button>
          }
        >
          {command({ id: 'paste', label: 'Paste', glyph: ICONS.paste, tip: 'Add content from the clipboard.', priority: 3 }, sizes, run)}
          {command({ id: 'cut', label: 'Cut', glyph: ICONS.cut, tip: 'Remove the selection and put it on the clipboard.', priority: 1 }, sizes, run)}
          {command({ id: 'copy', label: 'Copy', glyph: ICONS.copy, tip: 'Put a copy of the selection on the clipboard.', priority: 1 }, sizes, run)}
        </ToolbarGroup>
        <ToolbarGroup label="Font">
          <ToolbarItem overflow="never">
            <Select aria-label="Font" data={['Inter', 'Georgia', 'Menlo']} defaultValue="Inter" />
          </ToolbarItem>
          <ToolbarItem overflow="never">
            <ToggleButtonGroup aria-label="Text style" selectionMode="multiple" name="style">
              <ToggleButton value="bold" iconOnly aria-label="Bold">
                {ICONS.bold}
              </ToggleButton>
              <ToggleButton value="italic" iconOnly aria-label="Italic">
                <em>I</em>
              </ToggleButton>
            </ToggleButtonGroup>
          </ToolbarItem>
          <ToolbarItem overflow="never">
            <ColorPicker aria-label="Font color" defaultValue="#c2410c" />
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarGroup label="Styles">
          <ToolbarItem overflow="never">
            {/* Gallery: a Listbox grid of tiles in a Popover. */}
            <Popover placement="bottomStart">
              <Popover.Trigger render={(props) => <Button {...props} variant="ghost" />}>Styles</Popover.Trigger>
              <Popover.Content aria-label="Style gallery">
                <Listbox aria-label="Styles" layout="grid" columns={3} data={GALLERY} onValueChange={(value) => run(`style:${String(value)}`)} styles={{ option: { blockSize: 48 } }} />
              </Popover.Content>
            </Popover>
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarGroup label="Editing">
          {command({ id: 'find', label: 'Find', glyph: ICONS.find }, sizes, run)}
          <ToolbarItem label="Replace">
            <SplitButton variant="ghost" items={[{ id: 'replace-all', label: 'Replace all' }]} onClick={() => run('replace')} onAction={(event) => run(event.id)}>
              Replace
            </SplitButton>
          </ToolbarItem>
        </ToolbarGroup>
      </Toolbar>
    );
  };

  const tabs = ['home', 'insert', ...(tableSelected ? ['table'] : [])];
  return (
    <div>
      <div className="demo-toolbar">
        {/* Inline like the checkbox, so the row's controls share one axis. */}
        <label>
          Width
          <Slider min={240} max={1100} value={width} onValueChange={setWidth} style={{ inlineSize: 240 }} />
        </label>
        <Checkbox checked={tableSelected} onCheckedChange={(checked) => setTableSelected(checked)}>
          A table is selected (contextual tab)
        </Checkbox>
      </div>
      <div ref={frame} style={{ inlineSize: width, maxInlineSize: '100%', border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)' }}>
        <Tabs
          value={current}
          onValueChange={(next) => {
            setTab(next);
            if (collapsed) setPopup(true);
          }}
          panelMount="active"
        >
          {/* The tab row: the File menu before the TabList, layout switches after it (the help pane slot). */}
          <div style={{ gridArea: 'list', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingInline: 4 }}>
            <MenuButton
              variant="ghost"
              style={{ flex: 'none' }}
              items={[
                { id: 'new', label: 'New' },
                { id: 'open', label: 'Open…' },
                { id: 'save', label: 'Save' },
              ]}
              onAction={(event) => run(`file: ${event.id}`)}
            >
              File
            </MenuButton>
            <TabList aria-label="Ribbon tabs" style={{ flex: '1 1 auto' }}>
              {tabs.map((value) => (
                <Tab key={value} value={value} onClick={() => collapsed && setPopup(true)}>
                  {value === 'home' ? 'Home' : value === 'insert' ? 'Insert' : 'Table Design'}
                </Tab>
              ))}
            </TabList>
            <Button variant="ghost" style={{ flex: 'none' }} aria-pressed={layout === 'simplified'} onClick={() => setLayout(layout === 'classic' ? 'simplified' : 'classic')}>
              Simplified
            </Button>
            <Button
              variant="ghost"
              style={{ flex: 'none' }}
              aria-pressed={collapsed}
              onClick={() => {
                setCollapsed(!collapsed);
                setPopup(false);
              }}
            >
              Collapse
            </Button>
          </div>
          {tabs.map((value) => (
            <TabPanel key={value} value={value} tabIndex={-1} style={collapsed ? { display: 'none' } : {}}>
              {collapsed ? null : panel(value)}
            </TabPanel>
          ))}
        </Tabs>
        {/* Minimized: the selected tab's commands open in a Popover under the tab row. */}
        <Popover open={collapsed && popup} onOpenChange={setPopup} anchor={frame} placement="bottomStart">
          <Popover.Content aria-label="Ribbon commands" style={{ inlineSize: width, maxInlineSize: '100vw' }}>
            {panel(current)}
          </Popover.Content>
        </Popover>
      </div>
      <p className="demo-status">Last command: {last}</p>
    </div>
  );
}
