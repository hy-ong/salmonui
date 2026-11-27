'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { ImageEditor, type ImageEditorActions, type ImageEditorAnnotation } from '@salmonui/editors/image-editor';

/** A generated landscape (no network image): sky, sun, hills and a "license plate" to redact. */
function makeScene(): string {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#7cc6ff');
  sky.addColorStop(1, '#fde2b8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(500, 90, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f8f4f';
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.quadraticCurveTo(160, 180, 320, 290);
  ctx.quadraticCurveTo(480, 200, 640, 280);
  ctx.lineTo(640, 400);
  ctx.lineTo(0, 400);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(80, 320, 150, 44);
  ctx.fillStyle = '#1b1b1b';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('SAL 404', 92, 352);
  return c.toDataURL('image/png');
}

const START: readonly ImageEditorAnnotation[] = [
  { id: 'note', kind: 'text', x: 40, y: 40, text: 'Golden hour', fontSize: 36, color: '#ffffff', bold: true },
  { id: 'sun', kind: 'ellipse', x: 440, y: 30, width: 120, height: 120, stroke: '#e5484d', strokeWidth: 5 },
  { id: 'plate', kind: 'redact', x: 76, y: 316, width: 158, height: 52, mode: 'pixelate', strength: 10 },
];

export default function ImageEditorDemo() {
  // The image is generated in an effect: render stays identical on the server and the client.
  const [src, setSrc] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState(START);
  const [exported, setExported] = useState<string | null>(null);
  const actions = useRef<ImageEditorActions | null>(null);
  useEffect(() => setSrc(makeScene()), []);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <ImageEditor src={src} annotations={annotations} onAnnotationsChange={setAnnotations} actionsRef={actions} style={{ blockSize: 460 }} onSave={(blob) => setExported(`${Math.round(blob.size / 1024)} KB PNG`)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button
          variant="outline"
          onClick={async () => {
            const blob = await actions.current?.toBlob({ type: 'image/jpeg', quality: 0.85 });
            if (blob) setExported(`${Math.round(blob.size / 1024)} KB JPEG, ${actions.current?.getSize()?.width} × ${actions.current?.getSize()?.height}`);
          }}
        >
          Export JPEG
        </Button>
        <span aria-live="polite">{exported ? `Exported: ${exported}` : `${annotations.length} annotations`}</span>
      </div>
    </div>
  );
}
