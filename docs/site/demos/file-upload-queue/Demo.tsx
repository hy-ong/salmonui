'use client';

import { useRef, useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { FileUpload, type FileUploadApi, type UploadTransport } from '@salmonui/inputs/file-upload';

// A simulated transport: progress over about two seconds, every third file fails.
let count = 0;
const simulated: UploadTransport = (file, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    const fail = ++count % 3 === 0;
    let loaded = 0;
    const timer = setInterval(() => {
      loaded = Math.min(file.size, loaded + Math.max(1, file.size / 20));
      onProgress(loaded, file.size);
      if (loaded < file.size) return;
      clearInterval(timer);
      if (fail) reject(new Error('Simulated server error'));
      else resolve({ id: `${file.name}-${Date.now()}` });
    }, 100);
    signal.addEventListener('abort', () => {
      clearInterval(timer);
      reject(signal.reason);
    });
  });

export default function FileUploadQueueDemo() {
  const api = useRef<FileUploadApi>(null);
  const [auto, setAuto] = useState(true);
  const [done, setDone] = useState('');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
      <Checkbox checked={auto} onCheckedChange={(checked) => setAuto(checked)}>
        Upload as soon as files are added
      </Checkbox>
      <FileUpload
        ref={api}
        label="Photos"
        multiple
        accept="image/*,.pdf"
        upload={simulated}
        autoUpload={auto}
        concurrency={2}
        defaultFiles={[{ name: 'team-offsite.jpg', size: 1_248_213, type: 'image/jpeg' }]}
        onUploadComplete={(files) => setDone(`${files.filter((f) => f.status === 'uploaded').length} of ${files.length} uploaded`)}
      />
      <output>{done || 'Add photos to start the queue'}</output>
    </div>
  );
}
