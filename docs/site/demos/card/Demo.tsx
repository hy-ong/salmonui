import { Avatar } from '@salmonui/layout/avatar';
import { Button } from '@salmonui/buttons/button';
import { Card } from '@salmonui/layout/card';

export default function CardDemo() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <Card render={(props) => <article {...props} />}>
        <Card.Header media={<Avatar name="Ada Lovelace" shape="circle" />}>
          <Card.Title>Ada Lovelace</Card.Title>
          <Card.Description>Mathematician</Card.Description>
        </Card.Header>
        <Card.Body>Wrote the first algorithm intended to be carried out by a machine.</Card.Body>
        <Card.Separator />
        <Card.Actions>
          <Button variant="outline">Profile</Button>
          <Button tone="primary">Follow</Button>
        </Card.Actions>
      </Card>
      <Card orientation="horizontal">
        <Card.Media title="1843">
          {/* An inline illustration (no network request); a real app passes an image. */}
          <div style={{ width: 120, height: 96, display: 'grid', placeItems: 'center', color: 'var(--salmon-color-primary)', background: 'linear-gradient(135deg, var(--salmon-color-primary-subtle), var(--salmon-color-info-subtle))' }}>
            <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="14" r="5" />
              <path d="M12 5v3M12 20v3M3 14h3M18 14h3M5.6 7.6l2.1 2.1M16.3 18.3l2.1 2.1M5.6 20.4l2.1-2.1M16.3 9.7l2.1-2.1" />
              <circle cx="23" cy="24" r="3" />
            </svg>
          </div>
        </Card.Media>
        <Card.Body>Notes on the Analytical Engine.</Card.Body>
      </Card>
    </div>
  );
}
