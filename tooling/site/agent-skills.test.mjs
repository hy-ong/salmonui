import assert from 'node:assert/strict';
import { VENDOR_PATTERN } from '../checks/planning-tokens.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseFrontmatter } from '../../docs/site/lib/catalog.mjs';
import {
  assignDocs,
  cleanProse,
  commonMistakesOf,
  DISCOVERY_SCHEMA,
  importsOf,
  leadingParagraph,
  resolveSiteUrl,
  sentences,
  skillFamilies,
  alsoImportOf,
  skillsFromSources,
  skillsIndex,
  WELL_KNOWN_INDEX,
  writeSiteSkills,
  writeSkills,
} from './agent-skills.mjs';

const SITE = 'https://docs.example.dev';

const member = (name, signature = `${name}?: unknown;`) => ({ name, signature, optional: true, inherited: false, summary: '', docs: '', tags: [] });
const symbol = (name, kind, summary = '', extra = {}) => ({ name, kind, signature: `${kind} ${name}`, summary, docs: summary, tags: [], ...extra });

/** A small api.json: core (theme, server), data, buttons, dropdowns and data-grid (+ features, engine). */
const API = {
  version: 1,
  generatedFrom: 'test',
  packages: [
    {
      name: '@salmonui/core',
      slug: 'core',
      entries: [
        { subpath: './theme', slug: 'theme', symbols: [symbol('ThemeProvider', 'component', 'Colors-only theme.')] },
        { subpath: './server', slug: 'server', symbols: [symbol('ThemeStyle', 'component', 'Server-safe theme style.')] },
      ],
    },
    {
      name: '@salmonui/data',
      slug: 'data',
      entries: [{ subpath: '.', slug: 'index', symbols: [symbol('createJsonDataSource', 'function', 'A remote data source.'), symbol('HttpError', 'class', 'Non-2xx response.')] }],
    },
    {
      name: '@salmonui/buttons',
      slug: 'buttons',
      entries: [
        {
          subpath: './button',
          slug: 'button',
          symbols: [
            symbol('Button', 'function', 'Native button (APG Button).'),
            symbol('ToggleButton', 'function', 'Toggle button.'),
            symbol('ButtonAccessibleName', 'type', 'An icon-only button needs an accessible name.'),
            symbol('ToggleButtonProps', 'type', '', { signature: 'type ToggleButtonProps = { pressed?: boolean; defaultPressed?: boolean; onPressedChange?: (p: boolean) => void; }' }),
          ],
        },
      ],
    },
    {
      name: '@salmonui/dropdowns',
      slug: 'dropdowns',
      entries: [
        {
          subpath: './select',
          slug: 'select',
          symbols: [
            symbol('Select', 'component', 'Single-select dropdown.'),
            symbol('SelectProps', 'interface', '', { members: [member('value'), member('defaultValue'), member('onValueChange')] }),
          ],
        },
      ],
    },
    {
      name: '@salmonui/data-grid',
      slug: 'data-grid',
      entries: [
        {
          subpath: '.',
          slug: 'index',
          symbols: [
            symbol('DataGrid', 'component', 'Virtualized data grid. State lives in the engine store.'),
            symbol('DataGridProps', 'interface', '', { members: [member('rows'), member('onSortChange')] }),
          ],
        },
        { subpath: './features', slug: 'features', symbols: [symbol('grouping', 'const', 'Grouping feature.')] },
        { subpath: './engine', slug: 'engine', symbols: [symbol('createStore', 'function', 'The engine store.')] },
        { subpath: './engine/sort', slug: 'engine-sort', symbols: [symbol('sortRows', 'function', 'Sorts rows.')] },
      ],
    },
  ],
};

/** The manifest slice of those packages. */
const MANIFEST = [
  { name: '@salmonui/core', families: [] },
  { name: '@salmonui/data', families: [] },
  { name: '@salmonui/buttons', families: [{ name: 'button', alsoImport: { menu: 'with `overflow="menu"`' } }, { name: 'menu' }] },
  { name: '@salmonui/dropdowns', families: [{ name: 'select' }] },
  { name: '@salmonui/data-grid', families: [{ name: 'data-grid', root: true }] },
];

const EXPORTS = {
  '@salmonui/buttons': {
    './button': { types: './dist/button.d.ts' },
    './button/styles.css': './dist/button.css',
    './styles.css': './dist/styles.css',
  },
  '@salmonui/data-grid': {
    '.': { types: './dist/data-grid.d.ts' },
    './styles.css': './dist/data-grid.css',
  },
};

