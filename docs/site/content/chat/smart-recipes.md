---
title: Smart feature recipes
description: How to build smart AI features with Salmon UI, a provider-agnostic Conversation adapter, your own server route and the public props of each host component.
category: Guides
order: 80
---

Smart AI features combine an assistant UI, a prompt, a server proxy and
calls into a host component. They are compositions rather than component
API, and they need application data such as embeddings and domain prompts, so
Salmon UI documents them as recipes and ships no provider SDK.

## The common pattern

1. Your server route calls the model and asks for JSON, through structured
   output or a tool call. Keep the provider key on the server.
2. Your application validates the reply against what the host component
   accepts.
3. You apply the validated result through the host component's props or `ref`
   API.

```tsx
import { Conversation, type ConversationAdapter } from '@salmonui/chat/conversation';
import '@salmonui/chat/conversation/styles.css';

const adapter: ConversationAdapter = async ({ text }, { signal }) => {
  const response = await fetch('/api/grid-command', {
    method: 'POST',
    body: JSON.stringify({ text }),
    signal,
  });
  const command = parseGridCommand(await response.json()); // your validation
  applyCommand(command);
  return command.summary;
};

<Conversation adapter={adapter} />;
```

Each section below shows the client calls for one host component.

## Data Grid

**Natural-language operations.** Have the model return sort, filter,
group and page values, then set them on `sorting.sortBy`, `filtering.filters`,
`grouping.groupBy` and `paging.page`. These replace the sample's
`filterByColumn`, `sortColumn`, `groupColumn` and `goToPage` calls.

**Semantic filtering.** Compute embeddings in your application, rank
the rows on the server, and pass the matching rows or a filter on their ids to
the grid.

**Anomaly detection and predictive analysis.** Run the analysis in
your application, then show results with `rowClassName` and a column's
`renderCell`.

## Tree Grid and Pivot Table

**Hierarchy correction and natural-language pivot.** For a tree, the
model proposes parent changes that you validate and apply to `data`. For a
pivot, it proposes a partial `pivotModel` that you validate and set; see
[AI and agent tools](/docs/pivot-table/state#ai-and-agent-tools).

## Scheduling

**Natural language to appointment.** Parse the prompt on the server
into an event row, confirm it with the user, then call `api.addEvents([row])`
on the `Scheduler`. `api.isSlotAvailable(start, end)` checks for conflicts.

**Prioritization, progress prediction, resource allocation and risk
assessment.** Have the model return task changes and apply the
approved ones with `api.updateTask(id, changes)` on the `Gantt`.

## Editors and documents

**Rewrite, grammar, summarize, translate and generate.** Pair the
editor toolbar with [InlineAssist](/docs/chat/inline-assist), or use
`Conversation` beside the editor, and write the accepted text back through the
editor's API.

**PDF summary, smart redaction and smart fill.** Extract the text on
your server, run the model there, and show the result next to `PdfViewer`.
Redacting or filling the file itself needs a server-side PDF tool; see the
[JavaScript PDF library](/docs/editors/javascript-pdf-library) guide.

**Magic eraser and background removal.** Not provided: a built-in
feature would be bound to one image AI provider, which breaks provider
neutrality. Call your
image service directly and load its result into the
[Image Editor](/docs/editors/image-editor).

**Spreadsheet analysis, validation and formula generation.** The
`Spreadsheet` is not included. For record data, apply model results to a `DataGrid`;
see the [Spreadsheet](/docs/editors/spreadsheet) guide.

## Search and queries

**File Manager and ComboBox semantic search.** Give `Combobox` a
remote `data` source whose `read` ranks items by your application's embeddings.
A [file browser](/docs/navigation/file-manager) can call the same search
endpoint.

**Natural language to query.** Have the adapter return a `QueryGroup`,
validate its fields and operators, and set it as the `QueryBuilder` `value`.

## Other components

**Text to mind map or flowchart.** Diagram is not included; see
[Diagram](/docs/data-visualization/diagram). Keep your existing diagram library
for these screens.

**Task recommendation and sentiment analysis.** Score the cards on
your server, then update the `Kanban` `data` or show the result in its card
rendering.

**Weather prediction.** Fetch the forecast in your application and
show it as data on a `GeoMap`.
