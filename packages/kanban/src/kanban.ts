'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/kanban`: Kanban.
// Self-contained: internal modules only (virtual list, dnd math, live region,
// controllable state); drag and drop and the card editor are lazy chunks.
export { Kanban, KanbanColumn } from './kanban/Kanban.js';
export { KANBAN_DEFAULT_LOCALE_TEXT } from './kanban/locale.js';
export type { KanbanLocaleText } from './kanban/locale.js';
export type {
  KanbanApi,
  KanbanCancelableEvent,
  KanbanCardAddEvent,
  KanbanCardChangeEvent,
  KanbanCardClickEvent,
  KanbanCardContext,
  KanbanCardFields,
  KanbanCardMoveEvent,
  KanbanCardProps,
  KanbanCellRef,
  KanbanChangeDetails,
  KanbanColumnContext,
  KanbanColumnDef,
  KanbanColumnGroup,
  KanbanColumnProps,
  KanbanDataSource,
  KanbanDropTarget,
  KanbanEditing,
  KanbanEditorContext,
  KanbanEditorField,
  KanbanEventSource,
  KanbanExternalDropEvent,
  KanbanKey,
  KanbanLimitState,
  KanbanProps,
  KanbanQuery,
  KanbanSort,
  KanbanSwimlaneContext,
  KanbanSwimlaneDef,
  KanbanSwimlanes,
  KanbanTooltip,
} from './kanban/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/kanban', 'salmon-kanban');
