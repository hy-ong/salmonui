import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createThemeCss, getThemeHash, ThemeStyle } from '@salmonui/core/server';
import { defaultSalmonTheme, ThemeProvider } from '@salmonui/core/theme';
import { contrastRatio, parseHex } from '../dist/internal/theme/color.js';
import { resolveTheme } from '../dist/internal/theme/derive.js';
import { FIXED_TOKENS } from '../dist/internal/theme/fixed.js';

const DOCUMENTED = [
  ...['primary', 'success', 'warning', 'danger', 'info'].flatMap((n) =>
    ['', '-hover', '-active', '-subtle', '-subtle-hover', '-border', '-text', '-on'].map((s) => `--salmon-color-${n}${s}`),
  ),
  ...['base', 'raised', 'overlay', 'sunken', 'header', 'hover', 'selected', 'selected-hover', 'disabled', 'backdrop'].map((s) => `--salmon-surface-${s}`),
  ...['default', 'subtle', 'strong', 'selected'].map((s) => `--salmon-border-${s}`),
  ...['primary', 'secondary', 'placeholder', 'disabled', 'link', 'inverse'].map((s) => `--salmon-text-${s}`),
  '--salmon-state-focus-ring', '--salmon-state-focus-ring-width', '--salmon-state-focus-ring-offset', '--salmon-state-invalid', '--salmon-state-drag-indicator',
  '--salmon-shadow-sm', '--salmon-shadow-md', '--salmon-shadow-lg', '--salmon-shadow-pinned',
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `--salmon-space-${i}`),
  '--salmon-radius-sm', '--salmon-radius-md', '--salmon-radius-lg', '--salmon-radius-full',
  '--salmon-font-sans', '--salmon-font-mono', '--salmon-font-size-sm', '--salmon-font-size-md', '--salmon-font-size-lg',
  '--salmon-line-height-tight', '--salmon-line-height-normal', '--salmon-font-weight-regular', '--salmon-font-weight-medium', '--salmon-font-weight-semibold',
  '--salmon-motion-duration-fast', '--salmon-motion-duration-normal', '--salmon-motion-easing',
];

const rgb = (hex: string) => parseHex(hex) as readonly [number, number, number];
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

function checkContrast(tokens: Record<string, string>, label: string): void {
  const v = (name: string) => tokens[name] as string;
  const surfaces = ['--salmon-surface-base', '--salmon-surface-raised', '--salmon-surface-overlay', '--salmon-surface-header', '--salmon-surface-hover'];
  for (const s of surfaces) {
    assert.ok(ratio(v('--salmon-text-primary'), v(s)) >= 7, `${label}: text-primary on ${s}`);
    assert.ok(ratio(v('--salmon-text-secondary'), v(s)) >= 4.5, `${label}: text-secondary on ${s}`);
    assert.ok(ratio(v('--salmon-text-placeholder'), v(s)) >= 4.5, `${label}: placeholder on ${s}`);
    for (const b of ['--salmon-border-default', '--salmon-border-strong', '--salmon-border-selected', '--salmon-state-focus-ring']) {
      assert.ok(ratio(v(b), v(s)) >= 3, `${label}: ${b} on ${s} = ${ratio(v(b), v(s)).toFixed(2)}`);
    }
  }
  for (const s of ['--salmon-surface-selected', '--salmon-surface-selected-hover']) {
    assert.ok(ratio(v('--salmon-text-primary'), v(s)) >= 7, `${label}: text-primary on ${s}`);
  }
  for (const name of ['primary', 'success', 'warning', 'danger', 'info']) {
    assert.ok(ratio(v(`--salmon-color-${name}-on`), v(`--salmon-color-${name}`)) >= 4.5, `${label}: ${name}-on on ${name}`);
    assert.ok(ratio(v(`--salmon-color-${name}-text`), v('--salmon-surface-base')) >= 4.5, `${label}: ${name}-text on base`);
  }
}

