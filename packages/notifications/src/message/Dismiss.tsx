'use client';

// The Message close button: the only client code
// of `@salmonui/notifications/message`, a "use client" island so the message body
// stays server-renderable. A plain native button (not `Button`) keeps the
// subpath inside its 0.75 KB budget; Enter and Space activate it natively.
// The island also reads the LocaleProvider (`message` family), which a
// server component cannot; it reads the context directly, like
// `useLocaleText`, because the hook wrapper costs bytes this budget lacks.
import type { MouseEvent, ReactElement } from 'react';
import { use } from 'react';
import { LocaleContext } from '@salmonui/core/internal/locale';
import type { MessageLocaleText } from './Message.js';

/** @internal */
export function MessageDismiss({ text, onDismiss }: { text: Partial<MessageLocaleText> | undefined; onDismiss: (event: MouseEvent<HTMLButtonElement>) => void }): ReactElement {
  return (
    <button type="button" className="salmon-message-dismiss" aria-label={(use(LocaleContext)?.('message', text) ?? text)?.dismiss ?? 'Dismiss'} onClick={onDismiss}>
      <svg viewBox="0 0 16 16">
        <path d="M4 4l8 8m0-8-8 8" />
      </svg>
    </button>
  );
}
