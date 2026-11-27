---
title: File Manager
description: A file browser is a composition of TreeView, Breadcrumbs, Toolbar, DataGrid, ContextMenu, FileUpload, Dialog and Splitter over your own file API.
category: File Manager
order: 140
demos: [file-browser-recipe]
---

```tsx
import { Breadcrumbs, BreadcrumbItem } from '@salmonui/navigation/breadcrumbs';
import { DataGrid } from '@salmonui/data-grid';
import { ContextMenu, Menu, MenuItem } from '@salmonui/buttons/menu';
import { Splitter } from '@salmonui/layout/splitter';
import { Toolbar } from '@salmonui/navigation/toolbar';
import { TreeView } from '@salmonui/navigation/tree-view';
import '@salmonui/navigation/breadcrumbs/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/layout/splitter/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/navigation/tree-view/styles.css';

<Toolbar aria-label="File commands">...</Toolbar>
<Breadcrumbs aria-label="Folder path" onItemClick={navigate}>...</Breadcrumbs>
<Splitter defaultSizes={{ nav: 200 }}>
  <Splitter.Pane id="nav">
    <TreeView aria-label="Folders" data={folders} selection="single" selected={[folder]} onSelectedChange={openFolder} ... />
  </Splitter.Pane>
  <Splitter.Pane id="main">
    <ContextMenu menu={<Menu aria-label="File actions">...</Menu>} onAction={runAction}>
      <DataGrid aria-label="Files" data={files} columns={columns} sorting selection={{ multiple: true, rowIds: selected }} onRowDoubleClick={openRow} />
    </ContextMenu>
  </Splitter.Pane>
</Splitter>
```

A file browser is a composition over **your** file API: the server protocol
(physical, cloud, FTP or database storage) stays yours, and every part you
see already exists as a Salmon UI component, so the components render your
data and your event handlers call your endpoints. The demo uses an in-memory
store with async calls in place of a server.

## Parts

| File browser feature | Salmon UI composition |
| --- | --- |
| Server access (list, upload, download and thumbnail URLs, request hooks, success and failure) | Your own `fetch` calls in the handlers below; errors are your promise rejections |
| Client-side file data | Your data in React state, rendered by `TreeView` and `DataGrid` |
| Navigation pane, with an optional template | [TreeView](/docs/navigation/tree-view) of folders: `selection="single"`, controlled `selected` and `expanded`, `renderItem` for a template, `loadChildren` for lazy folders |
| Address bar (current path, root name, going up a level) | [Breadcrumbs](/docs/navigation/breadcrumbs) of the current path; `onItemClick` navigates (call `preventDefault()` to stay in the app); the first item's label is the root name |
| Toolbar (items, clicks, enabled state) | [Toolbar](/docs/navigation/toolbar) of buttons with their own `onClick` and `disabled`; it overflows into a menu when narrow |
| Context menu (items, open, click) | [ContextMenu](/docs/navigation/context-menu) around the file list; `onBeforeOpen` selects the row under the pointer, `onAction` runs the command, items are disabled by rendering |
| Details view | [DataGrid](/docs/data-grid/columns) with your columns, sorting, filtering and row selection |
| Large icons view, with thumbnails or a template | A CSS grid of buttons or [Cards](/docs/layout/card) with your thumbnails |
| Virtualization | `DataGrid` and `TreeView` virtualize by default |
| Selection (multiple, ranges, item checkboxes, controlled selection, selection events) | `DataGrid selection` (`multiple`, Shift ranges, a `type: 'selection'` checkbox column, controlled `rowIds`, `onSelectionChange`) |
| File operations (new folder, rename, delete, cut / copy / paste, move, download, open, details) | Handlers that call your API, then update the data; [Dialog](/docs/layout/dialog) for the name prompt and the details |
| Upload | [FileUpload](/docs/inputs/file-upload) with an `upload` transport that posts to your endpoint (size, type and count limits, directories, queue, retry) |
| Drag and drop of files and folders | `TreeView` drag and drop and `DataGrid` row drag, with your move call in the drop handler |
| Search and filtering | A search field in the toolbar that filters your rows, or the `DataGrid` search and filter row |
| Sorting and display (sort field and order, custom comparer, file extensions, hidden items) | `DataGrid` sorting and column value formatting; filter hidden items out of your data |
| Popups (target, open and close events) | `Dialog` and `Popover` `open` / `onOpenChange` |
| Layout (height, width, resizable navigation pane) | [Splitter](/docs/layout/splitter) between the panes; CSS sizes the frame |
| WebMCP tools | Not offered: WebMCP is a proposed browser API that the catalog does not expose |

