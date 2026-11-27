'use client';

import { useState } from 'react';
import { InlineEdit } from '@salmonui/editors/inline-edit';
import { RichTextContent, RichTextEditor } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';

const initial = '<p>The <strong>v1</strong> release ships every editor:</p><ul><li><p>InlineEdit</p></li><li><p>RichTextEditor</p></li></ul>';

export default function InlineEditRichTextDemo() {
  const [html, setHtml] = useState(initial);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
      <strong id="inline-rte-label">Description</strong>
      <InlineEdit<string>
        label="Description"
        mode="inline"
        value={html}
        save={setHtml}
        saveOnEnter={false}
        blurAction="keep"
        renderPreview={({ value }) => <RichTextContent value={value} />}
      >
        {({ value, setValue }) => (
          <RichTextEditor
            aria-labelledby="inline-rte-label"
            defaultValue={value}
            onChange={setValue}
            toolbar={['bold', 'italic', 'underline', '|', 'unorderedList', 'orderedList', '|', 'link', 'undo', 'redo']}
            style={{ minBlockSize: 160 }}
          />
        )}
      </InlineEdit>
      <details>
        <summary>Saved HTML</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{html}</pre>
      </details>
    </div>
  );
}
