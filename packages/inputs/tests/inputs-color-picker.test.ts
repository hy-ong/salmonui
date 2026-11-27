// Color math and server markup of @salmonui/inputs/color-picker:
// conversions, parsing and
// serialization round-trips, and the behaviors that unit
// or SSR tests can check, asserted on renderToString output. Interaction tests live in
// tests/browser/inputs-color.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, colorName, hslColor, hsvColor, parseColor, rgbColor, type ColorFormat } from '@salmonui/inputs/color-picker';

const html = (element: ReactElement) => renderToString(element);
const count = (markup: string, re: RegExp): number => (markup.match(re) ?? []).length;

describe('Color math', () => {
  it('parseColor reads hex, rgb and hsl text in comma and space syntax', () => {
    assert.equal(parseColor('#f00').toString('hex'), '#ff0000');
    assert.equal(parseColor('#f008').toString('hexa'), '#ff000088');
    assert.equal(parseColor('00ff00').toString('hexa'), '#00ff00ff');
    assert.equal(parseColor('#12345678').toString('hexa'), '#12345678');
    assert.equal(parseColor('rgb(255, 128, 0)').toString('hex'), '#ff8000');
    assert.equal(parseColor('rgba(255,128,0,0.5)').toString('rgb'), 'rgba(255, 128, 0, 0.5)');
    assert.equal(parseColor('rgb(100% 50% 0% / 50%)').toString('rgb'), 'rgba(255, 128, 0, 0.5)');
    assert.equal(parseColor('hsl(120, 100%, 25%)').toString('hex'), '#008000');
    assert.equal(parseColor('hsl(240deg 100% 50% / 0.25)').toString('hexa'), '#0000ff40');
    assert.equal(parseColor('hsla(0.5turn, 100%, 50%, 1)').toString('hex'), '#00ffff');
    assert.equal(parseColor('transparent').toString('hexa'), '#00000000');
    for (const bad of ['', 'red', '#ggg', '#12345', 'rgb(1, 2)', 'rgb(a, b, c)', 'hsl(1px, 2%, 3%)', 'cmyk(0, 0, 0, 0)']) assert.throws(() => parseColor(bad), TypeError, bad);
  });

  it('toString serializes hex, hexa, rgb and hsl; alpha switches rgb and hsl to their alpha forms', () => {
    const c = rgbColor(0, 128, 0);
    assert.equal(c.toString(), '#008000ff');
    assert.equal(c.toString('hex'), '#008000');
    assert.equal(c.toString('rgb'), 'rgb(0, 128, 0)');
    assert.equal(c.toString('hsl'), 'hsl(120, 100%, 25.1%)');
    const a = c.with({ alpha: 0.5 });
    assert.equal(a.toString('hexa'), '#00800080');
    assert.equal(a.toString('hex'), '#008000');
    assert.equal(a.toString('rgb'), 'rgba(0, 128, 0, 0.5)');
    assert.equal(a.toString('hsl'), 'hsla(120, 100%, 25.1%, 0.5)');
  });

  it('round-trips: hex -> any format -> hex is exact for every 8-bit channel sample', () => {
    const formats: ColorFormat[] = ['hexa', 'rgb', 'hsl'];
    for (let r = 0; r < 256; r += 17)
      for (let g = 0; g < 256; g += 51)
        for (let b = 0; b < 256; b += 15) {
          const hex = rgbColor(r, g, b, 0.6).toString('hexa');
          for (const f of formats) assert.equal(parseColor(parseColor(hex).toString(f)).toString('hexa'), hex, `${hex} via ${f}`);
        }
  });

  it('HSV, HSL and RGB conversions agree', () => {
    const c = hsvColor(210, 50, 80, 1);
    const { r, g, b } = c.toRgb();
    assert.deepEqual([r, g, b], [102, 153, 204]);
    const hsl = c.toHsl();
    assert.equal(Math.round(hsl.h), 210);
    assert.equal(Math.round(hsl.s), 50);
    assert.equal(Math.round(hsl.l), 60);
    assert.equal(hslColor(hsl.h, hsl.s, hsl.l).toString('hex'), c.toString('hex'));
    const back = rgbColor(r, g, b).toHsv();
    assert.equal(Math.round(back.h), 210);
    assert.equal(Math.round(back.s), 50);
    assert.equal(Math.round(back.v), 80);
    // A gray keeps the hue it was given (the working model of the parts).
    assert.equal(hsvColor(200, 0, 50).with({ brightness: 60 }).hue, 200);
    assert.equal(hsvColor(-30, 120, -5, 2).hue, 330);
    assert.equal(hsvColor(-30, 120, -5, 2).saturation, 100);
    assert.equal(hsvColor(-30, 120, -5, 2).alpha, 1);
    assert.ok(rgbColor(255, 0, 0).equals(parseColor('#f00')));
    assert.ok(!rgbColor(255, 0, 0).equals(parseColor('#f00e')));
    assert.ok(rgbColor(255, 0, 0).equals(parseColor('#f00e'), 'hex'));
  });

  it('colorName describes hue, lightness, saturation and opacity', () => {
    assert.equal(colorName(parseColor('#008000')), 'dark vibrant green');
    assert.equal(colorName(parseColor('#ff0000')), 'vibrant red');
    assert.equal(colorName(parseColor('#0000ff')), 'vibrant blue');
    assert.equal(colorName(parseColor('#000')), 'black');
    assert.equal(colorName(parseColor('#fff')), 'white');
    assert.equal(colorName(parseColor('#808080')), 'gray');
    assert.equal(colorName(parseColor('#d0d0d0')), 'light gray');
    assert.equal(colorName(parseColor('#8b4513')), 'dark brown');
    assert.equal(colorName(parseColor('#ff000080')), 'vibrant red, 50% opaque');
    assert.equal(colorName(parseColor('transparent')), 'transparent');
  });
});

