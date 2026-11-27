import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid, type DataGridColumn, type DataGridFeature, type DataGridProps } from '@salmonui/data-grid';
import { readFeatures } from '../dist/data-grid/features/registry-static.js';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { normalizeProps } from '../dist/data-grid/normalize-props.js';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly active: boolean;
  readonly joined: Date;
}

export function people(count: number): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: `p${i}`, name: `Person ${i}`, age: 20 + (i % 50), active: i % 2 === 0, joined: new Date(Date.UTC(2024, 0, 1 + (i % 300))) });
  }
  return out;
}

export const personColumns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 80, pinned: 'start' },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', align: 'end', width: 90 },
  { field: 'active', header: 'Active', type: 'boolean', displayAsCheckbox: true, width: 90 },
  { field: 'joined', header: 'Joined', type: 'date', format: 'yMd', width: 120 },
];

export function render(props: Partial<DataGridProps<Person>> & { rows?: number } = {}): string {
  const { rows = 50, ...rest } = props;
  const element: ReactElement = createElement(DataGrid as (p: DataGridProps<Person>) => ReactElement, {
    'aria-label': 'People',
    data: people(rows),
    columns: personColumns,
    timeZone: 'UTC',
    ...rest,
  } as DataGridProps<Person>);
  return renderToString(element);
}

/** Minimal attribute reader for SSR markup assertions. */
export function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))].length;
}

/**
 * `new DataGridInstance(props, id, features)` with the render features the
 * props need, from the static registry (what `<DataGrid>` resolves on the
 * server).
 */
export function newInstance<Row>(props: unknown, reactId: string): DataGridInstance<Row> {
  const p = props as DataGridProps<Row>;
  return new DataGridInstance<Row>(p, reactId, readFeatures(requiredFeatures(normalizeProps(p as DataGridProps<unknown>)), p.features) as readonly DataGridFeature[]);
}
