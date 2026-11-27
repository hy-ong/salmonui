// End to end: spawn the built `salmonui-mcp` bin and talk MCP over stdio,
// the way Claude Code, Cursor or Codex do. Requires `npm run build`.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixtureIndex } from './fixture.ts';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'salmonui-mcp-'));
const indexFile = join(dir, 'index.json');
writeFileSync(indexFile, JSON.stringify(fixtureIndex()));
after(() => rmSync(dir, { recursive: true, force: true }));

interface Session {
  request(method: string, params?: Record<string, unknown>): Promise<Record<string, any>>;
  notify(method: string, params?: Record<string, unknown>): void;
  close(): Promise<{ code: number | null; stdout: string; stderr: string }>;
}

function start(env: Record<string, string> = { SALMONUI_MCP_INDEX: indexFile }, args: string[] = []): Session {
  const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let pending = '';
  let nextId = 1;
  const waiting = new Map<number, (message: Record<string, any>) => void>();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => (stderr += chunk));
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
    pending += chunk;
    let nl = pending.indexOf('\n');
    while (nl !== -1) {
      const line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      // --version and --help print plain text; protocol output is JSON (asserted per test).
      if (line.startsWith('{')) {
        const message = JSON.parse(line);
        waiting.get(message.id)?.(message);
        waiting.delete(message.id);
      }
      nl = pending.indexOf('\n');
    }
  });
  const exited = new Promise<number | null>((resolve) => child.on('close', resolve));
  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no response to ${method}; stderr: ${stderr}`)), 10_000);
        waiting.set(id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`);
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })}\n`);
    },
    async close() {
      child.stdin.end();
      const code = await exited;
      return { code, stdout, stderr };
    },
  };
}

describe('salmonui-mcp over stdio', () => {
  it('runs initialize -> notifications/initialized -> tools/list -> tools/call (legacy handshake)', async () => {
    const s = start();
    const init = await s.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1.0.0' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.equal(init.result.serverInfo.version, '9.9.9');
    s.notify('notifications/initialized');
    const list = await s.request('tools/list');
    assert.deepEqual(list.result.tools.map((t: { name: string }) => t.name), ['list_components', 'search_docs', 'get_component', 'get_example', 'check_imports']);
    const call = await s.request('tools/call', { name: 'check_imports', arguments: { code: "import { Menu } from '@salmonui/react';" } });
    assert.match(call.result.content[0].text, /import \{ Menu \} from '@salmonui\/buttons\/menu';/);
    assert.deepEqual((await s.request('ping')).result, {});
    const { code, stdout, stderr } = await s.close();
    assert.equal(code, 0);
    // stdout carries only the responses, one JSON-RPC message per line.
    const lines = stdout.trimEnd().split('\n');
    assert.equal(lines.length, 4);
    for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
    assert.match(stderr, /salmonui-mcp 9\.9\.9/);
  });

  it('serves stateless 2026-07-28 requests: server/discover -> tools/list -> tools/call', async () => {
    const s = start();
    const _meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
    const discover = await s.request('server/discover', { _meta });
    assert.ok(discover.result.supportedVersions.includes('2026-07-28'));
    const list = await s.request('tools/list', { _meta });
    assert.equal(list.result.resultType, 'complete');
    const call = await s.request('tools/call', { _meta, name: 'get_component', arguments: { name: 'DataGrid' } });
    assert.equal(call.result.resultType, 'complete');
    assert.match(call.result.content[0].text, /^# DataGrid \(component\)/);
    const old = await s.request('tools/list', { _meta: { ..._meta, 'io.modelcontextprotocol/protocolVersion': '2020-01-01' } });
    assert.equal(old.error.code, -32022);
    assert.equal((await s.close()).code, 0);
  });

  it('prints its version and help', async () => {
    assert.equal((await start(undefined, ['--version']).close()).stdout, '9.9.9\n');
    assert.match((await start(undefined, ['--help']).close()).stdout, /claude mcp add salmonui -- npx -y @salmonui\/mcp/);
  });

  it('exits with a message when the index is missing', async () => {
    const { code, stdout, stderr } = await start({ SALMONUI_MCP_INDEX: join(dir, 'missing.json') }).close();
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /index not found/);
  });
});
