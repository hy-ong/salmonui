// Locale families of @salmonui/core (see ../locale-coverage.test.mjs): the
// shared form field validation messages (read by every @salmonui/inputs
// field through `useField`) and the dialog core text (Dialog, AlertDialog
// and Drawer of @salmonui/overlays).
export default {
  validation: { defaults: [{ module: 'packages/core/dist/validation.js', export: 'DEFAULT_VALIDATION_MESSAGES', prefix: 'validation' }] },
  dialog: { keys: ['close', 'moved', 'resized', 'resize', 'resizeEdge'] },
};
