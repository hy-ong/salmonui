'use client';
import { useState } from 'react';
import { Avatar } from '@salmonui/layout/avatar';
import { Button } from '@salmonui/buttons/button';
import { List, ListItem } from '@salmonui/layout/list';

const PEOPLE = [
  ['Ada Lovelace', 'Mathematician'],
  ['Alan Turing', 'Computer scientist'],
  ['Grace Hopper', 'Rear admiral'],
] as const;

const INVITES = ['Edsger Dijkstra', 'Barbara Liskov'] as const;

export default function ListDemo() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <List aria-label="People">
        {PEOPLE.map(([name, role]) => (
          <ListItem key={name}>
            <Avatar name={name} size="sm" shape="circle" />
            {/* Name and role stack beside the avatar. */}
            <span style={{ display: 'grid' }}>
              {name}
              <span className="salmon-list-item-description">{role}</span>
            </span>
          </ListItem>
        ))}
      </List>
      <List aria-label="Invitations">
        {INVITES.map((name) => (
          <ListItem key={name}>
            <Avatar name={name} size="sm" shape="circle" />
            {name}
            {answers[name] ? (
              <span className="salmon-list-item-description" style={{ flexBasis: 'auto', marginInlineStart: 'auto' }}>
                {answers[name]}
              </span>
            ) : (
              <span style={{ display: 'inline-flex', gap: 8, marginInlineStart: 'auto' }}>
                <Button variant="outline" aria-label={`Decline ${name}`} onClick={() => setAnswers({ ...answers, [name]: 'Declined' })}>
                  Decline
                </Button>
                <Button tone="primary" aria-label={`Accept ${name}`} onClick={() => setAnswers({ ...answers, [name]: 'Accepted' })}>
                  Accept
                </Button>
              </span>
            )}
          </ListItem>
        ))}
      </List>
    </div>
  );
}
