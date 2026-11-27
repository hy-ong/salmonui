// The MCP stdio transport: newline-delimited JSON-RPC messages on stdin,
// responses on stdout (one line each, never anything else), logs on stderr.
// The server exits when stdin ends.
import type { McpServer } from './server.js';

/** The parts of a Node readable stream the transport uses (`process.stdin`). */
export interface StdioInput {
  setEncoding(encoding: 'utf8'): unknown;
  on(event: 'data', listener: (chunk: string) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}

/** The parts of a Node writable stream the transport uses (`process.stdout`). */
export interface StdioOutput {
  write(chunk: string, callback?: () => void): unknown;
}

export interface StdioStreams {
  readonly input: StdioInput;
  readonly output: StdioOutput;
}

/** Serves `server` on the streams until the input ends; resolves after the last response is flushed. */
export function serveStdio(server: McpServer, { input, output }: StdioStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const handle = (line: string) => {
      const response = server.handleLine(line.endsWith('\r') ? line.slice(0, -1) : line);
      // JSON.stringify never emits a raw newline, so one message stays one line.
      if (response !== undefined) output.write(`${response}\n`);
    };
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handle(line);
        newline = buffer.indexOf('\n');
      }
    });
    input.on('end', () => {
      if (buffer.trim() !== '') handle(buffer);
      buffer = '';
      output.write('', () => resolve());
    });
    input.on('error', reject);
  });
}