const doc = (section, slug, title, body, extra = {}) => ({ section, slug, title, description: `${title} description.`, body, order: 1, ...extra });

const DOCS = [
  doc('data-grid', 'sorting', 'Sorting', 'Sort rows by one or more columns.\n\n## Common mistakes\n\n- Sorting a column without a `field`\n  and no `valueGetter`.\n- See [the API](/docs/data-grid/api).\n\n## Next\n\n- not a mistake\n'),
  doc('data-grid', 'state-persistence', 'State persistence', "```ts\nimport { createJsonDataSource } from '@salmonui/data';\n```\n\nPersist state.\n"),
  doc('buttons', 'button', 'Button', "```tsx\nimport { Button } from '@salmonui/buttons/button';\n```\n\n`Button` renders a native `<button>`. See [Toggle](./toggle-button.md).\n"),
  doc('buttons', 'toggle-button', 'ToggleButton', 'A `ToggleButton` keeps a pressed state; `<ToggleButton pressed>`.\n'),
  doc('dropdowns', 'recipe', 'Recipe', 'Nothing imported and no component named.\n'),
];

describe('helpers', () => {
  test('cleanProse drops comments and links and collapses whitespace', () => {
    assert.equal(cleanProse('A <!-- demo: x --> [link](/docs/a)   `x`\n and more.'), 'A link `x` and more.');
    assert.equal(cleanProse('Uses {@link Foo} here.'), 'Uses `Foo` here.');
  });

  test('sentences keeps whole sentences within the limit', () => {
    assert.equal(sentences('One. Two. Three.', 9), 'One. Two.');
    assert.equal(sentences('Only `a.b` here. Next.', 16), 'Only `a.b` here.');
  });

  test('leadingParagraph skips code, headings, lists and intro lines', () => {
    assert.equal(leadingParagraph('```ts\ncode\n```\n\n# H\n\n- item\n\nIntro to a list:\n\nThe real paragraph\nwraps.\n'), 'The real paragraph wraps.');
  });

  test('commonMistakesOf collects bullets of a `## Common mistakes` section', () => {
    assert.deepEqual(commonMistakesOf(DOCS[0].body), ['Sorting a column without a `field` and no `valueGetter`.', 'See the API.']);
    assert.deepEqual(commonMistakesOf('No section.\n'), []);
  });

  test('alsoImportOf resolves the manifest stylesheets a family does not carry', async () => {
    const { allFamilies } = await import('../checks/packages.manifest.mjs');
    const fam = (name) => allFamilies().find((f) => f.family.name === name).family;
    assert.deepEqual(alsoImportOf(fam('pdf-viewer')), [{ sheet: '@salmonui/buttons/button/styles.css', when: null }]);
    assert.deepEqual(alsoImportOf(fam('sidebar-layout')).map((x) => x.sheet), ['@salmonui/overlays/drawer/styles.css']);
    assert.deepEqual(alsoImportOf(fam('dialog')), []);
  });

  test('importsOf reads import specifiers', () => {
    assert.deepEqual(importsOf("import { A } from '@salmonui/buttons/button';\nimport x from \"@salmonui/data/views\";"), ['@salmonui/buttons/button', '@salmonui/data/views']);
  });

  test('resolveSiteUrl follows site-url.ts', () => {
    assert.equal(resolveSiteUrl(''), 'https://salmonui.dev');
    assert.equal(resolveSiteUrl(' https://x.dev/// '), 'https://x.dev');
  });
});

describe('families and docs', () => {
  test('one skill per family, features join data-grid, package-level skills for core, data and the engine', () => {
    const families = skillFamilies(API, MANIFEST);
    assert.deepEqual([...families.keys()].sort(), ['button', 'core', 'data', 'data-grid', 'data-grid-engine', 'select']);
    assert.deepEqual(families.get('data-grid').entries.map((e) => e.entry.subpath), ['.', './features']);
    assert.deepEqual(families.get('data-grid-engine').entries.map((e) => e.entry.subpath), ['./engine', './engine/sort']);
    assert.deepEqual(families.get('core').entries.map((e) => e.entry.subpath), ['./theme', './server']);
    assert.equal(families.get('core').react, false);
    assert.equal(families.get('button').react, true);
  });

  test('pages map by imports, Data Grid section, then component mentions', () => {
    const pages = assignDocs(skillFamilies(API, MANIFEST), DOCS);
    assert.deepEqual(pages.get('data-grid').map((d) => d.slug), ['sorting', 'state-persistence']);
    assert.deepEqual(pages.get('data').map((d) => d.slug), ['state-persistence']);
    assert.deepEqual(pages.get('button').map((d) => d.slug), ['button', 'toggle-button']);
    assert.deepEqual(pages.get('data-grid-engine'), []);
    assert.equal([...pages.values()].flat().some((d) => d.slug === 'recipe'), false);
  });
});

