// Carousel server markup:
// rendered through react-dom/server with DOM globals removed. Interaction
// (scroll snap, auto-play, keys, hydration) is in tests/browser/carousel.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'IntersectionObserver', 'matchMedia', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Carousel, CarouselSlide, CAROUSEL_DEFAULT_LOCALE_TEXT } = await import('@salmonui/navigation/carousel');
type Props = import('@salmonui/navigation/carousel').CarouselProps;

const slides = (n: number, label?: (i: number) => string) => Array.from({ length: n }, (_, i) => h(CarouselSlide, { key: i, label: label?.(i) }, `Content ${i + 1}`));
const render = (props: Partial<Props> = {}, n = 3): string => renderToString(h(Carousel, { 'aria-label': 'Featured', ...props }, ...slides(n)));
const count = (html: string, re: RegExp): number => html.match(new RegExp(re.source, 'g'))?.length ?? 0;
const tag = (html: string, re: RegExp): string => {
  const m = html.match(re);
  assert.ok(m, `no match for ${re}`);
  return m[0];
};

describe('Carousel structure', () => {
  it('renders every slide in a scroll-snap track with APG carousel roles and "N of M" names', () => {
    const html = render();
    const root = tag(html, /<section[^>]*>/);
    assert.match(root, /class="salmon-carousel"/);
    assert.match(root, /aria-roledescription="carousel"/);
    assert.match(root, /aria-label="Featured"/);
    assert.match(root, /data-effect="slide"/);
    assert.equal(count(html, /role="group" aria-roledescription="slide"/), 3);
    assert.match(html, /aria-label="1 of 3"[^>]*data-index="0" data-active=""/);
    assert.match(html, /aria-label="2 of 3"[^>]*data-index="1" data-position="next"/);
    assert.match(html, /Content 3/);
    const track = tag(html, /<div[^>]*class="salmon-carousel-track"[^>]*>/);
    assert.match(track, /aria-live="polite"/);
    assert.match(track, /tabindex="0"/);
  });

  it('a slide label prefixes its name; slide className, style and attributes pass through', () => {
    const html = renderToString(
      h(Carousel, { 'aria-label': 'Sale' }, h(CarouselSlide, { label: 'Spring sale', className: 'mine', style: { padding: 4 }, id: 's1' }, 'A'), h(CarouselSlide, null, 'B')),
    );
    assert.match(html, /<div style="padding:4px" id="s1" class="salmon-carousel-slide mine" role="group" aria-roledescription="slide" aria-label="Spring sale, 1 of 2"/);
    assert.match(html, /aria-label="Slide 1: Spring sale"/);
  });

  it('className, style and DOM props reach the root', () => {
    const root = tag(render({ className: 'hero', style: { maxWidth: 600 }, id: 'c1', title: 'T' }), /<section[^>]*>/);
    assert.match(root, /id="c1"/);
    assert.match(root, /title="T"/);
    assert.match(root, /class="salmon-carousel hero"/);
    assert.match(root, /style="--salmon-carousel-index:0;max-width:600px"/);
  });

  it('is deterministic and needs no DOM', () => {
    assert.equal(render({ autoPlay: true, peek: true }), render({ autoPlay: true, peek: true }));
    assert.doesNotMatch(render(), /data-ready/);
  });
});

describe('index', () => {
  it('defaultIndex selects a slide and sets the CSS offset used until mount', () => {
    const html = render({ defaultIndex: 2 });
    assert.match(html, /--salmon-carousel-index:2/);
    assert.match(html, /aria-label="3 of 3"[^>]*data-index="2" data-active=""/);
    assert.match(html, /data-index="1" data-position="previous"/);
    assert.match(html, /aria-label="Slide 3" aria-current="true"/);
  });

  it('controlled index wins over defaultIndex and is clamped to the slide count', () => {
    assert.match(render({ index: 1, defaultIndex: 2 }), /data-index="1" data-active=""/);
    assert.match(render({ index: 9 }), /data-index="2" data-active=""/);
    assert.match(render({ index: -3 }), /data-index="0" data-active=""/);
  });
});

