'use client';

import { useRef, useState } from 'react';
import { PdfViewer, type PdfViewerActions } from '@salmonui/pdf-viewer';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/buttons/button/styles.css'; // the viewer stylesheet does not carry the Button rules
import '@salmonui/pdf-viewer/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PAGE_SIZES = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
  { width: 420, height: 595 },
];

const PAGES = [1, 2, 3];

const ES_TEXT = {
  label: 'Documento PDF',
  toolbar: 'Herramientas PDF',
  pageLabel: 'Página {page} de {count}',
  pageNumber: 'Página',
  pageOf: 'de {count}',
  previous: 'Página anterior',
  next: 'Página siguiente',
  zoomIn: 'Acercar',
  zoomOut: 'Alejar',
  zoom: 'Zoom',
  search: 'Buscar',
  print: 'Imprimir',
  download: 'Descargar',
  sidebar: 'Panel lateral',
  more: 'Más herramientas',
};

export default function PdfViewerApiDemo() {
  const [log, push] = useEventLog();
  const [page, setPage] = useState(1);
  const [selectable, setSelectable] = useState(true);
  const [blockPrint, setBlockPrint] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [spanish, setSpanish] = useState(false);
  const actions = useRef<PdfViewerActions | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="group" aria-label="Options" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label>
          Page{' '}
          <Select aria-label="Page" data={PAGES} value={page} onValueChange={(value) => value != null && setPage(Number(value))} />
        </label>
        <Checkbox checked={selectable} onCheckedChange={(checked) => setSelectable(checked)}>
          textSelection
        </Checkbox>
        <Checkbox checked={blockPrint} onCheckedChange={(checked) => setBlockPrint(checked)}>
          Cancel printing (onBeforePrint)
        </Checkbox>
        <Checkbox checked={narrow} onCheckedChange={(checked) => setNarrow(checked)}>
          Phone width (360 px)
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
        <Checkbox checked={spanish} onCheckedChange={(checked) => setSpanish(checked)}>
          Spanish labels
        </Checkbox>
      </div>
      <div role="group" aria-label="Viewer actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" onClick={() => actions.current?.goToPage(3)}>
          goToPage(3)
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const result = await actions.current?.search('salmon');
            if (result) push(`search('salmon'): ${result.total} matches`);
          }}
        >
          search(&apos;salmon&apos;)
        </Button>
        <Button variant="outline" onClick={() => actions.current?.findNext()}>
          findNext()
        </Button>
        <Button variant="outline" onClick={() => actions.current?.setZoom(1.5)}>
          setZoom(1.5)
        </Button>
        <Button variant="outline" onClick={async () => push(`print(): ${String(await actions.current?.print())}`)}>
          print()
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const blob = await actions.current?.save();
            if (blob) push(`save(): ${blob.size} bytes`);
          }}
        >
          save()
        </Button>
        <Button variant="outline" onClick={() => push(`getState(): ${JSON.stringify(actions.current?.getState())}`)}>
          getState()
        </Button>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ inlineSize: narrow ? 360 : '100%', maxInlineSize: '100%' }}>
        <PdfViewer
          src="/sample.pdf"
          aria-label="Sample document"
          pageSizes={PAGE_SIZES}
          defaultZoom="page-width"
          defaultSidebar="outline"
          actionsRef={actions}
          page={page}
          onPageChange={(next, event) => {
            setPage(next);
            push(`onPageChange: ${next} (${event.source})`);
          }}
          onZoomChange={(zoom, event) => push(`onZoomChange: ${typeof zoom === 'number' ? `${Math.round(zoom * 100)}%` : zoom} (${event.source})`)}
          onSidebarChange={(sidebar) => push(`onSidebarChange: ${sidebar ?? 'closed'}`)}
          onLoad={(info) => push(`onLoad: ${info.pageCount} pages, ${info.outline.length} bookmarks`)}
          onSearchResult={(result) => push(`onSearchResult: "${result.query}" ${result.current} of ${result.total}`)}
          textSelection={selectable}
          linkTarget="_blank"
          onLinkClick={(event) => {
            if (event.url) {
              event.preventDefault();
              push(`onLinkClick: external ${event.url} (blocked in the demo)`);
            } else push(`onLinkClick: page ${event.page}`);
          }}
          onBeforePrint={(event) => {
            if (blockPrint) {
              event.preventDefault();
              push('onBeforePrint: cancelled');
            } else push('onBeforePrint');
          }}
          localeText={spanish ? ES_TEXT : undefined}
          styles={{ viewport: { background: 'var(--salmon-surface-sunken)' } }}
          style={{ height: 520 }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}
