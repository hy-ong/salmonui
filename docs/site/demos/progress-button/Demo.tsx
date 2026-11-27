'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';

// A custom spinner: a quarter arc that turns (the system spinner is a full ring).
const RingSpinner = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M8 2a6 6 0 0 1 6 6">
      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite" />
    </path>
  </svg>
);

// The application owns the work: here a stand-in upload reports its progress
// in steps; `progress` and `loading` render whatever it reports.
export default function ProgressButtonDemo() {
  const [percent, setPercent] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const upload = () => {
    setPercent(0);
    timer.current = setInterval(() => {
      setPercent((p) => {
        const next = (p ?? 0) + 10;
        if (next >= 100) clearInterval(timer.current);
        return next >= 100 ? null : next;
      });
    }, 200);
  };
  const save = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 1500);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Button tone="primary" variant="outline" progress={percent ?? undefined} loading={percent !== null} loadingLabel="Uploading" onClick={upload}>
        {percent === null ? 'Upload' : 'Uploading'}
      </Button>
      <Button tone="success" loading={saving} loadingLabel="Saving" onClick={save}>
        Save
      </Button>
      <Button variant="outline" progress={65} progressLabel={(value) => `${value} percent of the quota used`}>
        Quota
      </Button>
      <Button loading spinner={<RingSpinner />}>
        Custom spinner
      </Button>
    </div>
  );
}
