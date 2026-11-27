// Grid marker clustering (`cluster.ts`): points within one `cell` px grid square merge into
// one cluster at their mean position. Linear time; recomputed per zoom
// level, so clusters split as the map zooms in ("deep" clustering).

export interface ClusterPoint {
  readonly x: number;
  readonly y: number;
  readonly index: number;
}

export interface Cluster {
  readonly x: number;
  readonly y: number;
  /** Indexes of the member points, in input order. */
  readonly members: readonly number[];
}

export function clusterPoints(points: readonly ClusterPoint[], cell = 48): Cluster[] {
  const cells = new Map<string, { sx: number; sy: number; members: number[] }>();
  const order: string[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    let c = cells.get(key);
    if (!c) {
      c = { sx: 0, sy: 0, members: [] };
      cells.set(key, c);
      order.push(key);
    }
    c.sx += p.x;
    c.sy += p.y;
    c.members.push(p.index);
  }
  return order.map((key) => {
    const c = cells.get(key)!;
    return { x: Math.round((c.sx / c.members.length) * 100) / 100, y: Math.round((c.sy / c.members.length) * 100) / 100, members: c.members };
  });
}