describe('skillsFromSources', () => {
  const skills = skillsFromSources({ api: API, docs: DOCS, exportsMap: EXPORTS, siteUrl: `${SITE}/`, packageDescriptions: { '@salmonui/data': 'Data sources for the grid.' }, manifest: MANIFEST });
  const byName = new Map(skills.map((s) => [s.name, s]));

  test('every family and package-level skill is built', () => {
    assert.deepEqual(
      skills.map((s) => s.name),
      ['salmonui-button', 'salmonui-core', 'salmonui-data', 'salmonui-data-grid', 'salmonui-data-grid-engine', 'salmonui-select'],
    );
    for (const skill of skills) assert.equal(skill.path, `${skill.name}/SKILL.md`);
  });

  test('SKILL.md front matter: name and a one-line description', () => {
    for (const skill of skills) {
      const { data, body } = parseFrontmatter(skill.markdown);
      assert.equal(data.name, skill.name);
      assert.equal(data.description, skill.description);
      assert.ok(!skill.description.includes('\n') && skill.description.length <= 1024);
      assert.match(body, /^# Salmon UI: /m);
    }
    assert.match(byName.get('salmonui-data').description, /^Salmon UI @salmonui\/data: Data sources for the grid\./);
    assert.match(byName.get('salmonui-button').description, /Use when .* @salmonui\/buttons\/button\.$/);
  });

  test('sections: import, mental model, public API, common mistakes, docs', () => {
    const md = byName.get('salmonui-button').markdown;
    const order = ['## Import', '## Mental model', '## Public API', '## Common mistakes', '## Docs'].map((h) => md.indexOf(`\n${h}\n`));
    assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), order.join(','));
    assert.ok(md.includes("import { Button, ToggleButton } from '@salmonui/buttons/button';"));
    assert.ok(md.includes('npm install @salmonui/buttons'));
    assert.ok(md.includes("import '@salmonui/core/styles.css'; // once per app\nimport '@salmonui/buttons/button/styles.css';\nimport '@salmonui/buttons/menu/styles.css'; // with overflow=\"menu\""));
    assert.ok(md.includes('- `Button`: Native button (APG Button).'));
    assert.ok(md.includes('`Button` renders a native `<button>`. See Toggle.'), 'leading paragraph of the primary page, cleaned');
    assert.ok(md.includes(`[@salmonui/buttons/button](${SITE}/docs/reference/buttons/button.md)`));
    assert.ok(md.includes('- Types: `ButtonAccessibleName`, `ToggleButtonProps`.'));
    assert.ok(md.includes(`- [Button](${SITE}/docs/buttons/button.md): Button description.`));
    assert.ok(md.includes(`- [ToggleButton](${SITE}/docs/buttons/toggle-button.md)`));
    assert.ok(md.includes(`${SITE}/llms.txt`));
  });

  test('common mistakes are backed by symbols, exports and page bullets', () => {
    const section = (name) => byName.get(name).markdown.split('\n## Common mistakes\n')[1]?.split('\n## ')[0] ?? '';
    const button = section('salmonui-button');
    assert.match(button, /import `'@salmonui\/core\/styles\.css'` once per app and `'@salmonui\/buttons\/button\/styles\.css'`/);
    assert.match(button, /does not carry: also import `'@salmonui\/buttons\/menu\/styles\.css'` \(with `overflow="menu"`\)/);
    assert.match(button, /Passing `pressed` without `onPressedChange`.*`defaultPressed`/);
    assert.doesNotMatch(button, /`value` without/);
    assert.match(button, /accessible name.*`ButtonAccessibleName`: An icon-only button needs an accessible name\./);
    assert.match(button, /Server Component/, 'onPressedChange in a type alias signature counts');
    const select = section('salmonui-select');
    assert.match(select, /Passing `value` without `onValueChange`.*`defaultValue`/);
    assert.doesNotMatch(select, /stylesheet/, 'no select/styles.css export');
    assert.match(select, /Server Component/);
    const grid = section('salmonui-data-grid');
    assert.match(grid, /'@salmonui\/data-grid\/styles\.css'/);
    assert.ok(grid.includes('- Sorting a column without a `field` and no `valueGetter`.'));
    assert.match(grid, /Server Component/);
    assert.equal(section('salmonui-data'), '', 'no rule backs a mistake for the data package');
  });

  test('data-grid links its index; links are absolute on SITE_URL and name no other vendor', () => {
    const md = byName.get('salmonui-data-grid').markdown;
    assert.ok(md.includes(`${SITE}/docs/data-grid.md`));
    assert.doesNotMatch(md, /migrating/i);
    assert.doesNotMatch(md, new RegExp(VENDOR_PATTERN.source, 'i'));
    assert.ok(md.includes(`${SITE}/docs/data-grid/sorting.md`));
    for (const skill of skills) {
      for (const [, href] of skill.markdown.matchAll(/\]\(([^)]+)\)/g)) assert.ok(href.startsWith(`${SITE}/`), `${skill.name}: ${href}`);
    }
  });

  test('skillsIndex is a discovery 0.2.0 index with sha256 digests', () => {
    const index = skillsIndex(skills, SITE);
    assert.equal(index.$schema, DISCOVERY_SCHEMA);
    const entry = index.skills.find((s) => s.name === 'salmonui-button');
    assert.equal(entry.type, 'skill-md');
    assert.equal(entry.url, `${SITE}/skills/salmonui-button/SKILL.md`);
    assert.equal(entry.digest, `sha256:${createHash('sha256').update(byName.get('salmonui-button').markdown).digest('hex')}`);
  });

  test('output is deterministic', () => {
    const again = skillsFromSources({ api: API, docs: DOCS, exportsMap: EXPORTS, siteUrl: SITE, packageDescriptions: { '@salmonui/data': 'Data sources for the grid.' }, manifest: MANIFEST });
    assert.deepEqual(again, skills);
  });
});

