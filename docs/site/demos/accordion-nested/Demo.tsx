'use client';
import { Accordion, AccordionItem } from '@salmonui/navigation/accordion';

const glyph = (d: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ACCOUNT = glyph('M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8M2.75 14c0-2.9 2.35-4.5 5.25-4.5s5.25 1.6 5.25 4.5');
const BILLING = glyph('M1.75 3.5h12.5v9H1.75zM1.75 6.5h12.5M4.5 10h2.5');

export default function AccordionNestedDemo() {
  return (
    <Accordion type="single" defaultValue={['account']} headingLevel={4} style={{ maxWidth: 560 }}>
      <AccordionItem value="account" header="Account" icon={ACCOUNT}>
        <Accordion defaultValue={[]}>
          <AccordionItem value="profile" header="Profile">
            Name, avatar and time zone.
          </AccordionItem>
          <AccordionItem value="security" header="Security">
            Password and two-factor authentication.
          </AccordionItem>
        </Accordion>
      </AccordionItem>
      <AccordionItem value="billing" header="Billing" icon={BILLING} keepMounted={false}>
        Invoices are listed here; this panel unmounts when it collapses.
      </AccordionItem>
    </Accordion>
  );
}
