'use client';

import { useState } from 'react';
import { Mention, type MentionDataSource } from '@salmonui/dropdowns/mention';
import { TextField } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

const NAMES = [
  'Aiko Tanaka', 'Amara Okoye', 'Bruno Costa', 'Carmen Ruiz', 'Dmitri Volkov', 'Emma Larsen', 'Farah Haddad', 'Felix Wagner',
  'Grace Kim', 'Hugo Martin', 'Ines Silva', 'Jonas Berg', 'Kofi Mensah', 'Lena Fischer', 'Marco Rossi', 'Nadia Petrova',
  'Omar Farouk', 'Priya Sharma', 'Rosa Ortega', 'Sven Holm', 'Tariq Aziz', 'Uma Patel', 'Vera Novak', 'Yuki Sato',
];

// A remote source with 300 ms of latency. Any @salmonui/data source works the
// same way: Mention sends the search text as `query.search` and
// `maxResults` as `range`, and aborts superseded reads through `signal`.
function createDirectory(push: (entry: string) => void): MentionDataSource<string> {
  return {
    read(request) {
      const text = request.query.search?.text.toLowerCase() ?? '';
      push(`read "${text}"`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const rows = NAMES.filter((name) => name.toLowerCase().includes(text));
          resolve({ version: request.version, rows: rows.slice(request.range?.start ?? 0, request.range?.end), totalRowCount: rows.length });
        }, 300);
        request.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          push(`abort "${text}"`);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    },
  };
}

export default function MentionRemoteDemo() {
  const [log, push] = useEventLog();
  // Created once: a new source per render would restart the search.
  const [directory] = useState(() => createDirectory(push));
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <Mention<string> data={directory} maxResults={8} debounce={200} onInsert={(event) => push(`insert ${JSON.stringify(event.text)}`)}>
        <TextField id="mention-remote-demo" label="Message" placeholder="Type @ and a name" style={{ inlineSize: '100%' }} />
      </Mention>
      <EventLog entries={log} />
    </div>
  );
}
