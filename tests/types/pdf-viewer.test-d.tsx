// Type contract of `@salmonui/pdf-viewer` PdfViewer ( sources,
// toolbar items zoom annotations actions).
import { useRef } from 'react';
import { PdfViewer, type PdfTextMarkupAnnotation, type PdfViewerActions, type PdfViewerSearchResult, type PdfViewerToolbarItem, type PdfViewerZoom } from '@salmonui/pdf-viewer';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

const toolbar: readonly PdfViewerToolbarItem[] = ['previous', 'next', '|', 'zoom', '-', { id: 'stamp', label: 'Stamp', onSelect: (actions) => void actions.goToPage(1) }];

export function Examples() {
  const actions = useRef<PdfViewerActions | null>(null);
  return (
    <>
      <PdfViewer src="/a.pdf" toolbar={toolbar} actionsRef={actions} zoom="page-width" onZoomChange={(zoom, event) => {
        expectType<Equal<typeof zoom, PdfViewerZoom>>(true);
        expectType<Equal<typeof event.scale, number>>(true);
      }} />
      <PdfViewer src={new Uint8Array(1)} pageSizes={{ width: 612, height: 792 }} pageCount={3} />
      <PdfViewer src={new Blob()} onAnnotationsChange={(list) => expectType<Equal<typeof list, readonly PdfTextMarkupAnnotation[]>>(true)} />
      <PdfViewer src={new ArrayBuffer(1)} onPasswordRequired={(request) => request.submit('x')} formValues={{ name: 'Ada', agree: true, tags: ['a'] }} />
      {/* @ts-expect-error unknown built-in toolbar id */}
      <PdfViewer toolbar={['rotate']} />
      {/* @ts-expect-error zoom takes a number or a fit mode */}
      <PdfViewer zoom="fit" />
    </>
  );
}

declare const api: PdfViewerActions;
expectType<Equal<ReturnType<PdfViewerActions['save']>, Promise<Blob>>>(true);
expectType<Equal<Awaited<ReturnType<typeof api.search>>, PdfViewerSearchResult>>(true);
