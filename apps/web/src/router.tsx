import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Navigate, Outlet, redirect } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import { AppShell } from '@/components/layout/app-shell';
import { Spinner } from '@/components/ui';
import { LoginPage } from '@/features/auth/login-page';
import type { Me } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { api } from '@/lib/api';

async function loadMe(): Promise<Me> {
  return queryClient.ensureQueryData({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: 60_000 });
}

const rootRoute = createRootRoute({ component: () => <Suspense fallback={<div className="p-8"><Spinner /></div>}><Outlet /></Suspense> });

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/login', component: LoginPage, validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async () => { const me = await loadMe(); if (me.user) throw redirect({ to: '/' }); },
});

const appRoute = createRoute({
  id: 'app', getParentRoute: () => rootRoute, component: AppShell,
  beforeLoad: async ({ location }) => { const me = await loadMe(); if (!me.user) throw redirect({ to: '/login', search: { redirect: location.href } }); },
});

const listSearch = z.object({ q: z.string().optional(), page: z.number().optional(), tab: z.string().optional(), status: z.string().optional(), from: z.string().optional(), to: z.string().optional() });

export const dashboardRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: lazyRouteComponent(() => import('@/features/dashboard/dashboard-page'), 'DashboardPage') });
export const billingRoute = createRoute({ getParentRoute: () => appRoute, path: '/billing', validateSearch: z.object({ resume: z.string().optional(), rebill: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/billing/billing-page'), 'BillingPage') });
export const salesRoute = createRoute({ getParentRoute: () => appRoute, path: '/sales', validateSearch: listSearch, component: lazyRouteComponent(() => import('@/features/sales/sales-page'), 'SalesPage') });
export const saleDetailRoute = createRoute({ getParentRoute: () => appRoute, path: '/sales/$id', validateSearch: z.object({ print: z.boolean().optional() }), component: lazyRouteComponent(() => import('@/features/sales/sale-detail-page'), 'SaleDetailPage') });
export const itemsRoute = createRoute({ getParentRoute: () => appRoute, path: '/items', validateSearch: listSearch.extend({ mode: z.string().optional(), new: z.boolean().optional() }), component: lazyRouteComponent(() => import('@/features/items/items-page'), 'ItemsPage') });
export const itemDetailRoute = createRoute({ getParentRoute: () => appRoute, path: '/items/$id', component: lazyRouteComponent(() => import('@/features/items/item-detail-page'), 'ItemDetailPage') });
export const inventoryRoute = createRoute({ getParentRoute: () => appRoute, path: '/inventory', validateSearch: listSearch.extend({ view: z.string().optional(), itemId: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/inventory/inventory-page'), 'InventoryPage') });
export const purchasesRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchases', validateSearch: listSearch, component: lazyRouteComponent(() => import('@/features/purchases/purchases-page'), 'PurchasesPage') });
export const purchaseNewRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchases/new', validateSearch: z.object({ poId: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/purchases/purchase-new-page'), 'PurchaseNewPage') });
export const purchaseReturnRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchases/returns', validateSearch: z.object({ supplierId: z.number().optional(), batchId: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/purchases/purchase-return-page'), 'PurchaseReturnPage') });
export const purchaseDetailRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchases/$id', component: lazyRouteComponent(() => import('@/features/purchases/purchase-detail-page'), 'PurchaseDetailPage') });
export const suppliersRoute = createRoute({ getParentRoute: () => appRoute, path: '/suppliers', validateSearch: listSearch.extend({ id: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/parties/suppliers-page'), 'SuppliersPage') });
export const customersRoute = createRoute({ getParentRoute: () => appRoute, path: '/customers', validateSearch: listSearch.extend({ id: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/parties/customers-page'), 'CustomersPage') });
export const doctorsRoute = createRoute({ getParentRoute: () => appRoute, path: '/doctors', validateSearch: listSearch, component: lazyRouteComponent(() => import('@/features/parties/doctors-page'), 'DoctorsPage') });
export const labelsRoute = createRoute({ getParentRoute: () => appRoute, path: '/labels', validateSearch: z.object({ batchIds: z.string().optional(), templateId: z.number().optional(), tab: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/labels/labels-page'), 'LabelsPage') });
export const registersRoute = createRoute({ getParentRoute: () => appRoute, path: '/registers', validateSearch: z.object({ register: z.string().optional(), fy: z.string().optional(), page: z.number().optional(), q: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/registers/registers-page'), 'RegistersPage') });
export const reportsRoute = createRoute({ getParentRoute: () => appRoute, path: '/reports', validateSearch: z.object({ report: z.string().optional(), from: z.string().optional(), to: z.string().optional(), group: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/reports/reports-page'), 'ReportsPage') });
export const auditRoute = createRoute({ getParentRoute: () => appRoute, path: '/audit', validateSearch: listSearch.extend({ entity: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/audit/audit-page'), 'AuditPage') });
export const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: '/settings', validateSearch: z.object({ tab: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/settings/settings-page'), 'SettingsPage') });
export const purchaseOrdersRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchase-orders', validateSearch: listSearch.extend({ supplierId: z.number().optional() }), component: lazyRouteComponent(() => import('@/features/purchase-orders/purchase-orders-page'), 'PurchaseOrdersPage') });
export const purchaseOrderNewRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchase-orders/new', validateSearch: z.object({ supplierId: z.number().optional(), fromReorder: z.boolean().optional() }), component: lazyRouteComponent(() => import('@/features/purchase-orders/purchase-order-new-page'), 'PurchaseOrderNewPage') });
export const purchaseOrderDetailRoute = createRoute({ getParentRoute: () => appRoute, path: '/purchase-orders/$id', validateSearch: z.object({ print: z.boolean().optional() }), component: lazyRouteComponent(() => import('@/features/purchase-orders/purchase-order-detail-page'), 'PurchaseOrderDetailPage') });
export const messagesRoute = createRoute({ getParentRoute: () => appRoute, path: '/messages', validateSearch: listSearch.extend({ template: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/messages/messages-page'), 'MessagesPage') });
export const exportsRoute = createRoute({ getParentRoute: () => appRoute, path: '/exports', validateSearch: z.object({ kind: z.string().optional(), from: z.string().optional(), to: z.string().optional() }), component: lazyRouteComponent(() => import('@/features/exports/exports-page'), 'ExportsPage') });
export const syncRoute = createRoute({ getParentRoute: () => appRoute, path: '/sync', component: lazyRouteComponent(() => import('@/features/sync/sync-page'), 'SyncPage') });
export const interactionsRoute = createRoute({ getParentRoute: () => appRoute, path: '/interactions', validateSearch: listSearch, component: lazyRouteComponent(() => import('@/features/interactions/interactions-page'), 'InteractionsPage') });
const catchAll = createRoute({ getParentRoute: () => appRoute, path: '$', component: () => <Navigate to="/" /> });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([dashboardRoute, billingRoute, salesRoute, saleDetailRoute, itemsRoute, itemDetailRoute, inventoryRoute, purchasesRoute, purchaseNewRoute, purchaseReturnRoute, purchaseDetailRoute, suppliersRoute, customersRoute, doctorsRoute, labelsRoute, registersRoute, reportsRoute, auditRoute, settingsRoute, purchaseOrdersRoute, purchaseOrderNewRoute, purchaseOrderDetailRoute, messagesRoute, exportsRoute, syncRoute, interactionsRoute, catchAll]),
]);
export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
