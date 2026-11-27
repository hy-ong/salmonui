'use client';

import { useState } from 'react';
import { getRecurrenceDates, getRecurrenceSummary, parseRecurrenceRule, RecurrenceEditor } from '@salmonui/scheduler';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { TextField } from '@salmonui/inputs/text-field';

const START = '2026-03-02T09:30';
const ZONE = 'Europe/Berlin';
const EXCEPTIONS = ['2026-03-16T09:30', '2026-04-06T09:30'];
// French labels, units and summary sentences through localeText.
const FRENCH = {
  label: 'Récurrence',
  repeat: 'Répéter',
  frequencyNever: 'Jamais',
  frequencyDaily: 'Chaque jour',
  frequencyWeekly: 'Chaque semaine',
  frequencyMonthly: 'Chaque mois',
  frequencyYearly: 'Chaque année',
  interval: 'Tous les',
  unitDays: { one: 'jour', other: 'jours' },
  unitWeeks: { one: 'semaine', other: 'semaines' },
  unitMonths: { one: 'mois', other: 'mois' },
  unitYears: { one: 'an', other: 'ans' },
  repeatOn: 'Les jours',
  end: 'Fin',
  endNever: 'Jamais',
  endUntil: 'Le',
  endCount: 'Après',
  untilDate: 'Date de fin',
  occurrences: { one: 'occurrence', other: 'occurrences' },
  summary: 'Résumé',
  daily: { one: 'Chaque jour', other: 'Tous les {interval} jours' },
  weekly: { one: 'Chaque semaine', other: 'Toutes les {interval} semaines' },
  weeklyOn: { one: 'Chaque semaine le {days}', other: 'Toutes les {interval} semaines le {days}' },
  monthly: { one: 'Chaque mois', other: 'Tous les {interval} mois' },
  yearly: { one: 'Chaque année', other: 'Tous les {interval} ans' },
  untilSuffix: "{summary}, jusqu'au {date}",
  countSuffix: { one: '{summary}, une fois', other: '{summary}, {count} fois' },
};

/** Localized editor bounds and defaults, RTL, rule parsing with errors, exceptions and DST-correct occurrences in Europe/Berlin. */
export default function RecurrenceEditorOptionsDemo() {
  const [rule, setRule] = useState<string | null>(null);
  const [rtl, setRtl] = useState(false);
  const [french, setFrench] = useState(true);
  const [text, setText] = useState('FREQ=WEEKLY;BYDAY=MO;BYHOUR=9');
  const parsed = parseRecurrenceRule(text);
  const dates = rule ? getRecurrenceDates(rule, { start: START, timeZone: ZONE, exceptions: EXCEPTIONS, maxCount: 8, range: { start: START, end: '2026-12-31T00:00' } }) : [];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        <Checkbox checked={french} onCheckedChange={(checked) => setFrench(checked)}>
          French labels (fr-FR, localeText)
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <RecurrenceEditor
        onValueChange={setRule}
        defaultFrequency="weekly"
        start={START}
        min="2026-03-02"
        max="2026-12-31"
        firstDayOfWeek={1}
        dateFormat={{ day: 'numeric', month: 'long', year: 'numeric' }}
        dir={rtl ? 'rtl' : 'ltr'}
        className="demo-recurrence"
        style={{ maxInlineSize: 560 }}
        {...(french ? { locale: 'fr-FR', localeText: FRENCH } : { locale: 'en-GB' })}
      />
      <p className="demo-status" aria-live="polite">
        Rule: <code>{rule ?? 'none yet: change a control'}</code>
      </p>
      <div className="demo-log">
        <div>
          Occurrences in {ZONE} (skipping 16 March and 6 April; clocks go forward on 29 March):
        </div>
        <ol>{dates.length ? dates.map((d) => <li key={String(d)}>{String(d)}</li>) : <li>Change the rule to expand it</li>}</ol>
      </div>
      <TextField label="Parse an RRULE" value={text} onValueChange={setText} spellCheck={false} />
      <p className="demo-status" aria-live="polite">
        {parsed.ok ? `OK: ${getRecurrenceSummary(parsed.rule, { locale: 'en-GB', start: START })}` : `Error: ${parsed.error}`}
      </p>
    </div>
  );
}
