// Overlay anchors, shared by the always-loaded chrome and the lazy overlay
// code (popover.tsx), so importing them never pulls the popover into the
// default bundle. They are the shared internal positioning primitive.

export { pointRect, rectOf, type AnchorRect } from '@salmonui/core/internal/position';
