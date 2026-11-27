'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Listbox, moveItems, reorderItems, type ListboxKey, type ListboxReorderEvent } from '@salmonui/dropdowns/listbox';

interface Fruit {
  value: string;
  label: string;
}

const fruits: Fruit[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
  { value: 'fig', label: 'Fig' },
  { value: 'grape', label: 'Grape' },
  { value: 'kiwi', label: 'Kiwi' },
];

/** Applies an `onReorder` event: `delta` for Alt+Up / Alt+Down, `toIndex` for a drag within the list. */
const applyReorder = (list: Fruit[], event: ListboxReorderEvent<Fruit>): Fruit[] =>
  event.delta !== null ? reorderItems(list, event.values, event.delta) : moveItems(list, list, event.values, event.toIndex)[0];

export default function ListboxDualListDemo() {
  const [available, setAvailable] = useState<Fruit[]>(fruits.slice(0, 6));
  const [chosen, setChosen] = useState<Fruit[]>(fruits.slice(6));
  const [availableSel, setAvailableSel] = useState<readonly ListboxKey[]>([]);
  const [chosenSel, setChosenSel] = useState<readonly ListboxKey[]>([]);

  // Toolbar buttons: the application moves items between its own arrays.
  const moveRight = (values: Iterable<ListboxKey>) => {
    const [nextAvailable, nextChosen] = moveItems(available, chosen, values);
    setAvailable(nextAvailable);
    setChosen(nextChosen);
    setAvailableSel([]);
  };
  const moveLeft = (values: Iterable<ListboxKey>) => {
    const [nextChosen, nextAvailable] = moveItems(chosen, available, values);
    setChosen(nextChosen);
    setAvailable(nextAvailable);
    setChosenSel([]);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'start' }}>
      <div style={{ minWidth: 180 }}>
        <p id="dual-available">Available</p>
        <Listbox
          id="dual-available-list"
          data={available}
          multiple
          reorderable
          dragGroup="fruit"
          aria-labelledby="dual-available"
          value={availableSel}
          onValueChange={(value) => setAvailableSel(value)}
          onReorder={(event) => setAvailable((list) => applyReorder(list, event))}
          onItemDrop={(event) => {
            // Dropped from the other list: move the items in at `toIndex`.
            const [nextChosen, nextAvailable] = moveItems(chosen, available, event.values, event.toIndex);
            setChosen(nextChosen);
            setAvailable(nextAvailable);
            setChosenSel([]);
          }}
          maxVisibleItems={7}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 40 }}>
        <Button variant="outline" onClick={() => moveRight(availableSel)} disabled={availableSel.length === 0}>
          Move selected →
        </Button>
        <Button variant="outline" onClick={() => moveRight(available.map((f) => f.value))} disabled={available.length === 0}>
          Move all →
        </Button>
        <Button variant="outline" onClick={() => moveLeft(chosenSel)} disabled={chosenSel.length === 0}>
          ← Move selected
        </Button>
        <Button variant="outline" onClick={() => moveLeft(chosen.map((f) => f.value))} disabled={chosen.length === 0}>
          ← Move all
        </Button>
        <Button variant="outline" onClick={() => setChosen((list) => reorderItems(list, chosenSel, -1))} disabled={chosenSel.length === 0}>
          Move up
        </Button>
        <Button variant="outline" onClick={() => setChosen((list) => reorderItems(list, chosenSel, 1))} disabled={chosenSel.length === 0}>
          Move down
        </Button>
      </div>
      <div style={{ minWidth: 180 }}>
        <p id="dual-chosen">Chosen</p>
        <Listbox
          id="dual-chosen-list"
          data={chosen}
          multiple
          reorderable
          dragGroup="fruit"
          aria-labelledby="dual-chosen"
          value={chosenSel}
          onValueChange={(value) => setChosenSel(value)}
          onReorder={(event) => setChosen((list) => applyReorder(list, event))}
          onItemDrop={(event) => {
            const [nextAvailable, nextChosen] = moveItems(available, chosen, event.values, event.toIndex);
            setAvailable(nextAvailable);
            setChosen(nextChosen);
            setAvailableSel([]);
          }}
          maxVisibleItems={7}
        />
      </div>
    </div>
  );
}
