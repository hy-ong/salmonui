'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Toaster, useToast } from '@salmonui/notifications/toast';

// Tones, an action toast, a progress update and a countdown bar, from a
// queue the Toaster creates and useToast() reaches.
function Controls() {
  const queue = useToast();
  const upload = useRef('');
  const [uploading, setUploading] = useState(false);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button onClick={() => queue.add({ title: 'Saved', description: 'Your changes are stored.', tone: 'success', progress: true })}>
        Success
      </Button>
      <Button onClick={() => queue.add({ title: 'Upload failed', description: 'The file is larger than 10 MB.', tone: 'danger', dismissible: true })}>
        Danger
      </Button>
      <Button
        onClick={() =>
          queue.add({
            title: 'Message archived',
            actions: [{ label: 'Undo', altText: 'Press F6 to reach Undo', onAction: () => queue.add({ title: 'Restored', tone: 'info' }) }],
            dismissible: true,
          })
        }
      >
        With action
      </Button>
      <Button
        onClick={() => {
          if (upload.current) {
            queue.update(upload.current, { title: 'Uploaded', tone: 'success', duration: 4000, progress: true });
            upload.current = '';
            setUploading(false);
          } else {
            upload.current = queue.add({ title: 'Uploading…', duration: Infinity });
            setUploading(true);
          }
        }}
      >
        {uploading ? 'Finish upload' : 'Start upload'}
      </Button>
      <Button variant="ghost" onClick={() => {
          queue.dismiss();
          upload.current = '';
          setUploading(false);
        }}
      >
        Dismiss all
      </Button>
    </div>
  );
}

export default function ToastBasicDemo() {
  return (
    <Toaster>
      <Controls />
    </Toaster>
  );
}
