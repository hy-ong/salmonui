'use client';

import { useRef, useState } from 'react';
import { PdfViewer, type PdfFormValues, type PdfTextMarkupAnnotation, type PdfViewerActions } from '@salmonui/pdf-viewer';
import '@salmonui/buttons/button/styles.css'; // the viewer stylesheet does not carry the Button rules
import '@salmonui/pdf-viewer/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

// A three-page sample with an outline, links and a form (public/sample.pdf). pageSizes lets the
// server render sized placeholders before pdf.js loads in the browser.
const PAGE_SIZES = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
  { width: 420, height: 595 },
];

export default function PdfViewerDemo() {
  const [log, push] = useEventLog();
  const [annotations, setAnnotations] = useState<readonly PdfTextMarkupAnnotation[]>([]);
  const [formValues, setFormValues] = useState<PdfFormValues>({});
  const actions = useRef<PdfViewerActions | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PdfViewer
        src="/sample.pdf"
        aria-label="Sample document"
        pageSizes={PAGE_SIZES}
        defaultZoom="page-width"
        defaultSidebar="outline"
        actionsRef={actions}
        annotations={annotations}
        annotationAuthor="Demo user"
        onAnnotationsChange={(list, event) => {
          setAnnotations(list);
          push(`annotation ${event.reason}: ${event.annotation.kind} on page ${event.annotation.page}`);
        }}
        formValues={formValues}
        onFormValuesChange={(values, event) => {
          setFormValues(values);
          push(`form: ${event.name} = ${JSON.stringify(values[event.name])}`);
        }}
        onLoad={(info) => push(`loaded ${info.pageCount} pages`)}
        onPageChange={(page, event) => push(`page ${page} (${event.source})`)}
        onZoomChange={(zoom, event) => push(`zoom ${typeof zoom === 'number' ? `${Math.round(zoom * 100)}%` : zoom} (${event.source})`)}
        onSearchResult={(result) => push(`find "${result.query}": ${result.total} matches`)}
        onLinkClick={(event) => {
          if (event.url) {
            event.preventDefault();
            push(`external link blocked in the demo: ${event.url}`);
          }
        }}
        fileName="sample-annotated.pdf"
        style={{ height: 560 }}
      />
      <EventLog entries={log} />
    </div>
  );
}
