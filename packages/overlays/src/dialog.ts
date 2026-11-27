'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/overlays/dialog`: Dialog and its parts, AlertDialog,
// DialogProvider, useConfirm and useAlert. Dialog
// lives in the dialog core (`dialog-core/`), shared with `/drawer`. Render-safe: a closed
// dialog renders nothing; drag and resize are a lazy chunk. AlertDialog
// composes `Button` from `@salmonui/buttons/button`.
export { Dialog } from './dialog/Dialog.js';
export { DialogTrigger, DialogClose, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@salmonui/core/internal/dialog-core/Dialog';
export type {
  DialogProps,
  DialogTriggerProps,
  DialogTriggerRenderProps,
  DialogOpenChangeEvent,
  DialogOpenChangeReason,
  DialogPosition,
  DialogSize,
  DialogResizeEdge,
  DialogLocaleText,
  DialogPart,
} from '@salmonui/core/internal/dialog-core/Dialog';
export { AlertDialog, DialogProvider, useConfirm, useAlert } from './dialog/AlertDialog.js';
export type { AlertDialogProps, AlertDialogLocaleText, ConfirmOptions } from './dialog/AlertDialog.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/overlays/dialog', 'salmon-dialog');
