// Dependency parsing and formatting: the string form (`'2'`, `'2FS'`, `'2FS+3d'`,
// `'3SS-2h'`, `'4FF+30m'`, `'5SF+1 days'`, comma separated, case-insensitive,
// ids may be non-numeric) and object arrays (`{ id, type, lag, lagUnit }`,
// types also upper case) into `Dependency[]`, and back. Pure: no React, no
// DOM globals, zero dependencies.

import type { Dependency, DependencyType, DurationUnit } from './types.js';

export interface ParseDependencyOptions {
  /** Unit of a lag written without a unit (default `'day'`). */
  readonly defaultLagUnit?: DurationUnit;
}

const TYPES: Readonly<Record<string, DependencyType>> = { fs: 'fs', ss: 'ss', ff: 'ff', sf: 'sf' };

/** A lag unit word (`d`, `day`, `days`, `h`, `hr`, `hours`, `m`, `min`, `minutes`); undefined when unknown. */
export function lagUnitOf(word: string): DurationUnit | undefined {
  const w = word.trim().toLowerCase();
  if (w === 'd' || w === 'day' || w === 'days') return 'day';
  if (w === 'h' || w === 'hr' || w === 'hrs' || w === 'hour' || w === 'hours') return 'hour';
  if (w === 'm' || w === 'min' || w === 'mins' || w === 'minute' || w === 'minutes') return 'minute';
  return undefined;
}

const TOKEN = /^(.+?)\s*(fs|ss|ff|sf)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*([a-z]*))?$/i;

function parseToken(token: string, unit: DurationUnit): Dependency | null {
  const t = token.trim();
  if (!t) return null;
  const m = TOKEN.exec(t);
  if (!m) return null;
  const lagUnit = m[5] ? lagUnitOf(m[5]) : unit;
  if (!lagUnit) {
    // Not a lag after all (`'T-1SS'`): an id with an optional type only.
    const plain = /^(.+?)\s*(fs|ss|ff|sf)?$/i.exec(t);
    return plain ? { id: (plain[1] as string).trim(), type: TYPES[(plain[2] ?? 'fs').toLowerCase()] as DependencyType, lag: 0, lagUnit: unit } : null;
  }
  const id = (m[1] as string).trim();
  if (!id) return null;
  const magnitude = m[4] ? Number(m[4]) : 0;
  return { id, type: TYPES[(m[2] ?? 'fs').toLowerCase()] as DependencyType, lag: m[3] === '-' ? -magnitude : magnitude, lagUnit };
}

/** Dependencies of a predecessor string or array; malformed entries are skipped, duplicates keep the first. */
export function parseDependencies(input: string | readonly unknown[] | null | undefined, options?: ParseDependencyOptions): Dependency[] {
  const unit = options?.defaultLagUnit ?? 'day';
  const out: Dependency[] = [];
  const seen = new Set<string>();
  const push = (d: Dependency | null): void => {
    if (!d || seen.has(d.id)) return;
    seen.add(d.id);
    out.push(d);
  };
  if (input === null || input === undefined) return out;
  if (typeof input === 'string' || typeof input === 'number') {
    for (const token of String(input).split(',')) push(parseToken(token, unit));
    return out;
  }
  for (const item of input) {
    if (typeof item === 'string' || typeof item === 'number') {
      for (const token of String(item).split(',')) push(parseToken(token, unit));
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const rawId = o['id'];
    if (rawId === null || rawId === undefined || rawId === '') continue;
    const type = TYPES[String(o['type'] ?? 'fs').toLowerCase()] ?? 'fs';
    const lag = typeof o['lag'] === 'number' && Number.isFinite(o['lag']) ? o['lag'] : 0;
    const lagUnit = typeof o['lagUnit'] === 'string' ? (lagUnitOf(o['lagUnit']) ?? unit) : unit;
    push({ id: String(rawId), type, lag, lagUnit });
  }
  return out;
}

const UNIT_SUFFIX: Readonly<Record<DurationUnit, string>> = { day: 'd', hour: 'h', minute: 'm' };

/** Rounds to 4 decimals and drops trailing zeros. */
export const formatNumber = (n: number): string => String(Math.round(n * 1e4) / 1e4);

/** One dependency in string form with `id` replaced by `label` (`'2FS+3d'`). */
export function formatDependency(d: Dependency, label: string = d.id): string {
  const lag = d.lag ? `${d.lag > 0 ? '+' : '-'}${formatNumber(Math.abs(d.lag))}${UNIT_SUFFIX[d.lagUnit]}` : '';
  return `${label}${d.type.toUpperCase()}${lag}`;
}

/** The predecessor string of dependencies (`'2FS,3SS-2h'`). */
export function formatDependencies(deps: readonly Dependency[] | null | undefined): string {
  return (deps ?? []).map((d) => formatDependency(d)).join(',');
}
