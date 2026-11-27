// Kanban browser page (tests/browser/kanban*.spec.ts).
//   ?fixture=basic (default)  #main: WIP limits, add button, collapsible columns, column reorder, card drag,
//                             editor, onCardClick / onCardDoubleClick; columns, collapsed and selection in React state
//   ?fixture=lanes            #lanes: swimlanes (Alice, Bob, Unassigned), ?lanesDraggable=0 turns off cross-lane drag
//   ?fixture=group            #left and #right share dragGroup "team"; #trash is a dropTarget of #left
//   ?fixture=source           #source reads a hand-written data source (500 ms); window.__rejectWrite rejects writes
//   ?fixture=virtual          #virtual: 5 columns x 2,000 cards, virtualization, height 600, card drag
//   ?fixture=narrow           #narrow inside a 360 px wide box (container-query layout)
//   ?tooltip=1                tooltip on #main (delay 200 ms)
//   ?selection=single|none    #main selection (default multiple); ?controlled=1: selectedCards controlled,
//                             window.__freezeSelection keeps the parent value
//   ?mode=hydrate             server-renders with renderToString, then hydrates (window.__hydrated)
//   ?mode=plain               no StrictMode (timing runs)
//   ?dir=rtl  ?scheme=dark
// Every callback appends to window.__events; window.__api (and __left, __right, __source, __virtual) are KanbanApis.
// window.__vetoMove / __vetoChange / __vetoClick / __keepOnDrop make the matching callback call preventDefault().
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Kanban, type KanbanApi, type KanbanColumnDef, type KanbanDataSource, type KanbanDropTarget, type KanbanKey } from '@salmonui/kanban';
import { ThemeProvider } from '@salmonui/core/theme';
import '@salmonui/core/styles.css';
import '@salmonui/kanban/styles.css';

interface Task {
  id: string;
  title: string;
  body?: string;
  status: string;
  tags?: string;
  owner?: string | null;
}

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const win = (typeof window === 'undefined' ? {} : window) as unknown as Record<string, unknown> & { __events: unknown[] };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);
const getCardId = (t: Task): KanbanKey => t.id;
const CARD = { headerField: 'title', contentField: 'body', tagsField: 'tags' } as const;

const COLUMNS: readonly KanbanColumnDef[] = [
  { key: 'backlog', header: 'Backlog', addButton: true, allowedTargets: ['todo'] },
  { key: 'todo', header: 'To do', collapsible: true, max: 2 },
  { key: 'doing', header: 'In progress', min: 1, max: 3 },
  { key: 'review', header: 'Review', droppable: false },
  { key: 'done', header: 'Done', collapsible: true },
];

const TASKS: readonly Task[] = [
  { id: 'b1', title: 'Write spec', body: 'Outline the API', status: 'backlog', tags: 'docs' },
  { id: 'b2', title: 'Design logo', status: 'backlog' },
  { id: 't1', title: 'Set up CI', status: 'todo', tags: 'infra, build' },
  { id: 't2', title: 'Draft API', status: 'todo' },
  { id: 'd1', title: 'Build board', body: 'Columns and cards', status: 'doing' },
  { id: 'd2', title: 'Fix login', status: 'doing' },
  { id: 'r1', title: 'Review PR', status: 'review' },
  { id: 'x1', title: 'Kickoff', status: 'done' },
];

function Main(): ReactNode {
  const api = useRef<KanbanApi>(null);
  const [columns, setColumns] = useState(COLUMNS);
  const [data, setData] = useState(TASKS);
  const [collapsed, setCollapsed] = useState<readonly KanbanKey[]>([]);
  const [selected, setSelected] = useState<readonly KanbanKey[]>([]);
  useEffect(() => {
    win.__api = api.current;
    win.__setColumns = setColumns;
    win.__hideColumn = (key: string) => setColumns((cols) => cols.map((c) => (c.key === key ? { ...c, hidden: true } : c)));
    win.__showColumn = (key: string) => setColumns((cols) => cols.map((c) => (c.key === key ? { ...c, hidden: false } : c)));
    win.__addColumn = (key: string, header: string) => setColumns((cols) => [...cols, { key, header }]);
    win.__setCollapsed = setCollapsed;
    win.__setSelected = setSelected;
    win.__resetData = () => setData([...TASKS]);
  });
  const controlled = params.get('controlled') === '1';
  const selection = (params.get('selection') ?? 'multiple') as 'multiple';
  return (
    <Kanban<Task>
      ref={api}
      id="main"
      aria-label="Sprint"
      data={data}
      getCardId={getCardId}
      columnField="status"
      columns={columns}
      card={CARD}
      selection={selection}
      {...(controlled
        ? {
            selectedCards: selected,
            onSelectedCardsChange: (value: readonly KanbanKey[], d: { source: string }) => {
              log('selected', [...value], d.source);
              if (!win.__freezeSelection) setSelected(value);
            },
          }
        : { onSelectedCardsChange: (value: readonly KanbanKey[], d: { source: string }) => log('selected', [...value], d.source) })}
      collapsedColumns={collapsed}
      onCollapsedColumnsChange={(value, d) => {
        log('collapsed', [...value], d.source);
        setCollapsed(value);
      }}
      onColumnOrderChange={(value, d) => log('columnOrder', [...value], d.source)}
      cardsDraggable
      columnsReorderable
      editor
      tooltip={params.get('tooltip') === '1' ? { delay: 200 } : undefined}
      onCardMove={(e) => {
        log('move', [...e.cardIds], e.from.columnKey, e.to.columnKey, e.index, e.source, e.external);
        if (win.__vetoMove) e.preventDefault();
      }}
      onCardChange={(e) => {
        log('change', e.kind, e.cards.map((c) => ({ ...c })), e.source);
        if (win.__vetoChange) e.preventDefault();
      }}
      onCardAdd={(e) => log('add', e.columnKey, e.swimlaneKey, e.source)}
      onCardClick={(e) => {
        log('click', e.id, e.source);
        if (win.__vetoClick) e.preventDefault();
      }}
      onCardDoubleClick={(e) => log('dblclick', e.id, e.source)}
      onEditingChange={(value, d) => log('editing', value, d.source)}
      style={{ blockSize: 520 }}
    />
  );
}

