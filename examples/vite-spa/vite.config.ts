import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The rich-text engine is a dynamic import; pre-bundling ProseMirror up front avoids the dev server
  // reloading the page when it discovers those modules on the first editor mount. The same holds for
  // pdf.js (@salmonui/pdf-viewer loads it with a dynamic import).
  // The pdf.js worker entry is listed too: otherwise the optimizer discovers it on the first PdfViewer
  // load and re-optimizes while other pages are open (parallel browser tests).
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf.worker.min.mjs', 'prosemirror-commands', 'prosemirror-dropcursor', 'prosemirror-gapcursor', 'prosemirror-history', 'prosemirror-inputrules', 'prosemirror-keymap', 'prosemirror-model', 'prosemirror-schema-list', 'prosemirror-state', 'prosemirror-tables', 'prosemirror-transform', 'prosemirror-view', 'yjs', 'y-prosemirror', 'y-protocols/awareness', 'pdfjs-dist'],
  },
  server: { port: 41730, strictPort: true },
  preview: { port: 41740, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // hierarchy.html: the hierarchy browser page (detail rows, child grids, row drag); infinite.html: infinite scroll;
    // remote.html: the remote first page budget (JSON source over the reference handler);
    // pickers.html: the calendar pickers (tests/browser/pickers*.spec.ts);
    // calendars.html: Calendar, RangeCalendar, DateField and TimeField (tests/browser/calendars.spec.ts).
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        hierarchy: fileURLToPath(new URL('hierarchy.html', import.meta.url)),
        infinite: fileURLToPath(new URL('infinite.html', import.meta.url)),
        remote: fileURLToPath(new URL('remote.html', import.meta.url)),
        pickers: fileURLToPath(new URL('pickers.html', import.meta.url)),
        // menu.html: the Menu family keyboard, pointer and budget page (tests/browser/menu*.spec.ts).
        menu: fileURLToPath(new URL('menu.html', import.meta.url)),
        // buttons.html?perf: Button family interaction budgets (tests/browser/buttons-perf.spec.ts).
        buttons: fileURLToPath(new URL('buttons.html', import.meta.url)),
        calendars: fileURLToPath(new URL('calendars.html', import.meta.url)),
        // listbox.html: Listbox behaviour, a11y and dropdown budgets (tests/browser/listbox.spec.ts).
        listbox: fileURLToPath(new URL('listbox.html', import.meta.url)),
        // Mention (tests/browser/mention.spec.ts).
        mention: fileURLToPath(new URL('mention.html', import.meta.url)),
        // Conversation (tests/browser/conversation.spec.ts).
        conversation: fileURLToPath(new URL('conversation.html', import.meta.url)),
        // Conversation assistant variant (tests/browser/conversation-assistant*.spec.ts).
        assistant: fileURLToPath(new URL('assistant.html', import.meta.url)),
        // InlineAssist (tests/browser/inline-assist*.spec.ts).
        'inline-assist': fileURLToPath(new URL('inline-assist.html', import.meta.url)),
        // TextArea suggest and smart paste (tests/browser/smart.spec.ts).
        smart: fileURLToPath(new URL('smart.html', import.meta.url)),
        // editors.html: InlineEdit and MarkdownEditor (tests/browser/inline-edit*.spec.ts, markdown-editor*.spec.ts).
        editors: fileURLToPath(new URL('editors.html', import.meta.url)),
        // image-editor.html: ImageEditor (tests/browser/image-editor*.spec.ts).
        'image-editor': fileURLToPath(new URL('image-editor.html', import.meta.url)),
        // dropdowns.html: the Select and Combobox page (select.spec.ts, combobox.spec.ts, select-combobox-perf.spec.ts).
        dropdowns: fileURLToPath(new URL('dropdowns.html', import.meta.url)),
        // pivot.html: the Pivot Table page (tests/browser/pivot*.spec.ts, a11y, ARIA snapshots).
        pivot: fileURLToPath(new URL('pivot.html', import.meta.url)),
        // viz-families.html: Sparkline, PieChart, FunnelChart, HeatMap, TreeMap, SankeyChart
        // (tests/browser/viz-families*.spec.ts), including the sparklines-in-a-grid scroll gate.
        'viz-families': fileURLToPath(new URL('viz-families.html', import.meta.url)),
        // viz-cross.html: the cross-family rows of every
        // visualization family except Chart (tests/browser/viz-cross.spec.ts).
        'viz-cross': fileURLToPath(new URL('viz-cross.html', import.meta.url)),
        // tree.html: DataGrid tree mode (tests/browser/tree.spec.ts).
        tree: fileURLToPath(new URL('tree.html', import.meta.url)),
        // tree-features.html: tree mode with inherited grid features (tree-features.spec.ts, tree-infinite.spec.ts).
        treeFeatures: fileURLToPath(new URL('tree-features.html', import.meta.url)),
        // tree-perf.html: the tree-large benchmark page (tests/browser/tree-perf.spec.ts).
        treePerf: fileURLToPath(new URL('tree-perf.html', import.meta.url)),
        // inputs.html: the Inputs and Forms page (tests/browser/inputs-*.spec.ts).
        inputs: fileURLToPath(new URL('inputs.html', import.meta.url)),
        // gauges.html: Gauge, Barcode and QRCode (tests/browser/gauges.spec.ts, gauges-a11y.spec.ts).
        gauges: fileURLToPath(new URL('gauges.html', import.meta.url)),
        // Spinner and Skeleton (tests/browser/notifications-spinner-skeleton.spec.ts).
        'spinner-skeleton': fileURLToPath(new URL('spinner-skeleton.html', import.meta.url)),
        // Progress and Meter (tests/browser/notifications-progress.spec.ts).
        progress: fileURLToPath(new URL('progress.html', import.meta.url)),
        // Badge and Message (tests/browser/notifications-badge-message.spec.ts).
        'badge-message': fileURLToPath(new URL('badge-message.html', import.meta.url)),
        // useFormState, requiredMark and the unsaved-changes Drawer flow (tests/browser/inputs-form-state.spec.ts).
        'form-state': fileURLToPath(new URL('form-state.html', import.meta.url)),
        // Toaster and the toast queue (tests/browser/notifications-toast.spec.ts).
        toast: fileURLToPath(new URL('toast.html', import.meta.url)),
        // Navigation: one page per component; menubar.html carries ContextMenu and Menubar.
        accordion: fileURLToPath(new URL('accordion.html', import.meta.url)),
        breadcrumbs: fileURLToPath(new URL('breadcrumbs.html', import.meta.url)),
        carousel: fileURLToPath(new URL('carousel.html', import.meta.url)),
        'sidebar-layout': fileURLToPath(new URL('sidebar-layout.html', import.meta.url)),
        // admin-template.html: an admin orders page under one compact, surfaced theme (visual reference page).
        'admin-template': fileURLToPath(new URL('admin-template.html', import.meta.url)),
        'sidebar-menu': fileURLToPath(new URL('sidebar-menu.html', import.meta.url)),
        tabs: fileURLToPath(new URL('tabs.html', import.meta.url)),
        toolbar: fileURLToPath(new URL('toolbar.html', import.meta.url)),
        // Ribbon recipe: Tabs + Toolbar multi-size items (tests/browser/ribbon.spec.ts).
        ribbon: fileURLToPath(new URL('ribbon.html', import.meta.url)),
        'tree-view': fileURLToPath(new URL('tree-view.html', import.meta.url)),
        // TreeSelect (tests/browser/tree-select*.spec.ts).
        'tree-select': fileURLToPath(new URL('tree-select.html', import.meta.url)),
        stepper: fileURLToPath(new URL('stepper.html', import.meta.url)),
        pager: fileURLToPath(new URL('pager.html', import.meta.url)),
        // LocaleProvider with the zh-TW pack across several families (tests/browser/locale-zh-tw.spec.ts).
        'locale-zh-tw': fileURLToPath(new URL('locale-zh-tw.html', import.meta.url)),
        menubar: fileURLToPath(new URL('menubar.html', import.meta.url)),
        // data-visualization.html: Chart, RangeSelector and StockChart (tests/browser/data-visualization.spec.ts).
        'data-visualization': fileURLToPath(new URL('data-visualization.html', import.meta.url)),
        // chart-features.html: tooltip modes, crosshair, shared selection and the Chart timing cases
        // (tests/browser/chart-features.spec.ts, chart-perf.spec.ts).
        'chart-features': fileURLToPath(new URL('chart-features.html', import.meta.url)),
        // Layout category: one page per family (tests/browser/<family>.spec.ts).
        popover: fileURLToPath(new URL('popover.html', import.meta.url)),
        // TagGroup (tests/browser/tag-group.spec.ts).
        'tag-group': fileURLToPath(new URL('tag-group.html', import.meta.url)),
        dialog: fileURLToPath(new URL('dialog.html', import.meta.url)),
        // Popups inside a modal Dialog / Drawer (tests/browser/modal-popups.spec.ts).
        'modal-popups': fileURLToPath(new URL('modal-popups.html', import.meta.url)),
        tooltip: fileURLToPath(new URL('tooltip.html', import.meta.url)),
        splitter: fileURLToPath(new URL('splitter.html', import.meta.url)),
        'dashboard-layout': fileURLToPath(new URL('dashboard-layout.html', import.meta.url)),
        display: fileURLToPath(new URL('display.html', import.meta.url)),
        // scheduler.html: RecurrenceEditor and Scheduler (tests/browser/recurrence-editor.spec.ts, scheduler*.spec.ts).
        scheduler: fileURLToPath(new URL('scheduler.html', import.meta.url)),
        // gantt.html: Gantt (tests/browser/gantt*.spec.ts).
        gantt: fileURLToPath(new URL('gantt.html', import.meta.url)),
        // gantt-resources.html: resource view, multi-taskbar, split tasks, tooltips (tests/browser/gantt-resources.spec.ts).
        'gantt-resources': fileURLToPath(new URL('gantt-resources.html', import.meta.url)),
        // Kanban (tests/browser/kanban*.spec.ts).
        kanban: fileURLToPath(new URL('kanban.html', import.meta.url)),
        // @salmonui/rich-text: RichTextEditor (rich-text*.spec.ts), BlockEditor (block-editor*.spec.ts) and
        // Mention on a contenteditable target (mention-editable.spec.ts).
        'rich-text': fileURLToPath(new URL('rich-text.html', import.meta.url)),
        'block-editor': fileURLToPath(new URL('block-editor.html', import.meta.url)),
        'mention-editable': fileURLToPath(new URL('mention-editable.html', import.meta.url)),
        'rich-text-collab': fileURLToPath(new URL('rich-text-collab.html', import.meta.url)),
        'rich-text-inline-edit': fileURLToPath(new URL('rich-text-inline-edit.html', import.meta.url)),
        // InlineEdit composed with the field components (tests/browser/inline-edit-fields.spec.ts).
        'inline-edit-fields': fileURLToPath(new URL('inline-edit-fields.html', import.meta.url)),
        // @salmonui/pdf-viewer: PdfViewer (tests/browser/pdf-viewer*.spec.ts).
        'pdf-viewer': fileURLToPath(new URL('pdf-viewer.html', import.meta.url)),
        // Theme density: default and compact scopes side by side (tests/browser/theme-density.spec.ts).
        'theme-density': fileURLToPath(new URL('theme-density.html', import.meta.url)),
      },
    },
  },
});
