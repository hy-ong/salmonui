# Third-Party Licenses

Runtime third-party code in the published Salmon UI packages. Only the
dependency-exception packages, `@salmonui/rich-text` and
`@salmonui/pdf-viewer`, may carry any: each has its own allow-list (`thirdParty` in
`tooling/checks/packages.manifest.mjs`, enforced by `deps:check`), every package of its runtime graph is listed here, and licenses must be MIT,
BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC or 0BSD. `npm run deps:check`
verifies the list against `package-lock.json` and reproduces the rule for
`NOTICE` files: a package that ships one (Apache-2.0 section 4d) must have
its NOTICE text reproduced verbatim below, under "Notices".

Every other package, `@salmonui/export` included (its XLSX, PDF, image and
iCalendar writers are implemented in the package), ships no third-party
code.

## `@salmonui/rich-text`

ProseMirror is the editing engine (A10); the root entry loads it with dynamic
`import()` on the client. Yjs and its ProseMirror binding are reached only
through the opt-in `@salmonui/rich-text/collab` subpath.

| Package | Version | License | Copyright | Used by |
| --- | --- | --- | --- | --- |
| prosemirror-commands | 1.7.2 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-dropcursor | 1.8.4 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-gapcursor | 1.4.1 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-history | 1.5.1 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-inputrules | 1.5.1 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-keymap | 1.2.3 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-model | 1.25.13 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-schema-list | 1.6.0 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-state | 1.4.4 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-tables | 1.8.5 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-transform | 1.12.5 | MIT | Marijn Haverbeke and others | engine |
| prosemirror-view | 1.42.9 | MIT | Marijn Haverbeke and others | engine |
| orderedmap | 2.1.1 | MIT | Marijn Haverbeke and others | engine (via prosemirror-model) |
| rope-sequence | 1.3.4 | MIT | Marijn Haverbeke and others | engine (via prosemirror-history) |
| w3c-keyname | 2.2.8 | MIT | Marijn Haverbeke and others | engine (via prosemirror-keymap, prosemirror-view) |
| yjs | 13.6.33 | MIT | Kevin Jahns | `/collab` |
| y-prosemirror | 1.3.7 | MIT | Kevin Jahns | `/collab` |
| y-protocols | 1.0.7 | MIT | Kevin Jahns | `/collab` |
| lib0 | 0.2.120 | MIT | Kevin Jahns | `/collab` (via yjs, y-prosemirror, y-protocols) |
| isomorphic.js | 0.2.5 | MIT | Kevin Jahns | `/collab` (via lib0) |

The MIT license text of each package is in its published `LICENSE` file.

## `@salmonui/pdf-viewer`

pdf.js renders the documents (A13); the root entry loads it with dynamic
`import()` on the client, and the package's module worker loads the pdf.js
worker the same way. `@napi-rs/canvas` and its platform packages are optional
dependencies of `pdfjs-dist` used only when pdf.js runs in Node; browsers never
load them, and npm installs only the package for the current platform.

| Package | Version | License | Copyright | Used by |
| --- | --- | --- | --- | --- |
| pdfjs-dist | 6.5.438 | Apache-2.0 | Mozilla Foundation and contributors | engine and worker (lazy) |
| @napi-rs/canvas | 1.2.0 | MIT | LongYinan | pdfjs-dist in Node only (optional) |
| @napi-rs/canvas-android-arm64 | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-darwin-arm64 | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-darwin-x64 | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-linux-arm-gnueabihf | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-linux-arm64-gnu | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-linux-arm64-musl | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-linux-riscv64-gnu | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-linux-x64-gnu | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-linux-x64-musl | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-win32-arm64-msvc | 1.2.0 | MIT | LongYinan | optional platform binary |
| @napi-rs/canvas-win32-x64-msvc | 1.2.0 | MIT | LongYinan | optional platform binary |

The Apache License 2.0 text of pdf.js is in the `LICENSE` file of
`pdfjs-dist`; applications that bundle the engine or worker chunk redistribute
it under that license.

## Notices

None of the packages above ships a `NOTICE` file. `pdfjs-dist` 6.5.438 is
Apache-2.0 and ships only its `LICENSE` file; `deps:check` reproduces a
`NOTICE` file here verbatim as soon as a pinned version ships one.
