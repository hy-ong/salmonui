'use client';
import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Dialog, type DialogPosition, type DialogSize } from '@salmonui/overlays/dialog';
import { EventLog, useEventLog } from '../../components/demo-kit';

export default function DialogDraggableDemo() {
  const [pos, setPos] = useState<DialogPosition>({ x: 0, y: 0 });
  const [size, setSize] = useState<DialogSize | null>(null);
  const [log, record] = useEventLog(6);
  // onMove / onResize run once per animation frame: write the DOM, not React state.
  const live = useRef<HTMLSpanElement>(null);
  return (
    <div>
      <div className="demo-toolbar">
        <Dialog
          trigger={<Dialog.Trigger render={(p) => <Button {...p}>Open palette</Button>} />}
          modal={false}
          draggable
          resizable
          position={pos}
          onPositionChange={setPos}
          width={size?.width ?? 320}
          height={size?.height}
          closeButton
          onMoveStart={() => record('move start')}
          onMove={(p) => {
            if (live.current) live.current.textContent = `moving ${Math.round(p.x)}, ${Math.round(p.y)}`;
          }}
          onMoveEnd={(p) => record(`move end ${Math.round(p.x)}, ${Math.round(p.y)}`)}
          onResizeStart={() => record('resize start')}
          onResize={(s) => {
            if (live.current) live.current.textContent = `resizing ${Math.round(s.width)} x ${Math.round(s.height)}`;
          }}
          onResizeEnd={(s) => {
            setSize(s);
            record(`resize end ${Math.round(s.width)} x ${Math.round(s.height)}`);
          }}
        >
          <Dialog.Title>Palette</Dialog.Title>
          <Dialog.Body>Drag the title, or focus it and use the arrow keys. Resize from the corner.</Dialog.Body>
        </Dialog>
        <Button
          variant="outline"
          onClick={() => {
            setPos({ x: 0, y: 0 });
            setSize(null);
          }}
        >
          Reset position and size
        </Button>
      </div>
      <p>
        <output>
          Offset {pos.x}, {pos.y}
          {size ? ` · size ${Math.round(size.width)} x ${Math.round(size.height)}` : ''}
        </output>{' '}
        <span ref={live} className="demo-status" />
      </p>
      <EventLog entries={log} label="Move and resize events" />
    </div>
  );
}
