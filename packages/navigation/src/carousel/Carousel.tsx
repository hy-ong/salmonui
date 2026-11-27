'use client';

// Carousel. The
// track is a native scroll-snap container: swiping, inertia and `peek` are
// CSS; once a scroll settles (`scrollend`, debounced `scroll` fallback)
// `index` follows the slide at the track's center, measured then. Programmatic moves call `scrollTo`; there is no JavaScript
// animation loop. Auto-play, hover and focus pauses live in an effect (no
// React state). SSR places the selected slide with a CSS offset until mount.

import { Children, createContext, Fragment, isValidElement, use, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { isRtl } from '@salmonui/core/internal/position';
import { pressSource } from '@salmonui/core/internal/press';

/** What moved the carousel. */
export type CarouselChangeSource = 'pointer' | 'keyboard' | 'autoPlay' | 'scroll' | 'api';

export interface CarouselIndexChangeEvent {
  readonly index: number;
  readonly previousIndex: number;
  readonly source: CarouselChangeSource;
}

/** `onBeforeIndexChange` event: `preventDefault()` keeps the current slide. */
export interface CarouselBeforeIndexChangeEvent extends CarouselIndexChangeEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface CarouselPlayingChangeEvent {
  readonly source: 'pointer' | 'keyboard' | 'autoPlay' | 'api' | 'reducedMotion';
}

export interface CarouselAutoPlay {
  /** Milliseconds per slide. Default 5000; a slide's `interval` wins. */
  readonly interval?: number | undefined;
  /** Pause while a mouse pointer is over the carousel. Default `true`. */
  readonly pauseOnHover?: boolean | undefined;
}

export type CarouselEffect = 'slide' | 'fade' | 'none';
export type CarouselIndicators = 'dots' | 'dynamic' | 'fraction' | 'progress';
export type CarouselControls = 'visible' | 'hover' | 'hidden';

/** Static texts; every value has a default in `CAROUSEL_DEFAULT_LOCALE_TEXT`. */
export interface CarouselLocaleText {
  /** `aria-roledescription` of the root. */
  readonly carousel: string;
  /** `aria-roledescription` of each slide. */
  readonly slide: string;
  /** Accessible name of a slide ("1 of 5"); `label` is the slide's own label. */
  readonly slideLabel: (index: number, total: number, label?: string) => string;
  readonly previous: string;
  readonly next: string;
  readonly play: string;
  readonly pause: string;
  /** Name of the indicator group. */
  readonly indicators: string;
  readonly indicator: (index: number, total: number, label?: string) => string;
  readonly fraction: (index: number, total: number) => string;
}

export const CAROUSEL_DEFAULT_LOCALE_TEXT: CarouselLocaleText = Object.freeze({
  carousel: 'carousel',
  slide: 'slide',
  slideLabel: (index: number, total: number, label?: string) => (label ? `${label}, ${index} of ${total}` : `${index} of ${total}`),
  previous: 'Previous slide',
  next: 'Next slide',
  play: 'Start automatic slide show',
  pause: 'Stop automatic slide show',
  indicators: 'Choose slide to display',
  indicator: (index: number, _total: number, label?: string) => (label ? `Slide ${index}: ${label}` : `Slide ${index}`),
  fraction: (index: number, total: number) => `${index} / ${total}`,
});

/** A click-like event (its `detail` tells keyboard from pointer); omitted means pointer. */
type SourceEvent = { readonly detail?: number; readonly nativeEvent?: unknown } | undefined;

export interface CarouselButtonContext {
  readonly disabled: boolean;
  readonly label: string;
  go(event?: SourceEvent): void;
}

export interface CarouselPlayButtonContext {
  readonly playing: boolean;
  readonly label: string;
  toggle(event?: SourceEvent): void;
}

export interface CarouselIndicatorContext {
  readonly index: number;
  readonly selected: boolean;
  readonly label: string;
  go(event?: SourceEvent): void;
}

/** The `ref` instance. */
export interface CarouselApi {
  readonly element: HTMLElement | null;
  readonly index: number;
  readonly playing: boolean;
  next(): void;
  previous(): void;
  goTo(index: number): void;
  play(): void;
  pause(): void;
}

export interface CarouselProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** `CarouselSlide` elements. */
  children?: ReactNode;
  /** Selected slide (controlled). */
  index?: number | undefined;
  /** Initial slide (uncontrolled). Default 0. */
  defaultIndex?: number | undefined;
  onIndexChange?: ((index: number, event: CarouselIndexChangeEvent) => void) | undefined;
  /** Synchronous; `event.preventDefault()` cancels the change. */
  onBeforeIndexChange?: ((event: CarouselBeforeIndexChangeEvent) => void) | undefined;
  /** Automatic rotation. Default `false`. A play/pause button is always shown while on. */
  autoPlay?: boolean | CarouselAutoPlay | undefined;
  /** Whether auto-play runs (controlled). */
  playing?: boolean | undefined;
  /** Initial `playing`. Default `true` when `autoPlay` is on, unless the user prefers reduced motion. */
  defaultPlaying?: boolean | undefined;
  onPlayingChange?: ((playing: boolean, event: CarouselPlayingChangeEvent) => void) | undefined;
  /** Past the last slide comes the first (jump back, no clones). Default `true`. */
  loop?: boolean | undefined;
  /** Default `'slide'`; reduced motion behaves as `'none'`. */
  effect?: CarouselEffect | undefined;
  /** Previous and next slides peek in; a string sets the peek width (CSS length). */
  peek?: boolean | string | undefined;
  /** Previous / next buttons. Default `'visible'`; `'hover'` also shows on focus and on touch devices. */
  controls?: CarouselControls | undefined;
  /** Default `'dots'`. */
  indicators?: CarouselIndicators | false | undefined;
  renderPreviousButton?: ((ctx: CarouselButtonContext) => ReactNode) | undefined;
  renderNextButton?: ((ctx: CarouselButtonContext) => ReactNode) | undefined;
  renderPlayButton?: ((ctx: CarouselPlayButtonContext) => ReactNode) | undefined;
  /** Replaces each `'dots'` / `'dynamic'` indicator button. */
  renderIndicator?: ((ctx: CarouselIndicatorContext) => ReactNode) | undefined;
  localeText?: Partial<CarouselLocaleText> | undefined;
  ref?: Ref<CarouselApi> | undefined;
}

