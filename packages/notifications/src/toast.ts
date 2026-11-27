'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// @salmonui/notifications/toast: `Toaster`, the queue
// factory and `useToast()`. Render-safe: the server renders the empty
// labelled region; toasts, timers and top-layer promotion are client-only.
export { Toaster, useToast } from './toast/Toaster.js';
export type { ToasterLocaleText, ToasterProps, ToastPlacement } from './toast/Toaster.js';
export { createToastQueue } from './internal/toast-queue.js';
export type { ToastAction, ToastBeforeCloseEvent, ToastCloseEvent, ToastCloseReason, ToastOptions, ToastQueue, ToastQueueOptions, ToastQueueSnapshot, ToastState, ToastTone } from './internal/toast-queue.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/notifications/toast', 'salmon-toast');
