// Type contract of `@salmonui/chat/inline-assist`: the adapter return type decides streaming, anchors, events and
// the compound Dictation part.
import { createRef } from 'react';
import {
  InlineAssist,
  InlineAssistDictation,
  type InlineAssistAdapter,
  type InlineAssistApi,
  type InlineAssistMessage,
  type InlineAssistOpenChangeReason,
  type InlineAssistRequest,
} from '@salmonui/chat/inline-assist';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

const once: InlineAssistAdapter = async (request) => request.prompt;
const stream: InlineAssistAdapter = async function* (request, { signal }) {
  expectType<Equal<typeof request, InlineAssistRequest>>(true);
  expectType<Equal<typeof signal, AbortSignal>>(true);
  yield 'text';
  yield { type: 'text', delta: 'more' };
};
// @ts-expect-error: an adapter returns text, not a number.
const wrong: InlineAssistAdapter = async () => 1;

const api = createRef<InlineAssistApi>();
const editor = createRef<HTMLTextAreaElement>();

export const examples = [
  <InlineAssist
    key="1"
    ref={api}
    anchor={editor}
    adapter={once}
    onOpenChange={(open, event) => {
      expectType<Equal<typeof open, boolean>>(true);
      expectType<Equal<typeof event.reason, InlineAssistOpenChangeReason>>(true);
    }}
    onMessagesChange={(messages) => expectType<Equal<typeof messages, readonly InlineAssistMessage[]>>(true)}
    responseActions={['accept', { id: 'shorter', label: 'Shorter' }]}
    onResponseActionClick={(event) => event.preventDefault()}
    onAccept={({ text }) => expectType<Equal<typeof text, string>>(true)}
    renderContent={(text, { streaming }) => (streaming ? text : <b>{text}</b>)}
  >
    <InlineAssist.Dictation lang="en-US" />
  </InlineAssist>,
  <InlineAssist key="2" anchor={{ x: 10, y: 20 }} mode="inline" adapter={stream} toolbarPlacement="bottom" />,
  // @ts-expect-error: mode is 'popover' or 'inline'.
  <InlineAssist key="3" mode="sheet" />,
  <InlineAssistDictation key="4" />,
];

void wrong;
