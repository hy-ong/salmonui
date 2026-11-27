---
title: Carousel
description: Carousel and CarouselSlide from @salmonui/navigation/carousel - a native scroll-snap slide show with auto-play, fade, peek, indicators, loop, RTL and the APG Carousel pattern.
category: Carousel
order: 90
demos: [carousel-basics, carousel-autoplay, carousel-templates]
---

```tsx
import { Carousel, CarouselSlide } from '@salmonui/navigation/carousel';
import '@salmonui/navigation/carousel/styles.css';

<Carousel aria-label="Promotions" autoPlay={{ interval: 6000 }} indicators="dots" peek>
  <CarouselSlide label="Spring sale">...</CarouselSlide>
  <CarouselSlide label="New arrivals">...</CarouselSlide>
</Carousel>
```

`/carousel/styles.css` needs nothing besides `@salmonui/core/styles.css`,
which every app imports once; the package aggregate
`@salmonui/navigation/styles.css` includes it.

## Slides

`Carousel` takes `CarouselSlide` children. Every slide is rendered,
on the server too, because slides are content. A slide accepts `label`
(prefixed to its accessible name and used by its indicator), `interval` (its
own auto-play time), `className`, `style` and any DOM attribute. Slides from
data are a `map` (a separate data-source and template API would
be two APIs for one feature, and the `map` covers both):

```tsx
<Carousel aria-label="News">
  {items.map((item) => (
    <CarouselSlide key={item.id} label={item.title}>
      <img src={item.src} alt={item.alt} />
    </CarouselSlide>
  ))}
</Carousel>
```

The track is a native CSS scroll-snap container: touch, trackpad and wheel
swiping come from the browser with inertia and no JavaScript per frame. One
`IntersectionObserver` per carousel reports the snapped slide and `index`
follows once the scroll settles (`scrollend`). Mouse-drag swiping is not
offered: it would need pointer capture
and a JavaScript animation on the default path. Touch swiping works by
default, and the buttons, indicators and keys cover mouse users.

## Selected slide and events

`index` / `defaultIndex` / `onIndexChange(index, event)` is the usual triad.
`onBeforeIndexChange(event)` runs first and `event.preventDefault()`
keeps the current slide; a swipe that was cancelled scrolls back.
Both events carry `{ index, previousIndex, source }` with `source` one of
`'pointer' | 'keyboard' | 'autoPlay' | 'scroll' | 'api'`. Event objects are
allocated only when a handler is bound and are frozen in development builds.

Without `index` the carousel is uncontrolled and starts at `defaultIndex`
(default `0`); with `index` only the prop moves the slide, and
`onIndexChange` reports each proposal:

```tsx
const [index, setIndex] = useState(0);

<Carousel aria-label="Promotions" index={index} onIndexChange={setIndex}>
  …
</Carousel>
```

## Auto-play