describe('theme derivation', () => {
  it('emits every documented variable for both schemes', () => {
    const t = resolveTheme();
    const light = { ...FIXED_TOKENS, ...t.light } as Record<string, string>;
    const dark = { ...FIXED_TOKENS, ...t.dark } as Record<string, string>;
    for (const name of DOCUMENTED) {
      assert.ok(name in light, `light ${name}`);
      assert.ok(name in dark || name in FIXED_TOKENS, `dark ${name}`);
    }
    // The precompiled stylesheet sets every variable on :root; a scope sets every color variable (the fixed
    // tokens are inherited from :root).
    const committed = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
    for (const name of DOCUMENTED) assert.ok(committed.includes(`${name}:`), `theme.css ${name}`);
    const css = createThemeCss({ colors: { primary: '#0f766e' } });
    for (const name of DOCUMENTED) assert.ok(css.includes(`${name}:`) === (!(name in FIXED_TOKENS) || name in t.lightContrast), `scope css ${name}`);
  });

  it('meets the contrast guarantees for the default seeds and 20 random seeds', () => {
    let state = 7;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    const hex = () => `#${(next() & 0xffffff).toString(16).padStart(6, '0')}` as `#${string}`;
    const inputs = [undefined, ...Array.from({ length: 20 }, () => ({ colors: { primary: hex(), success: hex(), warning: hex(), danger: hex(), info: hex() } }))];
    for (const input of inputs) {
      const t = resolveTheme(input);
      checkContrast(t.light as Record<string, string>, `light ${JSON.stringify(input?.colors ?? 'default')}`);
      checkContrast(t.dark as Record<string, string>, `dark ${JSON.stringify(input?.colors ?? 'default')}`);
    }
  });

  it('high-contrast tokens (prefers-contrast: more) meet 7:1 text and 4.5:1 boundaries for the default seeds and 20 random seeds', () => {
    let state = 11;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    const hex = () => `#${(next() & 0xffffff).toString(16).padStart(6, '0')}` as `#${string}`;
    const inputs = [undefined, ...Array.from({ length: 20 }, () => ({ colors: { primary: hex(), success: hex(), warning: hex(), danger: hex(), info: hex() } }))];
    for (const input of inputs) {
      const t = resolveTheme(input);
      for (const [scheme, base, more] of [['light', t.light, t.lightContrast], ['dark', t.dark, t.darkContrast]] as const) {
        const label = `${scheme} more ${JSON.stringify(input?.colors ?? 'default')}`;
        const tokens = { ...base, ...more } as Record<string, string>;
        const v = (name: string) => tokens[name] as string;
        // The overrides keep every standard guarantee and raise text to 7:1, boundaries to 4.5:1.
        assert.equal(v('--salmon-state-focus-ring-width'), '3px', label);
        checkContrast(tokens, label);
        const surfaces = ['--salmon-surface-base', '--salmon-surface-raised', '--salmon-surface-overlay', '--salmon-surface-header', '--salmon-surface-hover'];
        for (const s of [...surfaces, '--salmon-surface-selected', '--salmon-surface-selected-hover']) {
          const at = (a: string) => ratio(v(a), v(s)).toFixed(2);
          assert.ok(ratio(v('--salmon-text-secondary'), v(s)) >= 7, `${label}: text-secondary on ${s} = ${at('--salmon-text-secondary')}`);
          assert.ok(ratio(v('--salmon-border-strong'), v(s)) >= 7, `${label}: border-strong on ${s} = ${at('--salmon-border-strong')}`);
        }
        for (const s of surfaces) {
          const at = (a: string) => ratio(v(a), v(s)).toFixed(2);
          assert.ok(ratio(v('--salmon-text-placeholder'), v(s)) >= 7, `${label}: placeholder on ${s} = ${at('--salmon-text-placeholder')}`);
          assert.ok(ratio(v('--salmon-border-default'), v(s)) >= 4.5, `${label}: border-default on ${s} = ${at('--salmon-border-default')}`);
          assert.ok(ratio(v('--salmon-border-subtle'), v(s)) >= 3, `${label}: border-subtle on ${s} = ${at('--salmon-border-subtle')}`);
        }
        for (const name of ['primary', 'success', 'warning', 'danger', 'info']) {
          for (const s of ['--salmon-surface-base', '--salmon-surface-header', `--salmon-color-${name}-subtle`]) {
            assert.ok(ratio(v(`--salmon-color-${name}-text`), v(s)) >= 7, `${label}: ${name}-text on ${s} = ${ratio(v(`--salmon-color-${name}-text`), v(s)).toFixed(2)}`);
            assert.ok(ratio(v(`--salmon-color-${name}-border`), v(s)) >= 4.5, `${label}: ${name}-border on ${s}`);
          }
        }
      }
    }
  });

  it('keeps the seed exactly at its snapped step and rejects invalid seeds', () => {
    const t = resolveTheme({ colors: { primary: '#0F766E' } });
    assert.equal(t.colors.primary, '#0f766e');
    const bad = resolveTheme({ colors: { primary: 'red' as `#${string}`, danger: '#ff000080' as `#${string}` } });
    assert.deepEqual([...bad.invalid].sort(), ['danger', 'primary']);
    assert.equal(bad.colors.primary, defaultSalmonTheme.colors.primary);
  });

  it('is deterministic and hashed by seeds only', () => {
    assert.equal(createThemeCss({ colors: { primary: '#0f766e' } }), createThemeCss({ colors: { primary: '#0F766E' } }));
    assert.equal(getThemeHash({ colorScheme: 'dark' }), getThemeHash({ colorScheme: 'light' }));
    assert.notEqual(getThemeHash({ colors: { primary: '#0f766e' } }), getThemeHash());
    assert.equal(resolveTheme({ colorScheme: 'dark' }), resolveTheme({ colorScheme: 'dark' }), 'cached identity');
  });

  it('the committed default stylesheet matches the generator', () => {
    const css = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
    assert.ok(css.includes(`[data-salmon-theme="${getThemeHash()}"]`));
    assert.ok(css.includes(':root,'));
    assert.ok(css.includes('@media (prefers-color-scheme: dark)'));
    assert.ok(css.includes('@media (prefers-contrast: more)'));
  });
});

