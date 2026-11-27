// Type contract of `@salmonui/buttons/menu`: controlled and
// uncontrolled state, polymorphism through the render prop.
import { Menu, MenuButton, MenuCheckboxItem, MenuItem, MenuRadioGroup, MenuRadioItem, Submenu, SplitButton, type MenuActionEvent, type MenuItemData, type MenuOpenChangeEvent } from '@salmonui/buttons/menu';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

const items: MenuItemData[] = [{ id: 'a', label: 'A' }, { type: 'separator' }, { id: 'sub', label: 'Sub', items: [{ id: 'b', label: 'B' }] }];

export const examples = [
  <MenuButton
    key="1"
    items={items}
    placement="bottom-end"
    tone="primary"
    onOpenChange={(open, event) => {
      expectType<Equal<typeof open, boolean>>(true);
      expectType<Equal<typeof event, MenuOpenChangeEvent>>(true);
    }}
    onAction={(event) => {
      expectType<Equal<typeof event, MenuActionEvent>>(true);
      event.preventDefault();
    }}
    classNames={{ menu: 'm' }}
  >
    Actions
  </MenuButton>,
  <Menu key="2" aria-label="M">
    <MenuItem id="x" render={(props) => <a {...props} href="/x" />}>
      X
    </MenuItem>
    <MenuCheckboxItem checked onCheckedChange={(checked) => expectType<Equal<typeof checked, boolean>>(true)}>
      C
    </MenuCheckboxItem>
    <MenuRadioGroup value="a" onValueChange={(value) => expectType<Equal<typeof value, string>>(true)}>
      <MenuRadioItem value="a">A</MenuRadioItem>
    </MenuRadioGroup>
    <Submenu label="More">
      <MenuItem id="y">Y</MenuItem>
    </Submenu>
  </Menu>,
  <SplitButton key="3" menuLabel="Save options" onClick={() => undefined} items={items}>
    Save
  </SplitButton>,
];

// @ts-expect-error MenuItem requires a stable id.
export const missingId = <MenuItem>Nope</MenuItem>;
// @ts-expect-error placement is one of four logical values.
export const badPlacement = <MenuButton placement="left">A</MenuButton>;

