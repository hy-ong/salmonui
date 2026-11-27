'use client';

// Zoom toolbar, a lazy chunk mounted after hydration: Navigation's
// `Toolbar` with a `ToggleButtonGroup` for the drag tool (zoom or pan) and
// buttons for zoom in, zoom out and reset (mask icons from the chart
// stylesheet, keyed on `data-icon`). Imported through the public
// subpaths, so `/chart` carries no toolbar or button code; pages import
// `toolbar/styles.css` and `button/styles.css` with the chart stylesheet.

import type { ReactNode } from 'react';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { Toolbar } from '@salmonui/navigation/toolbar';
import type { ChartText, ChartZoomTool } from './types.js';

export interface ZoomToolbarProps {
  readonly tools: readonly ChartZoomTool[];
  readonly tool: 'zoom' | 'pan';
  readonly zoomed: boolean;
  readonly position: string;
  readonly text: ChartText;
  readonly onTool: (tool: 'zoom' | 'pan') => void;
  readonly onZoom: (factor: number) => void;
  readonly onReset: () => void;
}

export default function ZoomToolbar(props: ZoomToolbarProps): ReactNode {
  const { tools, text } = props;
  const has = (t: ChartZoomTool) => tools.includes(t);
  const modes = (['zoom', 'pan'] as const).filter(has);
  return (
    <Toolbar aria-label={text.zoomToolbar} className="salmon-chart-zoom-toolbar" data-position={props.position} overflow="wrap">
      {modes.length ? (
        <ToggleButtonGroup size="sm" variant="outline" disallowEmpty value={props.tool} onValueChange={(v) => props.onTool(v === 'pan' ? 'pan' : 'zoom')} aria-label={text.zoomToolbar}>
          {modes.map((m) => (
            <ToggleButton key={m} value={m} iconOnly aria-label={m === 'pan' ? text.pan : text.zoomTool} title={m === 'pan' ? text.pan : text.zoomTool} data-icon={m} />
          ))}
        </ToggleButtonGroup>
      ) : null}
      {has('zoomIn') ? (
        <Button size="sm" variant="outline" iconOnly aria-label={text.zoomIn} title={text.zoomIn} onClick={() => props.onZoom(0.8)} data-icon="in" />
      ) : null}
      {has('zoomOut') ? (
        <Button size="sm" variant="outline" iconOnly aria-label={text.zoomOut} title={text.zoomOut} onClick={() => props.onZoom(1.25)} data-icon="out" />
      ) : null}
      {has('reset') ? (
        <Button size="sm" variant="outline" iconOnly aria-label={text.resetZoom} title={text.resetZoom} disabled={!props.zoomed} onClick={props.onReset} data-icon="reset" />
      ) : null}
    </Toolbar>
  );
}
