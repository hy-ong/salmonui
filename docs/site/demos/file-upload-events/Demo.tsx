'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { FileUpload, formatFileSize, type FileUploadApi, type UploadTransport } from '@salmonui/inputs/file-upload';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

// A simulated server: about half a second per file, names containing "error" are rejected.
const simulated: UploadTransport = (file, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    let step = 0;
    const timer = setInterval(() => {
      step++;
      onProgress(Math.min(file.size, (file.size * step) / 5), file.size);
      if (step < 5) return;
      clearInterval(timer);
      if (file.name.toLowerCase().includes('error')) reject(new Error('Rejected by the server'));
      else resolve({ url: `/files/${encodeURIComponent(file.name)}` });
    }, 100);
    signal.addEventListener('abort', () => {
      clearInterval(timer);
      reject(signal.reason);
    });
  });

const MB = 1024 * 1024;

const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'ja-JP'].map((value) => ({ value, label: value }));

export default function FileUploadEventsDemo() {
  const api = useRef<FileUploadApi>(null);
  const [holdLarge, setHoldLarge] = useState(false);
  const [protect, setProtect] = useState(true);
  const [keepList, setKeepList] = useState(false);
  const [locale, setLocale] = useState('en-US');
  const [listed, setListed] = useState('');
  const [log, push] = useEventLog(14);
  const size = (bytes: number) => formatFileSize(bytes, locale);

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <div className="demo-toolbar">
        <Checkbox checked={holdLarge} onCheckedChange={(checked) => setHoldLarge(checked)}>
          Hold files over 1 MB
        </Checkbox>
        <Checkbox checked={protect} onCheckedChange={(checked) => setProtect(checked)}>
          Protect uploaded files
        </Checkbox>
        <Checkbox checked={keepList} onCheckedChange={(checked) => setKeepList(checked)}>
          Refuse clearing
        </Checkbox>
        <label>
          Size locale
          <Select aria-label="Size locale" data={LOCALES} value={locale} onValueChange={(value) => value != null && setLocale(String(value))} />
        </label>
      </div>
      <FileUpload
        ref={api}
        label="Documents"
        description="Names containing “error” fail on the simulated server"
        multiple
        upload={simulated}
        locale={locale}
        onBeforeFilesAdd={(event) => {
          const hidden = event.files.filter((f) => f.name.startsWith('.'));
          // The array is mutable: drop hidden files from the batch.
          for (const f of hidden) event.files.splice(event.files.indexOf(f), 1);
          push(`onBeforeFilesAdd ${event.source}: ${event.files.length} files${hidden.length ? `, ${hidden.length} hidden files dropped` : ''}`);
        }}
        onFilesChange={(files, d) => {
          if (d.reason !== 'progress') push(`onFilesChange ${d.reason} (${d.source}): ${files.length} files`);
        }}
        onBeforeUpload={(event) => {
          if (holdLarge && event.file.size > MB) {
            event.preventDefault();
            push(`onBeforeUpload ${event.file.name}: held (${size(event.file.size)})`);
          } else push(`onBeforeUpload ${event.file.name}`);
        }}
        onUploadSuccess={(file, result) => push(`onUploadSuccess ${file.name} -> ${(result as { url: string }).url}`)}
        onUploadError={(file, reason) => push(`onUploadError ${file.name}: ${reason instanceof Error ? reason.message : String(reason)}`)}
        onBeforeRemove={(event) => {
          if (protect && event.file.status === 'uploaded') {
            event.preventDefault();
            push(`onBeforeRemove ${event.file.name}: refused (uploaded)`);
          } else push(`onBeforeRemove ${event.file.name}`);
        }}
        onBeforeClear={(event) => {
          if (keepList) event.preventDefault();
          push(`onBeforeClear ${event.files.length} files${keepList ? ': refused' : ''}`);
        }}
      />
      <div className="demo-toolbar">
        <Button type="button" variant="outline" onClick={() => api.current?.clear()}>
          Clear with api.clear()
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const files = api.current?.getFiles() ?? [];
            const total = files.reduce((sum, f) => sum + f.size, 0);
            setListed(files.length ? `${files.map((f) => `${f.name} (${size(f.size)}, ${f.status})`).join('; ')}. Total ${size(total)}` : 'No files');
          }}
        >
          List with api.getFiles()
        </Button>
      </div>
      <output>{listed || 'Press List to read the files through the API'}</output>
      <EventLog entries={log} label="FileUpload events" />
    </div>
  );
}
