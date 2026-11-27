'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { toColor, type Color, type ColorFormat } from './color.js';
import { ColorArea } from './ColorArea.js';
import { ColorField } from './ColorField.js';
import { ColorSlider } from './ColorSlider.js';
import { ColorSwatch } from './ColorSwatch.js';
import { ColorSwatchPicker, type ColorSwatchGroup, type ColorSwatchItem, type SwatchRenderContext } from './ColorSwatchPicker.js';
import { DEFAULT_COLOR, type ColorChangeSource, type ColorPartLocaleText } from './control.js';

/** `'area'` (saturation and brightness area, sliders, hex field) or `'swatches'` (palette). */
export type ColorPickerMode = 'area' | 'swatches';

/** Second argument of `onValueChange` and `onValueCommit`. */
export interface ColorPickerChangeDetails {
  readonly source: ColorChangeSource;
  /** The part that changed the color; `'apply'` the Apply button (commit only), `'cancel'` a discarded pick, `'reset'` form reset. */
  readonly reason: 'area' | 'hue' | 'alpha' | 'field' | 'swatch' | 'recent' | 'clear' | 'apply' | 'cancel' | 'reset';
  readonly color: Color | null;
}

/** Second argument of `onOpenChange`. */
export interface ColorPickerOpenChangeDetails {
  readonly source: ColorChangeSource;
  readonly reason: 'trigger' | 'escape' | 'outside' | 'focus-outside' | 'apply' | 'cancel' | 'select';
}

/** A cancellable event: `preventDefault()` vetoes the change. */
export interface ColorPickerCancelableEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Argument of `onBeforeOpenChange`. */
export interface ColorPickerBeforeOpenChangeEvent extends ColorPickerCancelableEvent, ColorPickerOpenChangeDetails {
  readonly open: boolean;
}

/** Argument of `onBeforeModeChange`. */
export interface ColorPickerBeforeModeChangeEvent extends ColorPickerCancelableEvent {
  readonly mode: ColorPickerMode;
}

/** User-visible strings of ColorPicker. */
export type ColorPickerLocaleText = FieldValidationText &
  ColorPartLocaleText & {
    readonly trigger?: string;
    readonly dialog?: string;
    readonly area?: string;
    readonly colors?: string;
    readonly recentColors?: string;
    readonly noColor?: string;
    readonly apply?: string;
    readonly cancel?: string;
    readonly current?: string;
    readonly previous?: string;
    readonly clear?: string;
    readonly hex?: string;
    readonly switchToSwatches?: string;
    readonly switchToArea?: string;
  };

export interface ColorPickerProps extends FieldCommonProps {
  /** The color in `valueFormat`, or null for no color. */
  readonly value?: string | null | undefined;
  /** Default `'#008000ff'`. */
  readonly defaultValue?: string | null | undefined;
  /** Every pick, at most once per animation frame while dragging. */
  readonly onValueChange?: ((value: string | null, details: ColorPickerChangeDetails) => void) | undefined;
  /** A committed value: Apply with `commitBehavior: 'confirm'`, else a drag end, key step, field entry or swatch pick. */
  readonly onValueCommit?: ((value: string | null, details: ColorPickerChangeDetails) => void) | undefined;
  /** Default `'hexa'`. With `'hex'` the alpha slider is hidden. */
  readonly valueFormat?: ColorFormat | undefined;
  readonly mode?: ColorPickerMode | undefined;
  /** Default `'area'`. */
  readonly defaultMode?: ColorPickerMode | undefined;
  readonly onModeChange?: ((mode: ColorPickerMode) => void) | undefined;
  /** Cancellable. */
  readonly onBeforeModeChange?: ((event: ColorPickerBeforeModeChangeEvent) => void) | undefined;
  /** The button that switches between the area and the palette. Default true. */
  readonly showModeSwitch?: boolean | undefined;
  /** Renders the panel in place, without a trigger or popover. */
  readonly inline?: boolean | undefined;
  /** The alpha slider and alpha in the hex field. Default true. */
  readonly alpha?: boolean | undefined;
  /** A "no color" swatch (and the field's clear button); value null. */
  readonly clearable?: boolean | undefined;
  /** `'confirm'` (default): Apply and Cancel buttons, Cancel or a dismissal discards the picks. `'immediate'`: every pick commits. */
  readonly commitBehavior?: 'confirm' | 'immediate' | undefined;
  /** Recently committed colors, newest first. Shown and tracked when this or `defaultRecentColors` is set; never stored. */
  readonly recentColors?: readonly string[] | undefined;
  readonly defaultRecentColors?: readonly string[] | undefined;
  readonly onRecentColorsChange?: ((colors: readonly string[]) => void) | undefined;
  /** Default 10. */
  readonly maxRecentColors?: number | undefined;
  /** Palette of the swatches mode; default the `ColorSwatchPicker` palette. */
  readonly colors?: readonly ColorSwatchItem[] | readonly ColorSwatchGroup[] | undefined;
  /** Palette columns. Default 10. */
  readonly columns?: number | undefined;
  /** Replaces each palette swatch. */
  readonly renderSwatch?: ((ctx: SwatchRenderContext) => ReactNode) | undefined;
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean, details: ColorPickerOpenChangeDetails) => void) | undefined;
  /** Cancellable. */
  readonly onBeforeOpenChange?: ((event: ColorPickerBeforeOpenChangeEvent) => void) | undefined;
  /** Name of a hidden input carrying the value (`''` for no color). */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly id?: string | undefined;
  /** Accessible name of the trigger without a `label`. */
  readonly 'aria-label'?: string | undefined;
  readonly localeText?: ColorPickerLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** The trigger button (the panel group when `inline`). */
  readonly ref?: Ref<HTMLElement> | undefined;
}

