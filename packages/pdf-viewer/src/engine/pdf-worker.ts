// pdf.js worker entry. The viewer starts it with
// `new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' })`,
// a pattern Vite, webpack 5, Rollup and Turbopack bundle as a worker chunk.
// The worker module of `pdfjs-dist` registers its message handler on the
// worker scope when it is evaluated; it loads with dynamic import() (the
// package never imports the engine statically), so the messages the viewer
// sends meanwhile are queued and replayed once the handler listens.
// Pass `workerSrc` to use another worker file.
const scope = globalThis as unknown as EventTarget;
const queued: MessageEvent[] = [];
const hold = (event: Event) => {
  queued.push(event as MessageEvent);
  event.stopImmediatePropagation();
};
scope.addEventListener('message', hold);
// No top-level await: bundlers may emit the worker as a classic (IIFE) script.
void import('pdfjs-dist/build/pdf.worker.min.mjs').then(() => {
  scope.removeEventListener('message', hold);
  for (const event of queued) scope.dispatchEvent(new MessageEvent('message', { data: event.data, ports: [...event.ports] }));
});
export {};
