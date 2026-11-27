import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  Gauge,
  Globe,
  Headphones,
  LayoutGrid,
  Menu,
  Settings,
  ShoppingCart,
  Store,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { MenuButton, MenuItem, MenuSeparator } from '@salmonui/buttons/menu';
import { Avatar } from '@salmonui/layout/avatar';
import { BreadcrumbItem, Breadcrumbs } from '@salmonui/navigation/breadcrumbs';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';
import { SidebarMenu, type SidebarMenuEntry } from '@salmonui/navigation/sidebar-menu';
import { Link, Outlet, useRouteMeta, useRouter } from '../lib/router';

const icon = (Icon: typeof Gauge): ReactNode => <Icon size={15} strokeWidth={1.75} aria-hidden />;

const navigationItems: SidebarMenuEntry[] = [
  {
    type: 'group',
    id: '/workspace',
    label: '工作區',
    children: [
      { id: '/workspace/overview', href: '/workspace/overview', icon: icon(Gauge), label: '總覽' },
      { id: '/workspace/analytics', href: '/workspace/analytics', icon: icon(ChartColumn), label: '數據分析' },
      { id: '/workspace/orders', href: '/workspace/orders', icon: icon(ShoppingCart), label: '訂單管理' },
    ],
  },
  {
    type: 'group',
    id: '/operations',
    label: '營運',
    children: [
      {
        id: '/operations/commerce',
        icon: icon(Store),
        label: '商務中心',
        children: [
          { id: '/operations/commerce/products', href: '/operations/commerce/products', label: '商品目錄' },
          { id: '/operations/commerce/promotions', href: '/operations/commerce/promotions', label: '促銷活動' },
          { id: '/operations/commerce/subscriptions', href: '/operations/commerce/subscriptions', label: '訂閱方案' },
        ],
      },
      {
        id: '/operations/customers',
        icon: icon(Users),
        label: '客戶關係',
        children: [
          { id: '/operations/customers/segments', href: '/operations/customers/segments', label: '客群管理' },
          { id: '/operations/customers/support', href: '/operations/customers/support', label: '服務案件' },
          { id: '/operations/customers/feedback', href: '/operations/customers/feedback', label: '回饋中心' },
        ],
      },
      { id: '/operations/payments', href: '/operations/payments', icon: icon(Wallet), label: '金流管理' },
      { id: '/operations/billing', href: '/operations/billing', icon: icon(CreditCard), label: '帳務設定' },
    ],
  },
  {
    type: 'group',
    id: '/system',
    label: '系統',
    children: [
      { id: '/system/integrations', href: '/system/integrations', icon: icon(Globe), label: '整合服務' },
      { id: '/system/data', href: '/system/data', icon: icon(Database), label: '資料管理' },
      { id: '/system/settings', href: '/system/settings', icon: icon(Settings), label: '系統設定' },
      { id: '/system/help', href: '/system/help', icon: icon(Headphones), label: '支援中心' },
    ],
  },
];

/** The menu id of a pathname: the longest menu path it starts with (an order drawer keeps 訂單管理 selected). */
const selectedId = (pathname: string): string | null => {
  let best: string | null = null;
  const visit = (entries: readonly SidebarMenuEntry[]): void => {
    for (const entry of entries) {
      if (entry.type === 'group' || entry.children) visit(entry.children ?? []);
      else if ((pathname === entry.id || pathname.startsWith(`${entry.id}/`)) && entry.id.length > (best?.length ?? 0)) best = entry.id;
    }
  };
  visit(navigationItems);
  return best;
};

const mobileQuery = '(max-width: 767px)';
const subscribeMobile = (listener: () => void): (() => void) => {
  const list = window.matchMedia(mobileQuery);
  list.addEventListener('change', listener);
  return () => list.removeEventListener('change', listener);
};
const useMobile = (): boolean => useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false);

function AccountMenu({ mobile, container }: { readonly mobile: boolean; readonly container: Element | null }) {
  return (
    <MenuButton
      container={container}
      variant="ghost"
      className="atlas-account"
      placement="bottom-end"
      indicator={false}
      menu={
        <>
          <MenuItem id="profile" icon={<User size={14} aria-hidden />}>
            個人設定
          </MenuItem>
          <MenuItem id="workspace" icon={<Settings size={14} aria-hidden />}>
            工作區設定
          </MenuItem>
          <MenuSeparator />
          <MenuItem id="logout">登出</MenuItem>
        </>
      }
    >
      <Avatar size={22} shape="circle" variant="solid">
        OL
      </Avatar>
      {mobile ? <span className="atlas-sr-only">Olivia 帳號選單</span> : (
        <>
          <span className="atlas-account__name">Olivia</span>
          <span className="atlas-sr-only"> 帳號選單</span>
        </>
      )}
    </MenuButton>
  );
}

export function AppLayout() {
  const { pathname } = useRouter();
  const meta = useRouteMeta();
  const title = meta?.title ?? '找不到頁面';
  const breadcrumbs = meta?.breadcrumbs ?? [title];
  const mobile = useMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [header, setHeader] = useState<HTMLElement | null>(null);

  useEffect(() => {
    document.title = `${title} - Atlas`;
  }, [title]);

  return (
    <SidebarLayout
      className="atlas-layout"
      collapseBelow={mobileQuery}
      size={215}
      railSize={64}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      {...(mobile ? { open: drawerOpen, onOpenChange: setDrawerOpen } : {})}
      localeText={{ toggle: '開啟選單', collapse: collapsed ? '展開側邊欄' : '收合側邊欄' }}
    >
      {/* The account menu renders inside the banner landmark. */}
      <header ref={setHeader} className="salmon-app-bar atlas-topbar" data-salmon-surface="app-bar">
        {mobile ? <SidebarTrigger className="atlas-topbar__menu" icon={<Menu size={18} aria-hidden />} data-testid="mobile-menu" /> : null}
        <Link to="/workspace/orders" className="atlas-brand" aria-label="Atlas 首頁">
          <LayoutGrid size={mobile ? 18 : 20} strokeWidth={1.75} aria-hidden />
          {mobile ? null : <span>Atlas</span>}
        </Link>
        {mobile ? null : (
          <Breadcrumbs separator="/" className="atlas-breadcrumbs">
            {breadcrumbs.map((label, index) => (
              <BreadcrumbItem key={label}>{index === breadcrumbs.length - 1 ? label : <span className="atlas-breadcrumbs__parent">{label}</span>}</BreadcrumbItem>
            ))}
          </Breadcrumbs>
        )}
        <AccountMenu mobile={mobile} container={header} />
      </header>
      <SidebarPanel navigation aria-label="主選單" className="atlas-sider">
        <SidebarMenu
          landmark={false}
          items={navigationItems}
          selected={selectedId(pathname)}
          defaultExpanded="all"
          collapsed={collapsed && !mobile}
          dividers
          renderLink={(props) => <Link {...props} to={props.href} />}
          onItemClick={() => setDrawerOpen(false)}
        />
      </SidebarPanel>
      {mobile ? null : (
        <SidebarTrigger
          action="collapse"
          className="atlas-collapse"
          data-testid="sidebar-collapse"
          icon={collapsed ? <ChevronRight size={12} strokeWidth={2.5} aria-hidden /> : <ChevronLeft size={12} strokeWidth={2.5} aria-hidden />}
        />
      )}
      <SidebarMain render={(props) => <main {...props} />} className="atlas-main">
        <Outlet />
      </SidebarMain>
    </SidebarLayout>
  );
}
