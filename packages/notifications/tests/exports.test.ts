// @salmonui/notifications export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/notifications', {
  './message': ['Message'],
  './toast': ['Toaster', 'createToastQueue', 'useToast'],
  './badge': ['Badge'],
  './progress': ['Progress', 'Meter'],
  './spinner': ['Spinner'],
  './skeleton': ['Skeleton'],
});
