'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useClientValue } from '@salmonui/core/internal/hydrated';
import { browserRecognizer, createSpeechController, type SpeechRecognitionState, type UseSpeechRecognitionOptions } from './controller.js';

export interface SpeechRecognitionApi {
  /** `'idle'`, `'listening'` or `'stopped'`. */
  readonly state: SpeechRecognitionState;
  /** Text of the current session: final results, then interim ones. */
  readonly transcript: string;
  /** False on the server, during hydration and in browsers without the Web Speech API; true with a `recognizer`. */
  readonly supported: boolean;
  /** Starts a new session with an empty transcript. Without a recognizer it calls `onError({ code: 'unsupported' })`. */
  readonly start: () => void;
  /** Stops listening; the last results still arrive, then the session ends. */
  readonly stop: () => void;
  /** Ends the session without further results. */
  readonly abort: () => void;
}

interface Snapshot {
  readonly state: SpeechRecognitionState;
  readonly transcript: string;
}

const IDLE: Snapshot = { state: 'idle', transcript: '' };
const detect = (): boolean => browserRecognizer() !== null;

/**
 * Speech recognition over the
 * Web Speech API or a replaceable `recognizer`. Options are read when
 * events happen, so callbacks may be inline functions.
 */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}): SpeechRecognitionApi {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [snapshot, setSnapshot] = useState<Snapshot>(IDLE);
  const [controller] = useState(() =>
    createSpeechController({
      options: () => latest.current,
      update: (state, transcript) => setSnapshot({ state, transcript }),
    }),
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const detected = useClientValue(detect);
  const supported = options.recognizer !== undefined || detected === true;
  return useMemo(() => ({ ...snapshot, supported, start: controller.start, stop: controller.stop, abort: controller.abort }), [snapshot, supported, controller]);
}
