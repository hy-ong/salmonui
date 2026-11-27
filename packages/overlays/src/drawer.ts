'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/overlays/drawer`: Drawer (the Navigation
// category's Sidebar overlay mode renders it). Render-safe: a closed drawer
// renders only its trigger. Composes the dialog core (`dialog-core/`); its
// stylesheet carries the dialog core and drawer rules.
export { Drawer } from './drawer/Drawer.js';
export type { DrawerProps } from './drawer/Drawer.js';
export { DialogTrigger as DrawerTrigger, DialogClose as DrawerClose, DialogTitle as DrawerTitle, DialogDescription as DrawerDescription, DialogBody as DrawerBody, DialogFooter as DrawerFooter } from '@salmonui/core/internal/dialog-core/Dialog';
export type { DialogOpenChangeEvent as DrawerOpenChangeEvent, DialogOpenChangeReason as DrawerOpenChangeReason } from '@salmonui/core/internal/dialog-core/Dialog';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/overlays/drawer', 'salmon-drawer');
