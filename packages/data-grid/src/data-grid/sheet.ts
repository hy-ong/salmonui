'use client';

import { createContext } from 'react';

/**
 * Adaptive sheet mode of the grid overlays: while non-null, every
 * `DataGridPopover` renders as a full-screen sheet (dialogs) or a bottom sheet
 * (menus) instead of an anchored popover. Provided by `DataGrid` around its
 * overlays; the value changes only when the adaptive mode flips.
 */
export const DataGridSheetContext = createContext<{ readonly closeLabel: string } | null>(null);
