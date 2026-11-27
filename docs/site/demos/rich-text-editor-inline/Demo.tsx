'use client';

import { RichTextEditor, type RichTextEmoji } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const initial =
  '<h3>Team update</h3>' +
  '<p>This editor has no fixed toolbar: <strong><em>select any text</em></strong> and the toolbar appears over the selection.</p>' +
  '<p>Read the <a href="https://example.com/changelog" target="_blank" rel="noopener noreferrer">changelog</a> for details. Plain text here waits for the format painter.</p>' +
  '<p>Type a colon and a word, like :rocket or :tada, for emoji.</p>';

// A short emoji list replaces the built-in lazy one (emojiList).
const EMOJI: readonly RichTextEmoji[] = [
  { emoji: '🚀', name: 'rocket', keywords: ['launch', 'ship'] },
  { emoji: '🎉', name: 'tada', keywords: ['party', 'celebrate'] },
  { emoji: '✅', name: 'check', keywords: ['done', 'yes'] },
  { emoji: '⚠️', name: 'warning', keywords: ['risk', 'careful'] },
  { emoji: '👀', name: 'eyes', keywords: ['look', 'review'] },
  { emoji: '🐟', name: 'fish', keywords: ['salmon'] },
];

export default function RichTextEditorInlineDemo() {
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <RichTextEditor
        aria-label="Team update"
        defaultValue={initial}
        toolbar="floating"
        quickToolbars={{
          text: ['bold', 'italic', 'underline', 'fontColor', '|', 'link', 'formatPainter', 'emoji', 'clearFormat'],
          link: ['openLink', 'editLink', 'removeLink'],
        }}
        emojiList={EMOJI}
        placeholder="Write an update"
        onBeforePopupOpen={(event) => push(`onBeforePopupOpen: ${event.popup}`)}
        onCommand={(event) => push(`onCommand: ${event.command}${event.args.length ? ` ${JSON.stringify(event.args)}` : ''}`)}
        onDialogClose={(event) => push(`onDialogClose: ${event.dialog}`)}
        style={{ minBlockSize: 220 }}
      />
      <EventLog entries={log} />
    </div>
  );
}
