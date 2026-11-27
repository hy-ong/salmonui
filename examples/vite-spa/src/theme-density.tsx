// Theme density browser page (tests/browser/theme-density.spec.ts):
// the same controls in a default ThemeProvider scope and a `density: 'compact'`
// scope, side by side. Each scope root carries `data-density-scope`.
//
//   ?dir=rtl   right-to-left
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/buttons/tag-group/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import '@salmonui/inputs/number-field/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/calendars/time-picker/styles.css';
import '@salmonui/navigation/tabs/styles.css';
import '@salmonui/navigation/tree-view/styles.css';
import '@salmonui/navigation/pager/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/navigation/sidebar-layout/styles.css';
import { Button } from '@salmonui/buttons/button';
import { Menu, MenuItem } from '@salmonui/buttons/menu';
import { Tag, TagGroup } from '@salmonui/buttons/tag-group';
import { ThemeProvider } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';
import type { SalmonThemeInput } from '@salmonui/core/theme';
import { TextField } from '@salmonui/inputs/text-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { TreeView } from '@salmonui/navigation/tree-view';
import { Pager } from '@salmonui/navigation/pager';
import { Toolbar } from '@salmonui/navigation/toolbar';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';

declare global {
  interface Window {
    __density?: { ready: boolean };
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

const SIZES = ['sm', 'md', 'lg'] as const;
const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'kiwi', label: 'Kiwi' },
  { value: 'pear', label: 'Pear' },
];
interface Folder {
  readonly id: string;
  readonly name: string;
  readonly children?: readonly Folder[];
}
const FOLDERS: readonly Folder[] = [
  { id: 'docs', name: 'Documents', children: [{ id: 'cv', name: 'CV.pdf' }] },
  { id: 'pics', name: 'Pictures' },
];

const EXPANDED = ['docs'];
const THEMES: Record<'default' | 'compact', SalmonThemeInput> = { default: {}, compact: { density: 'compact' } };

function Scope({ name }: { name: 'default' | 'compact' }) {
  const theme = THEMES[name];
  const label = (text: string) => `${text} (${name})`;
  return (
    <ThemeProvider theme={theme}>
      <ThemeStyle theme={theme} />
      <section data-density-scope={name} aria-label={label('Controls')} style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{name}</h2>
        <div data-part="buttons" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {SIZES.map((size) => (
            <Button key={size} size={size}>
              {`Button ${size}`}
            </Button>
          ))}
        </div>
        <div data-part="text-fields" style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          {SIZES.map((size) => (
            <TextField key={size} size={size} label={label(`Text ${size}`)} defaultValue="Text" />
          ))}
        </div>
        <div data-part="selects" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {SIZES.map((size) => (
            <Select key={size} size={size} aria-label={label(`Select ${size}`)} data={FRUITS} defaultValue="kiwi" />
          ))}
        </div>
        <div data-part="fields" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <NumberField label={label('Number')} defaultValue={12} />
          <Combobox aria-label={label('Combobox')} data={FRUITS} defaultValue="kiwi" />
          <DatePicker label={label('Date')} defaultValue="2026-11-26" />
          <TimePicker label={label('Time')} defaultValue="10:30" />
        </div>
        <Tabs defaultValue="one">
          <TabList aria-label={label('Tabs')}>
            <Tab value="one">One</Tab>
            <Tab value="two">Two</Tab>
          </TabList>
          <TabPanel value="one">Panel one</TabPanel>
          <TabPanel value="two">Panel two</TabPanel>
        </Tabs>
        <Menu aria-label={label('Menu')}>
          <MenuItem id={`${name}-open`}>Open</MenuItem>
          <MenuItem id={`${name}-save`}>Save</MenuItem>
        </Menu>
        <TreeView<Folder> aria-label={label('Files')} data={FOLDERS} getItemId={(f) => f.id} getItemLabel={(f) => f.name} getChildren={(f) => f.children} expanded={EXPANDED} />
        <Pager aria-label={label('Pages')} totalCount={100} />
        <Toolbar aria-label={label('Formatting')}>
          <Button>Cut</Button>
          <Button>Copy</Button>
        </Toolbar>
        <TagGroup aria-label={label('Tags')}>
          <Tag value="alpha">Alpha</Tag>
          <Tag value="beta">Beta</Tag>
        </TagGroup>
        <SidebarLayout style={{ blockSize: 120, border: '1px solid var(--salmon-border-subtle)' }}>
          <SidebarPanel aria-label={label('Sidebar')}>Sidebar</SidebarPanel>
          <SidebarMain>
            <SidebarTrigger />
          </SidebarMain>
        </SidebarLayout>
      </section>
    </ThemeProvider>
  );
}

function App() {
  return (
    <main dir={dir} data-salmon-a11y-root="" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: 24 }}>
      <h1 style={{ gridColumn: '1 / -1', margin: 0, fontSize: 20 }}>Theme density</h1>
      <Scope name="default" />
      <Scope name="compact" />
    </main>
  );
}

document.documentElement.dir = dir;
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
window.__density = { ready: true };
