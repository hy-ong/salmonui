// node:worker_threads adapter for the pivot worker entry (tests only): the
// same protocol a module Worker serves, over `parentPort`.
import { parentPort } from 'node:worker_threads';
import { attachPivotWorker } from '@salmonui/pivot-table/engine/worker';

attachPivotWorker({
  postMessage: (message) => parentPort.postMessage(message),
  addEventListener: (_type, listener) => parentPort.on('message', (data) => listener({ data })),
});
