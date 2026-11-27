// Removes build output from every workspace package. Dependency-free so it
// runs before anything is built.
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const groups = ['packages', 'examples'];

for (const group of groups) {
  const dir = join(root, group);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    const pkg = join(dir, name);
    for (const target of ['dist', '.next', 'tsconfig.tsbuildinfo', 'tests/tsconfig.tsbuildinfo']) {
      rmSync(join(pkg, target), { recursive: true, force: true });
    }
  }
}
// Docs site (Next.js) build output.
rmSync(join(root, 'docs/site/.next'), { recursive: true, force: true });
for (const file of readdirSync(root)) {
  if (file.endsWith('.tsbuildinfo')) rmSync(join(root, file), { force: true });
}
