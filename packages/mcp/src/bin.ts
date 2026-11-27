#!/usr/bin/env node
// salmonui-mcp: the Salmon UI MCP server over stdio.
//
//   claude mcp add salmonui -- npx -y @salmonui/mcp
//
// Options: --version, --help. `SALMONUI_MCP_INDEX` points at another index file.
import { defaultIndexPath, loadIndex } from './data.js';
import { McpServer } from './server.js';
import { serveStdio } from './stdio.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'salmonui-mcp: Model Context Protocol server for Salmon UI (stdio).\n\n' +
      'Register it with your agent, e.g.\n  claude mcp add salmonui -- npx -y @salmonui/mcp\n\n' +
      'Tools: list_components, search_docs, get_component, get_example, check_imports.\n' +
      'Options: --version, --help. Env: SALMONUI_MCP_INDEX=<index.json>.\n',
  );
} else {
  let index;
  try {
    index = loadIndex(defaultIndexPath());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${index.version}\n`);
  } else {
    const server = new McpServer({ index });
    process.stderr.write(`salmonui-mcp ${index.version}: ${index.symbols.length} symbols, ${index.docs.length} docs pages, ${index.demos.length} demos; listening on stdio\n`);
    serveStdio(server, { input: process.stdin, output: process.stdout }).then(
      () => process.exit(0),
      (error: unknown) => {
        process.stderr.write(`salmonui-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      },
    );
  }
}
