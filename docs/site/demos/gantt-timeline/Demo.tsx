'use client';

import { useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttProps, type GanttTimeline } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; predecessors?: string };

const tasks: Task[] = [
  { id: 1, title: 'Mobile app 2.0', parentId: null },
  { id: 2, title: 'Research', parentId: 1, start: '2027-01-11', duration: 10, progress: 100 },
  { id: 3, title: 'Prototype', parentId: 1, duration: 15, progress: 40, predecessors: '2FS' },
  { id: 4, title: 'Beta', parentId: 1, duration: 30, predecessors: '3FS' },
  { id: 5, title: 'Store review', parentId: 1, duration: 5, predecessors: '4FS' },
  { id: 6, title: 'Release', parentId: 1, duration: 0, predecessors: '5FS' },
];

type Mode = NonNullable<GanttTimeline['mode']>;


const MODE_OPTIONS = [...(['hour', 'day', 'week', 'month', 'year'] as const).map((m) => ({ value: m, label: `mode: ${m}` })), { value: 'custom', label: 'custom tiers: month over fortnights' }];
const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['title', 'start', 'end', 'duration'];
/** Timeline modes and custom tiers, unit width and week start, a tier cell template, zoom and fit, an infinite timeline, scroll methods, event markers, the splitter and panes, and the date format. */
export default function GanttTimelineDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const [mode, setMode] = useState<Mode | 'custom'>('week');
  const [unitWidth, setUnitWidth] = useState(33);
  const [panes, setPanes] = useState<'both' | 'grid' | 'chart'>('both');
  const [zoom, setZoom] = useState<string>('');
  const [status, setStatus] = useState('');
  const timeline: GanttTimeline =
    mode === 'custom'
      ? {
          topTier: { unit: 'month', format: { month: 'short', year: 'numeric' } },
          bottomTier: { unit: 'week', count: 2, format: { day: 'numeric' }, render: ({ date, text }) => <span title={`Fortnight from ${date.toISOString().slice(0, 10)}`}>{`⇥ ${text}`}</span> },
          unitWidth,
          weekStart: 1,
          infinite: true,
        }
      : {
          mode,
          unitWidth,
          weekStart: 1,
          infinite: true,
          renderCell: ({ tier, text }) => (tier === 'top' ? <strong>{text}</strong> : text),
        };
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Timeline
          <Select aria-label="Timeline" data={MODE_OPTIONS} value={mode} onValueChange={(value) => value != null && setMode(value as Mode | 'custom')} />
        </label>
        <Slider label="Unit width" min={20} max={80} value={unitWidth} onValueChange={setUnitWidth} valueLabel={{ format: (v) => `${String(v)} px` }} style={{ inlineSize: 160 }} />
        <label>
          Panes
          <Select aria-label="Panes" data={[{ value: 'both', label: 'both' }, { value: 'grid', label: 'grid' }, { value: 'chart', label: 'chart' }]} value={panes} onValueChange={(value) => value != null && setPanes(value as 'both' | 'grid' | 'chart')} />
        </label>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => apiRef.current?.zoomIn()}>
          zoomIn()
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.zoomOut()}>
          zoomOut()
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.zoomToFit()}>
          zoomToFit()
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.scrollToDate('2027-03-15')}>
          scrollToDate(15 Mar)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.scrollToTask('5')}>
          scrollToTask(5)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.extendTimeline('end')}>
          extendTimeline(&apos;end&apos;)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.setSplitterPosition('30%')}>
          setSplitterPosition(30%)
        </Button>
      </div>
      <Gantt<Task>
        ref={apiRef}
        aria-label="Mobile app 2.0 timeline"
        data={tasks}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        timeZone="UTC"
        locale="en-GB"
        dateFormat="dd.MM.yyyy"
        timeline={timeline}
        highlightWeekends
        markers={[
          { date: '2027-02-01', label: 'Funding review' },
          { date: '2027-03-22', label: 'Marketing launch', className: 'demo-marker' },
        ]}
        splitter={{ position: '40%', minSize: 160 }}
        panes={panes}
        height={420}
        onZoomChange={(e) => setZoom(`onZoomChange: level ${e.level} (from ${e.previous})`)}
        onSplitterResizeEnd={(e) => setStatus(`onSplitterResizeEnd: ${Math.round(e.position)} px`)}
      />
      <p className="demo-status" aria-live="polite">
        {[zoom, status].filter(Boolean).join(' · ') || 'Zoom with Ctrl+wheel over the chart, or drag the splitter'}
      </p>
    </div>
  );
}
