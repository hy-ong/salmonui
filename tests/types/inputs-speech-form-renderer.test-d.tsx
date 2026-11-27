// Type contract of @salmonui/react/speech-to-text and @salmonui/react/form-renderer.
// Compiles against dist/*.d.ts.
import { SpeechToTextButton, useSpeechRecognition, type SpeechRecognitionApi, type SpeechRecognitionState, type SpeechRecognizer } from '@salmonui/inputs/speech-to-text';
import { FormRenderer, type FormRendererData, type FormRendererSubmitDetails, type FormSchema, type FormUiSchema } from '@salmonui/inputs/form-renderer';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;
expectType<Equal<SpeechRecognitionState, 'idle' | 'listening' | 'stopped'>>(true);

declare const fake: () => SpeechRecognizer;
export function Probe(): string {
  const speech: SpeechRecognitionApi = useSpeechRecognition({ lang: 'en-US', interimResults: false, recognizer: fake, onTranscriptChange: (t: string, d: { final: boolean }) => void [t, d.final], onError: (e) => void e.code });
  speech.start();
  return speech.transcript;
}

export const button = <SpeechToTextButton tone="primary" variant="outline" size="sm" localeText={{ label: 'Dictate' }} onStop={() => undefined} />;
// @ts-expect-error the button's pressed state follows the recognizer (no repeat / loading modes either)
export const repeat = <SpeechToTextButton repeat />;

const schema = { type: 'object', required: ['a'], properties: { a: { type: 'string', minLength: 1 }, b: { type: 'integer' }, c: { type: 'boolean', const: true }, d: { type: 'string', enum: ['x', 'y'] } } } satisfies FormSchema;
const ui: FormUiSchema = { layout: [['a', 'b'], 'c'], fields: { d: { widget: 'radio', enumLabels: ['X', 'Y'] } }, submit: { label: 'Go', tone: 'primary' } };
export const form = <FormRenderer schema={schema} uiSchema={ui} onSubmit={(data: FormRendererData, d: FormRendererSubmitDetails) => void [data['a'], d.isValid, d.errors]} validationBehavior="aria" />;
// @ts-expect-error arrays are not in the schema subset
export const bad = <FormRenderer schema={{ type: 'object', properties: { a: { type: 'array' } } }} />;
