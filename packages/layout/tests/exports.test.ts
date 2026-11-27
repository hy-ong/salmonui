// @salmonui/layout export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/layout', {
  './splitter': ['Splitter', 'SplitterPane'],
  './card': ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardBody', 'CardMedia', 'CardActions', 'CardSeparator'],
  './avatar': ['Avatar', 'AvatarGroup'],
  './timeline': ['Timeline', 'TimelineItem'],
  './list': ['List', 'ListItem'],
  './dashboard-layout': ['DashboardLayout', 'DashboardLayoutPanel'],
});