describe('ThemeProvider and ThemeStyle (SSR)', () => {
  it('ThemeStyle renders one deduplicated hoistable style', () => {
    const theme = { colors: { primary: '#0f766e' as const } };
    const html = renderToString(createElement('div', null, createElement(ThemeStyle, { theme }), createElement(ThemeStyle, { theme })));
    assert.equal([...html.matchAll(/<style/g)].length, 1);
    assert.match(html, new RegExp(`data-href="salmonui-theme-${getThemeHash(theme)}"`));
    assert.equal(html, renderToString(createElement('div', null, createElement(ThemeStyle, { theme }), createElement(ThemeStyle, { theme }))));
  });

  it('ThemeProvider sets the scope attributes; auto and inherit set no scheme attribute', () => {
    const html = (colorScheme?: 'light' | 'dark' | 'auto' | 'inherit') =>
      renderToString(createElement(ThemeProvider, { theme: colorScheme ? { colorScheme } : {}, className: 'x' }, 'child'));
    assert.match(html('dark'), new RegExp(`class="salmon-theme-scope x" data-salmon-theme="${getThemeHash()}" data-salmon-color-scheme="dark">child`));
    assert.doesNotMatch(html('auto'), /data-salmon-color-scheme/);
    assert.doesNotMatch(html('inherit'), /data-salmon-color-scheme/);
    assert.doesNotMatch(html(), /data-salmon-color-scheme/);
  });
});