const LANE_TASKS: readonly Task[] = [
  { id: 'a1', title: 'Alice todo', status: 'todo', owner: 'alice' },
  { id: 'a2', title: 'Alice doing', status: 'doing', owner: 'alice' },
  { id: 'c1', title: 'Bob todo', status: 'todo', owner: 'bob' },
  { id: 'c2', title: 'Bob done', status: 'done', owner: 'bob' },
  { id: 'u1', title: 'Nobody todo', status: 'todo', owner: null },
];
const LANE_COLUMNS: readonly KanbanColumnDef[] = [
  { key: 'todo', header: 'To do' },
  { key: 'doing', header: 'In progress' },
  { key: 'done', header: 'Done' },
];

function Lanes(): ReactNode {
  const api = useRef<KanbanApi>(null);
  useEffect(() => {
    win.__api = api.current;
  });
  return (
    <Kanban<Task>
      ref={api}
      id="lanes"
      aria-label="Team board"
      data={LANE_TASKS}
      getCardId={getCardId}
      columnField="status"
      columns={LANE_COLUMNS}
      card={CARD}
      swimlanes={{ field: 'owner', lanes: [{ key: 'alice', label: 'Alice' }, { key: 'bob', label: 'Bob' }], draggable: params.get('lanesDraggable') !== '0' }}
      cardsDraggable
      onCardMove={(e) => log('move', [...e.cardIds], e.from.columnKey, e.from.swimlaneKey, e.to.columnKey, e.to.swimlaneKey, e.index, e.source)}
      onCardChange={(e) => log('change', e.kind, e.cards.map((c) => ({ ...c })), e.source)}
    />
  );
}

const LEFT: readonly Task[] = [
  { id: 'l1', title: 'Left one', status: 'todo' },
  { id: 'l2', title: 'Left two', status: 'todo' },
  { id: 'l3', title: 'Left three', status: 'done' },
];
const RIGHT: readonly Task[] = [{ id: 'g1', title: 'Right one', status: 'todo' }];
const GROUP_COLUMNS: readonly KanbanColumnDef[] = [
  { key: 'todo', header: 'To do' },
  { key: 'done', header: 'Done' },
];

function Group(): ReactNode {
  const left = useRef<KanbanApi>(null);
  const right = useRef<KanbanApi>(null);
  const trash = useRef<HTMLDivElement>(null);
  useEffect(() => {
    win.__left = left.current;
    win.__right = right.current;
  });
  const [targets] = useState<readonly KanbanDropTarget<Task>[]>(() => [
    {
      ref: trash,
      accept: (cards) => !cards.some((c) => c.id === 'l3'),
      onDrop(e) {
        log('externalDrop', [...e.cardIds], (e.target as HTMLElement).id);
        if (win.__keepOnDrop) e.preventDefault();
      },
    },
  ]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Kanban<Task>
          ref={left}
          id="left"
          aria-label="Left board"
          data={LEFT}
          getCardId={getCardId}
          columnField="status"
          columns={GROUP_COLUMNS}
          card={CARD}
          cardsDraggable
          dragGroup="team"
          dropTargets={targets}
          onCardMove={(e) => log('leftMove', [...e.cardIds], e.to.columnKey, e.index, e.external)}
          onCardChange={(e) => log('leftChange', e.kind, e.cards.map((c) => c.id))}
          style={{ inlineSize: 616 }}
        />
        <Kanban<Task>
          ref={right}
          id="right"
          aria-label="Right board"
          data={RIGHT}
          getCardId={getCardId}
          columnField="status"
          columns={GROUP_COLUMNS}
          card={CARD}
          cardsDraggable
          dragGroup="team"
          onCardMove={(e) => log('rightMove', [...e.cardIds], e.to.columnKey, e.index, e.external)}
          onCardChange={(e) => log('rightChange', e.kind, e.cards.map((c) => c.id))}
          style={{ inlineSize: 616 }}
        />
      </div>
      <div ref={trash} id="trash" style={{ inlineSize: 300, blockSize: 80, border: '2px dashed var(--salmon-border-default)', display: 'grid', placeItems: 'center' }}>
        Archive
      </div>
    </div>
  );
}

