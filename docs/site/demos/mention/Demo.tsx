'use client';

import { Mention, type MentionTrigger } from '@salmonui/dropdowns/mention';
import { TextArea } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Person {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

const people: readonly Person[] = [
  { value: 'ana', label: 'Ana Lima' },
  { value: 'ben', label: 'Ben Okafor' },
  { value: 'chen', label: 'Chen Wei' },
  { value: 'dara', label: 'Dara Nguyen', disabled: true },
  { value: 'elif', label: 'Elif Şahin' },
  { value: 'jose', label: 'José García' },
  { value: 'mira', label: 'Mira Kovač' },
];

const tags: readonly Person[] = [
  { value: 'bug', label: 'bug' },
  { value: 'docs', label: 'docs' },
  { value: 'performance', label: 'performance' },
  { value: 'question', label: 'question' },
];

// `@` inserts the name and a space; `#` keeps the hash and adds a space.
const triggers: readonly MentionTrigger<Person>[] = [
  { char: '@', data: people, suffix: ' ' },
  { char: '#', data: tags, keepChar: true, suffix: ' ' },
];

export default function MentionDemo() {
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <Mention<Person>
        triggers={triggers}
        ignoreAccents
        highlightMatches
        onInsert={(event) => push(`insert (${event.source}): ${JSON.stringify(event.text)} for ${event.trigger}${event.item.value}`)}
        onOpenChange={(open, event) => push(`${open ? 'open' : 'close'}: ${event.reason}`)}
      >
        <TextArea label="Comment" rows={5} resize="vertical" placeholder="Type @ to mention someone or # for a tag" style={{ inlineSize: '100%' }} />
      </Mention>
      <EventLog entries={log} />
    </div>
  );
}
