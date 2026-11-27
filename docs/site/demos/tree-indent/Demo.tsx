'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridRowDragEvent } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Step {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly days: number;
}

const steps: Step[] = [
  { id: 's1', parentId: null, name: 'Design', days: 5 },
  { id: 's2', parentId: 's1', name: 'Wireframes', days: 3 },
  { id: 's3', parentId: 's1', name: 'Visual review', days: 1 },
  { id: 's4', parentId: null, name: 'Implementation', days: 12 },
  { id: 's5', parentId: 's4', name: 'Data layer', days: 4 },
  { id: 's6', parentId: 's4', name: 'Screens', days: 6 },
  { id: 's7', parentId: null, name: 'Accessibility pass', days: 2 },
  { id: 's8', parentId: null, name: 'Ship', days: 1 },
  { id: 's9', parentId: null, name: 'Retro', days: 1 },
];

const columns: DataGridColumn<Step>[] = [
  { field: 'name', header: 'Step', width: 260 },
  { field: 'id', header: 'ID', primaryKey: true, width: 90, editable: false },
  { field: 'days', header: 'Days', type: 'number', align: 'end', width: 90 },
];

type Position = 'below' | 'above' | 'child' | 'top' | 'bottom';

const POSITIONS = [
  { value: 'child', label: 'child of the focused row' },
  { value: 'below', label: 'below the focused row' },
  { value: 'above', label: 'above the focused row' },
  { value: 'top', label: 'top' },
  { value: 'bottom', label: 'bottom' },
];

export default function TreeIndentDemo() {
  const api = useRef<DataGridApi<Step> | null>(null);
  const [log, push] = useEventLog();
  const [position, setPosition] = useState<Position>('child');
  // Ids of added rows; read only in the newRow callback, never while rendering.
  const nextId = useRef(10);
  const onDrop = (event: DataGridRowDragEvent<Step>) =>
    push(`${event.rowIds.join(', ')} ${event.position ?? 'dropped'} ${event.targetRowId ?? ''} → parent ${event.parentId ?? 'root'} (${event.source})`);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.indentRows(['s7'])}>
          Indent Accessibility pass
        </Button>
        <Button variant="outline" onClick={() => api.current?.outdentRows(['s6'])}>
          Outdent Screens
        </Button>
        <label>
          New row position{' '}
          <Select aria-label="New row position" data={POSITIONS} value={position} onValueChange={(value) => value != null && setPosition(value as Position)} />
        </label>
      </div>
      <DataGrid<Step>
        ref={api}
        aria-label="Release plan"
        data={steps}
        columns={columns}
        tree={{ parentIdField: 'parentId' }}
        rowDrag
        editing={{ newRowPosition: position, newRow: () => ({ id: `s${nextId.current++}`, parentId: null, name: 'New step', days: 1 }) }}
        toolbar={['indent', 'outdent', 'add', 'delete', 'save', 'cancel']}
        height={420}
        onRowDrop={onDrop}
      />
      <p className="demo-status">
        Drag a grip onto the middle of a row to drop into it, near its top or bottom edge to drop before or after. Alt+Shift+ArrowRight / ArrowLeft indents or outdents the focused row. Deleting a parent deletes its subtree.
      </p>
      <EventLog entries={log} />
    </>
  );
}
