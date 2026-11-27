// Type contract of `@salmonui/rich-text` RichTextEditor ( mentions,
// toolbar items actions).
import { useRef } from 'react';
import { RichTextEditor, type RichTextEditorActions, type RichTextEditorProps, type RichTextToolbarItem } from '@salmonui/rich-text';
import type { MentionItem } from '@salmonui/dropdowns/mention';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

interface Person {
  readonly value: string;
  readonly label: string;
  readonly avatar: string;
}
const people: readonly Person[] = [{ value: 'a', label: 'Ann', avatar: '/a.png' }];

// Built-in ids, an extension's toolbar item id, item options and a custom item.
const toolbar: readonly RichTextToolbarItem[] = ['bold', '|', 'signature', { id: 'italic', disabled: true }, { id: 'shout', label: 'Shout', command: 'uppercase' }];

export function Examples() {
  const actions = useRef<RichTextEditorActions | null>(null);
  return (
    <>
      <RichTextEditor
        toolbar={toolbar}
        actionsRef={actions}
        mentions={{
          items: people,
          renderItem: (context) => {
            expectType<Equal<typeof context.item, Person>>(true);
            return context.item.avatar;
          },
        }}
        onChange={(html) => expectType<Equal<typeof html, string>>(true)}
      />
      <RichTextEditor
        mentions={{
          onSearch: async (text) => people.filter((p) => p.label.includes(text)),
          renderItem: (context) => {
            expectType<Equal<typeof context.item, Person>>(true);
            return context.label;
          },
        }}
      />
    </>
  );
}

// The default mention item type.
expectType<Equal<NonNullable<NonNullable<RichTextEditorProps['mentions']>['items']>, readonly MentionItem[]>>(true);
// @ts-expect-error renderItem's item is the typed Person, not a string.
export const wrong = <RichTextEditor mentions={{ items: people, renderItem: (context: { item: string }) => context.item }} />;
