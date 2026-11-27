---
title: Diagram
description: A diagram editor is not included in Salmon UI. What it would cover, why it is not included, and what to use for hierarchies and flows instead.
category: Foundation
order: 95
---

Salmon UI has no `Diagram` component. Diagram is an application-sized editor
with its own engine and release cadence: shapes, routing, layouts, BPMN and UML,
a palette, an overview, history, serialization, and Visio and Mermaid
interchange. A read-only subset would not meet the needs of users who edit
diagrams, so Salmon UI does not include one.

## What to use instead

- **Keep your existing diagram editor** on diagram screens. The rest of the
  application can use Salmon UI independently.
- **Hierarchies and flows that are read-only** can use
  [TreeMap](/docs/data-visualization/tree-map),
  [SankeyChart](/docs/data-visualization/sankey-chart) or
  [TreeView](/docs/navigation/tree-view).
- **Organization charts** can be composed from [Card](/docs/layout/card) and
  CSS.
- **Card workflows** (columns of states with drag and drop) are often
  drawn as diagrams; [Kanban](/docs/data-visualization/kanban) covers them
  with keyboard drag, WIP limits and swimlanes.

## Using Salmon UI next to an existing diagram screen

1. Leave the diagram screen, its symbol palette, its overview and its saved
   diagram files as they are. Salmon UI reads no diagram data, so there
   is nothing to convert.
2. Isolate the screen: load it as its own route or lazy client chunk, so
   the diagram editor's bundle and stylesheet load only there and the rest
   of the application uses Salmon UI.
3. Where the diagram only displays data (an org chart built from data, a
   read-only flow), use one of the components above and keep the editing
   screens on the existing editor.
4. No Salmon UI component provides WebMCP tools, so diagram WebMCP
   stays with the existing screen.

Salmon UI provides none of the capabilities below; use the approach
above for them.

## Diagram capabilities not included

| Capability |
| --- |
| Nodes and shapes (basic, flow, path, image, HTML, native SVG, text), node templates and node defaults |
| Connectors: straight, orthogonal, bezier, segment editing, decorators, bridging, line routing, obstacle avoidance, line distribution and overlap handling |
| Ports and annotations (labels, editable text, hyperlinks) |
| Groups, containers, stack panels and swimlanes (lanes, phases) |
| Automatic layouts: hierarchical tree, complex hierarchical, organizational chart, mind map, radial tree, symmetrical, flowchart, and layout animation |
| BPMN shapes; UML class, activity and sequence diagrams; entity-relationship diagrams |
| Symbol palette and drag preview |
| Overview component (minimap) |
| Rulers, grid lines, snapping, page settings and layers |
| Selection, resize and rotate handles, fixed user handles, constraints, drawing tools and custom cursors |
| Undo and redo, clipboard, z-order, and align, distribute and size commands, with keyboard commands |
| Data binding (`dataSourceSettings`, data mapping) to build diagrams from data |
| JSON save and load; Mermaid and Visio import and export |
| Export (PNG, JPG, SVG, PDF), print, zoom, pan, scroll settings and virtualization |
| Tooltip, context menu and diagram events |
| Collaborative editing |
| Accessibility, keyboard navigation between nodes and connectors, RTL and localization |
