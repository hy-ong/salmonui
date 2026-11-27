'use client';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Kanban, type KanbanApi, type KanbanColumnDef } from '@salmonui/kanban';
import { NumberField } from '@salmonui/inputs/number-field';

interface Item {
  id: number;
  title: string;
  detail: string;
  stage: string;
}

const STAGES = ['new', 'triage', 'build', 'verify', 'shipped'] as const;
const COLUMNS: readonly KanbanColumnDef[] = STAGES.map((stage) => ({
  key: stage,
  header: stage[0]!.toUpperCase() + stage.slice(1),
}));
const PER_COLUMN = 2000;

/** 10,000 cards, deterministic so the server and client render the same board. */
function makeItems(): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < STAGES.length * PER_COLUMN; i++) {
    // Every third card has a longer body: heights vary and are measured.
    items.push({
      id: i + 1,
      title: `Item ${i + 1}`,
      detail: i % 3 === 0 ? 'A longer description that wraps onto a second line to vary the card height.' : 'Short note.',
      stage: STAGES[i % STAGES.length]!,
    });
  }
  return items;
}

export default function KanbanVirtualizationDemo() {
  const api = useRef<KanbanApi>(null);
  const items = useMemo(makeItems, []);
  const [target, setTarget] = useState<number | null>(7777);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (target != null) api.current?.focusCard(target);
        }}
      >
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Card id{' '}
          <NumberField aria-label="Card id" min={1} max={items.length} value={target} onValueChange={setTarget} formatOptions={{ useGrouping: false }} style={{ inlineSize: 120 }} />
        </label>
        <Button type="submit">Go to card</Button>
      </form>
      <Kanban
        ref={api}
        aria-label="Large board"
        data={items}
        getCardId={(item) => item.id}
        columnField="stage"
        columns={COLUMNS}
        card={{ headerField: 'title', contentField: 'detail' }}
        virtualization
        height={480}
        cardsDraggable
      />
    </div>
  );
}
