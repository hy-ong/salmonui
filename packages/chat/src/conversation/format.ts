// Pure text helpers of the conversation (timestamps, date separators,
// initials, mention tokens, locale text). No React, no DOM globals; every
// formatter takes an explicit locale and time zone, so server and client
// output agree.

import { formatMessage } from '@salmonui/core/internal/dates/index';
import type { ConversationLocaleText, ConversationMessage, ConversationUser } from './types.js';

export const CONVERSATION_DEFAULT_LOCALE_TEXT: ConversationLocaleText = Object.freeze({
  feedLabel: 'Messages',
  composerLabel: 'Message',
  placeholder: 'Write a message',
  send: 'Send',
  stop: 'Stop',
  attach: 'Attach files',
  removeAttachment: 'Remove {name}',
  jumpToLatest: 'Jump to latest',
  unread: { one: '{count} new message', other: '{count} new messages' },
  typingOne: '{name} is typing',
  typingTwo: '{first} and {second} are typing',
  typingMany: { one: '{first} and {count} other are typing', other: '{first} and {count} others are typing' },
  newMessage: '{author}: {text}',
  responseComplete: '{author}: {text}',
  messageActions: 'Message actions',
  copy: 'Copy',
  reply: 'Reply',
  pin: 'Pin',
  unpin: 'Unpin',
  delete: 'Delete',
  replyingTo: 'Replying to {author}',
  cancelReply: 'Cancel reply',
  pinned: 'Pinned',
  forwarded: 'Forwarded',
  status_sending: 'Sending',
  status_sent: 'Sent',
  status_delivered: 'Delivered',
  status_read: 'Read',
  status_error: 'Not sent',
  retry: 'Retry',
  loadingOlder: 'Loading older messages',
  suggestionsLabel: 'Suggestions',
  clear: 'Clear',
});

export type ConversationText = (key: keyof ConversationLocaleText, params?: Readonly<Record<string, string | number>>) => string;

export function createText(overrides: Partial<ConversationLocaleText> | undefined, locale: string): ConversationText {
  return (key, params) => formatMessage(overrides?.[key] ?? (CONVERSATION_DEFAULT_LOCALE_TEXT as Partial<ConversationLocaleText>)[key], params, locale);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached `Intl.DateTimeFormat`; falls back to `en-US` / UTC on invalid input. */
export function dateFormatter(locale: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? ''}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    }
    if (formatters.size > 64) formatters.clear();
    formatters.set(key, f);
  }
  return f;
}

export const DEFAULT_TIME_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ hour: 'numeric', minute: '2-digit' });
export const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ year: 'numeric', month: 'long', day: 'numeric' });

/** The message date, or null when absent or invalid. */
export function messageDate(message: ConversationMessage): Date | null {
  const v = message.createdAt;
  if (v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar day key of `date` in `timeZone` (`YYYY-MM-DD`). */
export function dayKey(date: Date, timeZone: string | undefined): string {
  const parts = dateFormatter('en-US', timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whether a date separator goes before `message` (first message, or a new day). */
export function startsNewDay(message: ConversationMessage, previous: ConversationMessage | undefined, timeZone: string | undefined): boolean {
  const d = messageDate(message);
  if (!d) return false;
  const p = previous ? messageDate(previous) : null;
  return !p || dayKey(p, timeZone) !== dayKey(d, timeZone);
}

/** One or two initials of a name (avatar fallback). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...(words[0] as string)][0] ?? '';
  const last = words.length > 1 ? ([...(words[words.length - 1] as string)][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Typing indicator text for user names. */
export function typingText(text: ConversationText, names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return text('typingOne', { name: names[0] as string });
  if (names.length === 2) return text('typingTwo', { first: names[0] as string, second: names[1] as string });
  return text('typingMany', { first: names[0] as string, count: names.length - 1 });
}

export type TextSegment = { readonly text: string; readonly mention?: string };

/**
 * Splits `text` into plain runs and mention tokens: an occurrence of
 * `@Name` for each mentioned user id, with any single-character trigger
 * that is not a letter, a digit or a space before the name (every Composer
 * `mentions[].trigger`, not only `@` and `#`). Never produces markup; the
 * caller renders text nodes.
 */
export function mentionSegments(text: string, mentions: readonly string[] | undefined, userOf: (id: string) => ConversationUser | undefined): readonly TextSegment[] {
  if (!mentions?.length) return [{ text }];
  const names = mentions
    .map((id) => ({ id, name: userOf(id)?.name ?? id }))
    .filter((m) => m.name !== '')
    .sort((a, b) => b.name.length - a.name.length);
  const out: TextSegment[] = [];
  let i = 0;
  let run = 0;
  while (i < text.length) {
    // Names are non-empty, so a trigger at the end of the text never matches.
    const hit = /[^\p{L}\p{N}\s]/u.test(text[i] as string) && names.find((m) => text.startsWith(m.name, i + 1));
    if (hit) {
      if (i > run) out.push({ text: text.slice(run, i) });
      run = i + 1 + hit.name.length;
      out.push({ text: text.slice(i, run), mention: hit.id });
      i = run;
    } else i++;
  }
  if (run < text.length) out.push({ text: text.slice(run) });
  return out;
}

/** File size for attachment chips (`1.2 MB`). */
export function formatSize(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: u === 0 ? 0 : 1 }).format(v)} ${units[u]}`;
}
