import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/calendars/date-range-picker/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/number-field/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import '@salmonui/layout/avatar/styles.css';
import '@salmonui/layout/card/styles.css';
import '@salmonui/navigation/breadcrumbs/styles.css';
import '@salmonui/navigation/pager/styles.css';
import '@salmonui/navigation/sidebar-layout/styles.css';
import '@salmonui/navigation/sidebar-menu/styles.css';
import '@salmonui/navigation/tabs/styles.css';
import '@salmonui/notifications/badge/styles.css';
import '@salmonui/notifications/message/styles.css';
import '@salmonui/notifications/spinner/styles.css';
import '@salmonui/notifications/toast/styles.css';
import '@salmonui/overlays/dialog/styles.css';
import '@salmonui/overlays/drawer/styles.css';
import './styles.css';
import { ThemeStyle } from '@salmonui/core/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { ThemeProvider } from '@salmonui/core/theme';
import { Toaster } from '@salmonui/notifications/toast';
import { DialogProvider } from '@salmonui/overlays/dialog';
import { AppLayout } from './components/app-layout';
import { RouterProvider } from './lib/router';
import { routes } from './routes';
import { appTheme } from './theme';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeStyle theme={appTheme} />
    <ThemeProvider theme={appTheme} className="atlas-root">
      <LocaleProvider locale="zh-TW" localeText={zhTW}>
        <Toaster placement="top">
          <DialogProvider>
            <RouterProvider routes={routes} layout={AppLayout} />
          </DialogProvider>
        </Toaster>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
);
