import type { ReactNode } from 'react';

/** A decorative 404 illustration: a person holding an empty box next to a plant, under a question mark. */
function Illustration() {
  return (
    <svg className="atlas-result__image" viewBox="0 0 252 294" width="252" height="294" aria-hidden="true" focusable="false">
      <circle cx="126" cy="126" r="126" fill="#e8eef6" />
      <path d="M96 22h22a6 6 0 0 1 0 12h-6a6 6 0 0 0 0 12h18a6 6 0 0 1 0 12H98a6 6 0 0 1 0-12h4a6 6 0 0 0 0-12h-6a6 6 0 0 1 0-12Z" fill="#fff" />
      <ellipse cx="164" cy="60" rx="6" ry="4.5" fill="#fff" />
      <g fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
        <path d="M30 135l16 8M46 143l12-6M46 143l-8 14" />
        <path d="M192 92v22l12 10 16-8M190 160l12-12 10 4 8 22M174 136l-12 8" />
      </g>
      <circle cx="30" cy="135" r="7" fill="#fff" />
      <circle cx="58" cy="137" r="5" fill="#fff" />
      <circle cx="173" cy="134" r="9" fill="#fff" />
      <circle cx="194" cy="148" r="6" fill="#fff" />
      <circle cx="221" cy="176" r="3" fill="#fff" />
      {/* question mark */}
      <circle cx="202" cy="28" r="28" fill="var(--salmon-color-primary)" />
      <text x="202" y="40" textAnchor="middle" fontSize="34" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
        ?
      </text>
      {/* plant */}
      <rect x="160" y="168" width="10" height="80" rx="5" fill="#5ba02e" />
      <rect x="172" y="198" width="10" height="50" rx="5" fill="#7cc242" />
      <rect x="154" y="240" width="34" height="52" fill="#f3d8a7" />
      {/* person */}
      <circle cx="102" cy="74" r="14" fill="#fcd2b4" />
      <path d="M88 66c2-10 22-14 28-4-6 0-10 2-12 6-6-4-12-4-16-2Z" fill="#5c1a4a" />
      <path d="M84 92c4-8 32-8 36 0l6 54H80Z" fill="#fff" stroke="#e1e8f0" />
      <path d="M58 84c8 4 18 8 28 10l-2 8c-12-2-22-6-30-12Z" fill="#fcd2b4" />
      <path d="M82 146h40l-4 128h-12l-6-104-8 104H80Z" fill="#7fa8f0" />
      <path d="M78 274h16v8H74ZM110 274h14l4 8h-18Z" fill="#c7cdd6" />
      {/* box */}
      <path d="M96 116h54l-6 30h-42Z" fill="#f3d8a7" />
      <path d="M92 110h62l-4 10H96Z" fill="#e8c58b" />
      <path d="M118 126h10" stroke="#c8a06a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="150" cy="128" r="5" fill="#fcd2b4" />
    </svg>
  );
}

export function NotFoundResult({ title, subTitle, extra }: { readonly title: ReactNode; readonly subTitle: ReactNode; readonly extra?: ReactNode }) {
  return (
    <div className="atlas-result">
      <Illustration />
      <h1 className="atlas-result__title">{title}</h1>
      <p className="atlas-result__subtitle">{subTitle}</p>
      {extra ? <div className="atlas-result__extra">{extra}</div> : null}
    </div>
  );
}
