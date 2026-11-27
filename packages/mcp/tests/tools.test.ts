// The five tools over the fixture index.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SalmonTools } from '@salmonui/mcp';
import { fixtureIndex } from './fixture.ts';

const tools = new SalmonTools(fixtureIndex());
const run = (name: string, args: Record<string, unknown>) => {
  const result = tools.call(name, args);
  return { text: result.content.map((c) => c.text).join('\n'), isError: result.isError === true };
};

describe('list_components', () => {
  it('lists every package with family specifiers, stylesheets and components', () => {
    const { text } = run('list_components', {});
    assert.match(text, /## @salmonui\/buttons/);
    assert.match(text, /- `@salmonui\/buttons\/menu`: Menus and menu buttons\./);
    assert.match(text, /components Menu, MenuButton; css `@salmonui\/buttons\/menu\/styles\.css`/);
    assert.match(text, /`@salmonui\/data-grid` \(also `@salmonui\/data-grid\/features`\)/);
    assert.match(text, /hooks useDataGrid/);
    assert.match(text, /Entries: `@salmonui\/core\/theme`/);
    assert.match(text, /Import `@salmonui\/core\/styles\.css` once/);
  });

  it('filters by package or word', () => {
    const grid = run('list_components', { filter: 'grid' }).text;
    assert.match(grid, /@salmonui\/data-grid/);
    assert.doesNotMatch(grid, /@salmonui\/buttons/);
    const menu = run('list_components', { filter: 'menubutton' }).text;
    assert.match(menu, /@salmonui\/buttons\/menu/);
    assert.doesNotMatch(menu, /@salmonui\/buttons\/button`/);
    assert.match(run('list_components', { filter: 'zzz' }).text, /No package or family matches/);
  });
});

describe('search_docs', () => {
  it('returns the best page with its URL and matching section', () => {
    const { text } = run('search_docs', { query: 'cell edit validation' });
    assert.match(text, /^# Editing\nhttps:\/\/salmonui\.dev\/docs\/data-grid\/editing/);
    assert.match(text, /## Validation \(https:\/\/salmonui\.dev\/docs\/data-grid\/editing#validation\)/);
  });

  it('honors the limit and reports no match', () => {
    assert.equal(run('search_docs', { query: 'button theme editing', limit: 2 }).text.match(/^# /gm)?.length, 2);
    assert.match(run('search_docs', { query: 'qwertyuiop' }).text, /No docs page matches/);
  });

  it('finds identifiers by their camelCase parts', () => {
    assert.match(run('search_docs', { query: 'repeat while held' }).text, /^# Button/);
    assert.match(run('search_docs', { query: 'colorScheme dark' }).text, /^# Theming/);
  });
});

describe('get_component', () => {
  it('describes a component with its import, stylesheets, props, defaults, events and docs', () => {
    const { text } = run('get_component', { name: 'Button' });
    assert.match(text, /^# Button \(component\)/);
    assert.match(text, /import '@salmonui\/core\/styles\.css'; \/\/ once, in the app root\nimport '@salmonui\/buttons\/button\/styles\.css';\nimport \{ Button \} from '@salmonui\/buttons\/button';/);
    // ButtonProps is an alias: its members come from the interfaces it names.
    assert.match(text, /## Props \(ButtonProps: ButtonBaseProps\)/);
    assert.match(text, /- `variant\?: 'solid' \| 'outline' \| undefined` \(default `'solid'`\): Visual weight\./);
    assert.match(text, /## Events\n- `onRepeat\?:/);
    assert.match(text, /- Button: https:\/\/salmonui\.dev\/docs\/buttons\/button/);
    assert.match(text, /API reference: https:\/\/salmonui\.dev\/docs\/reference\/buttons\/button/);
  });

  it('marks deprecated and lists events of a generic component', () => {
    const { text } = run('get_component', { name: 'DataGrid' });
    assert.match(text, /## Props \(DataGridProps\)/);
    assert.match(text, /`legacyMode\?: boolean` \*\*deprecated\*\*/);
    assert.match(text, /## Events\n- `onCellEdit\?: \(event: CellEditEvent<Row>\) => void`: After a cell edit commits\./);
  });

  it('describes a hook with its returned object', () => {
    const { text } = run('get_component', { name: 'useDataGrid' });
    assert.match(text, /^# useDataGrid \(function\)/);
    assert.match(text, /Returns: The grid API\./);
    assert.match(text, /## Returns \(DataGridApi\)\n- `refresh: \(\) => void`: Reloads the rows\./);
  });

  it('describes a type with import type and every exporting entry', () => {
    const { text } = run('get_component', { name: 'ColumnDef' });
    assert.match(text, /import type \{ ColumnDef \} from '@salmonui\/data-grid';/);
    assert.match(text, /Also exported by `@salmonui\/data-grid\/engine`\./);
    assert.match(text, /## Members \(ColumnDef\)\n- `field: string`/);
  });

  it('describes a function with its parameters', () => {
    assert.match(run('get_component', { name: 'sortRows' }).text, /Parameters:\n- `rows`: The rows\./);
  });

  it('describes a family by slug or specifier', () => {
    for (const name of ['menu', '@salmonui/buttons/menu']) {
      const { text } = run('get_component', { name });
      assert.match(text, /^# @salmonui\/buttons\/menu \(family `menu` of @salmonui\/buttons\)/);
      assert.match(text, /## Components\n- `Menu`: A menu list\.\n- `MenuButton`/);
      assert.match(text, /## Menu \(component\)/);
      assert.match(text, /## Props \(MenuProps\)\n- `items: readonly MenuItemData\[\]`/);
    }
  });

  it('is case-insensitive and suggests close names', () => {
    assert.match(run('get_component', { name: 'datagrid' }).text, /^# DataGrid \(component\)/);
    const miss = run('get_component', { name: 'Buton' });
    assert.equal(miss.isError, true);
    assert.match(miss.text, /Closest: `Button`/);
  });
});

describe('get_example', () => {
  it('returns a demo by id with its full source and live URL', () => {
    const { text } = run('get_example', { id: 'button-basics' });
    assert.match(text, /^# Buttons \(demo `button-basics`\)/);
    assert.match(text, /Live: https:\/\/salmonui\.dev\/demos\/buttons\/button-basics/);
    assert.match(text, /```tsx\nimport \{ Button \} from '@salmonui\/buttons\/button';[\s\S]*return <Button>Save<\/Button>;/);
  });

  it('finds a demo by query, notes fixtures and lists other matches', () => {
    const { text } = run('get_example', { query: 'grid cell editing' });
    assert.match(text, /^# Inline editing \(demo `grid-editing`\)/);
    assert.match(text, /Double-click a cell\./);
    assert.match(text, /docs-site fixtures/);
  });

  it('falls back from an unknown id to a search, and reports no match', () => {
    assert.match(run('get_example', { id: 'buttons' }).text, /demo `button-basics`/);
    assert.equal(run('get_example', { query: 'qwertyuiop' }).isError, true);
  });
});

describe('check_imports', () => {
  it('passes correct imports', () => {
    const code = "import '@salmonui/core/styles.css';\nimport '@salmonui/buttons/button/styles.css';\nimport { Button, type ButtonProps } from '@salmonui/buttons/button';\n";
    assert.equal(run('check_imports', { code }).text, 'OK: all 3 `@salmonui/*` imports resolve.');
  });

  it('reports errors and fixes', () => {
    const { text } = run('check_imports', { code: "import { Buton } from '@salmonui/buttons/button';\nimport { Menu } from '@salmonui/react';" });
    assert.match(text, /^2 error\(s\), 2 warning\(s\)/);
    assert.match(text, /ERROR line 1 `@salmonui\/buttons\/button`: `Buton` is not exported by `@salmonui\/buttons\/button`\. Did you mean `Button`\?/);
    assert.match(text, /ERROR line 2 `@salmonui\/react`: `@salmonui\/react` no longer exists/);
    assert.match(text, /import \{ Menu \} from '@salmonui\/buttons\/menu';/);
  });

  it('can skip the stylesheet checks', () => {
    assert.match(run('check_imports', { code: "import { Button } from '@salmonui/buttons/button';", stylesheets: false }).text, /^OK/);
    assert.equal(run('check_imports', { code: "import x from 'react';" }).text, 'No `@salmonui/*` import found.');
  });
});
