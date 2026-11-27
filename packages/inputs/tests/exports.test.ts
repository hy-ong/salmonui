// @salmonui/inputs export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/inputs', {
  './form': ['Form', 'Field', 'FieldDescription', 'FieldError', 'useFieldContext'],
  './form/state': ['useFormState'],
  './text-field': ['TextField', 'TextArea'],
  './masked-field': ['MaskedField', 'formatMasked', 'parseMask'],
  './number-field': ['NumberField'],
  './file-upload': ['FileUpload', 'formatFileSize'],
  './file-upload/xhr': ['createXhrUploader', 'XhrUploadError'],
  './checkbox': ['Checkbox', 'CheckboxGroup'],
  './radio-group': ['RadioGroup', 'Radio'],
  './switch': ['Switch'],
  './rating': ['Rating'],
  './otp-field': ['OtpField'],
  './slider': ['Slider'],
  './signature-pad': ['SignaturePad'],
  './color-picker': ['ColorPicker', 'ColorArea', 'ColorField', 'ColorSlider', 'ColorSwatch', 'ColorSwatchPicker', 'parseColor'],
  './speech-to-text': ['SpeechToTextButton', 'useSpeechRecognition', 'SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT'],
  './form-renderer': ['FormRenderer'],
});
