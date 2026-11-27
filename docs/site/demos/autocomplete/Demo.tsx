'use client';

import { Combobox } from '@salmonui/dropdowns/combobox';

const CITIES = ['Amsterdam', 'Barcelona', 'Bern', 'Kraków', 'Lisbon', 'Lyon', 'Málaga', 'Montréal', 'Reykjavík', 'São Paulo', 'Turin', 'Zürich'];

// Autocomplete on Combobox: free text with suggestions that open from the
// first character, contain the text, are capped and marked.
export default function AutocompleteDemo() {
  return (
    <div style={{ display: 'grid', gap: 4, maxWidth: 320 }}>
      <span id="demo-city-label">City</span>
      <Combobox aria-labelledby="demo-city-label" data={CITIES} creatable showTrigger={false} minSearchLength={1} maxResults={5} searchOperator="contains" ignoreAccents highlightMatches placeholder="Start typing" />
    </div>
  );
}
