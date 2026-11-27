'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, DataGridRow, type DataGridColumn, type DataGridLines } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';

interface Unit {
  readonly id: string;
  readonly name: string;
  readonly kind: 'division' | 'team' | 'person';
  readonly site: string;
  readonly budget: number;
  readonly note?: string;
  readonly children?: readonly Unit[];
}

const unitId = (unit: Unit) => unit.id;

const person = (id: string, name: string, site: string, budget: number, note: string): Unit => ({ id, name, kind: 'person', site, budget, note });

// Nested rows (`tree: true` reads `children`).
const org: Unit[] = [
  {
    id: 'eng',
    name: 'Engineering',
    kind: 'division',
    site: 'Lisbon',
    budget: 0,
    children: [
      {
        id: 'platform',
        name: 'Platform',
        kind: 'team',
        site: 'Lisbon',
        budget: 0,
        children: [
          person('p-ana', 'Ana Duarte', 'Lisbon', 98_000, 'Owns the build pipeline and the release train.'),
          person('p-ben', 'Ben Okafor', 'Lisbon', 91_000, 'On call this week; prefers async reviews.'),
          person('p-chen', 'Chen Wei', 'Remote', 88_000, 'Migrating the CI runners to the new cluster.'),
        ],
      },
      {
        id: 'web',
        name: 'Web',
        kind: 'team',
        site: 'Berlin',
        budget: 0,
        children: [
          person('p-dara', 'Dara Novak', 'Berlin', 94_000, 'Leads the accessibility audit.'),
          person('p-eli', 'Eli Haddad', 'Berlin', 86_000, 'Joined in March; mentoring by Dara.'),
        ],
      },
    ],
  },
  {
    id: 'ops',
    name: 'Operations',
    kind: 'division',
    site: 'Berlin',
    budget: 0,
    children: [
      {
        id: 'support',
        name: 'Support',
        kind: 'team',
        site: 'Dublin',
        budget: 0,
        children: [
          person('p-fay', 'Fay Murphy', 'Dublin', 72_000, 'Runs the weekly incident review.'),
          person('p-gus', 'Gus Lindqvist', 'Dublin', 70_000, 'Writes the help-centre articles.'),
        ],
      },
    ],
  },
];

const KIND_LABEL: Record<Unit['kind'], string> = { division: 'Division', team: 'Team', person: 'Person' };

const columns: DataGridColumn<Unit>[] = [
  {
    field: 'name',
    header: 'Unit',
    width: 300,
    // The tree column template renders after the toggle; `ctx.tree` carries depth, expansion and load status.
    renderCell: ({ value, tree }) => (
      <span>
        {String(value)}{' '}
        {tree?.hasChildren ? (
          <span className="demo-badge" data-tone={tree.expanded ? 'info' : undefined}>
            {tree.expanded ? 'open' : 'closed'} · level {tree.depth + 1}
          </span>
        ) : null}
      </span>
    ),
  },
  { field: 'kind', header: 'Kind', width: 110, valueGetter: (row) => KIND_LABEL[row.kind] },
  // Equal neighbouring values merge; a span never crosses a parent row.
  { field: 'site', header: 'Site', width: 120, rowSpan: true },
  { field: 'budget', header: 'Budget', type: 'number', format: 'C0', align: 'end', width: 130, renderCell: ({ formattedValue, row }) => (row.kind === 'person' ? formattedValue : '') },
];

const LINES: readonly DataGridLines[] = ['default', 'both', 'horizontal', 'vertical', 'none'];
const LINE_OPTIONS = LINES.map((value) => ({ value, label: value }));

export default function TreeTemplatesDemo() {
  const [cards, setCards] = useState(false);
  const [lines, setLines] = useState<DataGridLines>('default');
  const [striped, setStriped] = useState(true);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={cards} onCheckedChange={(checked) => setCards(checked)}>
          Row template (card rows)
        </Checkbox>
        <label>
          Grid lines{' '}
          <Select aria-label="Grid lines" data={LINE_OPTIONS} value={lines} onValueChange={(value) => value != null && setLines(value as DataGridLines)} />
        </label>
        <Checkbox checked={striped} onCheckedChange={(checked) => setStriped(checked)}>
          Alternate rows
        </Checkbox>
      </div>
      <DataGrid<Unit>
        aria-label="Organization"
        getRowId={unitId}
        data={org}
        columns={columns}
        tree
        height={420}
        locale="en-US"
        currency="EUR"
        gridLines={lines}
        striped={striped}
        highlightOnHover
        // Row hooks see `ctx.tree`; rows also carry data-depth, data-expanded and data-has-children.
        getRowProps={(row, _index, ctx) => ({
          'data-kind': row.kind,
          ...(ctx.tree ? { title: `${KIND_LABEL[row.kind]} at level ${ctx.tree.depth + 1}` } : {}),
          ...(ctx.tree?.depth === 0 ? { style: { fontWeight: 600 } } : {}),
        })}
        rowClassName={(row) => (row.site === 'Remote' ? 'demo-row--flagged' : undefined)}
        // A row template keeps role, aria attributes and the tree toggle by spreading rowProps around the default cells.
        {...(cards
          ? {
              renderRow: ({ rowProps, cells }) => (
                <DataGridRow {...rowProps} className={`${rowProps.className ?? ''} demo-card-row`}>
                  {cells}
                </DataGridRow>
              ),
            }
          : {})}
        // Detail rows follow their tree row and hide with it when a parent collapses.
        hasDetail={(row) => row.kind === 'person'}
        renderDetail={({ row }) => <p style={{ margin: 0 }}>{row.note}</p>}
      />
      <p className="demo-status">
        Open a person&apos;s detail toggle, then collapse the team: the detail row hides with its row and comes back on expand. The remote engineer is flagged by a row class.
      </p>
    </>
  );
}
