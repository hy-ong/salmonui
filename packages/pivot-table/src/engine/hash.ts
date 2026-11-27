// Open-addressing hash of (int, int) -> int keys in typed arrays: the tuple
// dictionary of the bucket stage.
export interface PairMap {
  get(a: number, b: number): number;
  /** Returns the existing value or stores `value` (and returns it). */
  put(a: number, b: number, value: number): number;
  readonly size: number;
}

export function createPairMap(capacity = 1024): PairMap {
  let cap = 1024;
  while (cap < capacity * 2) cap *= 2;
  let ka = new Int32Array(cap).fill(-1);
  let kb = new Int32Array(cap);
  let kv = new Int32Array(cap);
  let mask = cap - 1;
  let size = 0;
  const slot = (a: number, b: number) => {
    let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca77);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    return (h ^ (h >>> 12)) & mask;
  };
  const grow = () => {
    const oa = ka;
    const ob = kb;
    const ov = kv;
    cap *= 2;
    mask = cap - 1;
    ka = new Int32Array(cap).fill(-1);
    kb = new Int32Array(cap);
    kv = new Int32Array(cap);
    for (let i = 0; i < oa.length; i++) {
      const a = oa[i]!;
      if (a === -1) continue;
      let j = slot(a, ob[i]!);
      while (ka[j] !== -1) j = (j + 1) & mask;
      ka[j] = a;
      kb[j] = ob[i]!;
      kv[j] = ov[i]!;
    }
  };
  return {
    get(a, b) {
      let i = slot(a, b);
      for (;;) {
        const k = ka[i]!;
        if (k === -1) return -1;
        if (k === a && kb[i] === b) return kv[i]!;
        i = (i + 1) & mask;
      }
    },
    put(a, b, value) {
      let i = slot(a, b);
      for (;;) {
        const k = ka[i]!;
        if (k === -1) break;
        if (k === a && kb[i] === b) return kv[i]!;
        i = (i + 1) & mask;
      }
      ka[i] = a;
      kb[i] = b;
      kv[i] = value;
      if (++size * 2 > cap) grow();
      return value;
    },
    get size() {
      return size;
    },
  };
}
