'use client';

import { useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttExportWriters, type GanttProps } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; predecessors?: string };

const tasks: Task[] = [
  { id: 1, title: 'Annual report', parentId: null },
  { id: 2, title: 'Collect figures', parentId: 1, start: '2027-01-11', duration: 5, progress: 100 },
  { id: 3, title: 'Write chapters', parentId: 1, duration: 8, progress: 40, predecessors: '2FS' },
  { id: 4, title: 'Layout', parentId: 1, duration: 4, predecessors: '3FS' },
  { id: 5, title: 'Print run', parentId: 1, duration: 0, predecessors: '4FS' },
];

// Writers load on first use: dynamic imports of @salmonui/export subpaths.
const writers: GanttExportWriters = { excel: () => import('@salmonui/export/xlsx'), pdf: () => import('@salmonui/export/gantt') };

type Lang = 'en' | 'de' | 'ar';
const LANG: Record<Lang, Partial<GanttProps<Task>>> = {
  en: { locale: 'en-GB' },
  de: { locale: 'de-DE', localeText: { gridPane: 'Aufgaben', chart: 'Zeitachse', paneSwitch: 'Ansicht' } },
  ar: { locale: 'ar-EG', dir: 'rtl' },
};

const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['title', 'start', 'end', 'duration', 'progress'];
const TOOLBAR: NonNullable<GanttProps<Task>['toolbar']> = ['excelExport', 'csvExport', 'pdfExport', 'zoomIn', 'zoomOut'];

/** Excel, CSV and PDF export, print, the context menu, keyboard shortcuts and labelled taskbars, RTL, localization, the adaptive layout and the task lookup methods. */
export default function GanttExportAccessibilityDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [narrow, setNarrow] = useState(false);
  const [status, setStatus] = useState('');
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Language
          <Select aria-label="Language" data={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }, { value: 'ar', label: 'العربية (RTL)' }]} value={lang} onValueChange={(value) => value != null && setLang(value as Lang)} />
        </label>
        <Checkbox checked={narrow} onCheckedChange={(checked) => setNarrow(checked)}>
          Narrow container (adaptive)
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.exportToExcel({ fileName: 'annual-report', sheetName: 'Plan' }).then((f) => setStatus(f ? `${f.fileName}: ${f.data.byteLength} bytes` : 'cancelled'))}>
          Export Excel
        </Button>
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.exportToCsv({ fileName: 'annual-report', separator: ';' }).then((f) => setStatus(f ? `${f.fileName}: ${f.data.split('\n').length} lines` : 'cancelled'))}>
          Export CSV
        </Button>
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.exportToPdf({ fileName: 'annual-report', pageSize: 'A4', orientation: 'landscape', fitToWidth: true, header: 'Annual report plan', footer: 'Confidential' }).then((f) => setStatus(f ? `${f.fileName}: ${f.data.byteLength} bytes` : 'cancelled'))}>
          Export PDF
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.print()}>
          Print
        </Button>
        <Button variant="outline"
          type="button"
          onClick={() => {
            const i = apiRef.current?.getTaskInfo('3');
            setStatus(i ? `getTask(3): ${apiRef.current?.getTask('3')?.title}; level ${i.level}, parent ${String(i.parentId)}, ${apiRef.current?.getViewRows().length} view rows` : '');
          }}
        >
          getTask / getTaskInfo(3)
        </Button>
      </div>
      <div style={{ inlineSize: narrow ? 420 : '100%', maxInlineSize: '100%' }}>
        <Gantt<Task>
          key={lang}
          ref={apiRef}
          aria-label="Annual report plan"
          data={tasks}
          taskFields={{ parentId: 'parentId' }}
          columns={COLUMNS}
          timeZone="UTC"
          height={380}
          contextMenu
          toolbar={TOOLBAR}
          exportWriters={writers}
          adaptive={{ breakpoint: 640 }}
          onExport={(e) => setStatus(`onExport(${e.format}): ${e.fileName}`)}
          onContextMenuItemClick={(e) => setStatus(`onContextMenuItemClick: ${e.item}`)}
          {...LANG[lang]}
        />
      </div>
      <p className="demo-status" aria-live="polite">
        {status || 'Export, right-click a row or a bar, or press F6 to move between the panes'}
      </p>
    </div>
  );
}
