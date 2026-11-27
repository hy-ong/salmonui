'use client';

import { useRef, useState } from 'react';
import { RichTextEditor, type RichTextEditorActions, type SanitizeHook } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

// Clipboard HTML as Word and Google Docs put it on the clipboard (shortened).
const SAMPLES = {
  word:
    '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->' +
    '<p class="MsoNormal"><b><span style="font-size:14.0pt;font-family:Calibri;color:#1F3864;mso-bidi-font-weight:normal">Quarterly plan</span></b><o:p></o:p></p>' +
    '<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span style="font:7.0pt Times">&nbsp;</span></span>Hire two engineers<o:p></o:p></p>' +
    '<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.<span style="font:7.0pt Times">&nbsp;</span></span>Ship the <i>editor</i> <span style="background:yellow;mso-highlight:yellow">beta</span><o:p></o:p></p>' +
    '<!--EndFragment--></body></html>',
  googleDocs:
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c"><p dir="ltr"><span style="font-weight:700;color:#cc0000;">Launch checklist</span></p>' +
    '<ul><li dir="ltr"><p dir="ltr"><span style="font-style:italic;">Write the post</span></p></li><li dir="ltr"><p dir="ltr"><span style="text-decoration:underline;">Review</span> with <a href="https://example.com/team">the team</a></p></li></ul></b>',
  unsafe:
    '<p onclick="alert(1)">Click <a href="javascript:alert(1)">here</a> or <a href="https://example.com" target="_blank">there</a>.</p>' +
    '<img src="javascript:alert(1)" onerror="alert(1)"><script>alert(1)</script><iframe src="https://evil.example"></iframe><p style="color:red;background:url(x)">Styled text</p>',
} as const;

const INITIAL = '<p>Paste below this line.</p><p></p>';

type Mode = 'clean' | 'keep' | 'plainText' | 'prompt';
const MODES = (['clean', 'keep', 'plainText', 'prompt'] as const).map((value) => ({ value, label: value }));

/** Restriction-only hook: links never open a new window. */
const noNewWindows: SanitizeHook = (element) => (element.tag === 'a' && element.attrs['href'] ? { attrs: { href: element.attrs['href'] } } : undefined);

function pasteHtml(actions: RichTextEditorActions | null, html: string): boolean {
  const target = actions?.engine.view?.dom;
  if (!actions || !target) return false;
  // Paste at the end of the document, like a user who clicks below the text.
  const end = actions.engine.state.doc.content.size - 1;
  actions.setSelection(end);
  actions.focus();
  const data = new DataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  // Some engines ignore clipboardData in the constructor.
  if (!event.clipboardData) Object.defineProperty(event, 'clipboardData', { value: data });
  target.dispatchEvent(event);
  return true;
}

export default function RichTextPasteDemo() {
  const [log, push] = useEventLog();
  const [mode, setMode] = useState<Mode>('clean');
  const [keepWord, setKeepWord] = useState(false);
  const [noLinks, setNoLinks] = useState(false);
  const [hook, setHook] = useState(false);
  const [html, setHtml] = useState(INITIAL);
  const actions = useRef<RichTextEditorActions | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <fieldset style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', border: 0, margin: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, padding: 0 }}>pasteCleanup</legend>
        <label>
          mode{' '}
          <Select aria-label="mode" data={MODES} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <Checkbox checked={keepWord} onCheckedChange={(checked) => setKeepWord(checked)}>
          keepWordFormatting
        </Checkbox>
        <Checkbox checked={noLinks} onCheckedChange={(checked) => setNoLinks(checked)}>
          deniedTags: [&apos;a&apos;]
        </Checkbox>
        <Checkbox checked={hook} onCheckedChange={(checked) => setHook(checked)}>
          sanitize hook: no new windows
        </Checkbox>
      </fieldset>
      <div role="group" aria-label="Paste a sample" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            ['word', 'Paste a Word sample'],
            ['googleDocs', 'Paste a Google Docs sample'],
            ['unsafe', 'Paste unsafe HTML'],
          ] as const
        ).map(([key, label]) => (
          <Button variant="outline" key={key} type="button" onClick={() => push(pasteHtml(actions.current, SAMPLES[key]) ? `pasted the ${key} sample (${mode})` : 'the editor is still loading')}>
            {label}
          </Button>
        ))}
      </div>
      <RichTextEditor
        aria-label="Paste target"
        defaultValue={INITIAL}
        actionsRef={actions}
        onChange={setHtml}
        toolbar={['undo', 'redo', '|', 'bold', 'italic', 'underline', 'fontColor', '|', 'orderedList', 'unorderedList', 'link', 'sourceCode']}
        pasteCleanup={{ mode, keepWordFormatting: keepWord, ...(noLinks ? { deniedTags: ['a'] } : {}) }}
        {...(hook ? { sanitize: noNewWindows } : {})}
        style={{ minBlockSize: 220 }}
      />
      <details open>
        <summary>Editor HTML (after cleanup and sanitizing)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{html}</pre>
      </details>
      <EventLog entries={log} />
    </div>
  );
}
