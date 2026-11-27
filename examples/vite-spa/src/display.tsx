// Layout display components page (tests/browser/display.spec.ts): Card,
// Avatar, AvatarGroup, Timeline and List.
//
//   ?dir=rtl  ?scheme=dark  ?hydrate (server-render, then hydrate)
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/layout/avatar/styles.css';
import '@salmonui/layout/card/styles.css';
import '@salmonui/layout/list/styles.css';
import '@salmonui/layout/timeline/styles.css';
import '@salmonui/notifications/badge/styles.css';
import { Avatar, AvatarGroup } from '@salmonui/layout/avatar';
import { Badge } from '@salmonui/notifications/badge';
import { Button } from '@salmonui/buttons/button';
import { Card } from '@salmonui/layout/card';
import { List, ListItem } from '@salmonui/layout/list';
import { ThemeProvider } from '@salmonui/core/theme';
import { Timeline } from '@salmonui/layout/timeline';

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
// A 1x1 PNG that loads, and a URL that fails.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function Page() {
  return (
    <div id="page" data-salmon-a11y-root="" dir={dir} style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 720, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar id="ok" src={PIXEL} name="Ada Lovelace" />
        <Avatar id="broken" src="/does-not-exist.png" name="Grace Hopper" shape="circle" tone="primary" />
        <Avatar id="icon" alt="Robot" fallback={<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor" /></svg>} size="lg" tone="success" />
        <AvatarGroup id="group" max={3} aria-label="Reviewers">
          {['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Edsger Dijkstra', 'Barbara Liskov'].map((n) => (
            <Avatar key={n} name={n} shape="circle" size="sm" />
          ))}
        </AvatarGroup>
        <Badge id="avatar-badge" content={3} overlap="circular" label="3 unread messages">
          <Avatar id="badged" name="Ada Lovelace" shape="circle" size="lg" />
        </Badge>
      </div>

      <Card id="card" render={(p) => <article {...p} />} style={{ maxWidth: 360 }}>
        <Card.Header media={<Avatar name="Ada Lovelace" shape="circle" />}>
          <Card.Title>Ada Lovelace</Card.Title>
          <Card.Description>Mathematician</Card.Description>
        </Card.Header>
        <Card.Body>Wrote the first algorithm intended for a machine.</Card.Body>
        <Card.Separator />
        <Card.Actions>
          <Button variant="outline">Profile</Button>
          <Button tone="primary">Follow</Button>
        </Card.Actions>
      </Card>

      <Card id="card-horizontal" orientation="horizontal">
        <Card.Media title="Engine">
          <img src={PIXEL} alt="" width={120} height={90} />
        </Card.Media>
        <Card.Body>Horizontal card</Card.Body>
      </Card>

      <Timeline
        id="timeline"
        aria-label="Order status"
        align="alternate"
        items={[
          { content: 'Ordered', opposite: '09:00', tone: 'primary' },
          { content: 'Packed', opposite: '10:30', tone: 'info' },
          { content: 'Shipped', opposite: '12:00', tone: 'success' },
          { content: 'Delivered', opposite: '—', disabled: true },
        ]}
      />
      <Timeline id="timeline-end" aria-label="Releases" items={[{ content: 'v1.0 released', opposite: 'March' }, { content: 'v1.1 adds export', opposite: 'May' }, { content: 'v2.0 in review', opposite: 'September' }]} />
      <Timeline id="timeline-h" aria-label="Steps" orientation="horizontal" items={[{ content: 'One' }, { content: 'Two' }, { content: 'Three' }]} />

      <List id="list" aria-label="People">
        <ListItem>
          <Avatar name="Ada Lovelace" size="sm" shape="circle" />
          Ada Lovelace
          <span className="salmon-list-item-description">Mathematician</span>
        </ListItem>
        <ListItem>
          <Avatar name="Alan Turing" size="sm" shape="circle" />
          Alan Turing
          <span className="salmon-list-item-description">Computer scientist</span>
        </ListItem>
      </List>
      <List id="actions-list" aria-label="Invitations">
        {['Ada Lovelace', 'Alan Turing'].map((name) => (
          <ListItem key={name}>
            <Avatar name={name} size="sm" shape="circle" />
            {name}
            <Button size="sm" variant="outline" aria-label={`Accept ${name}`}>
              Accept
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Decline ${name}`}>
              Decline
            </Button>
          </ListItem>
        ))}
      </List>
    </div>
  );
}

const app = (
  <StrictMode>
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <Page />
    </ThemeProvider>
  </StrictMode>
);
const root = document.getElementById('root') as HTMLElement;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app);
} else createRoot(root).render(app);
