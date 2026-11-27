// Sections of examples/vite-spa/inputs.html for the other Inputs families.
// Each family adds one import and one element here.
import type { ReactNode } from 'react';
import { StructuredSections } from './inputs-structured.tsx';
import { UploadSection } from './inputs-upload.tsx';
import { CheckboxSection } from './inputs-checkbox.tsx';
import { OtpSection } from './inputs-otp-field.tsx';
import { PointerSection } from './inputs-pointer.tsx';
import { RadioSection } from './inputs-radio-group.tsx';
import { RatingSection } from './inputs-rating.tsx';
import { SwitchSection } from './inputs-switch.tsx';
import { ColorSection } from './inputs-color.tsx';
import { SpeechSection } from './inputs-speech.tsx';
import { FormRendererSection } from './inputs-form-renderer.tsx';
import { QuerySection } from './inputs-query.tsx';

export function sections(): ReactNode {
  return (
    <>
      <StructuredSections />
      <UploadSection />
      <CheckboxSection />
      <RadioSection />
      <SwitchSection />
      <RatingSection />
      <OtpSection />
      <PointerSection />
      <ColorSection />
      <SpeechSection />
      <FormRendererSection />
      <QuerySection />
    </>
  );
}
