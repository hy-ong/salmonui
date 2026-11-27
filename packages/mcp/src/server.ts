// MCP over JSON-RPC 2.0, transport-independent: one message (or a batch) in,
// zero or more responses out. The server is dual-era (MCP versioning,
// "Backward Compatibility with Initialization-Based Versions"):
//
// - modern (2026-07-28): stateless; every request carries
//   `_meta["io.modelcontextprotocol/protocolVersion"]` and
//   `clientCapabilities`; `server/discover` advertises the versions; every
//   result has `resultType` and the server identity in `_meta`;
// - legacy (2025-11-25 and earlier): the `initialize` handshake negotiates a
//   version for the process, then `tools/*` and `ping`.
//
// Notifications never get a response; unknown ones are ignored.
import type { McpIndex } from './data.js';
import { SalmonTools, TOOLS, ToolInputError, validateArguments, type ToolResult } from './tools.js';

export const MODERN_VERSIONS: readonly string[] = Object.freeze(['2026-07-28']);
/** Handshake-era versions, newest first. */
export const LEGACY_VERSIONS: readonly string[] = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
export const SUPPORTED_VERSIONS: readonly string[] = Object.freeze([...MODERN_VERSIONS, ...LEGACY_VERSIONS]);

const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

/** JSON-RPC 2.0 and MCP error codes. */
export const ErrorCode = Object.freeze({
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  UnsupportedProtocolVersion: -32022,
});

export type JsonRpcId = string | number;

export interface JsonRpcError {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId | null;
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export interface JsonRpcResult {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly result: Readonly<Record<string, unknown>>;
}

export type JsonRpcResponse = JsonRpcError | JsonRpcResult;

export interface ServerOptions {
  /** The index, or a function that loads it on first use. */
  readonly index: McpIndex | (() => McpIndex);
  readonly name?: string;
  readonly version?: string;
}

/** Cache lifetime advertised on `server/discover` and `tools/list` results (the index never changes while running). */
const TTL_MS = 3_600_000;

class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is JsonRpcId => typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));

