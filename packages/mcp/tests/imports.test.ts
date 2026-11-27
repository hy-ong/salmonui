// Import parsing and the exports-map checks behind check_imports.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkImports, ExportsMap, migrateSpecifier, parseImports } from '@salmonui/mcp';
import { fixtureIndex } from './fixture.ts';

const map = new ExportsMap(fixtureIndex());
const problems = (code: string, stylesheets = false) => checkImports(code, map, { stylesheets }).problems;

describe('parseImports', () => {
  it('reads every module form with line numbers', () => {
    const code = [
      "import Default, { a, b as c, type T } from 'x';", // 1
      "import type { U } from 'y';", // 2
      "import * as ns from 'z';", // 3
      "import './side.css';", // 4
      "export { e as f } from 'w';", // 5
      "export * from 'v';", // 6
      "const lazy = () => import('u');", // 7
      'import {', // 8
      '  multi,',
      '  line,',
      "} from 'm';",
    ].join('\n');
    const parsed = parseImports(code);
    assert.deepEqual(
      parsed.map((p) => [p.line, p.form, p.specifier]),
      [
        [1, 'import', 'x'],
        [2, 'import', 'y'],
        [3, 'import', 'z'],
        [4, 'side-effect', './side.css'],
        [5, 'export-from', 'w'],
        [6, 'export-from', 'v'],
        [7, 'dynamic', 'u'],
        [8, 'import', 'm'],
      ],
    );
    assert.deepEqual(parsed[0]!.names, [
      { imported: 'default', local: 'Default', typeOnly: false },
      { imported: 'a', local: 'a', typeOnly: false },
      { imported: 'b', local: 'c', typeOnly: false },
      { imported: 'T', local: 'T', typeOnly: true },
    ]);
    assert.equal(parsed[1]!.typeOnly, true);
    assert.equal(parsed[1]!.names[0]!.typeOnly, true);
    assert.equal(parsed[2]!.namespace, true);
    assert.deepEqual(parsed[4]!.names, [{ imported: 'e', local: 'f', typeOnly: false }]);
    assert.equal(parsed[5]!.namespace, true);
    assert.deepEqual(parsed[7]!.names.map((n) => n.imported), ['multi', 'line']);
  });

  it('ignores imports inside comments and keeps strings intact', () => {
    const code = "// import { a } from 'commented';\n/* import 'block';\n*/ const s = '// not a comment';\nimport { b } from 'real';";
    const parsed = parseImports(code);
    assert.deepEqual(parsed.map((p) => [p.specifier, p.line]), [['real', 4]]);
  });
});