describe('files', () => {
  const temp = mkdtempSync(join(tmpdir(), 'salmon-skills-'));
  after(() => rmSync(temp, { recursive: true, force: true }));

  test('writeSkills replaces the folder', () => {
    const dir = join(temp, 'skills');
    mkdirSync(join(dir, 'stale'), { recursive: true });
    writeSkills(dir, [{ name: 'salmonui-a', path: 'salmonui-a/SKILL.md', markdown: 'A\n' }]);
    assert.equal(readFileSync(join(dir, 'salmonui-a/SKILL.md'), 'utf8'), 'A\n');
    assert.equal(existsSync(join(dir, 'stale')), false);
  });

  test('writeSiteSkills reads a repository root and writes skills plus the well-known index', async () => {
    const root = join(temp, 'repo');
    const write = (path, text) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    write('docs/site/generated/api.json', JSON.stringify(API));
    write('packages/buttons/package.json', JSON.stringify({ name: '@salmonui/buttons', description: 'Buttons.', exports: EXPORTS['@salmonui/buttons'] }));
    write('packages/data/package.json', JSON.stringify({ name: '@salmonui/data', description: 'Data sources for the grid.', exports: { '.': {} } }));
    write('docs/site/content/sorting.md', `---\ntitle: Sorting\ndescription: Sort rows.\n---\n\n${DOCS[0].body}`);
    write('docs/site/content/buttons/button.md', `---\ntitle: Button\ndescription: A button.\n---\n\n${DOCS[2].body}`);
    const out = join(temp, 'out');
    const skills = await writeSiteSkills(out, { root, siteUrl: SITE });
    assert.deepEqual(skills.map((s) => s.name), ['salmonui-button', 'salmonui-core', 'salmonui-data', 'salmonui-data-grid', 'salmonui-data-grid-engine', 'salmonui-select']);
    const index = JSON.parse(readFileSync(join(out, WELL_KNOWN_INDEX), 'utf8'));
    assert.deepEqual(index, skillsIndex(skills, SITE));
    for (const skill of skills) assert.equal(readFileSync(join(out, 'skills', skill.path), 'utf8'), skill.markdown);
    assert.ok(skills[0].markdown.includes(`${SITE}/docs/buttons/button.md`));
  });
});
