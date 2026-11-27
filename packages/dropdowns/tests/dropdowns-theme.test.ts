// Dropdown colors come from the theme only:
// every color declaration of the Select, Combobox, Listbox,
// Mention and TreeSelect stylesheets reads a `--salmon-*` variable that the
// theme derives from the five seeds (or a keyword such as `transparent`), so
// the contrast guarantees of theme.test.ts hold for options, chips and
// popups; system colors appear only inside `@media (forced-colors: active)`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createThemeCss } from '@salmonui/core/server';
import { defaultSalmonTheme } from '@salmonui/core/theme';
import { contrastRatio, parseHex } from '@salmonui/core/internal/theme/color';
import { resolveTheme } from '@salmonui/core/internal/theme/derive';

const FILES = ['dropdown', 'listbox', 'select', 'combobox', 'mention', 'tree-select'];
const COLOR_PROPS = /^(color|background|background-color|border(-(block|inline)(-(start|end))?)?(-color)?|outline(-color)?|accent-color|caret-color|fill|stroke|text-decoration-color|box-shadow)$/;
const KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'none', 'initial', 'unset', '0', 'solid']);

function stripForcedColors(css: string): string {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (;;) {
    const at = out.indexOf('@media (forced-colors: active)');
    if (at < 0) return out;
    let depth = 0;
    let end = out.indexOf('{', at);
    for (let i = end; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    out = out.slice(0, at) + out.slice(end);
  }
}

describe('dropdown colors', () => {
  const themeCss = createThemeCss(defaultSalmonTheme);
  const defined = new Set([...themeCss.matchAll(/(--salmon-[\w-]+)\s*:/g)].map((m) => m[1]));

  for (const file of FILES) {
    it(`${file}.css reads theme variables only for colors`, () => {
      // A fallback inside var() applies only without the theme stylesheet; the theme value is what renders.
      const css = stripForcedColors(readFileSync(new URL(`../../dropdowns/styles/${file}.css`, import.meta.url), 'utf8')).replace(/var\((--salmon-[\w-]+),[^()]*\)/g, 'var($1)');
      assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|\b(Canvas|CanvasText|Highlight|HighlightText|GrayText|ButtonText)\b/i);
      for (const m of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        const [, prop, value] = m as unknown as [string, string, string];
        if (!COLOR_PROPS.test(prop)) continue;
        for (const v of value.matchAll(/var\((--salmon-[\w-]+)/g)) {
          const name = v[1] as string;
          if (/width|radius|space|size|shadow|offset/.test(name)) continue;
          assert.ok(defined.has(name), `${file}.css ${prop}: ${name} is not a theme variable`);
        }
        const rest = value.replace(/var\([^)]*\)+/g, ' ').replace(/\d+(\.\d+)?(px|em|rem|%)?/g, ' ').replace(/inset|solid|dashed/g, ' ');
        for (const word of rest.split(/[\s,/]+/).filter(Boolean)) assert.ok(KEYWORDS.has(word.toLowerCase()), `${file}.css ${prop}: literal "${word}"`);
      }
    });
  }

  it('option and chip text meets 4.5:1 on the surfaces they sit on, both schemes', () => {
    const theme = resolveTheme();
    for (const scheme of ['light', 'dark'] as const) {
      const vars = theme[scheme] as Record<string, string>;
      const pairs: [string, string][] = [
        ['--salmon-text-primary', '--salmon-surface-overlay'],
        ['--salmon-text-primary', '--salmon-surface-selected'],
        ['--salmon-text-primary', '--salmon-surface-hover'],
        ['--salmon-text-primary', '--salmon-surface-base'],
        ['--salmon-text-secondary', '--salmon-surface-overlay'],
      ];
      for (const [fg, bg] of pairs) {
        assert.ok(vars[fg] && vars[bg], `${scheme}: ${fg} and ${bg} are derived`);
        const ratio = contrastRatio(parseHex(vars[fg] as string)!, parseHex(vars[bg] as string)!);
        assert.ok(ratio >= 4.5, `${scheme} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
      }
    }
  });
});
