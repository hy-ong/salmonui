// Badge and Message browser page (tests/browser/notifications-badge-message.spec.ts, NTF1):
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it
//
// window.__messageEvents records every onDismiss call as a plain object.
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/notifications/badge/styles.css';
import '@salmonui/notifications/message/styles.css';
import './app.css';
import { Badge, type BadgePlacement, type BadgeTone, type BadgeVariant } from '@salmonui/notifications/badge';
import { Message, type MessageVariant } from '@salmonui/notifications/message';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __messageEvents?: Record<string, unknown>[];
  }
}

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
window.__messageEvents = [];

const TONES: BadgeTone[] = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'];
const BADGE_VARIANTS: BadgeVariant[] = ['soft', 'solid', 'outline'];
const MESSAGE_VARIANTS: MessageVariant[] = ['soft', 'outline', 'solid'];
const PLACEMENTS: BadgePlacement[] = ['topEnd', 'topStart', 'bottomEnd', 'bottomStart'];
const host = { display: 'inline-block', inlineSize: 40, blockSize: 40, border: '1px solid var(--salmon-border-default)', borderRadius: 6 } as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} style={{ marginBlockEnd: 24 }}>
      <h2 id={`${id}-title`} style={{ fontSize: 14 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Dismissible() {
  const [hidden, setHidden] = useState(false);
  return (
    <>
      <Message
        id="dismissible"
        tone="info"
        title="Update available"
        hidden={hidden}
        onDismiss={(event) => {
          window.__messageEvents?.push({ kind: 'dismiss', type: event.type });
          setHidden(true);
        }}
      >
        Version 2 is ready.
      </Message>
      <button id="restore" type="button" onClick={() => setHidden(false)}>
        Restore
      </button>
    </>
  );
}

function LiveMessage() {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button id="show-live" type="button" onClick={() => setShown((s) => !s)}>
        Toggle saved message
      </button>
      <Message id="live" live="polite" tone="success" hidden={!shown}>
        Changes saved.
      </Message>
      <Message id="assertive" live="assertive" tone="danger" icon={false}>
        Connection lost.
      </Message>
    </>
  );
}

function OverlayBadges() {
  const [invisible, setInvisible] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', gap: 32, padding: 16, alignItems: 'center' }}>
        <Badge id="inbox" content={120} max={99} label="120 unread messages" tone="danger" invisible={invisible}>
          <button type="button">Inbox</button>
        </Badge>
        {PLACEMENTS.map((placement) => (
          <Badge key={placement} data-placement-host={placement} content={3} placement={placement} tone="primary">
            <span style={host} />
          </Badge>
        ))}
        <Badge id="avatar" dot label="Online" tone="success" overlap="circular" placement="bottomEnd">
          <span style={{ ...host, borderRadius: '50%' }} />
        </Badge>
      </div>
      <button id="toggle-invisible" type="button" onClick={() => setInvisible((v) => !v)}>
        Toggle badge
      </button>
    </>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <div dir={dir} id="page" data-salmon-a11y-root="">
        <Section id="inline" title="Inline badges">
          {BADGE_VARIANTS.map((variant) => (
            <div key={variant} style={{ display: 'flex', gap: 8, marginBlockEnd: 8 }}>
              {TONES.map((tone) => (
                <Badge key={tone} data-matrix={`${tone}-${variant}`} tone={tone} variant={variant}>
                  {tone}
                </Badge>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge shape="pill">Pill</Badge>
            <Badge shape="circle" tone="primary" variant="solid">
              7
            </Badge>
            <Badge id="badge-link" tone="info" render={(props) => <a {...props} href="#inline" />}>
              Docs
            </Badge>
          </div>
        </Section>
        <Section id="status" title="Status badges">
          <div style={{ display: 'flex', gap: 16 }}>
            {TONES.map((tone) => (
              <Badge key={tone} data-status={tone} tone={tone} variant="dot">
                {tone}
              </Badge>
            ))}
          </div>
        </Section>
        <Section id="overlay" title="Overlay badges">
          <OverlayBadges />
        </Section>
        <Section id="messages" title="Messages">
          <div style={{ display: 'grid', gap: 8 }}>
            {MESSAGE_VARIANTS.flatMap((variant) =>
              TONES.map((tone) => (
                <Message key={`${tone}-${variant}`} data-matrix={`${tone}-${variant}`} tone={tone} variant={variant} title={tone}>
                  A {variant} message.
                </Message>
              )),
            )}
            <Dismissible />
            <LiveMessage />
            <Message align="center" action={<button type="button">Undo</button>}>
              Centered with an action.
            </Message>
          </div>
        </Section>
      </div>
    </ThemeProvider>
  );
}

const root = document.getElementById('root') as HTMLElement;
const app = (
  <StrictMode>
    <Page />
  </StrictMode>
);
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app, { onRecoverableError: (error) => console.error('recoverable', error) });
} else {
  createRoot(root).render(app);
}
