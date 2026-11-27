// Pivot wire helpers shared by the client source and the reference handler
// (`pivot` request kind): the model as it travels
// (client-only parts stripped, defaults omitted, canonical key order) and the
// header list of a window.

import { stableStringify } from './canonical.js';
import type { WirePivotHeader, WirePivotModel } from './protocol.js';
import { ProtocolError } from './transport.js';
import type { Json } from './types.js';

/**
 * Defaults of `normalizePivotModel()` (`@salmonui/pivot-table/engine`). A
 * field equal to its default is omitted from the wire; the server normalizes
 * again, so omission only shortens bodies and cache keys.
 */
const DEFAULTS: Readonly<Record<string, string>> = {
  rows: '[]',
  columns: '[]',
  values: '[]',
  filters: '[]',
  filterBy: '{}',
  sort: '{}',
  valueSort: 'null',
  groups: '{}',
  calculatedFields: '[]',
  expanded: '[]',
  totals: '{"grand":"both","grandPosition":"end","sub":true,"subPosition":"auto"}',
  valuesPlacement: '{"axis":"columns","index":-1}',
  showEmptyMembers: 'false',
  showValueHeader: 'false',
};

/** Client-only parts of the model: applied to the returned numbers on the client. */
const CLIENT_ONLY = new Set(['formats', 'conditionalFormats']);

/**
 * The model as it travels: rejects client-only aggregators, drops formats and
 * conditional formats, omits defaults. Throws `ProtocolError` with code
 * `pivot/unsupported-aggregate` for a value field whose aggregate is
 * `custom` or a function.
 */
export function toWirePivotModel(model: WirePivotModel): WirePivotModel {
  for (const v of model.values ?? []) {
    const aggregate = (v as { aggregate: unknown }).aggregate;
    if (aggregate === 'custom' || typeof aggregate === 'function' || typeof aggregate !== 'string') {
      throw new ProtocolError('pivot/unsupported-aggregate', `Value field "${v.field}" uses a client-side aggregator, which cannot run on the server.`);
    }
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(model).sort()) {
    if (CLIENT_ONLY.has(key)) continue;
    let value = (model as Record<string, unknown>)[key];
    if (value === undefined || typeof value === 'function') continue;
    if (key === 'calculatedFields' && Array.isArray(value)) {
      value = (value as readonly Record<string, unknown>[]).map(({ format: _format, ...rest }) => rest);
    }
    if (DEFAULTS[key] === stableStringify(value)) continue;
    out[key] = value;
  }
  return out as WirePivotModel;
}

/** Canonical JSON of the wire model: equal models give equal bodies and cache keys. */
export function wirePivotModelKey(model: WirePivotModel): string {
  return stableStringify(toWirePivotModel(model));
}

/** The structural header node both sides read (`PivotHeaderNode`). */
export interface PivotHeaderLike {
  readonly key: string;
  readonly kind: 'member' | 'subtotal' | 'grandTotal' | 'value';
  readonly path: readonly Json[];
  readonly field: string | null;
  readonly measure: string | null;
  readonly label: string;
  readonly depth: number;
  readonly position: number;
  readonly span: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly children?: readonly PivotHeaderLike[];
}

/** Depth-first header nodes overlapping `[start, end)`, ancestors included. */
export function windowHeaders(roots: readonly PivotHeaderLike[], start: number, end: number): WirePivotHeader[] {
  const out: WirePivotHeader[] = [];
  const visit = (node: PivotHeaderLike): void => {
    if (node.position >= end || node.position + node.span <= start) return;
    out.push(toWireHeader(node));
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return out;
}

export function toWireHeader(node: PivotHeaderLike): WirePivotHeader {
  return {
    key: node.key,
    path: node.path as Json[],
    label: node.label,
    depth: node.depth,
    position: node.position,
    span: node.span,
    kind: node.kind,
    ...(node.field !== null ? { field: node.field } : {}),
    ...(node.measure !== null ? { measure: node.measure } : {}),
    ...(node.expandable ? { expandable: true as const } : {}),
    ...(node.expanded ? { expanded: true as const } : {}),
  };
}
