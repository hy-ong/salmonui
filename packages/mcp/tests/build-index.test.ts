// The index builder (scripts/build-index.mjs) over small fake sources, and,
// when `npm run mcp:index` has run, checks of the real bundled index.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { checkImports, ExportsMap, loadIndex, TOOLS } from '@salmonui/mcp';
import { buildIndex, defaultOf, kindOf, memberType, OUTPUT, splitSections } from '../scripts/build-index.mjs';

function fakeIndex() {
  return buildIndex({
    manifest: [
      { name: '@salmonui/core', dir: 'packages/core', description: 'Core.', deps: [], optionalPeers: [], react: 'optional', families: [], extra: { './theme': 'theme.ts' } },
      {
        name: '@salmonui/buttons',
        dir: 'packages/buttons',
        description: 'Buttons.',
        deps: ['@salmonui/core'],
        optionalPeers: [],
        react: 'required',
        families: [{ name: 'button', entry: 'button.ts', styles: ['button'], subpaths: { './extra': 'button/extra.ts' } }],
        extra: {},
      },
      { name: '@salmonui/mcp', dir: 'packages/mcp', description: 'MCP.', deps: [], optionalPeers: [], react: 'none', families: [], extra: { '.': 'index.ts' } },
    ],
    packageJsons: {
      '@salmonui/core': { exports: { './theme': {}, './styles.css': './dist/styles.css', './internal/*': {}, './package.json': './package.json' } },
      '@salmonui/buttons': { exports: { './button': {}, './button/extra': {}, './button/styles.css': './dist/button.css', './styles.css': './dist/styles.css', './package.json': './package.json' } },
    },
    api: {
      version: 1,
      generatedFrom: 'x',
      packages: [
        { name: '@salmonui/core', slug: 'core', entries: [{ subpath: './theme', slug: 'theme', symbols: [{ name: 'ThemeProvider', kind: 'function', signature: 'function ThemeProvider(props: ThemeProviderProps): ReactElement;', summary: 'Theme.', docs: 'Theme.', tags: [] }] }, { subpath: './internal/*', slug: 'internal', symbols: [{ name: 'secret', kind: 'function', signature: 'function secret(): void;', summary: '', docs: '', tags: [] }] }] },
        {
          name: '@salmonui/buttons',
          slug: 'buttons',
          entries: [
            {
              subpath: './button',
              slug: 'button',
              symbols: [
                { name: 'Button', kind: 'component', signature: 'function Button(props: ButtonProps): ReactElement;', summary: 'A native button. More text.', docs: 'A native button. More text.\n\nSee [Button](/docs/buttons/button).', tags: [] },
                {
                  name: 'ButtonProps',
                  kind: 'interface',
                  signature: 'interface ButtonProps extends Base {\n    variant?: Variant;\n}',
                  summary: '',
                  docs: '',
                  tags: [],
                  members: [
                    { name: 'variant', signature: 'variant?: Variant;', optional: true, inherited: false, summary: 'Visual weight.', docs: 'Visual weight.', tags: [{ name: 'default', text: "'solid'" }] },
                    { name: 'size', signature: "readonly size?: 'sm' | 'md';", optional: true, inherited: true, summary: 'Size (default `md`).', docs: 'Size (default `md`).', tags: [] },
                    { name: 'hidden', signature: 'hidden?: boolean;', optional: true, inherited: false, summary: '', docs: '', tags: [{ name: 'internal', text: '' }] },
                  ],
                },
                { name: 'useButton', kind: 'function', signature: 'function useButton(): ButtonState;', summary: 'Hook.', docs: 'Hook.', tags: [{ name: 'param', text: 'none - nothing' }, { name: 'returns', text: 'The state.' }, { name: 'deprecated', text: 'Use `Button`.' }] },
                { name: 'Secret', kind: 'const', signature: 'const Secret: 1;', summary: '', docs: '', tags: [{ name: 'internal', text: '' }] },
              ],
            },
            { subpath: './button/extra', slug: 'button-extra', symbols: [{ name: 'ButtonProps', kind: 'interface', signature: 'interface ButtonProps extends Base {\n    variant?: Variant;\n}', summary: '', docs: '', tags: [], members: [] }] },
          ],
        },
      ],
    },
    docs: [{ slug: 'button', section: 'buttons', title: 'Button', description: 'Buttons.', body: "```tsx\nimport { Button } from '@salmonui/buttons/button';\n```\n\nIntro.\n<!-- demo: button-basics -->\n\n## Sizes `sm` and `md`\n\nSee [Menu](/docs/buttons/menu).\n\n```md\n## Not a heading\n```\n\n## Sizes `sm` and `md`\n\nAgain.\n" }],
    demos: [{ id: 'button-basics', title: 'Buttons', description: 'Variants.', category: 'buttons', notes: 'Click.', source: "// a comment\nimport { Button } from '@salmonui/buttons/button';\n" }],
    version: '1.2.3',
    generatedFrom: 'abc',
  });
}