describe('checkImports', () => {
  it('accepts public entries, named exports, type imports and stylesheets', () => {
    assert.deepEqual(problems("import { Button, type ButtonProps } from '@salmonui/buttons/button';\nimport '@salmonui/buttons/button/styles.css';\nimport { sortRows } from '@salmonui/data-grid/engine/sort';"), []);
  });

  it('flags a name the entry does not export and where it lives', () => {
    const [p] = problems("import { Menu } from '@salmonui/buttons/button';");
    assert.equal(p!.severity, 'error');
    assert.match(p!.message, /`Menu` is not exported by `@salmonui\/buttons\/button`\. It is exported by `@salmonui\/buttons\/menu`\./);
    assert.equal(p!.fix, "import { Menu } from '@salmonui/buttons/menu';");
  });

  it('flags default imports', () => {
    assert.match(problems("import Button from '@salmonui/buttons/button';")[0]!.message, /no default export/);
  });

  it('flags a specifier missing from the exports map', () => {
    const [p] = problems("import { Button } from '@salmonui/buttons';");
    assert.match(p!.message, /`@salmonui\/buttons` is not in the `exports` map of @salmonui\/buttons\. The imported names live in `@salmonui\/buttons\/button`\./);
    assert.match(problems("import '@salmonui/buttons/buton/styles.css';")[0]!.message, /Did you mean `@salmonui\/buttons\/button\/styles\.css`/);
    assert.match(problems("import { x } from '@salmonui/buttonz/button';")[0]!.message, /not a Salmon UI package/);
  });

  it('flags private and deep imports', () => {
    assert.match(problems("import { roving } from '@salmonui/core/internal/roving';")[0]!.message, /private module/);
    assert.match(problems("import { Button } from '@salmonui/buttons/dist/button.js';")[0]!.message, /Deep imports/);
  });

  it('maps the removed packages to their replacements', () => {
    assert.equal(migrateSpecifier('@salmonui/react/button', map), '@salmonui/buttons/button');
    assert.equal(migrateSpecifier('@salmonui/react/menu/styles.css', map), '@salmonui/buttons/menu/styles.css');
    assert.equal(migrateSpecifier('@salmonui/react/data-grid/features', map), '@salmonui/data-grid/features');
    assert.equal(migrateSpecifier('@salmonui/react/styles.css', map), '@salmonui/core/styles.css');
    assert.equal(migrateSpecifier('@salmonui/react/theme', map), '@salmonui/core/theme');
    assert.equal(migrateSpecifier('@salmonui/data-grid-core/sort', map), '@salmonui/data-grid/engine/sort');
    assert.equal(migrateSpecifier('@salmonui/data-grid-core', map), '@salmonui/data-grid/engine');
    assert.equal(migrateSpecifier('@salmonui/react', map), null);

    const [root] = problems("import { Button, Menu, type ColumnDef } from '@salmonui/react';");
    assert.equal(root!.severity, 'error');
    assert.match(root!.message, /`@salmonui\/react` no longer exists/);
    assert.equal(root!.fix, "import { Button } from '@salmonui/buttons/button';\nimport { Menu } from '@salmonui/buttons/menu';\nimport { type ColumnDef } from '@salmonui/data-grid';");
    const [engine] = problems("import { sortRows } from '@salmonui/data-grid-core/sort';");
    assert.equal(engine!.fix, "import { sortRows } from '@salmonui/data-grid/engine/sort';");
    assert.equal(problems("import '@salmonui/react/styles.css';")[0]!.fix, "import '@salmonui/core/styles.css';");
    assert.match(problems("import { gone } from '@salmonui/data-grid-export';")[0]!.message, /Not exported by any entry: `gone`/);
  });

  it('reports missing core and family stylesheets for value imports only', () => {
    const missing = checkImports("import { Button } from '@salmonui/buttons/button';\nconst G = () => import('@salmonui/data-grid');", map).problems;
    assert.deepEqual(missing.map((p) => [p.severity, p.specifier]), [
      ['warning', '@salmonui/core/styles.css'],
      ['warning', '@salmonui/buttons/button/styles.css'],
      ['warning', '@salmonui/data-grid/styles.css'],
    ]);
    assert.deepEqual(checkImports("import type { ButtonProps } from '@salmonui/buttons/button';", map).problems, []);
    // The package-wide aggregate covers its families.
    assert.deepEqual(checkImports("import '@salmonui/core/styles.css';\nimport '@salmonui/buttons/styles.css';\nimport { Menu } from '@salmonui/buttons/menu';", map).problems, []);
    // Core is a component package's requirement, not the theme entry's.
    assert.deepEqual(checkImports("import { ThemeProvider } from '@salmonui/core/theme';", map).problems, []);
  });

  it('reports only the always-needed stylesheets a family stylesheet does not carry', () => {
    const index = fixtureIndex();
    const grid = index.packages.find((p) => p.name === '@salmonui/data-grid')!;
    const withExtras = {
      ...index,
      packages: index.packages.map((p) =>
        p === grid
          ? { ...p, families: p.families.map((f) => ({ ...f, alsoImport: [{ stylesheet: '@salmonui/buttons/button/styles.css', when: null }, { stylesheet: '@salmonui/buttons/menu/styles.css', when: 'with `menus`' }] })) }
          : p,
      ),
    };
    const extras = new ExportsMap(withExtras);
    const base = "import '@salmonui/core/styles.css';\nimport '@salmonui/data-grid/styles.css';\nimport { DataGrid } from '@salmonui/data-grid';\n";
    const found = checkImports(base, extras).problems;
    assert.deepEqual(found.map((p) => [p.severity, p.specifier, p.fix]), [['warning', '@salmonui/buttons/button/styles.css', "import '@salmonui/buttons/button/styles.css';"]]);
    assert.match(found[0]!.message, /does not carry/);
    assert.deepEqual(checkImports(`${base}import '@salmonui/buttons/button/styles.css';\n`, extras).problems, []);
    assert.deepEqual(checkImports(`${base}import '@salmonui/buttons/styles.css';\n`, extras).problems, [], 'the package aggregate covers it');
    // Without the exceptions, composed families need nothing beyond the family stylesheet.
    assert.deepEqual(checkImports(base, map).problems, []);
  });

  it('warns about a side-effect import of a JS entry', () => {
    assert.match(problems("import '@salmonui/buttons/button';")[0]!.message, /does not load styles/);
  });
});
