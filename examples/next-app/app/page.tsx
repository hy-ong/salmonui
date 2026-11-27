// Server Component: theme CSS variables come from the server-safe entry;
// the DataGrid itself is a Client Component rendered on the server and hydrated.
import { ThemeStyle } from '@salmonui/core/server';
import { OrdersGrid } from './orders-grid';
import { theme } from './theme';

export default function Page() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <OrdersGrid />
    </>
  );
}
