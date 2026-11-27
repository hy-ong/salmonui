// tooling/bench/quiet.mjs: quiet-run options and the wrapped command line.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENVIRONMENTS, parseCpuList, resolveQuietOptions, wrapCommand } from '../quiet.mjs';

const linux = process.platform === 'linux';

test('CPU lists expand ranges and reject malformed input', () => {
  assert.deepEqual(parseCpuList('4-7,12-15'), [4, 5, 6, 7, 12, 13, 14, 15]);
  assert.deepEqual(parseCpuList('3,1,1'), [1, 3]);
  assert.throws(() => parseCpuList('7-4'));
  assert.throws(() => parseCpuList('a'));
});

test('local runs are not pinned, niced or delayed', () => {
  const opts = resolveQuietOptions('local', [], {});
  assert.deepEqual([opts.pin, opts.nice, opts.waitQuiet, opts.netns, opts.repeat, opts.shortRepeat, opts.nodeFlags], [null, null, null, false, 1, 1, []]);
  assert.deepEqual(wrapCommand('node', ['x'], opts, { root: '/r/', current: 0 }), { command: 'node', args: ['x'] });
});

test('the Linux box environment pins to whole P-cores, raises priority and waits for quiet CPUs', { skip: !linux }, () => {
  const opts = resolveQuietOptions('linux-2080ti', [], {});
  assert.equal(opts.pin, ENVIRONMENTS['linux-2080ti'].pin);
  assert.equal(opts.nice, -10);
  assert.equal(opts.waitQuiet, 10);
  assert.equal(opts.netns, true);
  assert.equal(opts.repeat, 2);
  assert.equal(resolveQuietOptions('linux-2080ti', ['--repeat=1'], {}).repeat, 1);
  // Short metrics take the same process count unless --short-repeat asks for more.
  assert.equal(opts.shortRepeat, opts.repeat);
  assert.equal(resolveQuietOptions('linux-2080ti', ['--short-repeat=5'], {}).shortRepeat, 5);
  assert.deepEqual(opts.nodeFlags, ['--single-threaded-gc']);
  // A short metric never gets fewer runs than the others.
  assert.equal(resolveQuietOptions('linux-2080ti', ['--repeat=4', '--short-repeat=2'], {}).shortRepeat, 4);
  assert.throws(() => resolveQuietOptions('local', ['--repeat=0'], {}));
  assert.equal(resolveQuietOptions('linux-2080ti', ['--no-wait-quiet', '--no-netns', '--pin=2-3'], {}).waitQuiet, null);
  assert.equal(resolveQuietOptions('linux-2080ti', ['--pin=2-3'], {}).pin, '2-3');
});

test('flags override variables', { skip: !linux }, () => {
  const opts = resolveQuietOptions('local', ['--nice=-5', '--wait-quiet'], { SALMON_BENCH_NICE: '3', SALMON_BENCH_PIN: '1' });
  assert.deepEqual([opts.pin, opts.nice, opts.waitQuiet], ['1', -5, 10]);
});

test('a negative niceness goes through sudo and back to the calling user; netns wraps outermost', () => {
  const opts = { pin: '4-7', nice: -10, waitQuiet: null, netns: true };
  const line = wrapCommand('npx', ['playwright'], opts, { root: '/r/', user: 'me', current: 0, path: '/bin' });
  assert.deepEqual([line.command, ...line.args], ['/r/tooling/playwright/netns.sh', 'sudo', '-n', '-E', 'nice', '-n', '-10', 'sudo', '-n', '-E', '-u', 'me', 'env', 'PATH=/bin', 'taskset', '-c', '4-7', 'npx', 'playwright']);
  // `nice -n` is relative: from a +5 shell the step is -15; a higher target needs no sudo.
  assert.equal(wrapCommand('node', [], { ...opts, netns: false }, { root: '/r/', user: 'me', current: 5, path: '' }).args[4], '-15');
  assert.deepEqual(wrapCommand('node', [], { pin: null, nice: 5, netns: false }, { root: '/r/', current: 0 }), { command: 'nice', args: ['-n', '5', 'node'] });
});
