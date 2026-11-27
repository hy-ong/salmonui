'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { FileUpload } from '@salmonui/inputs/file-upload';
import { Form } from '@salmonui/inputs/form';

// No transport: the files stay in the native input and submit with the form.
export default function FileUploadBasicsDemo() {
  const [sent, setSent] = useState<string[]>([]);
  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        setSent([...new FormData(event.currentTarget).getAll('attachments')].map((v) => (typeof v === 'string' ? v : `${v.name} (${v.size} bytes)`)));
      }}
      style={{ display: 'grid', gap: 12, maxWidth: 360 }}
    >
      <FileUpload
        name="attachments"
        label="Attachments"
        description="PDF or images, up to 2 MB each, at most 3 files"
        multiple
        required
        accept=".pdf,image/*"
        maxSize={2 * 1024 * 1024}
        maxFiles={3}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" tone="primary">
          Send
        </Button>
        <Button type="reset" variant="outline">
          Reset
        </Button>
      </div>
      <output>{sent.length ? `FormData: ${sent.join(', ')}` : 'Nothing sent yet'}</output>
    </Form>
  );
}
