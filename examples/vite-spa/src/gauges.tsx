// Gauge, Barcode, QRCode, Pdf417, Gs1DataBar, DotCode and GeoMap browser page
// (tests/browser/gauges.spec.ts, gauges-a11y.spec.ts):
//
//   ?dir=rtl  ?scheme=dark
//   ?hydrate               server-renders the page with react-dom/server, then hydrates it
//
// window.__viz records events and holds the instance APIs.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/charts/gauge/styles.css';
import '@salmonui/charts/barcode/styles.css';
import '@salmonui/charts/geo-map/styles.css';
import '@salmonui/charts/viz-animations.css';
import '@salmonui/charts/viz-rtl.css';
import { Gauge, type GaugeApi } from '@salmonui/charts/gauge';
import { Barcode, QRCode, type BarcodeApi } from '@salmonui/charts/barcode';
import { DotCode } from '@salmonui/charts/barcode/dotcode';
import { Gs1DataBar } from '@salmonui/charts/barcode/gs1-databar';
import { Pdf417 } from '@salmonui/charts/barcode/pdf417';
import { GeoMap, type GeoMapApi, type GeoMapView } from '@salmonui/charts/geo-map';
import { ThemeProvider } from '@salmonui/core/theme';
import { CITIES, POPULATION, REGIONS, SEATS } from './geo-fixture.ts';

interface VizLog {
  events: { case: string; type: string; value: unknown; source?: string; reason?: string }[];
  apis: Record<string, GaugeApi | BarcodeApi | GeoMapApi | null>;
  invalid: string[];
}
const log: VizLog = { events: [], apis: {}, invalid: [] };
(window as unknown as { __viz: VizLog }).__viz = log;

const params = new URLSearchParams(location.search);
const ranges = [
  { id: 'normal', from: 0, to: 60, color: '#2e7d32', label: 'Normal' },
  { id: 'high', from: 60, to: 85, color: '#b26a00', label: 'High' },
  { id: 'critical', from: 85, to: 100, color: '#c62828', label: 'Critical' },
];

