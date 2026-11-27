// Type contract of @salmonui/react/color-picker. Compiles against dist/*.d.ts.
import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  parseColor,
  type Color,
  type ColorChangeDetails,
  type ColorFieldChangeDetails,
  type ColorFormat,
  type ColorPickerBeforeModeChangeEvent,
  type ColorPickerBeforeOpenChangeEvent,
  type ColorPickerChangeDetails,
  type ColorPickerMode,
  type ColorPickerOpenChangeDetails,
  type SwatchChangeDetails,
  type SwatchRenderContext,
} from '@salmonui/inputs/color-picker';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;
expectType<Equal<ReturnType<typeof parseColor>, Color>>(true);
expectType<Equal<Parameters<Color['toString']>[0], ColorFormat | undefined>>(true);
expectType<Equal<ColorPickerMode, 'area' | 'swatches'>>(true);

export const picker = (
  <ColorPicker
    label="Brand"
    value={null as string | null}
    valueFormat="rgb"
    onValueChange={(v: string | null, d: ColorPickerChangeDetails) => [v, d.reason, d.color?.toString('hex')]}
    onValueCommit={(v: string | null, d: ColorPickerChangeDetails) => [v, d.source]}
    mode="swatches"
    onModeChange={(m: ColorPickerMode) => m}
    onBeforeModeChange={(e: ColorPickerBeforeModeChangeEvent) => e.mode === 'area' && e.preventDefault()}
    open
    onOpenChange={(o: boolean, d: ColorPickerOpenChangeDetails) => [o, d.reason]}
    onBeforeOpenChange={(e: ColorPickerBeforeOpenChangeEvent) => (e.open ? e.preventDefault() : undefined)}
    commitBehavior="immediate"
    recentColors={['#fff']}
    onRecentColorsChange={(c: readonly string[]) => c}
    colors={[{ label: 'Warm', colors: ['#f00', { value: '#f80', label: 'Orange' }] }]}
    renderSwatch={(ctx: SwatchRenderContext) => (ctx.selected ? ctx.label : null)}
    ref={(el: HTMLElement | null) => void el}
  />
);
export const parts = (
  <>
    <ColorArea value={parseColor('#fff')} onValueChange={(c: Color, d: ColorChangeDetails) => [c.hue, d.reason === 'drag' || d.reason === 'step' || d.reason === 'reset']} ref={(el: HTMLDivElement | null) => void el} />
    <ColorSlider channel="alpha" orientation="vertical" defaultValue="#000" onValueCommit={(c: Color) => c.alpha} />
    <ColorField value="#fff" onValueChange={(v: string | null, d: ColorFieldChangeDetails) => [v, d.reason, d.color]} ref={(el: HTMLInputElement | null) => void el} />
    <ColorSwatch color={null} />
    <ColorSwatchPicker colors={['#f00']} columns={4} onValueChange={(v: string | null, d: SwatchChangeDetails) => [v, d.color]} />
  </>
);
// @ts-expect-error channel is hue or alpha
export const badChannel = <ColorSlider channel="red" />;
// @ts-expect-error valueFormat is hex, hexa, rgb or hsl
export const badFormat = <ColorPicker valueFormat="cmyk" />;
// @ts-expect-error commitBehavior is confirm or immediate
export const badCommit = <ColorPicker commitBehavior="later" />;
