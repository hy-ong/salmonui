// @salmonui/overlays export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/overlays', {
  './dialog': ['Dialog', 'DialogTrigger', 'DialogTitle', 'DialogDescription', 'DialogBody', 'DialogFooter', 'DialogClose', 'AlertDialog', 'DialogProvider', 'useConfirm', 'useAlert'],
  './drawer': ['Drawer', 'DrawerTrigger', 'DrawerTitle', 'DrawerDescription', 'DrawerBody', 'DrawerFooter', 'DrawerClose'],
  './popover': ['Popover', 'PopoverTrigger', 'PopoverContent', 'PopoverTitle', 'PopoverDescription', 'PopoverClose'],
  './tooltip': ['Tooltip', 'TooltipProvider'],
});