function Section(props: { id: string; title: string; children: ReactNode }): ReactNode {
  return (
    <section data-case={props.id} style={{ display: 'inline-block', verticalAlign: 'top', inlineSize: 320, margin: 8 }}>
      <h2 style={{ fontSize: 14 }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

function ControlledGauge(): ReactNode {
  const [value, setValue] = useState(30);
  return (
    <>
      <Gauge
        title="Volume"
        axes={[{ ranges: [{ id: 'loud', from: 80, to: 100, label: 'Loud' }] }]}
        pointers={[{ id: 'volume', value, draggable: true, label: 'Volume', step: 5 }]}
        onPointerValueChange={(c, e) => {
          setValue(c.value);
          log.events.push({ case: 'controlled', type: 'change', value: c.value, source: e.source, reason: e.reason });
        }}
        onPointerValueCommit={(c, e) => log.events.push({ case: 'controlled', type: 'commit', value: c.value, source: e.source, reason: e.reason })}
        ref={(api) => {
          log.apis['controlled'] = api;
        }}
      />
      <output id="controlled-value">{value}</output>
    </>
  );
}

function RangeGauge(): ReactNode {
  const [band, setBand] = useState({ from: 40, to: 70 });
  return (
    <>
      <Gauge
        title="Comfort"
        animated={false}
        axes={[{ ranges: [{ id: 'band', ...band, label: 'Comfort band', draggable: true, step: 5, color: '#2e7d32' }] }]}
        onRangeChange={(c, e) => {
          setBand({ from: c.from, to: c.to });
          log.events.push({ case: 'ranges', type: 'range', value: [c.rangeId, c.from, c.to], source: e.source, reason: e.reason });
        }}
      />
      <output id="ranges-value">{`${band.from}-${band.to}`}</output>
    </>
  );
}

function AnimatedGauge(): ReactNode {
  const [value, setValue] = useState(20);
  return (
    <>
      <Gauge
        title="Load"
        axes={[{ annotations: [{ id: 'note', angle: 180, radius: 0.45, content: <span>Peak</span>, label: 'Peak load since restart' }] }]}
        pointers={[{ id: 'load', value, label: 'Load' }]}
        tooltip={{ targets: ['annotation'] }}
      />
      <button type="button" id="animated-set" onClick={() => setValue((v) => (v === 20 ? 90 : 20))}>
        Toggle load
      </button>
    </>
  );
}

function Maps(): ReactNode {
  const [view, setView] = useState<GeoMapView | undefined>(undefined);
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <>
      <Section id="map" title="Choropleth map">
        <GeoMap
          title="Population"
          width={480}
          height={360}
          layers={[
            {
              shapes: REGIONS,
              data: POPULATION,
              dataKey: 'region',
              colorScale: { kind: 'range', field: 'population', stops: [{ from: 0, to: 20, color: '#4292c6', label: 'Low' }, { from: 20, to: 40, color: '#2171b5', label: 'Mid' }, { from: 40, to: 100, color: '#08519c', label: 'High' }] },
              labels: { overflow: 'hide' },
              markers: { id: 'cities', data: CITIES, labelField: 'name', cluster: true },
              routes: [{ points: [[55, -4], [45, 6], [36, 14]], curvature: 0.2, arrows: 'end' }],
            },
          ]}
          legend
          tooltip
          zoom
          view={view}
          onViewChange={(v, e) => {
            setView(v);
            log.events.push({ case: 'map', type: 'view', value: v, source: e.source, reason: e.reason });
          }}
          selectedShapes={selected}
          onSelectedShapesChange={(keys, e) => {
            setSelected(keys);
            log.events.push({ case: 'map', type: 'select', value: keys, source: e.source, reason: e.reason });
          }}
          onMarkerClick={(c) => log.events.push({ case: 'map', type: 'marker', value: (c.datum as { name: string }).name })}
          onClusterClick={(c) => log.events.push({ case: 'map', type: 'cluster', value: c.count })}
          onMapClick={(p) => log.events.push({ case: 'map', type: 'click', value: p })}
          ref={(api) => {
            log.apis['map'] = api;
          }}
        />
        <output id="map-view">{view ? `${view.center.join(',')}@${view.zoom}` : 'fit'}</output>
      </Section>
      <Section id="tiles" title="Tile layer">
        <GeoMap
          title="Tiles"
          width={480}
          height={300}
          zoom
          layers={[{ shapes: REGIONS, color: 'transparent', tiles: { url: 'https://tiles.test/{z}/{x}/{y}.png', attribution: <a href="https://example.org/copyright">© Example tiles</a> } }]}
        />
      </Section>
      <Section id="seats" title="Planar seat map">
        <GeoMap title="Seats" width={360} height={160} selection={{ multiple: true }} defaultSelectedShapes={['Seat A1']} layers={[{ shapes: SEATS, geometry: 'planar', labels: true }]} onSelectedShapesChange={(keys, e) => log.events.push({ case: 'seats', type: 'select', value: keys, source: e.source })} />
      </Section>
    </>
  );
}

const STOPS = [
  { name: 'Stop 1', latitude: 48, longitude: 2 },
  { name: 'Stop 2', latitude: 48.1, longitude: 2.1 },
  { name: 'Stop 3', latitude: 47.9, longitude: 2.05 },
  { name: 'Stop 4', latitude: 48.05, longitude: 1.9 },
];

function EditableMap(): ReactNode {
  const [pins, setPins] = useState([
    { name: 'Depot', latitude: 52, longitude: -2 },
    { name: 'Port', latitude: 40, longitude: 12 },
  ]);
  return (
    <GeoMap
      title="Editor"
      width={480}
      height={300}
      zoom={{ selection: true }}
      legend={{ source: 'markers', position: 'start', mode: 'list' }}
      layers={[
        {
          shapes: REGIONS,
          markers: [
            { id: 'pins', label: 'Pins', data: pins, labelField: 'name', draggable: true, shape: 'balloon', size: 16 },
            { id: 'stops', label: 'Stops', data: STOPS, labelField: 'name', color: '#b26a00', cluster: { expand: 'spider' } },
          ],
        },
      ]}
      onMarkerMove={(m, e) => {
        setPins((list) => list.map((p, i) => (i === m.index ? { ...p, latitude: m.latitude, longitude: m.longitude } : p)));
        log.events.push({ case: 'editor', type: 'move', value: [m.markerId, m.latitude, m.longitude], source: e.source, reason: e.reason });
      }}
      onViewChange={(v, e) => log.events.push({ case: 'editor', type: 'view', value: v, source: e.source, reason: e.reason })}
      onClusterClick={(c) => log.events.push({ case: 'editor', type: 'cluster', value: c.count })}
    />
  );
}

function Page(): ReactNode {
  const tooltipRef = useRef<GaugeApi | null>(null);
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 16 }}>
        <h1>Gauges and barcodes</h1>
        <Section id="speed" title="Read-only circular gauge">
          <Gauge
            title="Speed"
            axes={[{ ranges, ticks: { minor: 5 } }]}
            pointers={[{ id: 'speed', value: 72, label: 'Speed', valueText: (v) => `${v} km/h` }]}
            legend
            tooltip
            onHiddenRangesChange={(ids, e) => log.events.push({ case: 'speed', type: 'hidden', value: ids, source: e.source, reason: e.reason })}
            ref={(api) => {
              tooltipRef.current = api;
              log.apis['speed'] = api;
            }}
          />
        </Section>
        <Section id="controlled" title="Controlled draggable needle">
          <ControlledGauge />
        </Section>
        <Section id="uncontrolled" title="Uncontrolled linear slider">
          <Gauge
            shape="linear"
            title="Temperature"
            axes={[{ min: -10, max: 40 }]}
            pointers={[{ id: 'temp', type: 'marker', defaultValue: 20, draggable: true, label: 'Temperature' }, { id: 'level', value: 12, label: 'Current' }]}
            onPointerValueCommit={(c, e) => log.events.push({ case: 'uncontrolled', type: 'commit', value: c.value, source: e.source, reason: e.reason })}
          />
        </Section>
        <Section id="thermometer" title="Vertical thermometer">
          <Gauge shape="linear" orientation="vertical" container="thermometer" title="Room" axes={[{ min: -10, max: 40 }]} pointers={[{ value: 22, label: 'Room temperature' }]} />
        </Section>
        <Section id="barcode" title="Barcodes">
          <Barcode
            type="code128"
            value="SALMON-0001"
            ref={(api) => {
              log.apis['barcode'] = api;
            }}
          />
          <Barcode type="ean13" value="590123412345" />
          <Barcode type="itf14" value="1540014128876" moduleSize={1} />
          <Barcode type="dataMatrix" value="Salmon UI" />
          <Barcode type="ean13" value="ABC" onInvalid={(e) => log.invalid.push(e.reason)} />
        </Section>
        <Section id="stacked" title="PDF417, GS1 DataBar and DotCode">
          <Pdf417
            value="PDF417 Symbology Standard"
            errorCorrection={1}
            columns={2}
            ref={(api) => {
              log.apis['pdf417'] = api;
            }}
          />
          <Gs1DataBar value="0950110153000" />
          <Gs1DataBar variant="expandedStacked" value="(01)98898765432106(3202)012345(15)991231" />
          <DotCode value="(17)070620(10)ABC123456" gs1 />
          <Pdf417 value="" onInvalid={(e) => log.invalid.push(`pdf417: ${e.reason}`)} />
        </Section>
        <Maps />
        <Section id="ranges" title="Draggable range">
          <RangeGauge />
        </Section>
        <Section id="animated" title="Animated pointer and annotation tooltip">
          <AnimatedGauge />
        </Section>
        <Section id="qr" title="QR code">
          <QRCode
            value="https://salmonui.dev/docs/data-visualization/qr-code"
            ref={(api) => {
              log.apis['qr'] = api;
            }}
          />
        </Section>
        <Section id="editor" title="Draggable markers, spider clusters, selection zoom">
          <EditableMap />
        </Section>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(<Page />);
  hydrateRoot(root, <Page />, { onRecoverableError: (error) => console.error('recoverable', error) });
  (window as unknown as { __hydrated: boolean }).__hydrated = true;
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
