// Locale pack coverage: every component family that
// reads a `LocaleProvider` catalog entry (`useLocaleText('<family>', ...)`
// in packages/*/src) is registered in ./locale-registry/<package>.mjs with
// its built-in English text, and every built-in locale pack has the same
// families with exactly the same keys. A key added to a component's English
// defaults without its translations fails here. Requires `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../', import.meta.url).pathname;
const registryDir = new URL('./locale-registry/', import.meta.url).pathname;
const PACKS = { 'zh-TW': 'packages/core/dist/locale/zh-TW.js' };

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** Family names the sources read: `useLocaleText('pager', ...)` or `use(LocaleContext)?.('pager', ...)`. */
function familiesInSource() {
  const found = new Map();
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const src = join(root, 'packages', pkg, 'src');
    try {
      statSync(src);
    } catch {
      continue;
    }
    for (const file of sourceFiles(src)) {
      if (file.includes(`${join('core', 'src', 'locale')}`)) continue;
      const text = readFileSync(file, 'utf8');
      // The hook, or the context read it wraps (`use(LocaleContext)?.('message', ...)`).
      for (const m of text.matchAll(/(?:useLocaleText(?:<[^>]*>)?\(|use\(LocaleContext\)\?\.\()\s*'([A-Za-z0-9]+)'/g)) found.set(m[1], file.replace(root, ''));
    }
  }
  return found;
}

async function registry() {
  const families = new Map();
  for (const name of readdirSync(registryDir).filter((n) => n.endsWith('.mjs')).sort()) {
    const entries = (await import(pathToFileURL(join(registryDir, name)).href)).default;
    for (const [family, spec] of Object.entries(entries)) {
      assert.ok(!families.has(family), `locale family "${family}" is registered twice (${name})`);
      families.set(family, { ...spec, file: name });
    }
  }
  return families;
}

/** The English keys of a registered family. */
async function englishKeys(spec) {
  const keys = new Set(spec.keys ?? []);
  for (const { module, export: name, prefix = '', omit = [] } of spec.defaults ?? []) {
    const mod = await import(pathToFileURL(join(root, module)).href);
    const value = mod[name];
    assert.ok(value && typeof value === 'object', `${module} has no object export ${name}`);
    for (const key of Object.keys(value)) if (!omit.includes(key)) keys.add(`${prefix}${prefix ? key[0].toUpperCase() + key.slice(1) : key}`);
  }
  return keys;
}

test('every family a component reads is registered with its English text', async () => {
  const reg = await registry();
  const used = familiesInSource();
  const missing = [...used.keys()].filter((f) => !reg.has(f)).map((f) => `${f} (read in ${used.get(f)})`);
  assert.deepEqual(missing, [], 'register these families in tooling/checks/tests/locale-registry/');
  const unused = [...reg.keys()].filter((f) => !used.has(f) && !reg.get(f).indirect);
  assert.deepEqual(unused, [], 'registered families no component reads (mark `indirect: true` when another family reads them)');
});

for (const [tag, path] of Object.entries(PACKS)) {
  test(`the ${tag} pack covers every key of every family`, async () => {
    const pack = await import(pathToFileURL(join(root, path)).href);
    const catalog = Object.values(pack).find((v) => v && typeof v === 'object' && Object.isFrozen(v) && 'pager' in v);
    assert.ok(catalog, `${path} exports no catalog object`);
    const reg = await registry();
    const problems = [];
    for (const [family, spec] of reg) {
      const entry = catalog[family];
      if (!entry) {
        problems.push(`${family}: missing family`);
        continue;
      }
      const english = await englishKeys(spec);
      for (const key of english) {
        if (!(key in entry)) problems.push(`${family}.${key}: missing`);
        else if (typeof entry[key] === 'string' && entry[key] === '' && !(spec.empty ?? []).includes(key)) problems.push(`${family}.${key}: empty`);
      }
      for (const key of Object.keys(entry)) if (!english.has(key)) problems.push(`${family}.${key}: not an English key`);
    }
    for (const family of Object.keys(catalog)) if (!reg.has(family)) problems.push(`${family}: not a registered family`);
    assert.deepEqual(problems, []);
  });
}