describe('auto-play', () => {
  it('autoPlay renders the play/pause button first in the viewport and turns aria-live off', () => {
    const html = render({ autoPlay: { interval: 3000 } });
    assert.match(html, /<div class="salmon-carousel-viewport"><button type="button" class="salmon-carousel-play"[^>]*aria-label="Stop automatic slide show" data-playing=""/);
    assert.match(tag(html, /<div[^>]*class="salmon-carousel-track"[^>]*>/), /aria-live="off"/);
    assert.match(tag(html, /<section[^>]*>/), /data-playing=""/);
  });

  it('paused auto-play shows "start" and a polite live region; no autoPlay means no button', () => {
    const paused = render({ autoPlay: true, defaultPlaying: false });
    assert.match(paused, /class="salmon-carousel-play"[^>]*aria-label="Start automatic slide show"/);
    assert.match(paused, /aria-live="polite"/);
    assert.doesNotMatch(render(), /salmon-carousel-play/);
    assert.doesNotMatch(render({ playing: true }), /salmon-carousel-play/);
  });

  it('renderPlayButton replaces the button with the playing context', () => {
    const html = render({ autoPlay: true, renderPlayButton: (ctx) => h('button', { type: 'button', id: 'pp', 'aria-label': ctx.label }, ctx.playing ? 'II' : '>') });
    assert.match(html, /<button type="button" id="pp" aria-label="Stop automatic slide show">II<\/button>/);
    assert.doesNotMatch(html, /salmon-carousel-play/);
  });
});

describe('loop and buttons', () => {
  it('prev/next buttons control the track; loop={false} disables the edge button', () => {
    const html = render({ loop: false });
    const prev = tag(html, /<button[^>]*salmon-carousel-previous[^>]*>/);
    const next = tag(html, /<button[^>]*salmon-carousel-next[^>]*>/);
    assert.match(prev, /disabled=""/);
    assert.doesNotMatch(next, /disabled/);
    const id = tag(html, /class="salmon-carousel-track"[^>]*id="[^"]+"|id="[^"]+"[^>]*class="salmon-carousel-track"/).match(/id="([^"]+)"/)![1];
    assert.match(prev, new RegExp(`aria-controls="${id}"`));
    assert.match(prev, /aria-label="Previous slide"/);
    assert.match(next, /aria-label="Next slide"/);
    assert.doesNotMatch(tag(render(), /<button[^>]*salmon-carousel-previous[^>]*>/), /disabled/, 'loop (default) never disables');
    assert.match(tag(render({ loop: false, defaultIndex: 2 }), /<button[^>]*salmon-carousel-next[^>]*>/), /disabled=""/);
  });

  it('controls: hover sets the data hook, hidden removes the buttons', () => {
    assert.match(render({ controls: 'hover' }), /data-controls="hover"/);
    const hidden = render({ controls: 'hidden' });
    assert.doesNotMatch(hidden, /salmon-carousel-(previous|next)/);
    assert.match(render(), /data-controls="visible"/);
  });

  it('renderPreviousButton / renderNextButton receive { disabled, label, go }', () => {
    const html = render({
      loop: false,
      renderPreviousButton: (ctx) => h('button', { id: 'p', disabled: ctx.disabled }, ctx.label),
      renderNextButton: (ctx) => h('button', { id: 'n', disabled: ctx.disabled }, typeof ctx.go),
    });
    assert.match(html, /<button id="p" disabled="">Previous slide<\/button><button id="n">function<\/button>/);
  });

  it('a single slide renders no controls or indicators', () => {
    const html = render({ autoPlay: true }, 1);
    assert.doesNotMatch(html, /salmon-carousel-(previous|next|play|indicators)/);
  });
});

