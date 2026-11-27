'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { FileUpload, type FileRenderContext, type FileUploadLocaleText } from '@salmonui/inputs/file-upload';
import { Select } from '@salmonui/dropdowns/select';

type DropEffect = 'copy' | 'move' | 'link' | 'none';

const DROP_EFFECTS = [
  { value: 'copy', label: 'copy' },
  { value: 'move', label: 'move' },
  { value: 'link', label: 'link' },
  { value: 'none', label: 'none (refuse drops)' },
];

// Every status and error text renamed; `{0}` is the limit.
const TEXT: FileUploadLocaleText = {
  browse: 'Choose files or drop them here',
  clearAll: 'Remove all',
  removeFile: 'Delete {0}',
  uploaded: 'Saved',
  queued: 'Added',
  type: 'Only PDF files and images',
  tooLarge: 'Too big: the limit is {0}',
};

const PRELOADED = [
  { name: 'contract.pdf', size: 182_340, type: 'application/pdf' },
  { name: 'site-photo.jpg', size: 734_002, type: 'image/jpeg' },
];

// A custom row: name or folder path, size, status and a named Remove button.
function row({ file, status, statusText, sizeText, remove }: FileRenderContext) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', inlineSize: '100%' }}>
      <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 700, padding: '2px 4px', border: '1px solid currentColor', borderRadius: 'var(--salmon-radius-sm)' }}>
        {file.type.startsWith('image/') ? 'IMG' : file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'FILE'}
      </span>
      <span style={{ flex: 1, minInlineSize: 0, overflowWrap: 'anywhere' }}>
        <strong>{file.path}</strong>
        <br />
        <small>
          {sizeText} · <span data-status={status} style={status === 'invalid' || status === 'error' ? { color: 'var(--salmon-color-danger-text)' } : undefined}>
            {statusText}
          </span>
        </small>
      </span>
      <Button type="button" variant="outline" onClick={remove} aria-label={`Delete ${file.name}`}>
        Delete
      </Button>
    </div>
  );
}

export default function FileUploadCustomDemo() {
  const [directory, setDirectory] = useState(false);
  const [dropEffect, setDropEffect] = useState<DropEffect>('copy');
  const [showFileList, setShowFileList] = useState(true);
  const [count, setCount] = useState(PRELOADED.length);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 440 }}>
      <div className="demo-toolbar">
        <Checkbox checked={directory} onCheckedChange={(checked) => setDirectory(checked)}>
          Pick folders
        </Checkbox>
        <Checkbox checked={showFileList} onCheckedChange={(checked) => setShowFileList(checked)}>
          Show the file list
        </Checkbox>
        <label>
          Drop effect
          <Select aria-label="Drop effect" data={DROP_EFFECTS} value={dropEffect} onValueChange={(value) => value != null && setDropEffect(value as DropEffect)} />
        </label>
      </div>
      <FileUpload
        label="Project files"
        description="PDF files and images up to 1 MB"
        multiple
        accept=".pdf,image/*"
        maxSize={1024 * 1024}
        directory={directory}
        dropEffect={dropEffect}
        showFileList={showFileList}
        defaultFiles={PRELOADED}
        onFilesChange={(files) => setCount(files.length)}
        localeText={TEXT}
        renderFile={row}
        renderTrigger={({ text }) => (
          <>
            <span aria-hidden="true" style={{ fontSize: 24 }}>
              ⇪
            </span>
            <br />
            {text}
          </>
        )}
      />
      <output>{count} files in the list</output>
    </div>
  );
}
