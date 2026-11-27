// @salmonui/mcp: a Model Context Protocol server for Salmon UI. The CLI
// (`salmonui-mcp`, src/bin.ts) serves it over stdio; this entry exposes the
// same pieces for embedding and tests.
export { defaultIndexPath, INDEX_FORMAT, loadIndex } from './data.js';
export type { IndexDemo, IndexDoc, IndexEntry, IndexFamily, IndexMember, IndexPackage, IndexParam, IndexSection, IndexSymbol, McpIndex, SymbolKind } from './data.js';
export { checkImports, ExportsMap, migrateSpecifier, parseImports, REMOVED_PACKAGES } from './imports.js';
export type { ImportedName, ImportProblem, ImportReport, ParsedImport } from './imports.js';
export { Bm25, tokenize } from './search.js';
export { ErrorCode, INSTRUCTIONS, LEGACY_VERSIONS, McpServer, MODERN_VERSIONS, SUPPORTED_VERSIONS } from './server.js';
export type { JsonRpcError, JsonRpcId, JsonRpcResponse, JsonRpcResult, ServerOptions } from './server.js';
export { serveStdio } from './stdio.js';
export type { StdioInput, StdioOutput, StdioStreams } from './stdio.js';
export { SalmonTools, TOOLS } from './tools.js';
export type { ToolDefinition, ToolResult } from './tools.js';
