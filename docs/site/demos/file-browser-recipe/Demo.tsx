'use client';
import { useMemo, useState } from 'react';
import { Breadcrumbs, BreadcrumbItem } from '@salmonui/navigation/breadcrumbs';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Dialog } from '@salmonui/overlays/dialog';
import { FileUpload, type UploadTransport } from '@salmonui/inputs/file-upload';
import { ContextMenu, Menu, MenuItem, MenuSeparator } from '@salmonui/buttons/menu';
import { Splitter } from '@salmonui/layout/splitter';
import { TextField } from '@salmonui/inputs/text-field';
import { Toolbar, ToolbarItem, ToolbarSeparator, ToolbarSpacer } from '@salmonui/navigation/toolbar';
import { TreeView, type TreeViewKey } from '@salmonui/navigation/tree-view';

// A file browser (/docs/navigation/file-manager) composed from a TreeView
// navigation pane, a Breadcrumbs address bar, a Toolbar, a DataGrid details
// view (or a card grid), a ContextMenu, FileUpload and Dialogs, over the application's own file API. Here the "API"
// is an in-memory store with async calls, standing in for your server.

interface Entry {
  readonly id: string;
  readonly name: string;
  /** Id of the parent folder; '' for the root. */
  readonly parent: string;
  readonly folder: boolean;
  readonly size: number;
  readonly modified: string;
}

interface Folder {
  readonly id: string;
  readonly name: string;
  readonly children: Folder[];
}

const SEED: readonly Entry[] = [
  { id: 'docs', name: 'Documents', parent: '', folder: true, size: 0, modified: '2026-11-02' },
  { id: 'pics', name: 'Pictures', parent: '', folder: true, size: 0, modified: '2026-10-21' },
  { id: 'reports', name: 'Reports', parent: 'docs', folder: true, size: 0, modified: '2026-11-12' },
  { id: 'plan', name: 'Plan.docx', parent: 'docs', folder: false, size: 48_200, modified: '2026-11-03' },
  { id: 'budget', name: 'Budget.xlsx', parent: 'docs', folder: false, size: 120_400, modified: '2026-11-08' },
  { id: 'q3', name: 'Q3 review.pdf', parent: 'reports', folder: false, size: 1_204_000, modified: '2026-10-30' },
  { id: 'beach', name: 'Beach.jpg', parent: 'pics', folder: false, size: 2_480_000, modified: '2026-08-14' },
  { id: 'notes', name: 'Notes.txt', parent: '', folder: false, size: 2_100, modified: '2026-11-20' },
];

/** The application's file API (your server endpoints); a short delay stands in for the network. */
function createFileApi(initial: readonly Entry[]) {
  let entries = [...initial];
  let next = 1;
  const wait = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 120));
  return {
    list: () => wait([...entries]),
    createFolder: (parent: string, name: string) => {
      entries = [...entries, { id: `new-${next++}`, name, parent, folder: true, size: 0, modified: new Date().toISOString().slice(0, 10) }];
      return wait([...entries]);
    },
    rename: (id: string, name: string) => {
      entries = entries.map((e) => (e.id === id ? { ...e, name } : e));
      return wait([...entries]);
    },
    remove: (ids: readonly string[]) => {
      const gone = new Set(ids);
      // Removing a folder removes its subtree.
      let grew = true;
      while (grew) {
        grew = false;
        for (const e of entries)
          if (!gone.has(e.id) && gone.has(e.parent)) {
            gone.add(e.id);
            grew = true;
          }
      }
      entries = entries.filter((e) => !gone.has(e.id));
      return wait([...entries]);
    },
    add: (parent: string, file: File) => {
      entries = [...entries, { id: `up-${next++}`, name: file.name, parent, folder: false, size: file.size, modified: new Date().toISOString().slice(0, 10) }];
      return wait([...entries]);
    },
  };
}

