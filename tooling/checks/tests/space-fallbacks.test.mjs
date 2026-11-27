// Every `var(--salmon-space-N, <fallback>)` in a shipped or docs-site
// stylesheet uses the token's own value as its fallback (visual
// consistency): a stylesheet loaded without theme.css must not
// render a different spacing scale.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../../..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', 'dist', '.next', '.next-export', 'out', 'generated', 'test-results']);

function cssFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...cssFiles(path));
    else if (entry.name.endsWith('.css')) files.push(path);
  }
  return files;
}

test('space token fallbacks match the theme scale', () => {
  const theme = readFileSync(join(root, 'packages/core/styles/theme.css'), 'utf8');
  const scale = new Map([...theme.matchAll(/--salmon-space-(\d+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  assert.ok(scale.size >= 8, 'theme.css defines the space scale');
  const wrong = [];
  for (const file of [...cssFiles(join(root, 'packages')), ...cssFiles(join(root, 'docs/site'))]) {
    const css = readFileSync(file, 'utf8');
    for (const m of css.matchAll(/var\(--salmon-space-(\d+),\s*([^)]+)\)/g)) {
      const want = scale.get(m[1]);
      if (m[2].trim() !== want) wrong.push(`${file.slice(root.length)}: ${m[0]} (space-${m[1]} is ${want})`);
    }
  }
  assert.deepEqual(wrong, []);
});
