// Carousel browser page (tests/browser/carousel.spec.ts, carousel-a11y.spec.ts):
//
//   ?effect=fade|none      ?loop=0        ?peek          ?controls=hover|hidden
//   ?indicators=dynamic|fraction|progress|none           ?index=<n> (defaultIndex)
//   ?autoPlay=<ms>         auto-play with that interval; ?hoverPause=0 turns pauseOnHover off
//   ?veto                  onBeforeIndexChange cancels moving to slide 3 (index 2)
//   ?controlled            `index` is controlled; window.__setIndex(n); ?frozen ignores proposals
//   ?n=<count>             slide count (default 5)
//   ?dir=rtl  ?scheme=dark
//   ?hydrate               server-renders the page with react-dom/server, then hydrates it
//
// window.__carousel records { changes, before, playing }; window.__api is the CarouselApi.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/navigation/carousel/styles.css';
import { Carousel, CarouselSlide, type CarouselApi, type CarouselEffect, type CarouselIndicators, type CarouselProps } from '@salmonui/navigation/carousel';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') ?? 5);
const COLORS = ['#fde2e4', '#e2ece9', '#dfe7fd', '#fff1e6', '#eae4e9', '#e8f3d6', '#f0efeb', '#d8e2dc'];

const log = {
  changes: [] as { index: number; previousIndex: number; source: string }[],
  before: [] as { index: number; source: string }[],
  playing: [] as { playing: boolean; source: string }[],
};
const win = window as unknown as { __carousel: typeof log; __api: CarouselApi | null; __setIndex?: (i: number) => void };
win.__carousel = log;

function Page(): ReactNode {
  const api = useRef<CarouselApi | null>(null);
  const [index, setIndex] = useState(Number(params.get('index') ?? 0));
  win.__setIndex = setIndex;
  const auto = params.get('autoPlay');
  const indicators = params.get('indicators');
  const props: CarouselProps = {
    'aria-label': 'Highlights',
    className: 'demo-carousel',
    style: { maxInlineSize: 560 },
    effect: (params.get('effect') ?? 'slide') as CarouselEffect,
    loop: params.get('loop') !== '0',
    peek: params.has('peek'),
    controls: (params.get('controls') ?? 'visible') as CarouselProps['controls'],
    indicators: indicators === 'none' ? false : ((indicators ?? 'dots') as CarouselIndicators),
    autoPlay: auto ? { interval: Number(auto), pauseOnHover: params.get('hoverPause') !== '0' } : false,
    onIndexChange: (i, e) => {
      log.changes.push({ index: e.index, previousIndex: e.previousIndex, source: e.source });
      if (params.has('controlled') && !params.has('frozen')) setIndex(i);
    },
    onBeforeIndexChange: (e) => {
      log.before.push({ index: e.index, source: e.source });
      if (params.has('veto') && e.index === 2) e.preventDefault();
    },
    onPlayingChange: (playing, e) => log.playing.push({ playing, source: e.source }),
    ref: (instance: CarouselApi | null) => {
      api.current = instance;
      win.__api = instance;
    },
  };
  if (params.has('controlled')) props.index = index;
  else props.defaultIndex = Number(params.get('index') ?? 0);
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24 }}>
        <h1>Carousel</h1>
        <button type="button" id="before">
          Before
        </button>
        <div data-salmon-a11y-root="">
          <Carousel {...props}>
            {Array.from({ length: n }, (_, i) => (
              <CarouselSlide key={i} label={`Story ${i + 1}`} className="demo-slide" style={{ blockSize: 180, display: 'grid', placeItems: 'center', background: COLORS[i % COLORS.length], color: '#1f2328' }}>
                <p>
                  Slide {i + 1} <a href={`?story=${i + 1}`} style={{ color: 'inherit' }}>
                    Read story {i + 1}
                  </a>
                </p>
              </CarouselSlide>
            ))}
          </Carousel>
        </div>
        <button type="button" id="after">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(<Page />);
  (window as unknown as { __ssrHtml: string }).__ssrHtml = root.innerHTML;
  hydrateRoot(root, <Page />, { onRecoverableError: (error) => console.error('recoverable', error) });
  (window as unknown as { __hydrated: boolean }).__hydrated = true;
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