`autoPlay` (`true` or `{ interval, pauseOnHover }`) rotates the slides every
`interval` milliseconds (default 5000; a slide's `interval` wins).
`autoPlay` is off by default. Rotation pauses while a mouse
pointer is over the carousel (`pauseOnHover`, default `true`) and while keyboard focus
is inside it. `playing` / `defaultPlaying` / `onPlayingChange`
control it.

While `autoPlay` is on, a play/pause button is always rendered and is the
first tab stop of the carousel; `renderPlayButton({ playing, label, toggle
})` changes its look. The button cannot be hidden: WCAG 2.2.2
(Pause, Stop, Hide) and the APG Carousel pattern require a pause control for
content that moves on its own; to have no button, turn `autoPlay` off. With
`prefers-reduced-motion: reduce`, auto-play waits until the user presses
play (`onPlayingChange` reports `source: 'reducedMotion'`).

## Loop, effects and peek

`loop` (default `true`) continues from the last slide to the first and back
by jumping (an instant scroll), without cloned slides that would duplicate
content for assistive technology. With `loop={false}` the edge
buttons are disabled and auto-play stops at the last slide.

`effect` is `'slide'` (smooth scroll, default), `'none'` (instant scroll) or
`'fade'` (slides stacked in one grid cell with an `opacity` transition;
inactive slides are `inert`). Reduced motion makes every move
instant. A custom effect is CSS on the `[data-active]` slide and its
`[data-position="previous" | "next"]` neighbours (a
custom effect is a styling hook, not an API, and must respect reduced
motion):

```css
.my-carousel .salmon-carousel-slide { transition: scale 300ms; scale: 0.92; }
.my-carousel .salmon-carousel-slide[data-active] { scale: 1; }
```

`peek` shows part of the previous and next slides; a string sets the width
(`peek="15%"`, default `10%`).

## Buttons and indicators

`controls` is `'visible'` (default), `'hover'` (shown on hover, on focus
within and always on touch devices) or `'hidden'`.
`renderPreviousButton` / `renderNextButton` receive `{ disabled, label, go }`
and return the button; call `go(event)` from its click handler.

`indicators` is `'dots'` (default), `'dynamic'` (dots that shrink and hide
away from the selected one), `'fraction'` ("2 / 5"), `'progress'` (a bar) or
`false`. `renderIndicator({ index, selected, label, go })` replaces
each dot.

```tsx
<Carousel
  aria-label="Products"
  renderIndicator={({ index, selected, label, go }) => (
    <button type="button" aria-label={label} aria-current={selected || undefined} onClick={go}>
      <img src={thumbs[index]} alt="" />
    </button>
  )}
>
  ...
</Carousel>
```

## Keyboard

ArrowLeft / ArrowRight (mirrored in RTL), Home and End move between slides
when focus is on the track or any control of the carousel. Keys in
editable fields inside a slide are left alone; intercept a key with
`onKeyDown` and `preventDefault()`. The keys cannot be turned off:
they are part of the accessible contract. Tab order: play/pause, previous,
next, the track, then the indicators.

## Ref

`ref` receives a `CarouselApi`: `next()`, `previous()`, `goTo(index)`,
`play()`, `pause()`, plus `index`, `playing` and `element`. Prefer
the `index` and `playing` props; the methods report `source: 'api'`.

## Accessibility

The APG Carousel pattern: the root is a `<section>` with
`aria-roledescription="carousel"` and your `aria-label` (required; a
development warning names a missing one); each slide is `role="group"` with
`aria-roledescription="slide"` and the name "1 of 5" (or "Spring sale, 1 of
5"). The track is `aria-live="off"` while auto-play runs and `"polite"`
otherwise. Every button names itself and points at the track with
`aria-controls`; the selected dot has `aria-current="true"`.

## Locale and styling

`localeText` overrides `carousel`, `slide`, `slideLabel(index, total, label)`,
`previous`, `next`, `play`, `pause`, `indicators`, `indicator(index, total,
label)` and `fraction(index, total)`; defaults are exported as
`CAROUSEL_DEFAULT_LOCALE_TEXT`.

`className` and `style` reach the root; DOM attributes pass through.
Styling hooks: `.salmon-carousel` (`data-effect`, `data-controls`,
`data-peek`, `data-playing`, `data-ready` after mount), `-viewport`,
`-track`, `-slide` (`data-active`, `data-position`), `-previous`, `-next`,
`-play`, `-indicators` (`data-type`), `-indicator`, `-progress`. Colors come
from the theme; directions use logical properties.

## Server rendering

The server renders every slide with the selected one placed by CSS (an
initial `--salmon-carousel-index` offset) until mount, so no layout is read
before the first commit and hydration matches the server markup.

## API reference

[`@salmonui/navigation/carousel`](/docs/reference/navigation/carousel): `Carousel`,
`CarouselSlide`, `CarouselApi`, `CAROUSEL_DEFAULT_LOCALE_TEXT` and the
context, event and locale types.