export interface CarouselSlideProps extends HTMLAttributes<HTMLDivElement> {
  /** Prepended to the "N of M" slide name and used by the indicator name. */
  label?: string | undefined;
  /** Auto-play milliseconds for this slide. */
  interval?: number | undefined;
}

interface SlideCtx {
  readonly index: number;
  readonly total: number;
  readonly selected: number;
  readonly fade: boolean;
  readonly text: CarouselLocaleText;
}

const SlideContext = createContext<SlideCtx | null>(null);

const freeze = <T extends object>(e: T): T => (DEV ? Object.freeze(e) : e);
const srcOf = (e: SourceEvent): 'pointer' | 'keyboard' => (e && pressSource(e) === 'keyboard' ? 'keyboard' : 'pointer');
const reducedMotion = (el: Element): boolean => !!el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Scrolls `track` so slide `i` is centered (the snap position); direction-agnostic. */
function scrollToSlide(track: HTMLElement, i: number, behavior: ScrollBehavior): void {
  const slide = track.children[i];
  if (!slide) return;
  const t = track.getBoundingClientRect();
  const s = slide.getBoundingClientRect();
  track.scrollTo({ left: track.scrollLeft + s.left + s.width / 2 - t.left - t.width / 2, behavior });
}

/** The slide whose center is nearest the track's center. */
function centered(track: HTMLElement): number {
  const t = track.getBoundingClientRect();
  const c = t.left + t.width / 2;
  let best = -1;
  let min = Infinity;
  [...track.children].forEach((slide, i) => {
    const r = slide.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - c);
    if (d < min) [min, best] = [d, i];
  });
  return best;
}

interface Live {
  index: number;
  total: number;
  playing: boolean;
  go(to: number, source: CarouselChangeSource): boolean;
  setPlaying(playing: boolean, source: CarouselPlayingChangeEvent['source']): void;
  advance(): void;
}

/**
 * Carousel (APG Carousel). `ref` is a `CarouselApi`. Styling hooks:
 * `.salmon-carousel` with `data-effect`, `data-controls`, `data-peek`,
 * `data-playing`, `data-ready` (after mount); parts `-viewport`, `-track`,
 * `-slide` (`data-active`, `data-position`), `-previous`, `-next`, `-play`,
 * `-indicators` (`data-type`), `-indicator`, `-progress`.
 */
