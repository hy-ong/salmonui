'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { FileUpload, type FileEntry, type FilePreload } from '@salmonui/inputs/file-upload';

// 500 preloaded entries with deterministic names and sizes (no randomness: SSR-safe).
const MANY: readonly FilePreload[] = Array.from({ length: 500 }, (_, i) => ({
  name: `scan-${String(i + 1).padStart(3, '0')}.pdf`,
  size: 20_000 + ((i * 7919) % 2_000_000),
  type: 'application/pdf',
}));

const NONE: readonly FileEntry[] = [];

// click to commit of a 500-file list, measured with performance.now().
export default function FileUploadLargeDemo() {
  const [files, setFiles] = useState<readonly (FileEntry | FilePreload)[]>(NONE);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const start = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (start.current === null) return;
    const ms = performance.now() - start.current;
    start.current = null;
    setElapsed(ms);
  }, [files]);

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 440 }}>
      <div className="demo-toolbar">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            start.current = performance.now();
            setFiles(MANY);
          }}
        >
          Show 500 files
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFiles(NONE);
            setElapsed(null);
          }}
        >
          Hide the files
        </Button>
        <output aria-live="polite">{elapsed === null ? 'Not measured yet' : `${files.length} files, mounted in ${elapsed.toFixed(1)} ms (budget 50 ms)`}</output>
      </div>
      <div style={{ maxBlockSize: 360, overflow: 'auto' }}>
        <FileUpload label="Scanned documents" multiple accept=".pdf" files={files} onFilesChange={setFiles} />
      </div>
    </div>
  );
}
