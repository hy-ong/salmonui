'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn, type DataGridEditing, type DataGridMergeCells, type DataGridSelection, type DataGridVirtualization } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';

interface Slot {
  readonly id: string;
  readonly block: string;
  readonly time: string;
  readonly mon: string;
  readonly tue: string;
  readonly wed: string;
  readonly thu: string;
  readonly fri: string;
}

// A weekly room schedule: equal adjacent values merge, and one booking spans
// three days through an explicit `colSpan` function.
const slots: Slot[] = [
  { id: 's08', block: 'Morning', time: '08:00', mon: 'Stand-up', tue: 'Stand-up', wed: 'Stand-up', thu: 'Stand-up', fri: 'Stand-up' },
  { id: 's09', block: 'Morning', time: '09:00', mon: 'Design review', tue: 'Planning', wed: 'Planning', thu: 'Workshop', fri: 'Retro' },
  { id: 's10', block: 'Morning', time: '10:00', mon: 'Design review', tue: 'Offsite', wed: '', thu: '', fri: 'Retro' },
  { id: 's11', block: 'Morning', time: '11:00', mon: 'Focus time', tue: 'Focus time', wed: 'Focus time', thu: 'Interviews', fri: 'Demo' },
  { id: 's12', block: 'Midday', time: '12:00', mon: 'Lunch', tue: 'Lunch', wed: 'Lunch', thu: 'Lunch', fri: 'Lunch' },
  { id: 's13', block: 'Afternoon', time: '13:00', mon: 'Pairing', tue: 'Customer call', wed: 'Pairing', thu: 'Interviews', fri: 'Demo' },
  { id: 's14', block: 'Afternoon', time: '14:00', mon: 'Pairing', tue: 'Customer call', wed: 'Pairing', thu: 'Training', fri: 'Release' },
  { id: 's15', block: 'Afternoon', time: '15:00', mon: 'Support', tue: 'Support', wed: 'Support', thu: 'Training', fri: 'Release' },
  { id: 's16', block: 'Afternoon', time: '16:00', mon: 'Office hours', tue: 'Office hours', wed: 'Office hours', thu: 'Office hours', fri: '' },
];

const day = (field: keyof Slot, header: string): DataGridColumn<Slot> => ({ field, header, width: 140 });

const columns: DataGridColumn<Slot>[] = [
  // Vertical merge of the block names, pinned with the time column.
  { field: 'block', header: 'Block', width: 110, pinned: 'start', rowSpan: true },
  { field: 'time', header: 'Time', width: 80, pinned: 'start', primaryKey: true },
  day('mon', 'Monday'),
  // An explicit span: the 10:00 offsite covers Tuesday to Thursday.
  { ...day('tue', 'Tuesday'), colSpan: ({ row }) => (row.id === 's10' ? 3 : 1) },
  day('wed', 'Wednesday'),
  day('thu', 'Thursday'),
  day('fri', 'Friday'),
];

const modes: readonly { readonly label: string; readonly value: DataGridMergeCells }[] = [
  { label: 'Off (column spans only)', value: false },
  { label: 'Rows', value: 'rows' },
  { label: 'Columns', value: 'columns' },
  { label: 'Both', value: true },
];
const MODE_OPTIONS = modes.map((m, index) => ({ value: String(index), label: m.label }));

// Row spans are computed over rendered rows: this demo renders every row.
const noRowVirtualization: DataGridVirtualization = { rows: false };
// Spans are one focus stop at their anchor: box ranges grow over
// whole spans, and double-click, F2 or typing edits the anchor cell.
const cellSelection: DataGridSelection = { mode: 'cell', multiple: true, cellRange: 'box' };
const cellEditing: DataGridEditing<Slot> = { mode: 'cell' };

export default function CellSpansDemo() {
  const [mode, setMode] = useState(3);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          mergeCells
          <Select aria-label="mergeCells" data={MODE_OPTIONS} value={String(mode)} onValueChange={(value) => value != null && setMode(Number(value))} />
        </label>
      </div>
      <DataGrid<Slot>
        aria-label="Weekly room schedule with merged cells"
        data={slots}
        columns={columns}
        mergeCells={modes[mode]?.value ?? false}
        virtualization={noRowVirtualization}
        gridLines="both"
        striped={false}
        height={380}
        selection={cellSelection}
        editing={cellEditing}
      />
    </>
  );
}