export function Carousel(props: CarouselProps): ReactElement {
  const {
    children,
    index: indexProp,
    defaultIndex = 0,
    onIndexChange,
    onBeforeIndexChange,
    autoPlay = false,
    playing: playingProp,
    defaultPlaying,
    onPlayingChange,
    loop = true,
    effect = 'slide',
    peek = false,
    controls = 'visible',
    indicators = 'dots',
    renderPreviousButton,
    renderNextButton,
    renderPlayButton,
    renderIndicator,
    localeText,
    className,
    style,
    ref,
    onKeyDown,
    ...rest
  } = props;
  const text = { ...CAROUSEL_DEFAULT_LOCALE_TEXT, ...useLocaleText('carousel', localeText) };
  const slides = Children.toArray(children).filter(isValidElement) as ReactElement<CarouselSlideProps>[];
  const total = slides.length;
  const [rawIndex, setIndex] = useControllableState<number, [CarouselIndexChangeEvent]>(indexProp, defaultIndex, onIndexChange, 'Carousel index');
  const index = total ? Math.min(Math.max(0, rawIndex), total - 1) : 0;
  const auto: CarouselAutoPlay | null = autoPlay ? (autoPlay === true ? {} : autoPlay) : null;
  const [playingState, setPlayingState] = useControllableState<boolean, [CarouselPlayingChangeEvent]>(playingProp, defaultPlaying ?? !!auto, onPlayingChange, 'Carousel playing');
  const playing = !!auto && playingState && total > 1;
  const scrolling = effect !== 'fade';
  const interval = slides[index]?.props.interval ?? auto?.interval ?? 5000;
  const pauseOnHover = auto?.pauseOnHover !== false;
  const trackId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const snapped = useRef(-1);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const jump = useRef(false);

  const go = (to: number, source: CarouselChangeSource): boolean => {
    const from = live.current.index;
    if (!total) return false;
    let next = to;
    if (next < 0 || next >= total) {
      if (!loop || source === 'scroll') return false;
      next = ((next % total) + total) % total;
      jump.current = true;
    }
    if (next === from) return false;
    if (onBeforeIndexChange) {
      let prevented = false;
      onBeforeIndexChange(
        freeze({
          index: next,
          previousIndex: from,
          source,
          preventDefault: () => void (prevented = true),
          get defaultPrevented() {
            return prevented;
          },
        }),
      );
      if (prevented) {
        jump.current = false;
        return false;
      }
    }
    setIndex(next, (onIndexChange ? freeze({ index: next, previousIndex: from, source }) : undefined) as CarouselIndexChangeEvent);
    return true;
  };
  const setPlaying = (value: boolean, source: CarouselPlayingChangeEvent['source']): void => setPlayingState(value, (onPlayingChange ? freeze({ source }) : undefined) as CarouselPlayingChangeEvent);
  const live = useRef<Live>({ index, total, playing, go, setPlaying, advance: () => {} });
  useLayoutEffect(() => {
    live.current = {
      index,
      total,
      playing,
      go,
      setPlaying,
      advance: () => (!loop && index >= total - 1 ? setPlaying(false, 'autoPlay') : go(index + 1, 'autoPlay')),
    };
  });

  useImperativeHandle(
    ref,
    () => ({
      get element() {
        return rootRef.current;
      },
      get index() {
        return live.current.index;
      },
      get playing() {
        return live.current.playing;
      },
      next: () => void live.current.go(live.current.index + 1, 'api'),
      previous: () => void live.current.go(live.current.index - 1, 'api'),
      goTo: (i: number) => void live.current.go(i, 'api'),
      play: () => live.current.setPlaying(true, 'api'),
      pause: () => live.current.setPlaying(false, 'api'),
    }),
    [],
  );

  // Mount and every index change: drop the SSR offset, then scroll the track to the slide.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;
    root.setAttribute('data-ready', '');
    if (scrolling && snapped.current !== index) {
      scrollToSlide(track, index, !mounted.current || jump.current || effect === 'none' || reducedMotion(root) ? 'instant' : 'smooth');
      // Where the track is heading; the settle check measures where it arrived. A check
      // still pending from an earlier scroll would measure this one halfway.
      snapped.current = index;
      clearTimeout(settleTimer.current);
    }
    mounted.current = true;
    jump.current = false;
  }, [index, scrolling, effect]);

  // `index` follows the snapped slide once scrolling settles. Measured at that point: an
  // observer's report can arrive after the settle timer under load, and a stale one moved
  // the carousel back to the slide a programmatic scroll just left.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !scrolling) return;
    const check = (): void => {
      const s = (snapped.current = centered(track));
      if (s < 0 || s === live.current.index) return;
      // Committed at once, so the comparison below sees the outcome: a deferred one could run
      // before React rendered the accepted slide and scroll the track back to the old one.
      flushSync(() => live.current.go(s, 'scroll'));
      // Vetoed or a controlled `index` that did not follow: return to the committed slide.
      if (live.current.index !== s) scrollToSlide(track, live.current.index, 'smooth');
    };
    const type = 'onscrollend' in track ? 'scrollend' : 'scroll';
    const settle = (): void => {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(check, type === 'scroll' ? 150 : 50);
    };
    track.addEventListener(type, settle, { passive: true });
    return () => {
      clearTimeout(settleTimer.current);
      track.removeEventListener(type, settle);
    };
  }, [scrolling]);

  // Auto-play: one timer; hover (mouse only) and focus within pause it without re-rendering.
  // The pause state is tracked from mount and survives slide changes; only the timer re-arms.
  const pause = useRef<{ hover: boolean; focus: boolean; arm: () => void }>({ hover: false, focus: false, arm: () => {} });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const p = pause.current;
    // Keyboard focus (`:focus-visible`) pauses, so a mouse click on play does not stop what it started.
    const visible = (el: Element | null): boolean => !!el && root.contains(el) && el.matches(':focus-visible');
    p.focus = visible(root.ownerDocument.activeElement);
    const on = (e: Event): void => {
      if (e.type === 'focusin') p.focus = visible(e.target as Element);
      else if (e.type === 'focusout') p.focus = visible((e as FocusEvent).relatedTarget as Element | null);
      else if ((e as PointerEvent).pointerType === 'mouse') p.hover = e.type === 'pointerenter';
      p.arm();
    };
    const types = ['focusin', 'focusout', 'pointerenter', 'pointerleave'];
    for (const t of types) root.addEventListener(t, on);
    return () => {
      for (const t of types) root.removeEventListener(t, on);
    };
  }, []);
  // A start (the play button clicked under the mouse) is not paused by the hover it began in.
  useEffect(() => {
    if (playing) pause.current.hover = false;
  }, [playing]);
  useEffect(() => {
    if (!playing) return;
    const p = pause.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    p.arm = () => {
      clearTimeout(timer);
      if (!(pauseOnHover && p.hover) && !p.focus) timer = setTimeout(() => live.current.advance(), interval);
    };
    p.arm();
    return () => {
      clearTimeout(timer);
      p.arm = () => {};
    };
  }, [playing, index, interval, pauseOnHover]);

  // Reduced motion: auto-play waits for the play button (uncontrolled `playing` only).
  const motionChecked = useRef(false);
  useEffect(() => {
    const root = rootRef.current!;
    if (motionChecked.current) return;
    motionChecked.current = true;
    if (DEV && !rest['aria-label'] && !rest['aria-labelledby']) warnOnce('carousel:name', 'Carousel needs an accessible name: pass aria-label or aria-labelledby.');
    if (autoPlay && playingProp === undefined && defaultPlaying === undefined && reducedMotion(root)) live.current.setPlaying(false, 'reducedMotion');
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const dir = isRtl(event.currentTarget) ? -1 : 1;
    const k = event.key;
    const to = k === 'ArrowRight' ? index + dir : k === 'ArrowLeft' ? index - dir : k === 'Home' ? 0 : k === 'End' ? total - 1 : null;
    if (to === null) return;
    event.preventDefault();
    go(to, 'keyboard');
  };

  const multi = total > 1;
  const button = (d: 1 | -1): ReactNode => {
    const ctx: CarouselButtonContext = {
      disabled: !loop && (d < 0 ? index <= 0 : index >= total - 1),
      label: d < 0 ? text.previous : text.next,
      go: (e) => void go(index + d, srcOf(e)),
    };
    const render = d < 0 ? renderPreviousButton : renderNextButton;
    return render ? (
      render(ctx)
    ) : (
      <button type="button" className={d < 0 ? 'salmon-carousel-previous' : 'salmon-carousel-next'} aria-controls={trackId} aria-label={ctx.label} disabled={ctx.disabled} onClick={ctx.go}>
        <span className="salmon-carousel-icon" aria-hidden="true" />
      </button>
    );
  };
  const playCtx: CarouselPlayButtonContext = {
    playing,
    label: playing ? text.pause : text.play,
    toggle: (e) => setPlaying(!playing, srcOf(e)),
  };

  let indicatorNode: ReactNode = null;
  if (indicators && multi) {
    if (indicators === 'fraction' || indicators === 'progress') {
      indicatorNode = (
        <div className="salmon-carousel-indicators" data-type={indicators} aria-hidden="true">
          {indicators === 'fraction' ? text.fraction(index + 1, total) : <div className="salmon-carousel-progress" style={{ inlineSize: `${((index + 1) / total) * 100}%` }} />}
        </div>
      );
    } else {
      indicatorNode = (
        <div className="salmon-carousel-indicators" data-type={indicators} role="group" aria-label={text.indicators}>
          {slides.map((slide, i) => {
            const ctx: CarouselIndicatorContext = { index: i, selected: i === index, label: text.indicator(i + 1, total, slide.props.label), go: (e) => void go(i, srcOf(e)) };
            return renderIndicator ? (
              <Fragment key={slide.key}>{renderIndicator(ctx)}</Fragment>
            ) : (
              <button key={slide.key} type="button" className="salmon-carousel-indicator" aria-controls={trackId} aria-label={ctx.label} aria-current={ctx.selected || undefined} data-distance={indicators === 'dynamic' ? Math.min(Math.abs(i - index), 3) : undefined} onClick={ctx.go} />
            );
          })}
        </div>
      );
    }
  }

  const rootStyle = { '--salmon-carousel-index': index, ...(typeof peek === 'string' ? { '--salmon-carousel-peek': peek } : null), ...style } as CSSProperties;
  return (
    <section
      {...rest}
      ref={rootRef}
      className={className ? `salmon-carousel ${className}` : 'salmon-carousel'}
      style={rootStyle}
      aria-roledescription={text.carousel}
      data-effect={effect}
      data-controls={controls}
      data-peek={peek ? '' : undefined}
      data-playing={playing ? '' : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="salmon-carousel-viewport">
        {auto && multi
          ? (renderPlayButton?.(playCtx) ?? (
              <button type="button" className="salmon-carousel-play" aria-controls={trackId} aria-label={playCtx.label} data-playing={playing ? '' : undefined} onClick={playCtx.toggle}>
                <span className="salmon-carousel-icon" aria-hidden="true" />
              </button>
            ))
          : null}
        {controls !== 'hidden' && multi ? (
          <>
            {button(-1)}
            {button(1)}
          </>
        ) : null}
        <div ref={trackRef} id={trackId} className="salmon-carousel-track" aria-live={playing ? 'off' : 'polite'} tabIndex={scrolling ? 0 : undefined}>
          {slides.map((slide, i) => (
            <SlideContext key={slide.key} value={{ index: i, total, selected: index, fade: !scrolling, text }}>
              {slide}
            </SlideContext>
          ))}
        </div>
      </div>
      {indicatorNode}
    </section>
  );
}

/** One slide: `role="group"`, `aria-roledescription="slide"`, named "N of M". */
export function CarouselSlide(props: CarouselSlideProps): ReactElement {
  const ctx = use(SlideContext);
  const { label, interval: _interval, className, children, ...rest } = props;
  const i = ctx?.index ?? 0;
  const d = i - (ctx?.selected ?? 0);
  const text = ctx?.text ?? CAROUSEL_DEFAULT_LOCALE_TEXT;
  return (
    <div
      {...rest}
      className={className ? `salmon-carousel-slide ${className}` : 'salmon-carousel-slide'}
      role="group"
      aria-roledescription={text.slide}
      aria-label={text.slideLabel(i + 1, ctx?.total ?? 1, label)}
      data-index={i}
      data-active={d === 0 ? '' : undefined}
      data-position={d === -1 ? 'previous' : d === 1 ? 'next' : undefined}
      inert={ctx?.fade && d !== 0 ? true : undefined}
    >
      {children}
    </div>
  );
}
