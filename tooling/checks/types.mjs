// test:types: the published type declarations.
// 1. Compiles tests/types/*.test-d.ts(x) against the built dist/*.d.ts with
//    skipLibCheck off, so broken published declarations fail too.
// 2. Fails on any `any` in a published .d.ts file (comments and strings
//    excluded). Requires `npm run build`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly, listFiles, reporter, requireBuild, root, workspacePackages } from './lib.mjs';

const r = reporter('test:types');
requireBuild('test:types');

const tsc = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tests/types', '--pretty', 'false'], { cwd: root, encoding: 'utf8' });
if (tsc.error || tsc.status !== 0) r.fail(`type-contract tests do not compile:\n${(tsc.stdout + tsc.stderr).trim() || tsc.error?.message}`);
else r.note('tests/types compiled against dist/*.d.ts');

let total = 0;
for (const p of workspacePackages()) {
  for (const f of listFiles(join(p.dir, 'dist')).filter((x) => x.endsWith('.d.ts'))) {
    const code = codeOnly(readFileSync(join(p.dir, 'dist', f), 'utf8'));
    code.split('\n').forEach((line, i) => {
      if (/(?<![\w$.])any(?![\w$])/.test(line)) {
        total++;
        r.fail(`${p.rel}/dist/${f}:${i + 1} exports \`any\`: ${line.trim()}`);
      }
    });
  }
}
if (!total) r.note('no `any` in published declarations');
r.done();
