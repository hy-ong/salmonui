// `?dropdowns`: every dropdown server rendered and hydrated
// (tests/browser/ssr-dropdowns.spec.ts): the server renders the
// triggers, the selected labels, the hidden form elements and the Listbox
// list (list and grid layouts), never a popup.
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Listbox } from '@salmonui/dropdowns/listbox';
import { Mention } from '@salmonui/dropdowns/mention';
import { Select } from '@salmonui/dropdowns/select';
import { TreeSelect } from '@salmonui/dropdowns/tree-select';

const fruits = ['Apple', 'Banana', 'Cherry', 'Kiwi', 'Mango'].map((label) => ({ value: label.toLowerCase(), label }));
const many = Array.from({ length: 10_000 }, (_, i) => ({ value: i, label: `Item ${i}` }));
const people = [
  { value: 'alice', label: 'Alice Smith' },
  { value: 'bob', label: 'Bob Jones' },
];
const tree = [{ id: 'docs', label: 'Documents', children: [{ id: 'cv', label: 'CV.pdf' }] }];

export function Dropdowns() {
  return (
    <main style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 420 }}>
      <Select aria-label="Fruit" data={fruits} defaultValue="kiwi" name="fruit" />
      <Select aria-label="Tags" data={fruits} multiple defaultValue={['apple', 'mango']} name="tags" />
      <Select aria-label="Many" data={many} defaultValue={9_999} />
      <Combobox aria-label="Search fruit" data={fruits} defaultValue="banana" name="pick" />
      <Combobox aria-label="Labels" data={fruits} multiple defaultValue={['cherry']} />
      <Listbox aria-label="Basket" data={fruits} multiple defaultValue={['apple']} name="basket" />
      <Listbox aria-label="Swatches" layout="grid" columns={3} data={fruits} defaultValue="kiwi" />
      <Mention triggers={[{ char: '@', data: people }]}>
        <textarea aria-label="Comment" defaultValue="Hi" />
      </Mention>
      <TreeSelect aria-label="File" data={tree} defaultValue="cv" defaultExpanded={['docs']} />
    </main>
  );
}
