'use client';

import { useState } from 'react';
import { RichTextContent, sanitizeHtml } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { Checkbox } from '@salmonui/inputs/checkbox';

const stored = `<h2>Release notes</h2>
<p>This build adds <strong>block editing</strong>, <em>collaboration</em> and a
<a href="https://example.com/changelog" target="_blank">changelog</a>.</p>
<ul data-type="checklist"><li data-checked="true"><p>Paste cleanup</p></li><li data-checked="false"><p>Version history</p></li></ul>
<blockquote><p>Stored HTML is sanitized on the way in and out.</p></blockquote>
<p onclick="alert('xss')">Unsafe parts are removed: <img src="javascript:alert(1)" onerror="alert(1)" alt=""><a href="javascript:alert(1)">this link</a><script>alert(1)</script></p>`;

export default function RichTextContentDemo() {
  const [showSource, setShowSource] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
      <RichTextContent value={stored} aria-label="Release notes" />
      <Checkbox checked={showSource} onCheckedChange={(checked) => setShowSource(checked)}>
        Show the stored and the sanitized HTML
      </Checkbox>
      {showSource ? (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <pre style={{ overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }} aria-label="Stored HTML">{stored}</pre>
          <pre style={{ overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }} aria-label="Sanitized HTML">{sanitizeHtml(stored)}</pre>
        </div>
      ) : null}
    </div>
  );
}
