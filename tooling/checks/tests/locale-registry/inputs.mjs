// Locale families of @salmonui/inputs (see ../locale-coverage.test.mjs).
// The `validation*` keys of every field are the shared `validation` family
// (core.mjs); these are the component-specific keys.
export default {
  textField: { keys: ['clear'] },
  maskedField: { keys: ['clear', 'incomplete'] },
  numberField: { keys: ['increment', 'decrement', 'clear'] },
  otpField: { keys: ['incomplete'] },
  rating: { keys: ['item', 'clear'] },
  slider: { keys: ['start', 'end'] },
  fileUpload: { defaults: [{ module: 'packages/inputs/dist/file-upload/FileUpload.js', export: 'FILE_UPLOAD_DEFAULT_LOCALE_TEXT' }] },
  signaturePad: { keys: ['empty', 'signed', 'typeMode', 'typeLabel', 'clear'] },
  colorPicker: {
    keys: ['trigger', 'dialog', 'area', 'colors', 'recentColors', 'noColor', 'apply', 'cancel', 'current', 'previous', 'clear', 'hex', 'switchToSwatches', 'switchToArea', 'saturation', 'brightness', 'hue', 'alpha', 'colorName', 'hueName'],
  },
  colorArea: { keys: ['saturation', 'brightness', 'colorName'] },
  colorSlider: { keys: ['hue', 'alpha', 'hueName'] },
  colorField: { keys: ['clear'] },
  colorSwatchPicker: { keys: ['noColor', 'colorName'] },
  speechToText: { defaults: [{ module: 'packages/inputs/dist/speech-to-text/SpeechToTextButton.js', export: 'SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT' }] },
  formRenderer: { keys: ['submit'] },
};