const errorResponse = (id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcError => ({
  jsonrpc: '2.0',
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

export const INSTRUCTIONS = [
  'Salmon UI is a React 19+ component library split into per-category packages (@salmonui/buttons, @salmonui/inputs, @salmonui/data-grid, ...).',
  'Each component family is its own entry (`@salmonui/buttons/button`); there is no @salmonui/react package.',
  "Import '@salmonui/core/styles.css' once in the app root, plus each used family's stylesheet (`@salmonui/buttons/button/styles.css`); a family stylesheet carries every family it renders, and get_component lists the few stylesheets a family does not carry.",
  'Use list_components to find the entry of a component, get_component for its props, get_example for working demo code, search_docs for guides,',
  'and run check_imports on the code you write before finishing.',
].join(' ');

/** A Salmon UI MCP server bound to one index. */
export class McpServer {
  readonly name: string;
  readonly version: string;
  readonly #index: McpIndex | (() => McpIndex);
  #tools?: SalmonTools;
  /** Version negotiated by a legacy `initialize` on this process. */
  legacyVersion: string | undefined;

  constructor(options: ServerOptions) {
    this.#index = options.index;
    this.name = options.name ?? 'salmonui';
    this.version = options.version ?? (typeof options.index === 'function' ? '0.0.0' : options.index.version);
  }

  get tools(): SalmonTools {
    this.#tools ??= new SalmonTools(typeof this.#index === 'function' ? this.#index() : this.#index);
    return this.#tools;
  }

  get serverInfo(): Record<string, string> {
    return { name: this.name, title: 'Salmon UI', version: this.version };
  }

  /** Handles one line of the stdio transport; returns the line to write (no trailing newline), if any. */
  handleLine(line: string): string | undefined {
    const trimmed = line.trim();
    if (trimmed === '') return undefined;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return JSON.stringify(errorResponse(null, ErrorCode.ParseError, 'Parse error: the line is not valid JSON'));
    }
    const response = this.handle(message);
    return response === undefined ? undefined : JSON.stringify(response);
  }

  /** Handles a parsed message or batch. Returns undefined when nothing must be sent (notifications, client responses). */
  handle(message: unknown): JsonRpcResponse | JsonRpcResponse[] | undefined {
    if (Array.isArray(message)) {
      if (message.length === 0) return errorResponse(null, ErrorCode.InvalidRequest, 'Invalid Request: empty batch');
      const responses = message.map((m) => this.handleOne(m)).filter((r): r is JsonRpcResponse => r !== undefined);
      return responses.length > 0 ? responses : undefined;
    }
    return this.handleOne(message);
  }

  handleOne(message: unknown): JsonRpcResponse | undefined {
    if (!isObject(message)) return errorResponse(null, ErrorCode.InvalidRequest, 'Invalid Request: a message must be a JSON object');
    const hasId = 'id' in message;
    const id = hasId && isId(message['id']) ? message['id'] : null;
    // A response from the client (to a request this server never sends): nothing to answer.
    if (!('method' in message) && hasId && ('result' in message || 'error' in message)) return undefined;
    if (message['jsonrpc'] !== '2.0') return errorResponse(id, ErrorCode.InvalidRequest, 'Invalid Request: "jsonrpc" must be "2.0"');
    if (typeof message['method'] !== 'string') return errorResponse(id, ErrorCode.InvalidRequest, 'Invalid Request: "method" must be a string');
    if (hasId && id === null) return errorResponse(null, ErrorCode.InvalidRequest, 'Invalid Request: "id" must be a string or an integer');
    const params = message['params'];
    if (!hasId) return undefined; // Notification: never answered (notifications/initialized, notifications/cancelled, unknown ones).
    if (params !== undefined && !isObject(params)) return errorResponse(id, ErrorCode.InvalidParams, 'Invalid params: "params" must be an object');
    try {
      return { jsonrpc: '2.0', id: id!, result: this.dispatch(message['method'], params ?? {}) };
    } catch (error) {
      if (error instanceof RpcError) return errorResponse(id, error.code, error.message, error.data);
      return errorResponse(id, ErrorCode.InternalError, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  dispatch(method: string, params: Record<string, unknown>): Record<string, unknown> {
    if (method === 'initialize') return this.initialize(params);
    const meta = isObject(params['_meta']) ? params['_meta'] : undefined;
    if (meta && META_VERSION in meta) return this.modern(method, params, meta);
    return this.legacy(method, params);
  }

  initialize(params: Record<string, unknown>): Record<string, unknown> {
    const requested = params['protocolVersion'];
    if (typeof requested !== 'string') throw new RpcError(ErrorCode.InvalidParams, 'Invalid params: initialize needs a "protocolVersion" string', { supported: SUPPORTED_VERSIONS });
    const version = LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0]!;
    this.legacyVersion = version;
    return {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: this.serverInfo,
      instructions: INSTRUCTIONS,
    };
  }

  legacy(method: string, params: Record<string, unknown>): Record<string, unknown> {
    switch (method) {
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: TOOLS };
      case 'tools/call':
        return { ...this.callTool(params) };
      case 'server/discover':
        throw new RpcError(ErrorCode.InvalidParams, `Invalid params: missing required _meta field ${META_VERSION}`, { supported: SUPPORTED_VERSIONS });
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  }

  modern(method: string, params: Record<string, unknown>, meta: Record<string, unknown>): Record<string, unknown> {
    const requested = meta[META_VERSION];
    if (typeof requested !== 'string' || !MODERN_VERSIONS.includes(requested)) {
      throw new RpcError(ErrorCode.UnsupportedProtocolVersion, 'Unsupported protocol version', { supported: SUPPORTED_VERSIONS, requested });
    }
    if (!isObject(meta[META_CAPABILITIES])) throw new RpcError(ErrorCode.InvalidParams, `Invalid params: missing required _meta field ${META_CAPABILITIES}`);
    const done = (result: Record<string, unknown>) => ({ resultType: 'complete', ...result, _meta: { [META_SERVER_INFO]: this.serverInfo } });
    switch (method) {
      case 'server/discover':
        return done({ supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: {} }, instructions: INSTRUCTIONS, ttlMs: TTL_MS, cacheScope: 'public' });
      case 'tools/list':
        return done({ tools: TOOLS, ttlMs: TTL_MS, cacheScope: 'public' });
      case 'tools/call':
        return done({ ...this.callTool(params) });
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  }

  callTool(params: Record<string, unknown>): ToolResult {
    const name = params['name'];
    if (typeof name !== 'string') throw new RpcError(ErrorCode.InvalidParams, 'Invalid params: tools/call needs a "name" string');
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw new RpcError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    const args = params['arguments'] ?? {};
    if (!isObject(args)) throw new RpcError(ErrorCode.InvalidParams, 'Invalid params: "arguments" must be an object');
    try {
      validateArguments(tool, args);
      return this.tools.call(name, args);
    } catch (error) {
      // Input and execution failures are tool results the model can act on.
      const message = error instanceof ToolInputError ? `Invalid arguments for ${name}: ${error.message}` : `${name} failed: ${error instanceof Error ? error.message : String(error)}`;
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
}
