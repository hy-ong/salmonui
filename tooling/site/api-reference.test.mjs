import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildApiReference,
  entrySlug,
  isElementReturn,
  packageSlug,
  stripModifiers,
  summaryOf,
  typedEntries,
  writeApiReference,
} from './api-reference.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('helpers', () => {
  test('slugs', () => {
    assert.equal(entrySlug('.'), 'index');
    assert.equal(entrySlug('./edit-state'), 'edit-state');
    assert.equal(packageSlug('@salmonui/data-grid'), 'data-grid');
  });

  test('typedEntries keeps only public subpaths with a types target', () => {
    assert.deepEqual(
      typedEntries({
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
        './internal/*': { types: './dist/internal/*.d.ts', import: './dist/internal/*.js' },
        './styles.css': './dist/styles.css',
        './package.json': './package.json',
      }),
      [{ subpath: '.', types: './dist/index.d.ts' }],
    );
  });

  test('summaryOf takes the first paragraph', () => {
    assert.equal(summaryOf('One\nline.\n\nSecond.'), 'One\nline.');
    assert.equal(summaryOf(''), '');
  });

  test('stripModifiers', () => {
    assert.equal(stripModifiers('export declare function f(): void;'), 'function f(): void;');
    assert.equal(stripModifiers('export interface A {}'), 'interface A {}');
  });

  test('isElementReturn', () => {
    for (const t of ['Element', 'JSX.Element', 'React.JSX.Element', 'ReactNode', 'ReactElement<any>', 'Element | null', 'null']) {
      assert.equal(isElementReturn(t), true, t);
    }
    for (const t of ['string', 'void', 'Element | string', '']) assert.equal(isElementReturn(t), false, t);
  });
});

describe('fixture packages', () => {
  const dirs = [];
  after(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  /** Creates `<tmp>/packages/<name>` with the given `exports` map and dist files. */
  const fixture = (exportsField, files) => {
    const root = mkdtempSync(join(tmpdir(), 'salmon-api-ref-'));
    dirs.push(root);
    const dir = join(root, 'packages', 'demo');
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@fixture/demo', version: '0.0.0', exports: exportsField }));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return root;
  };
  const exportsField = {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './extra': { types: './dist/extra.d.ts', import: './dist/extra.js' },
    './styles.css': './dist/styles.css',
  };

  test('documents every kind with docs, tags and members', async () => {
    const root = fixture(exportsField, {
      'dist/index.d.ts': `
declare global { namespace JSX { interface Element { readonly __element: true } } }
/**
 * Adds numbers.
 *
 * Longer text.
 * @param a first
 * @returns the sum
 * @deprecated use plus
 */
export declare function add(a: number, b: number): number;
/** A button. */
export declare function Button(props: ButtonProps): JSX.Element;
interface Base<Item> {
  /** The items. */
  readonly items: readonly Item[];
}
/** Button props. */
export interface ButtonProps extends Base<string> {
  /** Label text. */
  readonly label: string;
  disabled?: boolean;
}
export type Size = 'small' | 'large';
export type Point = { readonly x: number; y?: number };
export declare const VERSION = 1;
export declare class Store { get(): number; }
export declare enum Mode { A = 0, B = 1 }
export * from './extra.js';
`,
      'dist/extra.d.ts': `export declare function extra(): string;\n`,
    });
    const ref = await buildApiReference({ root });
    assert.equal(ref.version, 1);
    assert.equal(typeof ref.generatedFrom, 'string');
    assert.equal(ref.packages.length, 1);
    const [pkg] = ref.packages;
    assert.equal(pkg.name, '@fixture/demo');
    assert.equal(pkg.slug, 'demo');
    assert.deepEqual(pkg.entries.map((e) => [e.subpath, e.slug]), [['.', 'index'], ['./extra', 'extra']]);
    const symbols = Object.fromEntries(pkg.entries[0].symbols.map((s) => [s.name, s]));
    assert.deepEqual(
      pkg.entries[0].symbols.map((s) => s.name),
      ['Button', 'ButtonProps', 'Mode', 'Point', 'Size', 'Store', 'VERSION', 'add', 'extra'],
    );
    assert.deepEqual(
      Object.fromEntries(Object.values(symbols).map((s) => [s.name, s.kind])),
      { Button: 'component', ButtonProps: 'interface', Mode: 'enum', Point: 'type', Size: 'type', Store: 'class', VERSION: 'const', add: 'function', extra: 'function' },
    );

    const add = symbols.add;
    assert.equal(add.signature, 'function add(a: number, b: number): number;');
    assert.equal(add.summary, 'Adds numbers.');
    assert.equal(add.docs, 'Adds numbers.\n\nLonger text.');
    assert.deepEqual(add.tags.map((t) => t.name), ['param', 'returns', 'deprecated']);
    assert.match(add.tags[0].text, /first/);
    assert.equal(add.members, undefined);

    assert.equal(symbols.VERSION.signature, 'const VERSION = 1;');
    assert.equal(symbols.Size.signature, "type Size = 'small' | 'large';");
    assert.equal(symbols.Size.members, undefined);

    const props = Object.fromEntries(symbols.ButtonProps.members.map((m) => [m.name, m]));
    assert.deepEqual(props.label, { name: 'label', signature: 'readonly label: string;', optional: false, inherited: false, summary: 'Label text.', docs: 'Label text.', tags: [] });
    assert.equal(props.disabled.optional, true);
    // Inherited members print from the instantiated type (`Item` -> `string`).
    assert.equal(props.items.inherited, true);
    assert.equal(props.items.signature, 'items: readonly string[];');
    assert.equal(props.items.summary, 'The items.');

    const point = Object.fromEntries(symbols.Point.members.map((m) => [m.name, m]));
    assert.equal(point.x.signature, 'readonly x: number;');
    assert.equal(point.x.inherited, false);
    assert.equal(point.y.optional, true);

    assert.deepEqual(symbols.Mode.members.map((m) => [m.name, m.signature]), [['A', 'A = 0'], ['B', 'B = 1']]);
    assert.ok(symbols.Store.members.some((m) => m.name === 'get'));
    assert.match(symbols.Store.signature, /^class Store \{/);
  });

  test('leaves out `@internal` exports and members, and entries with only internal exports', async () => {
    const root = fixture(
      { ...exportsField, './hidden': { types: './dist/hidden.d.ts', import: './dist/hidden.js' } },
      {
        'dist/index.d.ts': `
/** Public. */
export interface Options {
  /** Shown. */
  size?: number;
  /** @internal Not shown. */
  secret?: string;
}
/** @internal Shared helper. */
export declare function helper(): void;
export declare function visible(): void;
`,
        'dist/extra.d.ts': 'export declare const b: number;\n',
        'dist/hidden.d.ts': '/** @internal */\nexport declare const c: number;\n',
      },
    );
    const ref = await buildApiReference({ root });
    const [pkg] = ref.packages;
    assert.deepEqual(pkg.entries.map((e) => e.subpath), ['.', './extra']);
    assert.deepEqual(pkg.entries[0].symbols.map((s) => s.name), ['Options', 'visible']);
    assert.deepEqual(pkg.entries[0].symbols[0].members.map((m) => m.name), ['size']);
  });

  test('fails on a missing declaration file', async () => {
    const root = fixture(exportsField, { 'dist/index.d.ts': 'export declare const a: number;\n' });
    await assert.rejects(buildApiReference({ root }), /missing declaration files[\s\S]*"\.\/extra"/);
  });

  test('fails on an entry with no symbols', async () => {
    const root = fixture(exportsField, { 'dist/index.d.ts': 'export declare const a: number;\n', 'dist/extra.d.ts': 'export {};\n' });
    await assert.rejects(buildApiReference({ root }), /"\.\/extra" .*exports no symbols/);
  });

  test('fails when a declaration file does not resolve', async () => {
    const root = fixture(exportsField, {
      'dist/index.d.ts': "import type { Missing } from './missing.js';\nexport declare const a: Missing;\n",
      'dist/extra.d.ts': 'export declare const b: number;\n',
    });
    await assert.rejects(buildApiReference({ root }), /do not type-check/);
  });

  test('writeApiReference writes the whole file', () => {
    const root = mkdtempSync(join(tmpdir(), 'salmon-api-ref-'));
    dirs.push(root);
    const file = join(root, 'nested', 'api.json');
    writeApiReference({ version: 1, generatedFrom: 'x', packages: [] }, file);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, generatedFrom: 'x', packages: [] });
    assert.ok(existsSync(dirname(file)));
  });
});

