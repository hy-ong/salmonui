// Speech recognition session logic, free of React so it is unit-tested with a fake recognizer. The
// hook in useSpeechRecognition.ts owns one controller per component.

/** `'idle'` before the first session, `'listening'` while a session runs, `'stopped'` after it ends. */
export type SpeechRecognitionState = 'idle' | 'listening' | 'stopped';

/** A Web Speech `SpeechRecognitionErrorEvent.error` code, or `'unsupported'`. */
export type SpeechRecognitionErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'unsupported'
  | (string & {});

export interface SpeechRecognitionError {
  readonly code: SpeechRecognitionErrorCode;
  readonly message: string;
}

/** Second argument of `onTranscriptChange`: `final` is true when every result of the session is final. */
export interface SpeechTranscriptDetails {
  readonly final: boolean;
}

/** One alternative of a result (Web Speech `SpeechRecognitionAlternative`). */
export interface SpeechRecognizerAlternative {
  readonly transcript: string;
}

/** One result (Web Speech `SpeechRecognitionResult`): alternatives, best first. */
export interface SpeechRecognizerResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognizerAlternative;
}

/** `result` event (Web Speech `SpeechRecognitionEvent`): every result of the session so far. */
export interface SpeechRecognizerResultEvent {
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognizerResult };
}

/**
 * The subset of the Web Speech `SpeechRecognition` interface the hook uses. A cloud recognizer implements it; one instance per session.
 */
export interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((event: unknown) => void) | null;
  onresult: ((event: SpeechRecognizerResultEvent) => void) | null;
  onerror: ((event: { readonly error: string; readonly message?: string }) => void) | null;
  onend: ((event: unknown) => void) | null;
}

export interface UseSpeechRecognitionOptions {
  /** BCP 47 recognition language. Default: `document.documentElement.lang`, read when a session starts. */
  readonly lang?: string | undefined;
  /** Deliver interim (non-final) results. Default `true`. */
  readonly interimResults?: boolean | undefined;
  /** Keep listening after a pause until `stop()`. Default `true`. */
  readonly continuous?: boolean | undefined;
  /** Replaces the browser recognizer, e.g. a cloud service. Called once per session. */
  readonly recognizer?: (() => SpeechRecognizer) | undefined;
  /** The session transcript changed. */
  readonly onTranscriptChange?: ((transcript: string, details: SpeechTranscriptDetails) => void) | undefined;
  /** The recognizer started capturing audio. */
  readonly onStart?: (() => void) | undefined;
  /** The session ended (`stop()`, `abort()`, an error or the recognizer). */
  readonly onStop?: (() => void) | undefined;
  /** A recognizer error, or `'unsupported'` when `start()` has no recognizer. */
  readonly onError?: ((error: SpeechRecognitionError) => void) | undefined;
}

export interface SpeechControllerHost {
  /** The latest options (read inside events, never during render). */
  options(): UseSpeechRecognitionOptions;
  /** State or transcript changed. */
  update(state: SpeechRecognitionState, transcript: string): void;
}

export interface SpeechController {
  start(): void;
  stop(): void;
  abort(): void;
  /** Aborts a running session without callbacks (unmount). */
  dispose(): void;
}

type RecognizerConstructor = new () => SpeechRecognizer;

/** The browser's `SpeechRecognition` constructor (prefixed in Chromium and Safari), or null. */
export function browserRecognizer(): RecognizerConstructor | null {
  const g = globalThis as { SpeechRecognition?: RecognizerConstructor; webkitSpeechRecognition?: RecognizerConstructor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

const documentLang = (): string => (typeof document === 'undefined' ? '' : document.documentElement.lang);

/** Transcript of every result so far (best alternative) and whether all are final. */
export function readTranscript(event: SpeechRecognizerResultEvent): { readonly transcript: string; readonly final: boolean } {
  let transcript = '';
  let final = true;
  const { results } = event;
  for (let i = 0; i < results.length; i++) {
    const result = results[i] as SpeechRecognizerResult;
    transcript += result[0]?.transcript ?? '';
    if (!result.isFinal) final = false;
  }
  return { transcript, final };
}

export function createSpeechController(host: SpeechControllerHost): SpeechController {
  let active: SpeechRecognizer | null = null;
  let state: SpeechRecognitionState = 'idle';
  let transcript = '';
  const set = (next: SpeechRecognitionState, text: string): void => {
    if (next === state && text === transcript) return;
    state = next;
    transcript = text;
    host.update(state, transcript);
  };
  const detach = (r: SpeechRecognizer): void => {
    r.onstart = r.onresult = r.onerror = r.onend = null;
  };

  const start = (): void => {
    if (active) return;
    const o = host.options();
    const Ctor = o.recognizer ? null : browserRecognizer();
    if (!o.recognizer && !Ctor) {
      o.onError?.({ code: 'unsupported', message: 'Speech recognition is not supported in this browser.' });
      return;
    }
    let r: SpeechRecognizer;
    try {
      r = o.recognizer ? o.recognizer() : new (Ctor as RecognizerConstructor)();
    } catch (error) {
      o.onError?.({ code: 'unsupported', message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const lang = o.lang ?? documentLang();
    if (lang) r.lang = lang;
    r.continuous = o.continuous ?? true;
    r.interimResults = o.interimResults ?? true;
    r.onstart = () => host.options().onStart?.();
    r.onresult = (event) => {
      if (active !== r) return;
      const next = readTranscript(event);
      if (next.transcript === transcript) return;
      set(state, next.transcript);
      host.options().onTranscriptChange?.(next.transcript, Object.freeze({ final: next.final }));
    };
    r.onerror = (event) => host.options().onError?.(Object.freeze({ code: event.error, message: event.message ?? '' }));
    r.onend = () => {
      if (active !== r) return;
      detach(r);
      active = null;
      set('stopped', transcript);
      host.options().onStop?.();
    };
    active = r;
    set('listening', '');
    try {
      r.start();
    } catch (error) {
      // InvalidStateError and similar: report and end the session.
      detach(r);
      active = null;
      set('stopped', transcript);
      host.options().onError?.({ code: 'aborted', message: error instanceof Error ? error.message : String(error) });
    }
  };

  // The recognizer delivers the last results before `end`, so the session ends there.
  const stop = (): void => active?.stop();
  const abort = (): void => active?.abort();
  const dispose = (): void => {
    const r = active;
    if (!r) return;
    detach(r);
    active = null;
    r.abort();
  };
  return { start, stop, abort, dispose };
}
