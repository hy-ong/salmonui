// Density, font family, neutral tint and surfaces: derivation guarantees, CSS emission and
// the server render of ThemeStyle / ThemeProvider.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement, use } from 'react';
import { renderToString } from 'react-dom/server';
import { createThemeCss, getThemeHash, ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import { contrastRatio, parseHex, rgbToOklch } from '../dist/internal/theme/color.js';
import { CompactDensityContext } from '../dist/internal/theme/density.js';
import { resolveTheme } from '../dist/internal/theme/derive.js';
import { resolveScope } from '../dist/internal/theme/scope.js';
import { deriveSurface } from '../dist/internal/theme/surfaces.js';

const rgb = (hex: string) => parseHex(hex) as readonly [number, number, number];
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

/** The declarations of the first rule whose selector list contains `selector`. */
function declarations(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `no rule for ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const line of body.split(';')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

let state = 11;
const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
const hex = () => `#${(next() & 0xffffff).toString(16).padStart(6, '0')}` as `#${string}`;

function checkRoles(tokens: Record<string, string>, label: string): void {
  const v = (name: string) => tokens[name] as string;
  for (const s of ['--salmon-surface-base', '--salmon-surface-raised', '--salmon-surface-overlay', '--salmon-surface-header', '--salmon-surface-hover']) {
    assert.ok(ratio(v('--salmon-text-primary'), v(s)) >= 7, `${label}: text-primary on ${s}`);
    assert.ok(ratio(v('--salmon-text-secondary'), v(s)) >= 4.5, `${label}: text-secondary on ${s}`);
    assert.ok(ratio(v('--salmon-text-placeholder'), v(s)) >= 4.5, `${label}: placeholder on ${s}`);
    for (const b of ['--salmon-border-default', '--salmon-border-strong', '--salmon-state-focus-ring']) {
      assert.ok(ratio(v(b), v(s)) >= 3, `${label}: ${b} on ${s}`);
    }
  }
}

describe('theme appearance settings: default path', () => {
  it('unset settings change neither the default CSS nor its hash', () => {
    const committed = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
    assert.ok(committed.includes(`[data-salmon-theme="${getThemeHash()}"]`));
    for (const css of [createThemeCss(), committed]) {
      assert.ok(!css.includes('--salmon-control-'), 'no density variables');
      assert.ok(!css.includes('data-salmon-surface'), 'no surface rules');
      assert.ok(!css.includes('--salmon-font-size-cell'), 'no cell font size');
    }
    assert.equal(getThemeHash({ colors: { primary: '#0e4d5c' } }), getThemeHash({ colors: { primary: '#0E4D5C' } }));
  });
});

describe('density', () => {
  it('compact emits the compact metric set; an explicit default emits the default set; unset emits none', () => {
    const compact = declarations(createThemeCss({ density: 'compact' }), `[data-salmon-theme="${getThemeHash({ density: 'compact' })}"]`);
    assert.equal(compact['--salmon-control-height-sm'], '20px');
    assert.equal(compact['--salmon-control-height-md'], '28px');
    assert.equal(compact['--salmon-control-height-lg'], '36px');
    assert.equal(compact['--salmon-control-padding-md'], '10px');
    assert.equal(compact['--salmon-font-size-cell'], '13px');
    const reset = declarations(createThemeCss({ density: 'default' }), `[data-salmon-theme="${getThemeHash({ density: 'default' })}"]`);
    assert.equal(reset['--salmon-control-height-md'], '32px');
    assert.equal(reset['--salmon-control-padding-md'], '12px');
    assert.equal(reset['--salmon-font-size-cell'], '14px');
    const hashes = new Set([getThemeHash(), getThemeHash({ density: 'compact' }), getThemeHash({ density: 'default' })]);
    assert.equal(hashes.size, 3);
    assert.equal(resolveScope({ density: 'roomy' as 'compact' }).density, undefined);
  });

  it('ThemeProvider provides the density to JavaScript metrics; a nested scope inherits it unless it sets one', () => {
    function Probe() {
      return createElement('i', null, use(CompactDensityContext) ? 'compact' : 'default');
    }
    const render = (outer: SalmonThemeInput, inner?: SalmonThemeInput) =>
      renderToString(createElement(ThemeProvider, { theme: outer }, inner ? createElement(ThemeProvider, { theme: inner }, createElement(Probe)) : createElement(Probe)));
    assert.match(render({}), /<i>default<\/i>/);
    assert.match(render({ density: 'compact' }), /<i>compact<\/i>/);
    assert.match(render({ density: 'compact' }, { colorScheme: 'dark' }), /<i>compact<\/i>/);
    assert.match(render({ density: 'compact' }, { density: 'default' }), /<i>default<\/i>/);
  });
});

describe('font family', () => {
  it('sets --salmon-font-sans and rejects anything that is not a font-family list', () => {
    const font = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const t = resolveTheme({ fontFamily: font });
    assert.equal(t.font, font);
    assert.ok(createThemeCss({ fontFamily: font }).includes(`--salmon-font-sans: ${font};`));
    assert.notEqual(getThemeHash({ fontFamily: font }), getThemeHash());
    for (const bad of ['Inter; color: red', 'x}body{', 'url(evil)', '']) {
      const r = resolveTheme({ fontFamily: bad });
      assert.deepEqual([...r.invalid], ['fontFamily'], bad);
      assert.equal(r.font, undefined);
      assert.ok(!createThemeCss({ fontFamily: bad }).includes('--salmon-font-sans'));
    }
  });
});

describe('neutral tint', () => {
  it('tints the mid tones toward the hue, keeps white white, and clamps the chroma', () => {
    const t = resolveTheme({ colors: { primary: '#0e4d5c' }, neutral: { chroma: 0.032 } });
    const primaryHue = rgbToOklch(rgb('#0e4d5c')).h;
    const secondary = rgbToOklch(rgb(t.light['--salmon-text-secondary'] as string));
    assert.ok(secondary.c > 0.02, `mid-tone chroma ${secondary.c}`);
    assert.ok(Math.abs(secondary.h - primaryHue) < 6, `hue ${secondary.h} vs ${primaryHue}`);
    assert.equal(t.light['--salmon-surface-base'], '#ffffff');
    const untinted = rgbToOklch(rgb(resolveTheme({ colors: { primary: '#0e4d5c' } }).light['--salmon-text-secondary'] as string));
    assert.ok(untinted.c < 0.01);
    const hued = rgbToOklch(rgb(resolveTheme({ neutral: { hue: 30, chroma: 0.03 } }).light['--salmon-border-default'] as string));
    assert.ok(Math.abs(hued.h - 30) < 6, `explicit hue ${hued.h}`);
    const clamped = rgbToOklch(rgb(resolveTheme({ neutral: { chroma: 1 } }).light['--salmon-text-secondary'] as string));
    assert.ok(clamped.c <= 0.041, `clamped ${clamped.c}`);
  });

  it('meets the contrast guarantees with a tint for the default seeds and 20 random seeds and hues', () => {
    const inputs: SalmonThemeInput[] = [{ neutral: { chroma: 0.04 } }];
    for (let i = 0; i < 20; i++) inputs.push({ colors: { primary: hex(), success: hex(), warning: hex(), danger: hex(), info: hex() }, neutral: { hue: next() % 360, chroma: (next() % 41) / 1000 } });
    for (const input of inputs) {
      const t = resolveTheme(input);
      checkRoles(t.light as Record<string, string>, `light ${JSON.stringify(input)}`);
      checkRoles(t.dark as Record<string, string>, `dark ${JSON.stringify(input)}`);
    }
  });
});

describe('surfaces', () => {
  const seeds = ['#192225', '#0e4d5c', '#ffffff', '#f4f6f6', '#2563eb', '#7a7a7a', '#000000', '#ffe066', '#3a0ca3', '#8bd3c7', ...Array.from({ length: 20 }, hex)];

  it('derives fg 7:1 (the best of white and black where the seed allows less) and muted 4.5:1 against the background and hover; borders and focus 3:1', () => {
    const theme = resolveTheme({ colors: { primary: '#0e4d5c' } });
    for (const seed of seeds) {
      const s = deriveSurface(seed, theme);
      assert.equal(s.bg, seed);
      const best = Math.max(ratio('#ffffff', s.bg), ratio('#000000', s.bg));
      assert.ok(ratio(s.fg, s.bg) >= Math.min(7, best), `${seed}: fg ${s.fg}`);
      for (const bg of [s.bg, s.hover, s.selected, s.selectedHover]) assert.ok(ratio(s.fg, bg) >= 4.5, `${seed}: fg on ${bg}`);
      for (const bg of [s.bg, s.hover]) assert.ok(ratio(s.muted, bg) >= 4.5, `${seed}: muted ${s.muted} on ${bg}`);
      assert.ok(ratio(s.borderStrong, s.bg) >= 3, `${seed}: border ${s.borderStrong}`);
      assert.ok(ratio(s.focus, s.bg) >= 3, `${seed}: focus ${s.focus}`);
      assert.ok(ratio(s.link, s.bg) >= 4.5, `${seed}: link ${s.link}`);
      assert.equal(s.replacePrimary, [theme.light, theme.dark].some((t) => ratio(t['--salmon-color-primary'] as string, s.bg) < 3), seed);
    }
  });

  it('a near-black sidebar gets lighter steps, a mid-tone primary header darker ones and its accents replaced', () => {
    const theme = resolveTheme({ colors: { primary: '#0e4d5c' } });
    const sidebar = deriveSurface('#192225', theme);
    const l = (h: string) => rgbToOklch(rgb(h)).l;
    assert.ok(l(sidebar.selected) > l('#192225'));
    assert.ok(Math.abs(l(sidebar.selected) - l('#3a484c')) < 0.02, `selected ${sidebar.selected}`);
    assert.ok(sidebar.dark && sidebar.replacePrimary);
    const header = deriveSurface('#0e4d5c', theme);
    assert.ok(l(header.hover) < l('#0e4d5c'));
    assert.ok(header.replacePrimary);
    const appBar = deriveSurface('#ffffff', theme);
    assert.ok(!appBar.dark && !appBar.replacePrimary);
    assert.ok(l(appBar.hover) < 1);
  });

  it('emits the documented variables on the scope and one remap rule per surface; primary resolves; invalid is dropped', () => {
    const input: SalmonThemeInput = { colors: { primary: '#0e4d5c' }, surfaces: { sidebar: '#192225', appBar: '#ffffff', tableHeader: 'primary' } };
    const hash = getThemeHash(input);
    const css = createThemeCss(input);
    const scope = declarations(css, `[data-salmon-theme="${hash}"]`);
    for (const name of ['sidebar', 'app-bar', 'table-header']) {
      for (const role of ['bg', 'fg', 'muted', 'hover', 'selected-bg', 'selected-fg', 'border']) assert.ok(`--salmon-surface-${name}-${role}` in scope, `${name}-${role}`);
    }
    assert.equal(scope['--salmon-surface-table-header-bg'], '#0e4d5c');
    const header = declarations(css, `[data-salmon-theme="${hash}"] [data-salmon-surface="table-header"]`);
    assert.equal(header['background-color'], '#0e4d5c');
    assert.equal(header['--salmon-surface-header'], '#0e4d5c');
    assert.equal(header['--salmon-color-primary'], header['--salmon-text-primary']);
    assert.equal(header['color-scheme'], 'dark');
    assert.ok(ratio(header['--salmon-text-primary'] as string, '#0e4d5c') >= 7);
    const sidebar = declarations(css, `[data-salmon-theme="${hash}"] [data-salmon-surface="sidebar"]`);
    assert.equal(sidebar['--salmon-surface-raised'], '#192225');
    // The surface rules come after the scheme blocks, so they win over inherited scheme values.
    assert.ok(css.lastIndexOf('prefers-contrast') < css.indexOf('[data-salmon-surface='));
    const bad = resolveScope({ surfaces: { sidebar: 'navy' as `#${string}` } });
    assert.deepEqual([...bad.invalid], ['surfaces.sidebar']);
    assert.ok(!createThemeCss({ surfaces: { sidebar: 'navy' as `#${string}` } }).includes('data-salmon-surface'));
  });

  it('ThemeStyle renders the same deterministic text on every render', () => {
    const input: SalmonThemeInput = { density: 'compact', fontFamily: 'Inter, sans-serif', neutral: { chroma: 0.032 }, colors: { primary: '#0e4d5c' }, surfaces: { sidebar: '#192225', tableHeader: 'primary' } };
    const a = renderToString(createElement(ThemeStyle, { theme: input }));
    const b = renderToString(createElement(ThemeStyle, { theme: { ...input, surfaces: { ...input.surfaces } } }));
    assert.equal(a, b);
    assert.ok(a.includes('--salmon-control-height-md: 28px;'));
    assert.ok(a.includes('data-salmon-surface'));
    const provider = renderToString(createElement(ThemeProvider, { theme: input }, 'x'));
    assert.ok(provider.includes(`data-salmon-theme="${getThemeHash(input)}"`));
  });
});
