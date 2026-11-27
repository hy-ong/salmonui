'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Dialog } from '@salmonui/overlays/dialog';
import { TextField } from '@salmonui/inputs/text-field';

export default function DialogDemo() {
  const [result, setResult] = useState('No changes');
  return (
    <div>
      <Dialog
        trigger={<Dialog.Trigger render={(p) => <Button {...p}>Edit order</Button>} />}
        closeButton
        onOpenChange={(open, e) => !open && setResult(e.reason === 'submit' ? 'Saved' : `Closed (${e.reason})`)}
      >
        <Dialog.Title>Edit order</Dialog.Title>
        <Dialog.Description>Changes are saved on submit.</Dialog.Description>
        <form method="dialog">
          <Dialog.Body>
            <TextField label="Customer" name="customer" data-autofocus="" defaultValue="Ada Lovelace" style={{ inlineSize: '100%' }} />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close render={(p) => <Button {...p} variant="outline" />}>Cancel</Dialog.Close>
            <Button type="submit" value="save" tone="primary">
              Save
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog>
      <p>
        <output>{result}</output>
      </p>
    </div>
  );
}
