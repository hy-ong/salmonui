'use client';

import { useState } from 'react';
import { TextArea, TextField } from '@salmonui/inputs/text-field';

const TAGLINE_MAX = 40;
const BIO_MAX = 160;

// Native input attributes pass straight through: autoComplete tokens,
// maxLength, and TextArea (the multiline TextBox) with rows, cols and maxLength.
export default function TextFieldNativeDemo() {
  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');
  return (
    <form style={{ display: 'grid', gap: 16, maxInlineSize: 420 }} onSubmit={(event) => event.preventDefault()} aria-label="Profile">
      <TextField label="Email" type="email" name="email" autoComplete="email" description='autoComplete="email": the browser offers saved addresses' />
      <TextField label="New password" type="password" name="new-password" autoComplete="new-password" description='autoComplete="new-password": password managers suggest a strong one' />
      <TextField label="Search history" type="search" autoComplete="off" description='autoComplete="off": no suggestions' />
      <TextField
        label="Tagline"
        maxLength={TAGLINE_MAX}
        value={tagline}
        onValueChange={setTagline}
        description={`${tagline.length} / ${TAGLINE_MAX} characters (native maxLength stops typing at the limit)`}
      />
      <TextArea
        label="Bio"
        rows={4}
        cols={40}
        maxLength={BIO_MAX}
        resize="none"
        style={{ justifySelf: 'start', maxInlineSize: '100%' }}
        value={bio}
        onValueChange={setBio}
        description={`TextArea: rows={4} cols={40}, ${bio.length} / ${BIO_MAX} characters`}
      />
    </form>
  );
}
