// JSON-RPC 2.0 framing and the MCP methods of McpServer, both eras.
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { ErrorCode, LEGACY_VERSIONS, McpServer, serveStdio, SUPPORTED_VERSIONS, TOOLS } from '@salmonui/mcp';
import { fixtureIndex } from './fixture.ts';

const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

const server = () => new McpServer({ index: fixtureIndex() });
const send = (s: McpServer, message: unknown) => {
  const line = s.handleLine(JSON.stringify(message));
  return line === undefined ? undefined : JSON.parse(line);
};

describe('JSON-RPC framing', () => {
  it('answers a line that is not JSON with a parse error and a null id', () => {
    const out = JSON.parse(server().handleLine('{"jsonrpc":"2.0",')!);
    assert.deepEqual(out, { jsonrpc: '2.0', id: null, error: { code: ErrorCode.ParseError, message: 'Parse error: the line is not valid JSON' } });
  });

  it('ignores blank lines', () => {
    assert.equal(server().handleLine('   '), undefined);
  });

  it('rejects messages that are not requests', () => {
    const s = server();
    assert.equal(send(s, 42).error.code, ErrorCode.InvalidRequest);
    assert.equal(send(s, { id: 1, method: 'ping' }).error.code, ErrorCode.InvalidRequest);
    assert.deepEqual(send(s, { jsonrpc: '1.0', id: 7, method: 'ping' }).id, 7);
    assert.equal(send(s, { jsonrpc: '2.0', id: 1, method: 5 }).error.code, ErrorCode.InvalidRequest);
    const nullId = send(s, { jsonrpc: '2.0', id: null, method: 'ping' });
    assert.equal(nullId.id, null);
    assert.equal(nullId.error.code, ErrorCode.InvalidRequest);
    assert.equal(send(s, { jsonrpc: '2.0', id: 1.5, method: 'ping' }).error.code, ErrorCode.InvalidRequest);
  });

  it('rejects params that are not an object', () => {
    assert.equal(send(server(), { jsonrpc: '2.0', id: 1, method: 'ping', params: [1] }).error.code, ErrorCode.InvalidParams);
  });

  it('never answers notifications, known or unknown', () => {
    const s = server();
    assert.equal(send(s, { jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
    assert.equal(send(s, { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }), undefined);
    assert.equal(send(s, { jsonrpc: '2.0', method: 'notifications/whatever' }), undefined);
    assert.equal(send(s, { jsonrpc: '2.0', method: 'tools/list' }), undefined);
  });

  it('ignores responses sent by the client', () => {
    assert.equal(send(server(), { jsonrpc: '2.0', id: 3, result: {} }), undefined);
  });

  it('keeps string and integer ids', () => {
    const s = server();
    assert.equal(send(s, { jsonrpc: '2.0', id: 'abc', method: 'ping' }).id, 'abc');
    assert.equal(send(s, { jsonrpc: '2.0', id: 0, method: 'ping' }).id, 0);
  });

  it('answers a batch with one response per request, none for notifications', () => {
    const s = server();
    const out = send(s, [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'nope' },
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { jsonrpc: '2.0', id: 1, result: {} });
    assert.equal(out[1].error.code, ErrorCode.MethodNotFound);
    assert.equal(send(s, [{ jsonrpc: '2.0', method: 'notifications/initialized' }]), undefined);
    assert.equal(send(s, []).error.code, ErrorCode.InvalidRequest);
  });

  it('writes one line per response over stdio, survives chunked input and CRLF, and ends with the input', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';
    output.on('data', (chunk) => (written += String(chunk)));
    const done = serveStdio(server(), { input, output });
    const ping = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { note: 'a\nb' } });
    input.write(ping.slice(0, 10));
    input.write(`${ping.slice(10)}\r\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    input.end(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }));
    await done;
    const lines = written.split('\n');
    assert.equal(lines.at(-1), '');
    assert.deepEqual(lines.slice(0, -1).map((l) => JSON.parse(l).id), [1, 2]);
  });
});

describe('legacy era (initialize handshake)', () => {
  it('echoes a supported protocol version', () => {
    for (const version of LEGACY_VERSIONS) {
      const out = send(server(), { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 't', version: '1' } } });
      assert.equal(out.result.protocolVersion, version);
    }
  });

  it('answers an unknown version with its latest legacy version, tools capability, server info and instructions', () => {
    const s = server();
    const out = send(s, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(out.result.protocolVersion, LEGACY_VERSIONS[0]);
    assert.deepEqual(out.result.capabilities, { tools: {} });
    assert.deepEqual(out.result.serverInfo, { name: 'salmonui', title: 'Salmon UI', version: '9.9.9' });
    assert.match(out.result.instructions, /@salmonui\/core\/styles\.css/);
    assert.equal(s.legacyVersion, LEGACY_VERSIONS[0]);
  });

  it('rejects initialize without a protocolVersion', () => {
    const out = send(server(), { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.equal(out.error.code, ErrorCode.InvalidParams);
  });

  it('answers ping, tools/list and tools/call without resultType', () => {
    const s = server();
    assert.deepEqual(send(s, { jsonrpc: '2.0', id: 1, method: 'ping' }).result, {});
    const list = send(s, { jsonrpc: '2.0', id: 2, method: 'tools/list' }).result;
    assert.deepEqual(list.tools.map((t: { name: string }) => t.name), ['list_components', 'search_docs', 'get_component', 'get_example', 'check_imports']);
    assert.equal(list.resultType, undefined);
    const call = send(s, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_component', arguments: { name: 'Button' } } }).result;
    assert.equal(call.content[0].type, 'text');
    assert.match(call.content[0].text, /import \{ Button \} from '@salmonui\/buttons\/button'/);
    assert.equal(call.isError, undefined);
  });

  it('rejects server/discover without the per-request _meta', () => {
    assert.equal(send(server(), { jsonrpc: '2.0', id: 1, method: 'server/discover' }).error.code, ErrorCode.InvalidParams);
  });

  it('answers an unknown method with method not found', () => {
    const out = send(server(), { jsonrpc: '2.0', id: 9, method: 'resources/list' });
    assert.deepEqual(out, { jsonrpc: '2.0', id: 9, error: { code: ErrorCode.MethodNotFound, message: 'Method not found: resources/list' } });
  });
});

describe('modern era (per-request _meta)', () => {
  it('advertises versions, capabilities and identity on server/discover', () => {
    const out = send(server(), { jsonrpc: '2.0', id: 'd', method: 'server/discover', params: { _meta: META } }).result;
    assert.equal(out.resultType, 'complete');
    assert.deepEqual(out.supportedVersions, SUPPORTED_VERSIONS);
    assert.deepEqual(out.capabilities, { tools: {} });
    assert.deepEqual(out._meta['io.modelcontextprotocol/serverInfo'], { name: 'salmonui', title: 'Salmon UI', version: '9.9.9' });
    assert.equal(typeof out.instructions, 'string');
    assert.equal(typeof out.ttlMs, 'number');
    assert.equal(out.cacheScope, 'public');
  });

  it('lists tools with resultType and cache fields, without an initialize', () => {
    const out = send(server(), { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META } }).result;
    assert.equal(out.resultType, 'complete');
    assert.equal(out.tools.length, TOOLS.length);
    assert.equal(out.cacheScope, 'public');
    for (const tool of out.tools) {
      assert.match(tool.name, /^[a-z_]{1,128}$/);
      assert.equal(tool.inputSchema.type, 'object');
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.ok(tool.description.length > 40);
    }
  });

  it('calls a tool', () => {
    const out = send(server(), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { _meta: META, name: 'list_components', arguments: {} } }).result;
    assert.equal(out.resultType, 'complete');
    assert.match(out.content[0].text, /@salmonui\/buttons\/button/);
    assert.ok(out._meta['io.modelcontextprotocol/serverInfo']);
  });

  it('rejects an unsupported version with -32022 and the supported list', () => {
    const out = send(server(), { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { ...META, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } } });
    assert.deepEqual(out.error, { code: -32022, message: 'Unsupported protocol version', data: { supported: SUPPORTED_VERSIONS, requested: '1900-01-01' } });
  });

  it('rejects a request without clientCapabilities with invalid params', () => {
    const { 'io.modelcontextprotocol/clientCapabilities': _caps, ...meta } = META;
    const out = send(server(), { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } });
    assert.equal(out.error.code, ErrorCode.InvalidParams);
  });

  it('does not know ping (removed in this revision)', () => {
    assert.equal(send(server(), { jsonrpc: '2.0', id: 1, method: 'ping', params: { _meta: META } }).error.code, ErrorCode.MethodNotFound);
  });
});

describe('tools/call errors', () => {
  const call = (params: Record<string, unknown>) => send(server(), { jsonrpc: '2.0', id: 1, method: 'tools/call', params });

  it('reports an unknown tool or a malformed call as a protocol error', () => {
    assert.deepEqual(call({ name: 'nope' }).error, { code: ErrorCode.InvalidParams, message: 'Unknown tool: nope' });
    assert.equal(call({}).error.code, ErrorCode.InvalidParams);
    assert.equal(call({ name: 'search_docs', arguments: 'x' }).error.code, ErrorCode.InvalidParams);
  });

  it('reports arguments that fail the input schema as a tool execution error', () => {
    const missing = call({ name: 'search_docs', arguments: {} }).result;
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /Missing required argument `query`/);
    assert.match(call({ name: 'search_docs', arguments: { query: 'x', limit: 99 } }).result.content[0].text, /between 1 and 10/);
    assert.match(call({ name: 'search_docs', arguments: { query: 3 } }).result.content[0].text, /must be a string/);
    assert.match(call({ name: 'list_components', arguments: { bogus: 1 } }).result.content[0].text, /Unknown argument `bogus`/);
    assert.equal(call({ name: 'get_example', arguments: {} }).result.isError, true);
  });

  it('reports a failing index load as a tool execution error', () => {
    const broken = new McpServer({
      index: () => {
        throw new Error('index not found');
      },
      version: '1.0.0',
    });
    const out = send(broken, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_components' } }).result;
    assert.equal(out.isError, true);
    assert.match(out.content[0].text, /index not found/);
  });
});
