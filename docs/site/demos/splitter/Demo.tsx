'use client';
import { useState } from 'react';
import { Splitter, type SplitterSize } from '@salmonui/layout/splitter';

export default function SplitterDemo() {
  const [sizes, setSizes] = useState<Record<string, SplitterSize>>({ nav: 180 });
  return (
    <div>
      <Splitter sizes={sizes} onSizesChange={setSizes} style={{ height: 260, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}>
        <Splitter.Pane id="nav" minSize={120} maxSize="50%" collapsible collapsedSize={32}>
          <div className="demo-pane">Folders</div>
        </Splitter.Pane>
        <Splitter.Pane id="main">
          <Splitter orientation="vertical" defaultSizes={{ list: '55%' }}>
            <Splitter.Pane id="list" minSize="20%">
              <div className="demo-pane">Messages</div>
            </Splitter.Pane>
            <Splitter.Pane id="preview">
              <div className="demo-pane">Preview</div>
            </Splitter.Pane>
          </Splitter>
        </Splitter.Pane>
      </Splitter>
      <p>
        <output>Folders: {String(sizes['nav'])}</output>
      </p>
    </div>
  );
}