const formatSize = (bytes: number): string => (bytes === 0 ? '' : bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`);

interface Row {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly size: string;
  readonly modified: string;
}

const columns: DataGridColumn<Row>[] = [
  { field: 'name', header: 'Name', width: 220 },
  { field: 'kind', header: 'Type', width: 110 },
  { field: 'size', header: 'Size', width: 100, align: 'end' },
  { field: 'modified', header: 'Modified', width: 130 },
];

export default function FileBrowserRecipeDemo() {
  const [api] = useState(() => createFileApi(SEED));
  const [entries, setEntries] = useState<readonly Entry[]>(SEED);
  const [folder, setFolder] = useState('docs');
  const [expanded, setExpanded] = useState<readonly TreeViewKey[]>(['root', 'docs']);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [view, setView] = useState<'details' | 'icons'>('details');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<null | 'folder' | 'rename' | 'upload'>(null);
  const [status, setStatus] = useState('Ready');

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  // The navigation pane: a tree of folders under a root node.
  const tree = useMemo<Folder[]>(() => {
    const build = (parent: string): Folder[] => entries.filter((e) => e.folder && e.parent === parent).map((e) => ({ id: e.id, name: e.name, children: build(e.id) }));
    return [{ id: 'root', name: 'My files', children: build('') }];
  }, [entries]);
  const path = useMemo(() => {
    const out: Entry[] = [];
    for (let e = byId.get(folder); e; e = byId.get(e.parent)) out.unshift(e);
    return out;
  }, [byId, folder]);
  const rows = useMemo<Row[]>(
    () =>
      entries
        .filter((e) => e.parent === (folder === 'root' ? '' : folder) && e.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name))
        .map((e) => ({ id: e.id, name: e.name, kind: e.folder ? 'Folder' : (e.name.split('.').pop() ?? '').toUpperCase(), size: formatSize(e.size), modified: e.modified })),
    [entries, folder, query],
  );

  const run = async (label: string, call: Promise<readonly Entry[]>) => {
    setStatus(`${label}…`);
    setEntries(await call);
    setStatus(label);
  };
  const open = (id: string) => {
    const e = byId.get(id);
    if (e?.folder) {
      setFolder(id);
      setSelected([]);
      setExpanded((x) => (x.includes(e.parent || 'root') ? x : [...x, e.parent || 'root']));
    } else if (e) setStatus(`Opened ${e.name}`);
  };
  const target = folder === 'root' ? '' : folder;
  const single = selected.length === 1 ? byId.get(selected[0] as string) : undefined;
  const upload: UploadTransport = async (file) => {
    setEntries(await api.add(target, file));
  };
  const action = (id: string) => {
    if (id === 'open' && single) open(single.id);
    else if (id === 'new-folder') setDialog('folder');
    else if (id === 'upload') setDialog('upload');
    else if (id === 'rename' && single) setDialog('rename');
    else if (id === 'delete' && selected.length) void run(`Deleted ${selected.length} item(s)`, api.remove(selected)).then(() => setSelected([]));
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Toolbar aria-label="File commands">
        <Button variant="ghost" onClick={() => action('new-folder')}>
          New folder
        </Button>
        <Button variant="ghost" onClick={() => action('upload')}>
          Upload
        </Button>
        <ToolbarSeparator />
        <Button variant="ghost" disabled={!single} onClick={() => action('rename')}>
          Rename
        </Button>
        <Button variant="ghost" disabled={!selected.length} onClick={() => action('delete')}>
          Delete
        </Button>
        <ToolbarSpacer />
        <ToolbarItem overflow="never">
          <TextField type="search" aria-label="Search this folder" placeholder="Search" style={{ inlineSize: 140 }} value={query} onValueChange={(value) => setQuery(value)} />
        </ToolbarItem>
        <ToolbarItem overflow="never">
          <ToggleButtonGroup aria-label="View" value={view} onValueChange={(next) => next && setView(next as 'details' | 'icons')} disallowEmpty>
            <ToggleButton value="details">Details</ToggleButton>
            <ToggleButton value="icons">Icons</ToggleButton>
          </ToggleButtonGroup>
        </ToolbarItem>
      </Toolbar>
      <Breadcrumbs
        aria-label="Folder path"
        onItemClick={(event) => {
          event.preventDefault();
          const id = new URLSearchParams(event.href?.split('?')[1]).get('folder') ?? 'root';
          open(id);
          if (id === 'root') setFolder('root');
        }}
      >
        <BreadcrumbItem href="?folder=root" current={folder === 'root'}>
          My files
        </BreadcrumbItem>
        {path.map((e) => (
          <BreadcrumbItem key={e.id} href={`?folder=${e.id}`} current={e.id === folder}>
            {e.name}
          </BreadcrumbItem>
        ))}
      </Breadcrumbs>
      <Splitter defaultSizes={{ nav: 200 }} style={{ height: 320, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}>
        <Splitter.Pane id="nav" minSize={140} maxSize="45%">
          <TreeView
            aria-label="Folders"
            data={tree}
            getItemId={(f) => f.id}
            getItemLabel={(f) => f.name}
            getChildren={(f) => (f.children.length ? f.children : undefined)}
            selection="single"
            selected={[folder]}
            onSelectedChange={(event) => event.selected[0] !== undefined && open(String(event.selected[0]))}
            expanded={expanded}
            onExpandedChange={(event) => setExpanded(event.expanded)}
            height={318}
          />
        </Splitter.Pane>
        <Splitter.Pane id="main">
          <ContextMenu
            style={{ blockSize: '100%' }}
            onBeforeOpen={(event) => {
              // Right-click on a row selects it first, as file managers do.
              const id = event.target.closest('[data-row-id]')?.getAttribute('data-row-id') ?? event.target.closest('[data-file-id]')?.getAttribute('data-file-id');
              if (id && !selected.includes(id)) setSelected([id]);
            }}
            onAction={(event) => action(event.id)}
            menu={
              <Menu aria-label="File actions">
                <MenuItem id="open">Open</MenuItem>
                <MenuItem id="rename">Rename</MenuItem>
                <MenuItem id="delete">Delete</MenuItem>
                <MenuSeparator />
                <MenuItem id="new-folder">New folder</MenuItem>
                <MenuItem id="upload">Upload files…</MenuItem>
              </Menu>
            }
          >
            {view === 'details' ? (
              <DataGrid<Row>
                aria-label="Files"
                data={rows}
                columns={columns}
                getRowId={(row) => row.id}
                height={318}
                resizeMode="auto"
                sorting
                selection={{ mode: 'row', multiple: true, rowIds: selected }}
                onSelectionChange={(event) => setSelected(event.rowIds.map(String))}
                onRowDoubleClick={(event) => open(String(event.rowId))}
              />
            ) : (
              <ul aria-label="Files" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, padding: 8, margin: 0, listStyle: 'none' }}>
                {rows.map((r) => (
                  <li key={r.id}>
                    <Button
                      data-file-id={r.id}
                      variant={selected.includes(r.id) ? 'outline' : 'ghost'}
                      aria-pressed={selected.includes(r.id)}
                      style={{ inlineSize: '100%', blockSize: 88, flexDirection: 'column' }}
                      onClick={() => setSelected([r.id])}
                      onDoubleClick={() => open(r.id)}
                    >
                      <span style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
                        <svg viewBox="0 0 16 16" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                          <path d={r.kind === 'Folder' ? 'M1.5 4.5h5l1.5 1.5h6.5v7h-13z' : 'M4 1.5h5l3 3v10H4zM9 1.5v3h3'} />
                        </svg>
                        {r.name}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ContextMenu>
        </Splitter.Pane>
      </Splitter>
      <p className="demo-status" aria-live="polite">
        {status} · {rows.length} item(s){selected.length ? ` · ${selected.length} selected` : ''}
      </p>

      <Dialog open={dialog === 'folder' || dialog === 'rename'} onOpenChange={(isOpen) => !isOpen && setDialog(null)} closeButton>
        <Dialog.Title>{dialog === 'rename' ? 'Rename' : 'New folder'}</Dialog.Title>
        <form
          method="dialog"
          onSubmit={(event) => {
            const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
            if (!name) return;
            if (dialog === 'rename' && single) void run(`Renamed to ${name}`, api.rename(single.id, name));
            else void run(`Created ${name}`, api.createFolder(target, name));
          }}
        >
          <Dialog.Body>
            <TextField label="Name" name="name" data-autofocus="" required defaultValue={dialog === 'rename' ? single?.name : 'New folder'} />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close render={(p) => <Button {...p} variant="outline" />}>Cancel</Dialog.Close>
            <Button type="submit" tone="primary">
              {dialog === 'rename' ? 'Rename' : 'Create'}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog>

      <Dialog open={dialog === 'upload'} onOpenChange={(isOpen) => !isOpen && setDialog(null)} closeButton>
        <Dialog.Title>Upload to {folder === 'root' ? 'My files' : byId.get(folder)?.name}</Dialog.Title>
        <Dialog.Body>
          <FileUpload label="Files" multiple upload={upload} autoUpload maxSize={10 * 1024 * 1024} />
        </Dialog.Body>
      </Dialog>
    </div>
  );
}