describe('ColorPicker markup', () => {
  it('the trigger previews the default #008000ff; the hidden input submits it', () => {
    const out = html(h(ColorPicker, { label: 'Brand', name: 'brand' }));
    assert.match(out, /<button[^>]*class="salmon-input-group salmon-color-picker-trigger"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
    assert.match(out, /role="img" aria-label="dark vibrant green"/);
    assert.match(out, /<input type="hidden" name="brand" value="#008000ff"/);
    assert.equal(count(out, /role="dialog"/g), 0);  });

  it('valueFormat serializes the default value', () => {
    assert.match(html(h(ColorPicker, { name: 'c', valueFormat: 'rgb' })), /value="rgb\(0, 128, 0\)"/);
    assert.match(html(h(ColorPicker, { name: 'c', valueFormat: 'hsl', defaultValue: '#ff000080' })), /value="#ff000080"/);
    assert.match(html(h(ColorPicker, { name: 'c', defaultValue: null, clearable: true })), /name="c" value=""/);
  });

  it('inline renders the area, hue and alpha sliders and the hex field without a trigger', () => {
    const out = html(h(ColorPicker, { inline: true, label: 'Inline', defaultValue: '#3366cc' }));
    assert.equal(count(out, /salmon-color-picker-trigger/g), 0);
    assert.match(out, /role="group"[^>]*aria-labelledby/);
    assert.equal(count(out, /class="salmon-color-area"/g), 1);
    assert.equal(count(out, /data-channel="hue"/g), 1);
    assert.equal(count(out, /data-channel="alpha"/g), 1);
    assert.equal(count(out, /type="range"/g), 4);
    assert.match(out, /value="#3366ccff"/);
    // Apply / Cancel and the mode switch (commitBehavior 'confirm' default, showModeSwitch default).
    assert.match(out, />Apply</);
    assert.match(out, />Cancel</);
    assert.match(out, /aria-label="Show swatches"/);
    const noAlpha = html(h(ColorPicker, { inline: true, alpha: false, commitBehavior: 'immediate', showModeSwitch: false }));
    assert.equal(count(noAlpha, /data-channel="alpha"/g), 0);
    assert.equal(count(noAlpha, />Apply</g), 0);
    assert.equal(count(noAlpha, /salmon-color-picker-footer/g), 0);
    assert.match(noAlpha, /value="#008000"/, 'hex field without alpha');
    assert.equal(count(html(h(ColorPicker, { inline: true, valueFormat: 'hex' })), /data-channel="alpha"/g), 0);
  });

  it('swatches mode renders the palette as a listbox grid with columns and a no-color swatch', () => {
    const out = html(h(ColorPicker, { inline: true, defaultMode: 'swatches', colors: ['#f00', '#0f0', '#00f', { value: '#000', label: 'Ink' }], columns: 2, clearable: true, defaultValue: '#00ff00' }));
    assert.match(out, /role="listbox"/);
    assert.match(out, /--salmon-color-swatch-picker-columns:2/);
    assert.equal(count(out, /role="option"/g), 5);
    assert.match(out, /aria-label="No color"/);
    assert.match(out, /aria-label="Ink"/);
    assert.match(out, /aria-selected="true"[^>]*aria-label="vibrant green"/);
    assert.equal(count(out, /tabindex="0"/g), 1, 'one roving tab stop');
  });

  it('recent colors render as a labelled swatch listbox once tracked', () => {
    const out = html(h(ColorPicker, { inline: true, defaultRecentColors: ['#ff0000', '#0000ff'] }));
    assert.match(out, />Recent colors</);
    assert.match(out, /role="listbox" aria-labelledby="[^"]+r"/);
    assert.equal(count(html(h(ColorPicker, { inline: true })), /Recent colors/g), 0);
  });

  it('renderSwatch replaces each palette swatch', () => {
    const out = html(h(ColorSwatchPicker, { colors: ['#f00', '#0f0'], renderSwatch: ({ value, selected, index }) => h('b', null, `${index}:${value}:${selected}`), value: '#0f0' }));
    assert.match(out, /<b>0:#f00:false<\/b>/);
    assert.match(out, /<b>1:#0f0:true<\/b>/);
  });

  it('ColorSwatchPicker defaults to the 60-color, 10-column palette; groups are labelled', () => {
    const out = html(h(ColorSwatchPicker, { 'aria-label': 'Palette' }));
    assert.equal(count(out, /role="option"/g), 60);
    assert.match(out, /--salmon-color-swatch-picker-columns:10/);
    const grouped = html(h(ColorSwatchPicker, { colors: [{ label: 'Warm', colors: ['#f00', '#f80'] }, { label: 'Cool', colors: ['#00f'] }], name: 'g', defaultValue: '#00f' }));
    assert.equal(count(grouped, /role="group"/g), 2);
    assert.match(grouped, />Warm</);
    assert.match(grouped, /name="g" value="#00f"/);
  });

  it('the parts render alone with APG slider semantics and color names in aria-valuetext', () => {
    const area = html(h(ColorArea, { defaultValue: '#008000', name: 'a' }));
    assert.match(area, /role="group" aria-label="Color"/);
    assert.match(area, /type="range"[^>]*aria-label="Saturation"[^>]*aria-valuetext="Saturation 100%, dark vibrant green"/);
    assert.match(area, /type="range"[^>]*tabindex="-1"[^>]*aria-label="Brightness"[^>]*aria-valuetext="Brightness 50%, dark vibrant green"/);
    assert.match(area, /--salmon-color-area-x:100%/);
    assert.match(area, /name="a" value="#008000ff"/);
    const hue = html(h(ColorSlider, { channel: 'hue', defaultValue: '#008000' }));
    assert.match(hue, /aria-label="Hue"[^>]*aria-valuetext="120°, green"/);
    assert.match(hue, /max="360"/);
    const alpha = html(h(ColorSlider, { channel: 'alpha', defaultValue: '#00800080', orientation: 'vertical' }));
    assert.match(alpha, /aria-valuetext="50%"/);
    assert.match(alpha, /aria-orientation="vertical"/);
    const field = html(h(ColorField, { label: 'Hex', defaultValue: '#abc', valueFormat: 'hex', name: 'f' }));
    assert.match(field, /class="salmon-input" value="#aabbcc"/);
    assert.match(field, /name="f" value="#aabbcc"/);
    assert.match(html(h(ColorSwatch, { color: '#ff000080' })), /role="img" aria-label="vibrant red, 50% opaque"/);
    assert.match(html(h(ColorSwatch, { color: null })), /aria-label="No color"[^>]*data-empty=""/);
    assert.match(html(h(ColorSwatch, { color: '#000', 'aria-label': '' })), /aria-hidden="true"/);
  });
});
