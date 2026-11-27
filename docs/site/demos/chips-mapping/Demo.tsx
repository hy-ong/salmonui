'use client';

import { useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

interface Person {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly away?: boolean;
  readonly open: number;
}

// Application data, mapped to chips in JSX.
const PEOPLE: readonly Person[] = [
  { id: 'ana', name: 'Ana Lima', initials: 'AL', open: 3 },
  { id: 'ben', name: 'Ben Okafor', initials: 'BO', open: 7 },
  { id: 'chen', name: 'Chen Wei', initials: 'CW', away: true, open: 0 },
  { id: 'dina', name: 'Dina Haddad', initials: 'DH', open: 1 },
];

const Avatar = ({ initials }: { readonly initials: string }) => (
  <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', inlineSize: 20, blockSize: 20, borderRadius: 'var(--salmon-radius-full)', background: 'var(--salmon-surface-sunken)', fontSize: 10, fontWeight: 600 }}>
    {initials}
  </span>
);

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1.5l2 4.2 4.6.6-3.4 3.2.9 4.5L8 11.8 3.9 14l.9-4.5L1.4 6.3 6 5.7z" />
  </svg>
);

// Filter chips from data with avatars, trailing counts, per-item tone,
// class and attributes, a disabled item, a click veto and a single chip.
export default function ChipsMappingDemo() {
  const [assignees, setAssignees] = useState<readonly string[]>(['ana']);
  const [locked, setLocked] = useState(false);
  const [teamDisabled, setTeamDisabled] = useState(false);
  const [clicks, setClicks] = useState<readonly string[]>([]);
  const [starred, setStarred] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ToggleButtonGroup
        aria-label="Assignees"
        variant="chip"
        selectionMode="multiple"
        disabled={teamDisabled}
        value={assignees}
        onValueChange={(next) => {
          // Cancel a click: a controlled value that ignores the proposal.
          if (!locked) setAssignees(next);
        }}
      >
        {PEOPLE.map((person) => (
          <ToggleButton
            key={person.id}
            value={person.id}
            disabled={person.away}
            tone={person.open > 5 ? 'warning' : undefined}
            className={`demo-chip demo-chip-${person.id}`}
            data-person-id={person.id}
            title={person.away ? `${person.name} is away` : undefined}
            iconStart={<Avatar initials={person.initials} />}
            iconEnd={<span aria-hidden="true">{person.open}</span>}
            onClick={() => setClicks((list) => [person.name, ...list].slice(0, 3))}
          >
            {person.name}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Checkbox checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
          Lock selection
        </Checkbox>
        <Checkbox checked={teamDisabled} onCheckedChange={(checked) => setTeamDisabled(checked)}>
          Disable the group
        </Checkbox>
        <ToggleButton variant="chip" pressed={starred} onPressedChange={setStarred} iconStart={<StarIcon />}>
          Starred only
        </ToggleButton>
        <Button variant="chip" tone="danger" onClick={() => setAssignees([])}>
          Clear
        </Button>
      </div>
      <p style={{ margin: 0 }}>
        Selected: <output>{PEOPLE.filter((person) => assignees.includes(person.id)).map((person) => person.name).join(', ') || 'none'}</output> · Starred only: <output>{String(starred)}</output>
      </p>
      <p style={{ margin: 0 }}>
        Recent clicks: <output>{clicks.join(', ') || 'none'}</output>
      </p>
    </div>
  );
}