const built = existsSync(join(repoRoot, 'packages/data-grid/dist/data-grid.d.ts'));

test('repository packages: every public exports entry is documented', { skip: !built && 'run `npm run build` first' }, async () => {
  const { PACKAGES } = await import('../checks/packages.manifest.mjs');
  const ref = await buildApiReference();
  assert.deepEqual(ref.packages.map((p) => p.name), PACKAGES.map((p) => p.name));
  for (const p of ref.packages) {
    const dir = PACKAGES.find((m) => m.name === p.name).dir;
    const pkg = JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'));
    const documented = p.entries.map((e) => e.subpath);
    assert.ok(documented.every((subpath) => !subpath.includes('internal')), p.name);
    // Entries whose every export is `@internal` have no page; all others are documented.
    assert.ok(documented.every((subpath) => typedEntries(pkg.exports).some((e) => e.subpath === subpath)), p.name);
    for (const e of p.entries) assert.ok(e.symbols.length > 0, `${p.name} ${e.subpath}`);
    for (const e of p.entries) for (const s of e.symbols) assert.ok(!s.tags.some((t) => t.name === 'internal'), `${p.name} ${e.subpath} ${s.name}`);
  }
  const root = ref.packages.find((p) => p.slug === 'data-grid').entries.find((e) => e.subpath === '.');
  const grid = root.symbols.find((s) => s.name === 'DataGrid');
  assert.equal(grid.kind, 'component');
  assert.match(grid.signature, /^function DataGrid<Row>\(props: DataGridProps<Row>\)/);
  assert.ok(grid.summary.length > 0);
  const props = root.symbols.find((s) => s.name === 'DataGridProps');
  assert.equal(props.kind, 'interface');
  assert.ok(props.members.some((m) => m.name === 'data' && !m.inherited));
});
