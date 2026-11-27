// Field access shared by the visualization families: plain records
// read by field name, with dotted paths (`'price.close'`). Implemented once
// in `#viz` (viz/field.ts) so `/sparkline` can use it without internal/viz.

export { readField } from '#viz';
