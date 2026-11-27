# Contributing to Salmon UI

Thanks for your interest in Salmon UI. Bug reports, fixes, docs
improvements and well-scoped features are welcome.

## Before you start

- Search the [issues](https://github.com/hy-ong/salmonui/issues) first; open
  one to discuss a new feature or a larger change before writing code.
- Security problems: do not open a public issue; see [SECURITY.md](SECURITY.md).

## Setup

Requirements: Node.js 22 or later and npm.

```sh
git clone https://github.com/hy-ong/salmonui.git
cd salmonui
npm ci
npm run build
```

The repository is an npm workspace:

| Path | What it is |
| --- | --- |
| `packages/*` | The published `@salmonui/*` packages (`src/`, `styles/`, `tests/`) |
| `docs/site` | The documentation website (Next.js), its docs pages (`content/`) and demos (`demos/`) |
| `examples/*` | Example apps (Vite SPA, Vite SSR, Next.js App Router) used by the browser and SSR tests |
| `tests/` | Cross-package browser (Playwright), SSR and type tests |
| `tooling/` | Build, check, benchmark and site scripts |

## Common scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Clean build of every package (TypeScript project references) and their stylesheets |
| `npm run typecheck` | Type-check the packages and the examples |
| `npm run test:unit` | Unit tests (Node test runner) of every package and of the tooling |
| `npm run test:perf` | Performance tests of the engines (run serially) |
| `npm run test:browser` | Playwright browser tests against the example apps |
| `npm run test:ssr` | Server rendering and hydration tests |
| `npm run test:a11y` | Accessibility tests (axe-core, keyboard, ARIA snapshots) |
| `npm run test:examples` | Builds and checks the example apps |
| `npm run test:site` | Docs site tests |
| `npm run docs:dev` | Docs site dev server |
| `npm run site:verify` | Full static build of the docs site and its checks |
| `npm run bench` | Benchmarks against the committed baseline |
| `npm run release:verify` | Every gate (build, tests, dependency, packaging, bundle size, benchmark and release checks), in phases (see below) |

Playwright needs its browsers once: `npx playwright install chromium`.
Browser tests run a `functional` project in parallel (`PW_WORKERS` sets the
worker count) and a `timing` project of `@perf` tests on one worker.

### Parallel test runs

- The three Playwright configs (`playwright.config.ts`,
  `playwright.ssr.config.ts`, `docs/site/playwright.config.ts`) share one
  project split (`tooling/playwright/projects.mjs`). `functional` runs every
  test that is not a timing test, fully parallel. `timing` runs the
  `*-perf.spec.ts` files and the tests or `describe` blocks tagged
  `{ tag: '@perf' }`, on one worker, after `functional` has finished.
  `--project=functional` runs only the first; `--project=timing --no-deps`
  only the second. A failing functional test skips the timing project.
- `PW_WORKERS` takes a count, a percentage (`75%`) or `auto` (all cores but
  two). The default, `50%`, keeps the machine usable; on a 32-thread Linux
  machine it (16 workers) was also the fastest stable setting, and more
  workers only added load-induced failures.
- Unit tests that assert a millisecond budget end their name with `@perf`:
  `test:unit` and `test:ssr` skip them and `test:perf` runs them one file at
  a time. Render, commit or DOM-node counts are not timing tests.
- Every Playwright test gets its own browser context, so `localStorage` and
  cookies never leak between workers. A spec that shares other state (a
  server-side store, a file, a fixed port) uses
  `test.describe.configure({ mode: 'serial' })`. A spec waits for the state
  it needs (a lazily loaded chunk, a measured layout) before it acts;
  `tests/browser/helpers.ts` has `waitForModule` and `listenerCount` for that.
- On a Linux machine where Docker containers start and stop during a run,
  each network interface change makes Chromium abort in-flight requests
  (`net::ERR_NETWORK_CHANGED`) and leaves dev-server pages half loaded. Run
  the suites there through `tooling/playwright/netns.sh` (for example
  `PW_WORKERS=16 tooling/playwright/netns.sh npm run test:browser:run`): it
  runs the command in a private network namespace with only loopback and a
  dummy interface. It needs passwordless sudo and no outside network, so
  install and build first.
- `npm run bench` compares against the baseline of `SALMON_BENCH_ENV`. The
  default is `linux-2080ti` on Linux, the shared Linux test machine and the
  release baseline, and `local` elsewhere (`SALMON_BENCH_ENV=local` selects
  the development Mac baseline on any machine). `linux-2080ti` runs every
  suite pinned to four whole P-cores (`taskset`), at niceness -10 (through
  passwordless sudo), after waiting until those CPUs are below 10 % busy,
  and the browser specs inside `tooling/playwright/netns.sh`.
  `--pin=<cpus>`, `--nice=<n>`, `--wait-quiet[=<percent>]`,
  `--no-wait-quiet`, `--netns` and `--no-netns` set the same per run. The
  node suites (`*performance.test.ts` and the `@perf` unit tests) run one
  process per file and each metric keeps its fastest median: every file
  runs `--repeat=<n>` times (`linux-2080ti`: 2), and a file with a metric
  whose baseline is below 10 ms runs `--short-repeat=<n>` times in all
  (default: the repeat count). On `linux-2080ti` the node processes run
  with `--single-threaded-gc` (`tooling/bench/quiet.mjs` says why), so a
  process does not land in a slower mode by garbage-collector timing.
  Timing fixtures build their rows as fast-mode objects (object literals or
  a spread copy, never 100 computed-key stores), and cold runs get untimed
  warm-up runs before the measured ones. `--browser` adds the whole Playwright
  `timing` project. A copy synced without its git directory passes the
  commit as `SALMON_BENCH_SHA`. The landing page shows the `linux-2080ti`
  numbers.
- Absolute millisecond budgets in timing tests are product targets: the
  numbers are calibrated on the development Mac and stay as they are. Every
  timing assertion goes through `expectBudget(value, budget, label)`
  (`tests/browser/budget.ts`, Playwright) or `assertBudget(value, budget,
  label)` (`tooling/bench/budget.mjs`, node:test); `{ strict: true }` makes
  the bound exclusive, `{ atLeast: true }` makes it a lower bound (frame or
  event counts that a slow machine lowers). On `local` a missed target fails
  the test. On `linux-2080ti` it does not: the test prints the miss and adds
  a `perf-target-missed` annotation, and the gate is the bench's regression
  check against the `linux-2080ti` baseline: a metric more than 10 %
  slower fails (below 1 ms it also needs 0.25 ms more), after one
  re-measure of the regressed files, and only on the core paths of
  `tooling/bench/core-paths.mjs`; other regressions are warnings. Each check prints a
  `[perf-target]` line; `npm run bench` ends with a "targets missed"
  warning listing every metric whose fastest run is above its product
  target, and an `ms` target without a `[perf]` line of its own is
  recorded as a bench metric under its label. A new timing assertion uses
  the helper too, never a bare `expect(ms).toBeLessThan(...)`.
- `npm run release:verify` runs in phases: the build steps (`build`,
  `mcp:index`, `test:examples`, `bundle:check`) in order; the independent
  checks concurrently; the functional `test:ssr`, `test:browser` and
  `test:a11y` projects concurrently on port bases `SALMON_UI_PORT_BASE`
  + 100, + 0 and + 200; then each timing step (`test:perf`, the browser
  timing project, `bench --browser`) alone. Output of concurrent steps is
  printed whole, in step order. It calls the `:run` scripts
  (`test:ssr:run`, `test:browser:run`, `test:a11y:run`,
  `test:examples:run`, `bench:run`), which skip the build prefix of the
  script of the same name. `--keep-going`, `--skip=<step,...>` and
  `--serial` (one step at a time) are available for local runs. On the
  Linux test machine its bench step uses the `linux-2080ti` environment
  and so measures in quiet mode; run the whole gate there inside
  `tooling/playwright/netns.sh` (`PW_WORKERS=16 tooling/playwright/netns.sh
  npm run release:verify`).

Individual checks (`deps:check`, `pack:check`, `bundle:check`,
`isolation:check`, `server:boundary:check`, `feature:boundary:check`,
`planning:check`, `docs:coverage`) can be run on their own; most need
`npm run build` first.

## Guidelines

- Components are React 19 function components with pure renders: no
  browser APIs during render, no module-level render state. Server
  rendering must produce the same markup as the client; hydration warnings
  are bugs.
- Performance matters: interaction and rendering costs are gated by
  `npm run bundle:check`, the performance tests and `npm run bench`. A change
  that regresses a budget needs a good reason.
- Package dependencies are restricted (`npm run deps:check`): the packages
  have no runtime dependencies except the documented opt-in packages, and new
  dependencies must be MIT, BSD, Apache-2.0 or ISC licensed.
- Each component family has its own subpath and stylesheet; a family may use
  another family only where the package manifest
  (`tooling/checks/packages.manifest.mjs`) allows it (`npm run isolation:check`).
- Styles use `--salmon-*` custom properties and `.salmon-*` classes; no
  CSS-in-JS runtime and no utility-class frameworks.
- Add or update tests with every change, and update the docs page under
  `docs/site/content/` (and a demo under `docs/site/demos/` where it helps)
  when behavior or API changes.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  in English: `type(scope): subject`, for example
  `fix(data-grid): keep focus on the edited cell after save`. Types: `feat`,
  `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `style`.
  Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.
- Add a changeset (`npm run changeset`) for changes that affect a published
  package.
- Keep pull requests focused; describe what changed and why, and how you
  tested it. Run at least `npm run build`, `npm run typecheck`,
  `npm run test:unit` and the browser tests of the components you touched.

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
