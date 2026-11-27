'use client';

import { useId, type MouseEvent, type ReactElement } from 'react';
import { Button, type ButtonBaseProps, type ButtonProps } from '@salmonui/buttons/button';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { UseSpeechRecognitionOptions } from './controller.js';
import { useSpeechRecognition } from './useSpeechRecognition.js';

/** User-visible strings of `SpeechToTextButton`. */
export interface SpeechToTextLocaleText {
  /** Accessible name of an icon-only button. Default `"Speech to text"`. */
  readonly label?: string;
  /** Hint while idle or stopped. Default `"Start listening"`. */
  readonly start?: string;
  /** Hint while listening. Default `"Stop listening"`. */
  readonly stop?: string;
  /** Hint when the browser has no speech recognition. */
  readonly unsupported?: string;
}

export const SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT: Required<SpeechToTextLocaleText> = Object.freeze({
  label: 'Speech to text',
  start: 'Start listening',
  stop: 'Stop listening',
  unsupported: 'Speech recognition is not supported in this browser',
});

type OwnButtonProps = Omit<ButtonBaseProps, 'iconOnly' | 'loading' | 'loadingLabel' | 'spinner' | 'progress' | 'progressLabel' | 'repeat' | 'onRepeat' | 'render' | 'aria-pressed' | 'type' | 'lang' | 'onError'>;

export interface SpeechToTextButtonProps extends OwnButtonProps, UseSpeechRecognitionOptions {
  /** Visible label; without children the button is icon-only, named by `localeText.label`. */
  readonly children?: ButtonBaseProps['children'];
  readonly localeText?: SpeechToTextLocaleText | undefined;
}

const MIC = 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z';
const STOP = 'M7 7h10v10H7z';

// Glyph per control size: half the button height,
// at least 14px (sm 14, md 16, lg 20); the viewBox is cropped to the glyph.
const ICON_SIZE = { inlineSize: 'max(14px, var(--salmon-button-h) / 2)' } as const;

const Icon = ({ d }: { readonly d: string }): ReactElement => (
  <svg width="16" viewBox="2 1.5 20 20" fill="currentColor" focusable="false" style={ICON_SIZE}>
    <path d={d} />
  </svg>
);

/**
 * Toggle button that starts and stops speech recognition: `Button` with `aria-pressed` while listening. The name stays
 * constant; the state hint is the accessible description and the `title`.
 * Disabled (and described as unsupported) when the browser has no speech
 * recognition and no `recognizer` is given.
 */
export function SpeechToTextButton(props: SpeechToTextButtonProps): ReactElement {
  const { lang, interimResults, continuous, recognizer, onTranscriptChange, onStart, onStop, onError, localeText, children, onClick, disabled, className, title, ...rest } = props;
  // The recognition options are the props themselves (the hook reads only its option keys).
  const speech = useSpeechRecognition(props);
  const hydrated = useHydrated();
  const hintId = useId();
  const text = { ...SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT, ...useLocaleText('speechToText', localeText) };
  const listening = speech.state === 'listening';
  const unsupported = hydrated && !speech.supported;
  const hint = unsupported ? text.unsupported : listening ? text.stop : text.start;
  const describedBy = rest['aria-describedby'] ? `${hintId} ${rest['aria-describedby']}` : hintId;
  const icon = <Icon d={listening ? STOP : MIC} />;
  const common = {
    ...(rest as ButtonProps),
    className: className ? `salmon-speech-to-text ${className}` : 'salmon-speech-to-text',
    title: title ?? hint,
    disabled: disabled || unsupported,
    'aria-pressed': listening,
    'aria-describedby': describedBy,
    'data-pressed': listening ? '' : undefined,
    'data-state': speech.state,
    'data-unsupported': unsupported ? '' : undefined,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (listening) speech.stop();
      else speech.start();
    },
  } as const;
  return (
    <>
      {children != null && children !== false ? (
        <Button {...common} iconStart={icon}>
          {children}
        </Button>
      ) : (
        <Button {...common} iconOnly aria-label={rest['aria-label'] ?? text.label}>
          {icon}
        </Button>
      )}
      <span id={hintId} className="salmon-speech-to-text__hint" hidden>
        {hint}
      </span>
    </>
  );
}