function cancellable<T extends object>(fields: T): T & ColorPickerCancelableEvent {
  const event = {
    ...fields,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

const EMPTY: readonly string[] = Object.freeze([]);

type PopoverModule = typeof import('./popover.js');
const loadPopover = (): Promise<PopoverModule> => import('./popover.js');

/**
 * Color picker: a trigger button with
 * a swatch preview that opens a popover, or an inline panel. The panel
 * composes the parts: `ColorArea`, hue and alpha `ColorSlider`s and a
 * `ColorField` (mode `'area'`), or a `ColorSwatchPicker` (mode
 * `'swatches'`), recent colors and Apply / Cancel. The popover is a
 * `role="dialog"` that takes focus on open and returns it to the trigger
 * on close. A hidden input with `name` submits the value.
 */
export function ColorPicker(props: ColorPickerProps): ReactNode {
  const t = useLocaleText('colorPicker', props.localeText);
  const format = props.valueFormat ?? 'hexa';
  const confirm = props.commitBehavior !== 'immediate';
  const inline = props.inline === true;
  const showAlpha = props.alpha !== false && format !== 'hex';
  const [initial] = useState<string | null>(() => (props.defaultValue === undefined ? DEFAULT_COLOR.toString(format) : props.defaultValue));
  const [value, setValue] = useControllableState<string | null, [ColorPickerChangeDetails]>(props.value, initial, props.onValueChange, 'ColorPicker value');
  const [working, setWorking] = useState<Color>(() => toColor(props.value === undefined ? initial : props.value) ?? DEFAULT_COLOR);
  const parsed = toColor(value);
  // A value that serializes like the working color keeps the working color (hue of grays, precision).
  const color = parsed && !parsed.equals(working, format) ? parsed : working;
  // The value Cancel returns to: the value at open (popover) or at the last Apply (inline).
  const [base, setBase] = useState<string | null>(value);
  const [mode, setMode] = useControllableState<ColorPickerMode>(props.mode, props.defaultMode ?? 'area', props.onModeChange, 'ColorPicker mode');
  const [open, setOpen] = useControllableState<boolean, [ColorPickerOpenChangeDetails]>(props.open, props.defaultOpen ?? false, props.onOpenChange, 'ColorPicker open');
  const tracked = props.recentColors !== undefined || props.defaultRecentColors !== undefined;
  const [recent, setRecent] = useControllableState<readonly string[]>(props.recentColors, props.defaultRecentColors ?? EMPTY, props.onRecentColorsChange, 'ColorPicker recentColors');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const field = useField({ ...props, localeText: t, value, inputRef: hiddenRef, focusRef: triggerRef, revealOnChange: true });
  const id = useId();
  const swatchId = `${id}s`;
  const popupId = `${id}p`;
  const recentId = `${id}r`;
  // The popover chunk loads on first open, or earlier when the trigger is hovered or focused.
  const [popover, setPopover] = useState<PopoverModule | null>(null);
  const [wanted, setWanted] = useState(false);
  const want = open || wanted;
  useEffect(() => {
    if (!want || popover || inline) return;
    let live = true;
    void loadPopover().then((m) => live && setPopover(() => m));
    return () => {
      live = false;
    };
  }, [want, popover, inline]);
  const Overlay = popover?.Overlay;

  const details = (source: ColorChangeSource, reason: ColorPickerChangeDetails['reason'], c: Color | null): ColorPickerChangeDetails => Object.freeze({ source, reason, color: c });
  const change = (next: Color | null, source: ColorChangeSource, reason: ColorPickerChangeDetails['reason']): string | null => {
    if (next) setWorking(next);
    const v = next ? next.toString(format) : null;
    setValue(v, details(source, reason, next));
    return v;
  };
  const commit = (v: string | null, source: ColorChangeSource, reason: ColorPickerChangeDetails['reason']): void => {
    props.onValueCommit?.(v, details(source, reason, toColor(v)));
    if (!tracked || v === null) return;
    const key = toColor(v)?.toString('hexa');
    setRecent([v, ...recent.filter((r) => toColor(r)?.toString('hexa') !== key)].slice(0, Math.max(1, props.maxRecentColors ?? 10)));
  };
  /** A part's pick; commits now with `commitBehavior: 'immediate'` when `final`. */
  const pick = (next: Color | null, source: ColorChangeSource, reason: ColorPickerChangeDetails['reason'], final: boolean): void => {
    if (next === null && !props.clearable) return;
    const v = change(next, source, reason);
    if (final && !confirm) commit(v, source, reason);
  };

  const requestOpen = (next: boolean, source: ColorChangeSource, reason: ColorPickerOpenChangeDetails['reason']): void => {
    if (next === open || (next && props.disabled) || inline) return;
    const event = cancellable({ open: next, source, reason });
    props.onBeforeOpenChange?.(event);
    if (event.defaultPrevented) return;
    if (next) setBase(value);
    else if (confirm && reason !== 'apply') revert(source);
    setOpen(next, Object.freeze({ source, reason }));
  };
  const revert = (source: ColorChangeSource): void => {
    if (value === base) return;
    const c = toColor(base);
    if (c) setWorking(c);
    setValue(base, details(source, 'cancel', c));
  };
  const apply = (source: ColorChangeSource): void => {
    setBase(value);
    commit(value, source, 'apply');
    requestOpen(false, source, 'apply');
  };
  const cancel = (source: ColorChangeSource): void => {
    if (inline) revert(source);
    else requestOpen(false, source, 'cancel');
  };
  const switchMode = (): void => {
    const next: ColorPickerMode = mode === 'area' ? 'swatches' : 'area';
    const event = cancellable({ mode: next });
    props.onBeforeModeChange?.(event);
    if (!event.defaultPrevented) setMode(next);
  };

  useFormReset(rootRef, () => {
    const c = toColor(initial);
    if (c) setWorking(c);
    setBase(initial);
    setValue(initial, details('api', 'reset', c));
  });

  const src = (e: { readonly detail: number }): ColorChangeSource => (e.detail === 0 ? 'keyboard' : 'pointer');
  const disabled = props.disabled;
  const noColor = value === null;
  const panel = (
    <div className="salmon-color-picker-panel" data-mode={mode}>
      {mode === 'area' ? (
        <>
          <ColorArea value={color} disabled={disabled} localeText={t} aria-label={t?.area ?? 'Saturation and brightness'} onValueChange={(c, d) => pick(c, d.source, 'area', false)} onValueCommit={(c, d) => pick(c, d.source, 'area', true)} />
          <div className="salmon-color-picker-controls">
            <div className="salmon-color-picker-sliders">
              <ColorSlider channel="hue" value={color} disabled={disabled} localeText={t} onValueChange={(c, d) => pick(c, d.source, 'hue', false)} onValueCommit={(c, d) => pick(c, d.source, 'hue', true)} />
              {showAlpha ? <ColorSlider channel="alpha" value={color} disabled={disabled} localeText={t} onValueChange={(c, d) => pick(c, d.source, 'alpha', false)} onValueCommit={(c, d) => pick(c, d.source, 'alpha', true)} /> : null}
            </div>
            <span className="salmon-color-picker-preview">
              {confirm ? <ColorSwatch color={base} aria-label={`${t?.previous ?? 'Previous'}`} colorName={t?.colorName} /> : null}
              <ColorSwatch color={noColor ? null : color} aria-label={t?.current ?? 'Current'} colorName={t?.colorName} />
            </span>
          </div>
          <ColorField
            aria-label={t?.hex ?? 'Hex'}
            size="sm"
            showSwatch={false}
            value={noColor ? null : color}
            valueFormat={showAlpha ? 'hexa' : 'hex'}
            clearable={props.clearable}
            disabled={disabled}
            localeText={t}
            onValueChange={(_, d) => pick(d.color, d.source, d.color ? 'field' : 'clear', true)}
          />
        </>
      ) : (
        <ColorSwatchPicker
          aria-label={t?.colors ?? 'Colors'}
          colors={props.colors}
          columns={props.columns}
          clearable={props.clearable}
          renderSwatch={props.renderSwatch}
          disabled={disabled}
          localeText={t}
          value={value}
          onValueChange={(_, d) => {
            pick(d.color, d.source, d.color ? 'swatch' : 'clear', true);
            if (!confirm) requestOpen(false, d.source, 'select');
          }}
        />
      )}
      {tracked && recent.length > 0 ? (
        <div className="salmon-color-picker-recent">
          <div id={recentId}>
            {t?.recentColors ?? 'Recent colors'}
          </div>
          <ColorSwatchPicker aria-labelledby={recentId} colors={recent} columns={props.columns} disabled={disabled} localeText={t} value={value} onValueChange={(_, d) => pick(d.color, d.source, 'recent', true)} />
        </div>
      ) : null}
      {props.showModeSwitch !== false || confirm ? (
        <div className="salmon-color-picker-footer">
          {props.showModeSwitch !== false ? (
            <button type="button" className="salmon-color-picker-button salmon-color-picker-mode" data-mode={mode} disabled={disabled} aria-label={mode === 'area' ? (t?.switchToSwatches ?? 'Show swatches') : (t?.switchToArea ?? 'Show color area')} title={mode === 'area' ? (t?.switchToSwatches ?? 'Show swatches') : (t?.switchToArea ?? 'Show color area')} onClick={switchMode}>
              <span className="salmon-color-picker-mode-icon" aria-hidden="true" />
            </button>
          ) : null}
          {confirm ? (
            <>
              <button type="button" className="salmon-color-picker-button" disabled={disabled} onClick={(e) => cancel(src(e))}>
                {t?.cancel ?? 'Cancel'}
              </button>
              <button type="button" className="salmon-color-picker-button" data-primary="" disabled={disabled} onClick={(e) => apply(src(e))}>
                {t?.apply ?? 'Apply'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const labelled = props.label != null && props.label !== false;
  return (
    <FieldStateContext value={field}>
      <div ref={rootRef} className={cx('salmon-field salmon-color-picker', props.className)} style={props.style} data-size={props.size ?? 'md'} data-inline={inline ? '' : undefined} {...field.rootProps}>
        {inline ? (
          labelled ? (
            <div className="salmon-field-label" id={field.labelId}>
              {props.label}
            </div>
          ) : null
        ) : (
          <FieldLabel field={field}>{props.label}</FieldLabel>
        )}
        {inline ? (
          <div
            ref={(el) => assignRef(props.ref as never, el)}
            role="group"
            id={field.inputId}
            aria-labelledby={labelled ? field.labelId : undefined}
            aria-label={labelled ? undefined : (props['aria-label'] ?? t?.dialog ?? 'Color picker')}
            aria-describedby={field.inputProps['aria-describedby']}
            className="salmon-color-picker-inline"
          >
            {panel}
          </div>
        ) : (
          <button
            ref={(el) => {
              triggerRef.current = el;
              assignRef(props.ref as never, el);
            }}
            type="button"
            className="salmon-input-group salmon-color-picker-trigger"
            data-size={props.size ?? 'md'}
            {...field.inputProps}
            aria-labelledby={labelled ? `${field.labelId} ${swatchId}` : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            onClick={(e) => requestOpen(!open, src(e), 'trigger')}
            onPointerEnter={() => setWanted(true)}
            onFocus={() => setWanted(true)}
            onKeyDown={(e) => {
              if (e.altKey && e.key === 'ArrowDown') {
                e.preventDefault();
                requestOpen(true, 'keyboard', 'trigger');
              }
            }}
          >
            {labelled ? null : <span className="salmon-visually-hidden">{props['aria-label'] ?? t?.trigger ?? 'Color'}</span>}
            <ColorSwatch id={swatchId} color={noColor ? null : color} colorName={t?.colorName} aria-label={noColor ? (t?.noColor ?? 'No color') : undefined} />
            <span className="salmon-color-picker-chevron" aria-hidden="true" />
          </button>
        )}
        {open && !inline && Overlay ? (
          <Overlay
            anchor={triggerRef}
            id={popupId}
            role="dialog"
            aria-labelledby={labelled ? field.labelId : undefined}
            aria-label={labelled ? undefined : (t?.dialog ?? 'Color picker')}
            className="salmon-color-picker-popup"
            placement="bottom-start"
            offset={4}
            margin={4}
            insideRefs={[triggerRef]}
            dismissOnFocusOutside
            focus={{ restoreFocus: triggerRef }}
            onDismiss={(reason, event) => requestOpen(false, event.type === 'keydown' ? 'keyboard' : 'pointer', reason === 'outside' ? 'outside' : reason === 'escape' ? 'escape' : 'focus-outside')}
          >
            {panel}
          </Overlay>
        ) : null}
        {props.name ? <input ref={hiddenRef} type="hidden" name={props.name} form={props.form} value={value ?? ''} disabled={disabled} /> : null}
        <FieldHelp field={field} description={props.description} />
      </div>
    </FieldStateContext>
  );
}
