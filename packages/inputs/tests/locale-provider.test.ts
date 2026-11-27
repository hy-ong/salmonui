import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatchPicker } from '@salmonui/inputs/color-picker';
import { FileUpload } from '@salmonui/inputs/file-upload';
import { FormRenderer } from '@salmonui/inputs/form-renderer';
import { MaskedField } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { Rating } from '@salmonui/inputs/rating';
import { SignaturePad } from '@salmonui/inputs/signature-pad';
import { Slider } from '@salmonui/inputs/slider';
import { SpeechToTextButton } from '@salmonui/inputs/speech-to-text';
import { TextArea, TextField } from '@salmonui/inputs/text-field';

// Every inputs family reads the nearest LocaleProvider: the zh-TW pack reaches the markup, and a component's own
// `localeText` still wins over the provider. Errors (the `validation`,
// `incomplete` text) render only after a blur or submit, so the shared
// `validation` family is checked through the hook the fields call.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('inputs families under LocaleProvider', () => {
  it('validation: the shared family under the own validation keys', () => {
    let seen: Record<string, string> | undefined;
    const Probe = (props: { readonly own?: Record<string, string> }) => {
      seen = useLocaleText('validation', props.own);
      return null;
    };
    zh(h(Probe));
    assert.equal(seen?.['validationRequired'], '此欄位為必填。');
    assert.equal(seen?.['validationEmail'], '請輸入有效的電子郵件地址。');
    zh(h(Probe, { own: { validationRequired: 'Needed' } }));
    assert.equal(seen?.['validationRequired'], 'Needed');
    assert.equal(seen?.['validationMin'], '請輸入大於或等於 {0} 的值。');
  });

  it('textField and textArea', () => {
    assert.match(zh(h(TextField, { label: 'T', clearable: true, defaultValue: 'x' })), /aria-label="清除"/);
    assert.match(zh(h(TextArea, { label: 'T', clearable: true, defaultValue: 'x' })), /aria-label="清除"/);
    assert.match(zh(h(TextField, { label: 'T', clearable: true, defaultValue: 'x', localeText: { clear: 'Wipe' } })), /aria-label="Wipe"/);
  });

  it('maskedField', () => {
    assert.match(zh(h(MaskedField, { label: 'M', mask: '000', clearable: true, defaultValue: '12' })), /aria-label="清除"/);
    assert.match(zh(h(MaskedField, { label: 'M', mask: '000', clearable: true, defaultValue: '12', localeText: { clear: 'Wipe' } })), /aria-label="Wipe"/);
  });

  it('numberField: text and the provider locale', () => {
    const html = zh(h(NumberField, { label: 'N', defaultValue: 1234.5 }));
    assert.match(html, /aria-label="增加"/);
    assert.match(html, /aria-label="減少"/);
    assert.match(zh(h(NumberField, { label: 'N', localeText: { increment: 'Up' } })), /aria-label="Up"/);
    // de-DE groups with a dot: the provider's locale formats, the own locale wins.
    const de = (props: Record<string, unknown>) => renderToString(h(LocaleProvider, { locale: 'de-DE' }, h(NumberField, { label: 'N', defaultValue: 1234.5, ...props })));
    assert.match(de({}), /value="1\.234,5"/);
    assert.match(de({ locale: 'en-US' }), /value="1,234\.5"/);
  });

  it('rating', () => {
    assert.match(zh(h(Rating, { label: 'R', count: 3 })), /aria-label="1 顆星，共 3 顆"/);
    assert.match(zh(h(Rating, { label: 'R', count: 3, localeText: { item: '{0}/{1}' } })), /aria-label="1\/3"/);
  });

  it('slider', () => {
    const html = zh(h(Slider, { label: 'S', defaultValue: [10, 20] }));
    assert.match(html, /最小值/);
    assert.match(html, /最大值/);
    assert.match(zh(h(Slider, { label: 'S', defaultValue: [10, 20], localeText: { start: 'From' } })), /From/);
  });

  it('fileUpload', () => {
    assert.match(zh(h(FileUpload, { label: 'F' })), /瀏覽或拖放檔案/);
    assert.match(zh(h(FileUpload, { label: 'F', localeText: { browse: 'Pick' } })), /Pick/);
  });

  it('signaturePad', () => {
    assert.match(zh(h(SignaturePad, { label: 'S' })), /簽名，空白/);
    assert.match(zh(h(SignaturePad, { label: 'S', localeText: { empty: 'Blank' } })), /Blank/);
  });

  it('colorPicker and its parts', () => {
    const picker = zh(h(ColorPicker, { label: 'C', inline: true, defaultValue: '#ff0000' }));
    assert.match(picker, /飽和度與亮度/);
    assert.match(picker, /色相/);
    assert.match(zh(h(ColorPicker, { label: 'C', inline: true, localeText: { area: 'Plane' } })), /Plane/);
    assert.match(zh(h(ColorArea, { defaultValue: '#ff0000' })), /飽和度/);
    assert.match(zh(h(ColorSlider, { channel: 'hue', defaultValue: '#ff0000' })), /色相/);
    assert.match(zh(h(ColorSlider, { channel: 'hue', defaultValue: '#ff0000', localeText: { hue: 'Tint' } })), /Tint/);
    // Hue names in aria-valuetext: the pack's, the picker's own sliders too.
    assert.match(zh(h(ColorSlider, { channel: 'hue', defaultValue: '#00ff00' })), /aria-valuetext="120°, 綠色"/);
    assert.doesNotMatch(picker, /°, red/);
    assert.match(renderToString(h(ColorSlider, { channel: 'hue', defaultValue: '#00ff00' })), /aria-valuetext="120°, green"/);
    assert.match(zh(h(ColorField, { label: 'C', clearable: true, defaultValue: '#ff0000' })), /aria-label="清除"/);
    // The pack's color names replace the English description.
    const swatches = zh(h(ColorSwatchPicker, { 'aria-label': 'S', colors: ['#ff0000'], clearable: true }));
    assert.match(swatches, /鮮紅色/);
    assert.match(swatches, /無色彩/);
    assert.match(zh(h(ColorSwatchPicker, { 'aria-label': 'S', colors: ['#ff0000'], clearable: true, localeText: { noColor: 'None' } })), /None/);
  });

  it('speechToText', () => {
    assert.match(zh(h(SpeechToTextButton)), /aria-label="語音轉文字"/);
    assert.match(zh(h(SpeechToTextButton, { localeText: { label: 'Dictate' } })), /aria-label="Dictate"/);
  });

  it('formRenderer', () => {
    const schema = { type: 'object', properties: { name: { type: 'string', title: 'Name' } } } as const;
    assert.match(zh(h(FormRenderer, { schema })), /送出/);
    assert.match(zh(h(FormRenderer, { schema, localeText: { submit: 'Go' } })), />Go</);
  });
});
