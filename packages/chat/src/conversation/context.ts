'use client';

// Contexts shared by the conversation parts. `ConversationInstance` is
// created once per root (stable identity, so parts never re-render because
// the root did); `ConversationConfig` carries the display props and changes
// only when one of them does.

import { createContext, use, useSyncExternalStore, type KeyboardEvent } from 'react';
import { rovingMove } from '@salmonui/core/internal/roving';
import type { ConversationText } from './format.js';
import type { ConversationStore } from './store.js';
import type { ConversationActionItem, ConversationAttachment, ConversationChangeReason, ConversationMessage, ConversationProps, ConversationUser } from './types.js';

export interface SendOptions {
  readonly attachments?: readonly ConversationAttachment[];
  readonly mentions?: readonly string[];
}

/** Mutable per-instance controller: DOM handles and callbacks, written in effects and handlers only. */
export interface ConversationInstance {
  readonly store: ConversationStore;
  readonly baseId: string;
  /** Latest props (written in a layout effect). */
  props: ConversationProps;
  /** Locale text of the latest render (written in a layout effect). */
  text?: ConversationText;
  root: HTMLDivElement | null;
  scroller: HTMLDivElement | null;
  composer: HTMLTextAreaElement | null;
  live: HTMLDivElement | null;
  /** Sends a message as the current user; false when cancelled or empty. */
  send(text: string, options?: SendOptions): boolean;
  stop(): void;
  /** Runs the adapter for response `id` over `history` and commits the result once. */
  respond(history: readonly ConversationMessage[], text: string, attachments: readonly ConversationAttachment[], id: string): void;
  /** The root's message setter (written in a layout effect). */
  commitRaw: ((update: (previous: readonly ConversationMessage[]) => readonly ConversationMessage[], event: { readonly reason: ConversationChangeReason }) => void) | null;
  /** Proposes a new message list. */
  commit(update: (previous: readonly ConversationMessage[]) => readonly ConversationMessage[], reason: ConversationChangeReason): void;
  scrollToBottom(behavior?: ScrollBehavior): void;
  scrollToMessage(id: string, focus?: boolean): boolean;
  announce(text: string): void;
  /** Runs a built-in or custom item action. */
  action(action: string, message: ConversationMessage): void;
  focusComposer(): void;
  /** Composer typing signal. */
  typed(): void;
  stopTyping(): void;
}

export interface ConversationConfig {
  readonly currentUser: string;
  readonly users: ReadonlyMap<string, ConversationUser>;
  readonly layout: 'bubbles' | 'compact';
  readonly timestamps: boolean;
  readonly formatTimestamp: ConversationProps['formatTimestamp'];
  readonly locale: string;
  readonly timeZone: string | undefined;
  readonly dateSeparators: boolean;
  readonly renderDateSeparator: ConversationProps['renderDateSeparator'];
  readonly renderItem: ConversationProps['renderItem'];
  readonly renderAvatar: ConversationProps['renderAvatar'];
  /** The `itemActions` prop as given (the chat items use the default unless it is an array or false). */
  readonly itemActions: ConversationProps['itemActions'];
  /** `variant="assistant"`. */
  readonly assistant: boolean;
  readonly renderContent: ConversationProps['renderContent'];
  readonly renderPending: ConversationProps['renderPending'];
  readonly renderReasoning: ConversationProps['renderReasoning'];
  readonly renderTool: ConversationProps['renderTool'];
  readonly renderAttachment: ConversationProps['renderAttachment'];
  readonly onAttachmentClick: ConversationProps['onAttachmentClick'];
  readonly hasRetry: boolean;
  readonly text: ConversationText;
}

export const ConversationInstanceContext = createContext<ConversationInstance | null>(null);
export const ConversationConfigContext = createContext<ConversationConfig | null>(null);
/** Per item: whether its controls are in the tab order (the feed's roving article). */
export const ItemTabbableContext = createContext(false);

export function useConversation(part: string): { readonly instance: ConversationInstance; readonly config: ConversationConfig } {
  const instance = use(ConversationInstanceContext);
  const config = use(ConversationConfigContext);
  if (!instance || !config) throw new Error(`${part} must be rendered inside <Conversation>.`);
  return { instance, config };
}

/** A store selection read the same way on the server and the client. */
export const useStore = <T,>(store: ConversationStore, get: () => T): T => useSyncExternalStore(store.subscribe, get, get);

export const join = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ');

/** Roving tabindex over the buttons of a toolbar element (APG Toolbar); the keys stay out of the feed. */
export function toolbarKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const toolbar = event.currentTarget;
  const move = rovingMove(event.key, { orientation: 'horizontal', rtl: toolbar.ownerDocument.defaultView?.getComputedStyle(toolbar).direction === 'rtl' });
  const items = [...toolbar.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [role="button"]')];
  const n = items.length;
  if (!move || n === 0) return;
  const at = items.indexOf(event.target as HTMLElement);
  const next = move === 'first' ? 0 : move === 'last' ? n - 1 : (at + (move === 'next' ? 1 : -1) + n) % n;
  event.preventDefault();
  event.stopPropagation();
  for (const item of items) item.tabIndex = -1;
  const target = items[next] as HTMLElement;
  target.tabIndex = 0;
  target.focus();
}