const SOURCE_ROWS: readonly Task[] = [
  { id: 's1', title: 'Remote one', status: 'todo' },
  { id: 's2', title: 'Remote two', status: 'todo' },
  { id: 's3', title: 'Remote three', status: 'done' },
];
/** A hand-written `@salmonui/data` source: 500 ms reads; writes resolve after 100 ms, rejected while `window.__rejectWrite`. */
const remote: KanbanDataSource<Task> = {
  read: (request) => new Promise((resolve) => setTimeout(() => resolve({ version: request.version, rows: SOURCE_ROWS }), 500)),
  write: (request) =>
    new Promise((resolve) =>
      setTimeout(() => {
        log('write', request.changed.map((c) => c.rowId), request.added.length, request.deleted.length);
        resolve({ version: request.version, status: win.__rejectWrite ? 'rejected' : 'applied' });
      }, 100),
    ),
};

function Source(): ReactNode {
  const api = useRef<KanbanApi>(null);
  useEffect(() => {
    win.__source = api.current;
  });
  return (
    <Kanban<Task>
      ref={api}
      id="source"
      aria-label="Remote board"
      data={remote}
      getCardId={getCardId}
      columnField="status"
      columns={GROUP_COLUMNS}
      card={CARD}
      cardsDraggable
      onCardChange={(e) => log('change', e.kind, e.cards.map((c) => ({ ...c })))}
      onDataError={(error, kind) => log('dataError', kind, (error as { status?: string }).status ?? String(error))}
    />
  );
}

const VIRTUAL_COLUMNS: readonly KanbanColumnDef[] = ['c0', 'c1', 'c2', 'c3', 'c4'].map((key, i) => ({ key, header: `Stage ${i + 1}` }));
function virtualData(): Task[] {
  const out: Task[] = [];
  for (let c = 0; c < 5; c++)
    for (let i = 0; i < 2000; i++) out.push({ id: `v${c}-${i}`, title: `Card ${c}-${i}`, status: `c${c}`, ...(i % 3 === 0 ? { body: 'A longer description that wraps onto a second line of the card' } : null) });
  return out;
}
// Generated before the mount clock starts.
const VIRTUAL_DATA = params.get('fixture') === 'virtual' ? virtualData() : [];

function Virtual(): ReactNode {
  const api = useRef<KanbanApi>(null);
  const [data] = useState(VIRTUAL_DATA);
  useEffect(() => {
    win.__virtual = api.current;
  });
  return (
    <Kanban<Task>
      ref={api}
      id="virtual"
      aria-label="Large board"
      data={data}
      getCardId={getCardId}
      columnField="status"
      columns={VIRTUAL_COLUMNS}
      card={CARD}
      cardsDraggable
      virtualization
      height={600}
      onCardMove={(e) => log('move', [...e.cardIds], e.from.columnKey, e.to.columnKey, e.index, e.source)}
    />
  );
}

function Narrow(): ReactNode {
  return (
    <div id="narrow-box" style={{ inlineSize: 360, border: '1px solid var(--salmon-border-default)' }}>
      <Kanban<Task> id="narrow" aria-label="Phone board" data={TASKS} getCardId={getCardId} columnField="status" columns={COLUMNS} card={CARD} style={{ blockSize: 480 }} />
    </div>
  );
}

const FIXTURES: Record<string, () => ReactNode> = { basic: Main, lanes: Lanes, group: Group, source: Source, virtual: Virtual, narrow: Narrow };
const Fixture = FIXTURES[params.get('fixture') ?? 'basic'] ?? Main;

const Page = (): ReactNode => (
  <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
    <div data-salmon-a11y-root="" style={{ padding: 16 }}>
      <Fixture />
    </div>
  </ThemeProvider>
);

if (typeof document !== 'undefined') {
  if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
  const root = document.getElementById('root');
  const mode = params.get('mode');
  if (root && mode === 'hydrate') {
    const html = renderToString(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    win.__ssrHtml = html;
    root.innerHTML = html;
    hydrateRoot(
      root,
      <StrictMode>
        <Page />
      </StrictMode>,
      { onRecoverableError: (error) => console.error('recoverable', error) },
    );
    requestAnimationFrame(() => (win.__hydrated = true));
  } else if (root) {
    const t0 = performance.now();
    createRoot(root).render(
      mode === 'plain' ? (
        <Page />
      ) : (
        <StrictMode>
          <Page />
        </StrictMode>
      ),
    );
    // Mount to first painted window: the commit, then the next frame's paint.
    requestAnimationFrame(() => {
      const check = (): void => {
        if (document.querySelector('.salmon-kanban-card')) {
          void document.body.offsetHeight;
          const ch = new MessageChannel();
          ch.port1.onmessage = () => (win.__mountMs = performance.now() - t0);
          ch.port2.postMessage(0);
        } else requestAnimationFrame(check);
      };
      check();
    });
  }
}