describe('effects and peek', () => {
  it('fade stacks slides: inactive ones are inert and the track is not a tab stop', () => {
    const html = render({ effect: 'fade' });
    assert.match(html, /data-effect="fade"/);
    assert.equal(count(html, /inert=""/), 2);
    assert.doesNotMatch(tag(html, /<div[^>]*class="salmon-carousel-track"[^>]*>/), /tabindex/);
    assert.equal(count(render({ effect: 'none' }), /inert/), 0);
  });

  it('peek sets data-peek; a string sets the peek width variable', () => {
    assert.match(render({ peek: true }), /data-peek=""/);
    assert.match(render({ peek: '15%' }), /style="--salmon-carousel-index:0;--salmon-carousel-peek:15%"/);
    assert.doesNotMatch(render(), /data-peek/);
  });
});

describe('indicators', () => {
  it('dots: one labelled button per slide in a named group, the selected one aria-current', () => {
    const html = render({ defaultIndex: 1 });
    assert.match(html, /<div class="salmon-carousel-indicators" data-type="dots" role="group" aria-label="Choose slide to display">/);
    assert.equal(count(html, /class="salmon-carousel-indicator"/), 3);
    assert.equal(count(html, /aria-current="true"/), 1);
    assert.match(html, /aria-label="Slide 2" aria-current="true"/);
  });

  it('dynamic sets the capped distance; fraction and progress are text and a bar', () => {
    const dyn = render({ indicators: 'dynamic', defaultIndex: 0 }, 6);
    assert.deepEqual([...dyn.matchAll(/data-distance="(\d)"/g)].map((m) => m[1]), ['0', '1', '2', '3', '3', '3']);
    assert.match(render({ indicators: 'fraction', defaultIndex: 1 }), /<div class="salmon-carousel-indicators" data-type="fraction" aria-hidden="true">2 \/ 3<\/div>/);
    assert.match(render({ indicators: 'progress', defaultIndex: 0 }, 4), /<div class="salmon-carousel-progress" style="inline-size:25%"><\/div>/);
    assert.doesNotMatch(render({ indicators: false }), /salmon-carousel-indicators/);
  });

  it('renderIndicator receives { index, selected, label, go } per slide', () => {
    const html = render({ defaultIndex: 2, renderIndicator: (ctx) => h('button', { 'data-i': ctx.index, 'aria-pressed': ctx.selected }, ctx.label) });
    assert.match(html, /<button data-i="0" aria-pressed="false">Slide 1<\/button><button data-i="1" aria-pressed="false">Slide 2<\/button><button data-i="2" aria-pressed="true">Slide 3<\/button>/);
  });
});

describe('locale', () => {
  it('localeText overrides texts; defaults are exported and frozen', () => {
    const html = render({
      autoPlay: true,
      localeText: { carousel: 'Karussell', slide: 'Folie', slideLabel: (i, n) => `${i} von ${n}`, previous: 'Zurück', next: 'Weiter', pause: 'Anhalten', indicators: 'Folien', indicator: (i) => `Folie ${i}` },
    });
    assert.match(html, /aria-roledescription="Karussell"/);
    assert.match(html, /aria-roledescription="Folie" aria-label="1 von 3"/);
    assert.match(html, /aria-label="Zurück"/);
    assert.match(html, /aria-label="Weiter"/);
    assert.match(html, /aria-label="Anhalten"/);
    assert.match(html, /aria-label="Folien"/);
    assert.match(html, /aria-label="Folie 3"/);
    assert.ok(Object.isFrozen(CAROUSEL_DEFAULT_LOCALE_TEXT));
    assert.equal(CAROUSEL_DEFAULT_LOCALE_TEXT.slideLabel(2, 5), '2 of 5');
    assert.equal(CAROUSEL_DEFAULT_LOCALE_TEXT.fraction(2, 5), '2 / 5');
  });
});
