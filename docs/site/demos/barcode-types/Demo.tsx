'use client';

import { Barcode } from '@salmonui/charts/barcode';

const cell = { display: 'grid', gap: 4, justifyItems: 'start' } as const;

// One symbol per family of symbologies.
export default function BarcodeTypesDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 }}>
      <div style={cell}>
        <span>Code 128</span>
        <Barcode type="code128" value="SALMON-0042" />
      </div>
      <div style={cell}>
        <span>EAN-13</span>
        <Barcode type="ean13" value="590123412345" />
      </div>
      <div style={cell}>
        <span>UPC-E</span>
        <Barcode type="upcE" value="0123456" />
      </div>
      <div style={cell}>
        <span>ITF-14 with bearer bars</span>
        <Barcode type="itf14" value="1540014128876" moduleSize={1.5} />
      </div>
      <div style={cell}>
        <span>Code 39 with a check character</span>
        <Barcode type="code39" value="SALMON" checksum textAlign="start" />
      </div>
      <div style={cell}>
        <span>GS1-128</span>
        <Barcode type="gs1Code128" value="(01)09501101530003(10)AB-123" moduleSize={1.5} />
      </div>
      <div style={cell}>
        <span>Data Matrix</span>
        <Barcode type="dataMatrix" value="https://salmonui.dev" moduleSize={4} />
      </div>
    </div>
  );
}
