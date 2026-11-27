// Writes the published stylesheets of every package from
// tooling/checks/packages.manifest.mjs:
//
// - `dist/<family>.css` of each family (css-composition.mjs): the
//   stylesheets of the families of other packages it renders (`carries`),
//   then its own `styles` entries (its files and the `<package>:<module>`
//   modules its markup needs), each source file once, concatenated (never
//   `@import`, so there is no request waterfall). An application imports
//   `@salmonui/core/styles.css` and the stylesheet of each family it uses,
//   never one of a family rendered internally. Each module sits in its
//   cascade layer (`layeredStyles()`), so a module repeated by a later
//   sheet never beats the family rules of an earlier one.
// - `dist/styles.css` of a package with more than one family: every file of
//   every family stylesheet once, in manifest order (a convenience aggregate).
// - the extra stylesheets listed in `css` (core `styles.css`: the theme
//   variables; charts `viz-*.css`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { layeredStyles, stylesheetFiles } from './css-composition.mjs';
import { PACKAGES } from './packages.manifest.mjs';

const root = new URL('../../', import.meta.url);

for (const pkg of PACKAGES) {
  const outputs = new Map();
  const all = [];
  for (const fam of pkg.families) {
    const files = stylesheetFiles(fam.name);
    if (files.length) outputs.set(`${fam.name}.css`, layeredStyles(files));
    for (const f of files) if (!all.some((e) => e.pkg === f.pkg && e.file === f.file)) all.push(f);
  }
  if (pkg.families.length > 1 && all.length) outputs.set('styles.css', layeredStyles(all));
  for (const [sub, files] of Object.entries(pkg.css ?? {})) outputs.set(sub.slice(2), layeredStyles(files.map((file) => ({ pkg: pkg.name, file }))));
  if (outputs.size === 0) continue;
  const dist = new URL(`${pkg.dir}/dist/`, root);
  mkdirSync(dist, { recursive: true });
  for (const [name, css] of outputs) writeFileSync(new URL(name, dist), css);
}