## Navigation

Keep the current folder id in state. The tree, the address bar and a
double-click on a folder row all set it:

```tsx
const open = (id: string) => {
  const entry = byId.get(id);
  if (entry?.folder) setFolder(id);
  else if (entry) openFile(entry); // your viewer or a download
};

<TreeView selection="single" selected={[folder]} onSelectedChange={(e) => open(String(e.selected[0]))} ... />
<DataGrid onRowDoubleClick={(e) => open(String(e.rowId))} ... />
```

For large or remote trees, give `TreeView` `hasChildren` and `loadChildren`
so folders load when expanded.

## Operations

Each command is a handler that calls your API and stores the result:

```tsx
const remove = async () => {
  setEntries(await fileApi.remove(selected)); // DELETE /files
  setSelected([]);
};
```

The same handler serves the toolbar button and the context menu entry
(`onAction` receives the item `id`). Rename and new folder open a `Dialog`
with a form; its submit calls the API. A details dialog shows the selected
entry's fields.

## Upload

`FileUpload` with an `upload` transport sends each file to your endpoint and
reports progress; add the new entries to your data when a file finishes:

```tsx
const upload: UploadTransport = async (file, { signal, onProgress }) => {
  const entry = await postFile(folder, file, { signal, onProgress }); // POST /files
  setEntries((all) => [...all, entry]);
};

<FileUpload label="Files" multiple upload={upload} autoUpload maxSize={10 * 1024 * 1024} />
```

`createXhrUploader` from `@salmonui/inputs/file-upload/xhr` builds an
XMLHttpRequest transport with upload progress, if your endpoint accepts
multipart requests.

## Keyboard and accessibility

Every part keeps its own APG pattern: the `Toolbar` is one tab stop with
arrow keys, `Breadcrumbs` is a `nav` landmark, `TreeView` is an APG tree
(arrows, Home / End, typeahead, Enter), the `DataGrid` is an APG grid (arrows,
Space selects, Shift ranges), and `ContextMenu` opens with Shift+F10 (or a
long press on touch). Add application shortcuts (Delete, F2 for rename,
Ctrl+C / Ctrl+V) with `onKeyDown` on the file list, and announce the result
of each operation in a polite live region, as the demo's status line does.

## Connecting your server

Call your existing file endpoints from the handlers above: listing a folder
feeds the tree and the grid, create, rename, delete, copy and move are the
operation handlers, upload is the `FileUpload` transport and download is a
link or `fetch`. A details view is the `DataGrid`; a large icons view is a
card grid.

Every part of this page follows the same rule,
stated at the top: the storage protocol is yours, and each visible part is
an existing component, so the composition stays small and fully under your
control.

## Server rendering

Each part renders on the server and hydrates without warnings:
the toolbar and the breadcrumbs measure their overflow only after mount,
the tree and the grid render their first window, and the context menu,
dialogs and upload popups mount on the client. Load the folder listing on
the server and pass it as the initial state to avoid an empty first paint.

## API reference

The parts of a file browser are documented in
[`@salmonui/navigation/tree-view`](/docs/reference/navigation/tree-view),
[`@salmonui/data-grid`](/docs/reference/data-grid),
[`@salmonui/navigation/breadcrumbs`](/docs/reference/navigation/breadcrumbs),
[`@salmonui/navigation/toolbar`](/docs/reference/navigation/toolbar),
[`@salmonui/buttons/menu`](/docs/reference/buttons/menu),
[`@salmonui/inputs/file-upload`](/docs/reference/inputs/file-upload),
[`@salmonui/overlays/dialog`](/docs/reference/overlays/dialog) and
[`@salmonui/layout/splitter`](/docs/reference/layout/splitter).
