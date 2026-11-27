---
title: Speech To Text
description: Speech recognition from @salmonui/inputs/speech-to-text, a useSpeechRecognition hook and a SpeechToTextButton toggle over the Web Speech API or a replaceable recognizer.
category: Components
order: 50
demos: [speech-to-text-basics]
---

`useSpeechRecognition()` and `SpeechToTextButton` turn speech into text.
The hook runs a recognition session and exposes its state and
transcript; the button is a `Button` from `@salmonui/buttons/button` that
toggles the session.

```tsx
import { useState } from 'react';
import { SpeechToTextButton } from '@salmonui/inputs/speech-to-text';
import { TextArea } from '@salmonui/inputs/text-field';
import '@salmonui/inputs/speech-to-text/styles.css';
import '@salmonui/inputs/text-field/styles.css';

const [text, setText] = useState('');
<SpeechToTextButton onTranscriptChange={(transcript) => setText(transcript)} />
<TextArea label="Notes" value={text} onValueChange={setText} />
```

<!-- demo: speech-to-text-basics -->

## Browser behavior and privacy

By default the hook uses the browser's Web Speech API (`SpeechRecognition`,
prefixed as `webkitSpeechRecognition` in Chromium and Safari). Recognition
quality, the languages offered, the permission prompt and where audio is
processed are defined by the browser: some browsers send audio to a vendor
service. Salmon code never receives audio, only the text results. Tell your
users which service processes their speech, or pass your own `recognizer`.

`supported` is detected after mount, so server markup is identical in every
browser: it is `false` on the server and during hydration, then the
browser's answer. Without a recognizer `SpeechToTextButton` renders
`disabled` and its description says recognition is not supported.

## Sessions and state

`start()` begins a session with an empty transcript and `stop()` ends it.
`state` is `'idle'` before the first session, `'listening'` until
the recognizer's end event, then `'stopped'`. Results that arrive
after `stop()` still count.

```tsx
const speech = useSpeechRecognition({ onTranscriptChange: (t, { final }) => final && save(t) });
<button onClick={speech.state === 'listening' ? speech.stop : speech.start}>{speech.state}</button>
<output>{speech.transcript}</output>
```

## Transcript and interim results

`transcript` is the final text of the session followed by the interim
(not yet final) text. `interimResults` (default `true`) asks the
recognizer for interim results; `onTranscriptChange(transcript, { final })`
runs on every change and `final` is true once every result is final.
`continuous` (default `true`) keeps listening after a pause.

## Language

`lang` takes a BCP 47 tag, for example `lang="de-DE"`. Without
it, the hook reads `document.documentElement.lang` when a session starts
(never during render); an empty attribute leaves the recognizer default.
The demo above switches it with a language picker.

## Events and errors

`onStart()` runs when the recognizer starts capturing audio, `onStop()`
when the session ends, and `onError({ code, message })` on errors.
`code` is the Web Speech error (`'no-speech'`, `'aborted'`,
`'audio-capture'`, `'network'`, `'not-allowed'`, `'service-not-allowed'`,
`'language-not-supported'`, ...) or `'unsupported'` when `start()` has no
recognizer.

## Custom recognizer

`recognizer` is a factory called once per session. It returns an object
with the Web Speech shape: `lang`, `continuous`, `interimResults`, `start()`,
`stop()`, `abort()` and the `onstart`, `onresult`, `onerror`, `onend`
handlers. Wrap a cloud service (or a test fake) in it.

```tsx
const recognizer = () => createCloudRecognizer({ endpoint: '/api/speech' });
<SpeechToTextButton recognizer={recognizer} />
```

## Button

`SpeechToTextButton` takes the hook options plus `Button` props (`tone`,
`variant`, `size`, `className`, ...) and `localeText`. Without
children it is an icon-only button named by `localeText.label`; with
children they are its label. The name never changes; `aria-pressed` and
`data-state` follow the session, and the hint ("Start listening", "Stop
listening", or the unsupported text) is the button's accessible description
and its native `title`. The [Tooltip](/docs/layout/tooltip) is not built
in: the description and `title` carry the hint, and a `Tooltip` from
`@salmonui/overlays/tooltip` can wrap the button when you want a styled one.

## Keyboard

| Key | Action |
| --- | --- |
| Enter / Space | Starts or stops listening |
| Tab / Shift+Tab | Moves focus |

Screen readers hear "Speech to text, toggle button, not pressed" and the
hint as the description.

The listening state is `state` on the hook's result, next to the
`transcript`; start, stop and error callbacks are hook options. The button
takes `Button` props, and its labels and tooltip text come from
`localeText`. The `recognizer` option replaces the Web Speech API with your
own engine.

## API

`useSpeechRecognition(options)` returns:

| Field | Type |
| --- | --- |
| `state` | `'idle' \| 'listening' \| 'stopped'` |
| `transcript` | `string` |
| `supported` | `boolean` |
| `start`, `stop`, `abort` | `() => void` |

Options (also props of `SpeechToTextButton`):

| Option | Type | Default |
| --- | --- | --- |
| `lang` | `string` (BCP 47) | document language |
| `interimResults` | `boolean` | `true` |
| `continuous` | `boolean` | `true` |
| `recognizer` | `() => SpeechRecognizer` | Web Speech API |
| `onTranscriptChange` | `(transcript, { final }) => void` | |
| `onStart`, `onStop` | `() => void` | |
| `onError` | `({ code, message }) => void` | |

`SpeechToTextButton` props:

| Prop | Type | Default |
| --- | --- | --- |
| `tone`, `variant`, `size` | see [Button](/docs/buttons/button) | `'neutral'`, `'solid'`, `'md'` |
| `children` | `ReactNode` (visible label) | icon only |
| `localeText` | `{ label, start, stop, unsupported }` | English |
| `disabled`, `className`, `style`, `ref` | as `Button` | |

Full signatures: [`@salmonui/inputs/speech-to-text` API reference](/docs/reference/inputs/speech-to-text).