describe('buildIndex', () => {
  const index = fakeIndex();

  it('records the version and leaves out the server package', () => {
    assert.equal(index.format, 1);
    assert.equal(index.version, '1.2.3');
    assert.deepEqual(index.packages.map((p) => p.name), ['@salmonui/core', '@salmonui/buttons']);
  });

  it('builds families with specifiers, subpaths, stylesheets, components, hooks and docs', () => {
    const buttons = index.packages[1]!;
    assert.equal(buttons.stylesheet, '@salmonui/buttons/styles.css');
    assert.deepEqual(buttons.families[0], {
      name: 'button',
      specifier: '@salmonui/buttons/button',
      subpaths: ['@salmonui/buttons/button/extra'],
      stylesheet: '@salmonui/buttons/button/styles.css',
      summary: 'A native button.',
      components: ['Button'],
      hooks: ['useButton'],
      docs: ['/docs/buttons/button'],
    });
    assert.deepEqual(index.packages[0]!.entries, ['@salmonui/core/theme']);
  });

  it('lists public entries only, with their exported names', () => {
    // Core first (manifest order), a family's entry before its further entries.
    assert.deepEqual(index.entries.map((e) => [e.specifier, e.kind]), [
      ['@salmonui/core/styles.css', 'css'],
      ['@salmonui/core/theme', 'js'],
      ['@salmonui/buttons/button', 'js'],
      ['@salmonui/buttons/button/extra', 'js'],
      ['@salmonui/buttons/button/styles.css', 'css'],
      ['@salmonui/buttons/styles.css', 'css'],
    ]);
    assert.ok(!index.entries.some((e) => e.specifier.includes('internal')));
    assert.deepEqual(index.entries.find((e) => e.specifier === '@salmonui/buttons/button')!.names, ['Button', 'ButtonProps', 'useButton']);
  });

  it('merges symbols across entries, drops @internal symbols, and fixes component kinds', () => {
    const names = index.symbols.map((s) => s.name);
    assert.deepEqual(names, ['Button', 'ButtonProps', 'ThemeProvider', 'useButton']);
    const button = index.symbols[0]!;
    assert.equal(button.summary, 'A native button.');
    assert.equal(button.docs, 'A native button. More text.\n\nSee [Button](https://salmonui.dev/docs/buttons/button).');
    const props = index.symbols[1]!;
    assert.deepEqual(props.specifiers, ['@salmonui/buttons/button', '@salmonui/buttons/button/extra']);
    assert.equal(props.signature, 'interface ButtonProps extends Base { ... }');
    assert.deepEqual(props.members, [
      { name: 'variant', type: 'Variant', optional: true, summary: 'Visual weight.', default: "'solid'" },
      { name: 'size', type: "'sm' | 'md'", optional: true, summary: 'Size (default `md`).', default: 'md', inherited: true },
    ]);
    assert.equal(index.symbols[2]!.kind, 'component');
    const hook = index.symbols[3]!;
    assert.deepEqual(hook.params, [{ name: 'none', text: 'nothing' }]);
    assert.equal(hook.returns, 'The state.');
    assert.equal(hook.deprecated, 'Use `Button`.');
  });

  it('splits docs into sections with site anchors, outside code fences', () => {
    const [doc] = index.docs;
    assert.equal(doc!.path, '/docs/buttons/button');
    assert.equal(doc!.description, 'Buttons.');
    assert.deepEqual(doc!.sections.map((s) => [s.heading, s.anchor]), [['Button', ''], ['Sizes sm and md', 'sizes-sm-and-md'], ['Sizes sm and md', 'sizes-sm-and-md-2']]);
    assert.match(doc!.sections[0]!.text, /^```tsx[\s\S]*Intro\.$/);
    assert.match(doc!.sections[1]!.text, /\[Menu\]\(https:\/\/salmonui\.dev\/docs\/buttons\/menu\)[\s\S]*## Not a heading/);
  });

  it('keeps demo sources and notes', () => {
    const [demo] = index.demos;
    assert.equal(demo!.path, '/demos/buttons/button-basics');
    assert.equal(demo!.notes, 'Click.');
    assert.equal(demo!.source, "// a comment\nimport { Button } from '@salmonui/buttons/button';\n");
    assert.deepEqual(demo!.imports, ['@salmonui/buttons/button']);
  });
});

describe('build-index helpers', () => {
  it('reads member types and defaults', () => {
    assert.equal(memberType('label', 'readonly label?: string;'), 'string');
    assert.equal(memberType('focus', 'focus(): void;'), 'focus(): void');
    assert.equal(defaultOf([{ name: 'defaultValue', text: '`true`' }]), 'true');
    assert.equal(defaultOf([], 'Defaults to `10`.'), '10');
    assert.equal(defaultOf([]), undefined);
  });

  it('classifies capitalized element-returning functions as components', () => {
    assert.equal(kindOf({ name: 'Grid', kind: 'function', signature: 'function Grid<Row>(props: P<Row>): import("react").JSX.Element;' }), 'component');
    assert.equal(kindOf({ name: 'createStore', kind: 'function', signature: 'function createStore(): Store;' }), 'function');
    assert.equal(kindOf({ name: 'DEFAULTS', kind: 'const', signature: 'const DEFAULTS: X;' }), 'const');
  });

  it('ignores headings in fences', () => {
    assert.deepEqual(splitSections('T', '```\n## x\n```\n').map((s) => s.heading), ['T']);
  });
});

describe('bundled index', { skip: existsSync(OUTPUT) ? false : 'dist/index.json not built (npm run mcp:index)' }, () => {
  it('is consistent: families resolve, demo imports pass check_imports, size stays reasonable', () => {
    const index = loadIndex(OUTPUT);
    const map = new ExportsMap(index);
    for (const pkg of index.packages) {
      for (const family of pkg.families) {
        assert.ok(map.entries.has(family.specifier), `${family.specifier} is an entry`);
        if (family.stylesheet) assert.equal(map.entries.get(family.stylesheet)?.kind, 'css', `${family.stylesheet} is a stylesheet`);
        for (const x of family.alsoImport ?? []) assert.equal(map.entries.get(x.stylesheet)?.kind, 'css', `${family.name} alsoImport ${x.stylesheet} is a stylesheet`);
      }
    }
    const pdf = index.packages.find((p) => p.name === '@salmonui/pdf-viewer')?.families[0];
    assert.deepEqual(pdf?.alsoImport, [{ stylesheet: '@salmonui/buttons/button/styles.css', when: null }]);
    const errors = index.demos.flatMap((demo) => checkImports(demo.source, map, { stylesheets: false }).problems.filter((p) => p.severity === 'error').map((p) => `${demo.id}: ${p.message}`));
    assert.deepEqual(errors, []);
    assert.ok(TOOLS.length === 5);
  });
});
