# @salmonui/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets
coding agents (Claude Code, Cursor, Codex, VS Code and any other MCP client)
use Salmon UI correctly: find the right package and entry, read component
APIs, copy working demo code and check the imports they write.

Everything is answered from an index bundled in the package, built from the
docs, the API reference and the demos of the same Salmon UI version. It
works offline, sends nothing anywhere and has no runtime dependencies.
Requires Node.js 22 or later.

## Setup

Pin the version your app uses (`@salmonui/mcp@0.2.0`) so the answers match
your `@salmonui/*` packages; `@salmonui/mcp` alone runs the latest release.

### Claude Code

```sh
claude mcp add salmonui -- npx -y @salmonui/mcp
```

Add `--scope project` to share it with your team through `.mcp.json`.

### Cursor

`.cursor/mcp.json` in the project (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "salmonui": { "command": "npx", "args": ["-y", "@salmonui/mcp"] }
  }
}
```

### Codex

```sh
codex mcp add salmonui -- npx -y @salmonui/mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.salmonui]
command = "npx"
args = ["-y", "@salmonui/mcp"]
```

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json` in the workspace:

```json
{
  "servers": {
    "salmonui": { "type": "stdio", "command": "npx", "args": ["-y", "@salmonui/mcp"] }
  }
}
```

### Other clients

Run `npx -y @salmonui/mcp` as a stdio server. On Windows, clients that do
not resolve `npx` themselves need `"command": "cmd", "args": ["/c", "npx", "-y", "@salmonui/mcp"]`.

## Tools

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_components` | `filter?` | Every package and component family: import specifier, stylesheet, components, hooks, one-line description. |
| `search_docs` | `query`, `limit?` (1-10, default 3) | The best docs pages with their URL and best matching sections in Markdown. |
| `get_component` | `name` | A component, hook, function, type or whole family (`DataGrid`, `useToast`, `date-picker`, `@salmonui/buttons/menu`): import line, stylesheets, props with types, defaults and docs, events, docs links. |
| `get_example` | `id?` or `query?` | The full source of a docs demo with its description, plus other matches. |
| `check_imports` | `code`, `stylesheets?` | Problems in the `@salmonui/*` imports of a module: unknown entries or names, private `/internal/*` modules, removed packages with their replacement, missing `@salmonui/core/styles.css` or family stylesheets. |

All tools are read-only. The server also sends instructions that tell the
agent to import `@salmonui/core/styles.css` once and to run `check_imports`
on the code it writes.

## Protocol

MCP over stdio (newline-delimited JSON-RPC 2.0). The server supports the
stateless `2026-07-28` revision (`server/discover`, per-request `_meta`) and
the handshake revisions `2025-11-25`, `2025-06-18`, `2025-03-26` and
`2024-11-05` (`initialize`, `notifications/initialized`, `ping`), so current
and older clients both connect. It exits when its stdin closes.

`salmonui-mcp --version` prints the Salmon UI version of the bundled index;
`SALMONUI_MCP_INDEX=<file>` serves another index file.

## Programmatic use

```ts
import { loadIndex, McpServer } from '@salmonui/mcp';

const server = new McpServer({ index: loadIndex() });
const line = server.handleLine('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}');
```

Documentation: https://salmonui.dev

License: MIT
