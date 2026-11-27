// site:api: the API reference data. Requires `npm run build`.
//
// Reads the built declaration files of every `exports` subpath of the
// published packages (the package manifest, `tooling/checks/packages.manifest.mjs`;
// `package.json` `exports` -> `types`) and writes the git-ignored `docs/site/generated/api.json` that the reference
// pages read at build time.
//
// It uses the TypeScript 7 native API (`typescript/unstable/sync`). That API
// may change in any TypeScript release, so this is the only file in the
// repository that imports it; nothing else depends on its shape. When a
// TypeScript upgrade breaks it, only this script is fixed.
//
// Private `./internal/*` exports (shared between @salmonui packages, not
// semver) and every symbol or member tagged `@internal` are left out: the
// packages build with `stripInternal` off, so the declaration files keep them.
//
// Fails (non-zero exit, nothing written) when a `types` target is missing,
// when the declaration files do not type-check, when an entry exports no
// symbols, or when the unstable API cannot be loaded.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PACKAGES } from '../checks/packages.manifest.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const OUTPUT = join(repoRoot, 'docs/site/generated/api.json');

/** `"."` -> `"index"`, `"./edit-state"` -> `"edit-state"`. */
export function entrySlug(subpath) {
  if (subpath === '.') return 'index';
  return subpath.replace(/^\.\//, '').replaceAll('/', '-');
}

/** `"@salmonui/data-grid"` -> `"data-grid"`. */
export function packageSlug(name) {
  return name.replace(/^@[^/]+\//, '');
}

/** True for a private subpath: `./internal/*` and any other wildcard pattern. */
export function isPrivateSubpath(subpath) {
  return subpath.includes('*') || subpath === './internal' || subpath.startsWith('./internal/');
}

/** The `types` target of each public `exports` subpath; subpaths without one (CSS, package.json) and private ones are skipped. */
export function typedEntries(exportsField) {
  const out = [];
  for (const [subpath, value] of Object.entries(exportsField ?? {})) {
    if (isPrivateSubpath(subpath)) continue;
    if (value && typeof value === 'object' && typeof value.types === 'string') out.push({ subpath, types: value.types });
  }
  return out;
}

/** First paragraph of a JSDoc body. */
export function summaryOf(docs) {
  return docs.trim().split(/\n\s*\n/)[0]?.trim() ?? '';
}

/** Drops the `export` / `declare` modifiers the printer keeps on top-level declarations. */
export function stripModifiers(text) {
  return text.replace(/^(export\s+)?(default\s+)?(declare\s+)?/, '');
}

const ELEMENT_RETURN = /^(?:React\.)?(?:JSX\.)?Element$|^(?:React\.)?(?:ReactElement|ReactNode|ReactPortal)(?:<.*>)?$|^null$/;

/** True when a printed return type is a React element type (or a union of them, `null` included). */
export function isElementReturn(typeText) {
  const parts = typeText.split('|').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => ELEMENT_RETURN.test(p));
}

async function loadApi() {
  try {
    const [sync, ast] = await Promise.all([import('typescript/unstable/sync'), import('typescript/unstable/ast')]);
    return { ...sync, SyntaxKind: ast.SyntaxKind };
  } catch (error) {
    throw new Error(`site:api: cannot load typescript/unstable/sync (TypeScript 7 native API): ${error.message}`);
  }
}

function gitSha(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/** True when JSDoc tags mark a declaration `@internal`. */
export function isInternalTagged(tags) {
  return tags.some((tag) => tag.name === 'internal');
}

/**
 * Published packages, in manifest order. Under the repository they are the
 * manifest's packages; under another `root` (tests) every non-private
 * `packages/<dir>/package.json`, in directory order.
 */
function readPackages(root) {
  const dirs =
    root === resolve(repoRoot)
      ? PACKAGES.map((p) => join(root, p.dir))
      : readdirSync(join(root, 'packages'))
          .sort()
          .map((name) => join(root, 'packages', name));
  return dirs
    .filter((pkgDir) => existsSync(join(pkgDir, 'package.json')))
    .map((pkgDir) => ({ dir: pkgDir, pkg: JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) }))
    .filter(({ pkg }) => !pkg.private);
}

/**
 * Builds the API reference object. Throws on a missing `types` target, an
 * entry with no exported symbols, or an unloadable API.
 *
 * @param {{ root?: string }} [options] `root` holds `packages/*` (defaults to the repository).
 */
export async function buildApiReference({ root = repoRoot } = {}) {
  root = resolve(root);
  const packages = readPackages(root).map(({ dir, pkg }) => {
    const entries = typedEntries(pkg.exports).map((e) => ({ ...e, file: resolve(dir, e.types) }));
    if (entries.length === 0) throw new Error(`site:api: ${pkg.name} has no \`exports\` subpath with a \`types\` target`);
    return { name: pkg.name, dir, entries };
  });
  if (packages.length === 0) throw new Error(`site:api: no published packages under ${join(root, 'packages')}`);
  const missing = packages.flatMap((p) => p.entries.filter((e) => !existsSync(e.file)).map((e) => `${p.name} "${e.subpath}" -> ${e.file}`));
  if (missing.length > 0) {
    throw new Error(`site:api: missing declaration files (run \`npm run build\` first):\n  ${missing.join('\n  ')}`);
  }

  const ts = await loadApi();
  const { API, SymbolFlags, SignatureKind } = ts;
  const files = packages.flatMap((p) => p.entries.map((e) => e.file));
  // One program over every entry, from a virtual tsconfig served through the fs callbacks.
  const configFile = join(root, '__salmon_api_reference__.tsconfig.json');
  const config = JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      exactOptionalPropertyTypes: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
    },
    files,
  });
  const api = new API({
    cwd: root,
    fs: {
      readFile: (f) => (f === configFile ? config : undefined),
      fileExists: (f) => (f === configFile ? true : undefined),
    },
  });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configFile] });
    const project = snapshot.getProject(configFile);
    if (!project) throw new Error('site:api: the TypeScript API did not load the reference project');
    const { program, checker, emitter } = project;
    // An unresolved import would silently print as `any`; refuse to document a broken program.
    const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];
    if (diagnostics.length > 0) {
      const lines = diagnostics.slice(0, 10).map((d) => `${d.fileName ?? '(program)'}: TS${d.code} ${d.text}`);
      throw new Error(`site:api: the declaration files do not type-check (${diagnostics.length} diagnostics):\n  ${lines.join('\n  ')}`);
    }
    // Declarations under these dirs belong to the published API; members declared elsewhere
    // (lib.d.ts, @types/react) are inherited noise and are left out.
    const ownDirs = packages.map((p) => `${p.dir}${sep}`.toLowerCase());
    const isOwn = (handle) => ownDirs.some((d) => handle.path.toLowerCase().startsWith(d));

    const print = (handle) => {
      const node = handle.resolve(project);
      if (!node) return '';
      // A variable prints without `const`; print its statement instead.
      const target = node.kind === ts.SyntaxKind.VariableDeclaration && node.parent?.parent ? node.parent.parent : node;
      return stripModifiers(emitter.printNode(target).trim());
    };
    // True when the node behind `handle` is a child (or, through a type literal, a
    // grandchild) of a declaration whose `path#index` key is in `owners`.
    const isDeclaredIn = (handle, owners) => {
      const node = handle.resolve(project);
      const parent = node?.parent;
      const key = (n) => `${handle.path}#${n.index}`;
      return parent !== undefined && (owners.has(key(parent)) || (parent.parent !== undefined && owners.has(key(parent.parent))));
    };
    const docsOf = (symbol) => {
      const docs = checker.getDocumentationCommentOfSymbol(symbol).trim();
      const tags = checker.getJsDocTagsOfSymbol(symbol).map((t) => ({ name: t.name, text: (t.text ?? '').trim() }));
      return { summary: summaryOf(docs), docs, tags };
    };
    const callSignatures = (symbol) => {
      const type = checker.getTypeOfSymbol(symbol);
      return type ? checker.getSignaturesOfType(type, SignatureKind.Call) : [];
    };
    const isComponent = (name, symbol) => {
      if (!/^[A-Z]/.test(name)) return false;
      const sigs = callSignatures(symbol);
      if (sigs.length > 0) {
        return sigs.every((s) => {
          const ret = checker.getReturnTypeOfSignature(s);
          return ret !== undefined && isElementReturn(checker.typeToString(ret));
        });
      }
      const type = checker.getTypeOfSymbol(symbol);
      return type !== undefined && /ExoticComponent</.test(checker.typeToString(type));
    };
    const kindOf = (name, symbol) => {
      const f = symbol.flags;
      if (f & SymbolFlags.Class) return 'class';
      if (f & SymbolFlags.Enum) return 'enum';
      if (f & SymbolFlags.Function) return isComponent(name, symbol) ? 'component' : 'function';
      if (f & SymbolFlags.Variable) return isComponent(name, symbol) ? 'component' : 'const';
      if (f & SymbolFlags.Interface) return 'interface';
      if (f & SymbolFlags.TypeAlias) return 'type';
      if (f & SymbolFlags.Namespace) return 'namespace';
      return undefined;
    };
    const membersOf = (kind, symbol) => {
      let props;
      if (kind === 'enum') {
        props = [...symbol.getExports().values()];
      } else if (kind === 'interface' || kind === 'class' || kind === 'type') {
        const type = checker.getDeclaredTypeOfSymbol(symbol);
        if (type.isUnionType() || type.isTypeParameter() || callSignatureCount(type) > 0) return undefined;
        props = checker.getPropertiesOfType(type);
      } else {
        return undefined;
      }
      const owners = new Set(symbol.declarations.map((h) => `${h.path}#${h.index}`));
      const members = [];
      for (const m of props) {
        const decls = m.declarations.filter(isOwn);
        if (m.declarations.length > 0 && decls.length === 0) continue;
        if (isInternalTagged(checker.getJsDocTagsOfSymbol(m))) continue;
        const optional = (m.flags & SymbolFlags.Optional) !== 0;
        // Own members (declared directly in this symbol's interface / class body
        // or type literal) print from source. Inherited members print from the
        // instantiated type, so a base's type parameters (`Item` in `Base<Item>`)
        // show as their arguments (`Row`). Instantiated members are transient
        // symbols without a parent, so ownership is decided from the AST.
        const own = kind === 'enum' || decls.some((h) => isDeclaredIn(h, owners));
        let signature = own ? decls.map(print).filter(Boolean).join('\n') : '';
        if (!signature) {
          const t = checker.getTypeOfSymbol(m);
          const text = t ? checker.typeToString(t) : 'unknown';
          signature = `${m.name}${optional ? '?' : ''}: ${optional ? text.replace(/ \| undefined$/, '') : text};`;
        }
        members.push({ name: m.name, signature, optional, inherited: !own, ...docsOf(m) });
      }
      return members.length > 0 ? members : undefined;
    };
    const callSignatureCount = (type) => checker.getSignaturesOfType(type, SignatureKind.Call).length;

    // An export is internal when its target's JSDoc (or the alias's own) carries `@internal`.
    const isInternalExport = (exported) => {
      const target = exported.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      return isInternalTagged(checker.getJsDocTagsOfSymbol(target)) || (target !== exported && isInternalTagged(checker.getJsDocTagsOfSymbol(exported)));
    };

    const cache = new Map();
    const describe = (exported) => {
      const target = exported.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      if (checker.isUnknownSymbol(target)) throw new Error(`site:api: export ${exported.name} does not resolve`);
      const key = `${exported.name}\0${target.id}`;
      if (cache.has(key)) return cache.get(key);
      const kind = kindOf(exported.name, target);
      if (!kind) throw new Error(`site:api: export ${exported.name} has an unsupported symbol kind (flags ${target.flags})`);
      const signature = target.declarations.map(print).filter(Boolean).join('\n\n');
      const members = membersOf(kind, target);
      const symbol = { name: exported.name, kind, signature, ...docsOf(target), ...(members ? { members } : {}) };
      cache.set(key, symbol);
      return symbol;
    };

    const result = {
      version: 1,
      generatedFrom: gitSha(root),
      packages: packages.map((p) => ({
        name: p.name,
        slug: packageSlug(p.name),
        entries: p.entries.flatMap((e) => {
          const label = `${p.name} "${e.subpath}" (${e.types})`;
          const sourceFile = program.getSourceFile(e.file);
          if (!sourceFile) throw new Error(`site:api: ${label} is not in the program`);
          const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
          const all = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
          if (all.length === 0) throw new Error(`site:api: ${label} exports no symbols`);
          // An entry whose every export is `@internal` has no reference page.
          const exported = all.filter((symbol) => !isInternalExport(symbol));
          if (exported.length === 0) return [];
          const symbols = exported.map(describe).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
          return [{ subpath: e.subpath, slug: entrySlug(e.subpath), symbols }];
        }),
      })),
    };
    return result;
  } finally {
    api.close();
  }
}

/** Writes the reference atomically (temp file + rename), so a failed run never leaves a partial file. */
export function writeApiReference(reference, file = OUTPUT) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(reference)}\n`);
  renameSync(tmp, file);
}

async function main() {
  const started = performance.now();
  const reference = await buildApiReference();
  writeApiReference(reference);
  let total = 0;
  for (const p of reference.packages) {
    for (const e of p.entries) {
      total += e.symbols.length;
      console.log(`  ${p.name}${e.subpath === '.' ? '' : e.subpath.slice(1)}: ${e.symbols.length}`);
    }
  }
  const ms = Math.round(performance.now() - started);
  console.log(`site:api: ${total} symbols in ${reference.packages.reduce((n, p) => n + p.entries.length, 0)} entries -> ${OUTPUT} (${ms} ms)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
