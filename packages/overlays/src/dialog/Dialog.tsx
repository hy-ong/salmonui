'use client';

// Dialog: the dialog core with the lazy drag and resize
// chunk. Kept out of `dialog-core/` so `/drawer`, which composes the core,
// never bundles the chunk.

import type { ReactElement } from 'react';
import { DialogRoot, PARTS, type DialogParts, type DialogProps, type RootProps } from '@salmonui/core/internal/dialog-core/Dialog';
import { useLocaleText } from '@salmonui/core/internal/locale';

const loadDrag = (): Promise<typeof import('@salmonui/core/internal/dialog-core/drag')> => import('@salmonui/core/internal/dialog-core/drag');

/** @internal The dialog core of `Dialog` and `AlertDialog`: the lazy drag and resize chunk and the `dialog` family's text. */
export function DialogBase(props: RootProps): ReactElement {
  // One `dialog` family for Dialog, AlertDialog and Drawer (the close button, drag and resize text).
  const localeText = useLocaleText('dialog', props.localeText);
  return <DialogRoot {...props} localeText={localeText} loadDrag={loadDrag} />;
}

/** Dialog root: the open state, the trigger and the `<dialog>` (`.salmon-dialog`). */
export function Dialog(props: DialogProps): ReactElement {
  return <DialogBase {...props} kind="dialog" />;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Dialog {
  export const Trigger: DialogParts['Trigger'];
  export const Close: DialogParts['Close'];
  export const Title: DialogParts['Title'];
  export const Description: DialogParts['Description'];
  export const Body: DialogParts['Body'];
  export const Footer: DialogParts['Footer'];
}
Object.assign(Dialog, PARTS);
