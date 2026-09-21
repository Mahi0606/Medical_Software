import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Callout, PageHeader, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { AccountTab } from './account-tab';
import { BackupTab } from './backup-tab';
import { LicencesTab } from './licences-tab';
import { PrintingTab } from './printing-tab';
import type { Store } from './settings-shared';
import { StoreTab } from './store-tab';
import { UsersTab } from './users-tab';

type TabKey = 'store' | 'licences' | 'users' | 'printing' | 'backup' | 'account';

export function SettingsPage() {
  const search = useSearch({ from: '/app/settings' });
  const nav = useNavigate();
  const { can } = useAuth();
  const tabs: { key: TabKey; label: string; visible: boolean }[] = [
    { key: 'store', label: 'Store', visible: can('settings.write') },
    { key: 'licences', label: 'Licences', visible: can('settings.write') },
    { key: 'users', label: 'Users', visible: can('user.write') },
    { key: 'printing', label: 'Printing', visible: can('settings.write') },
    { key: 'backup', label: 'Backup', visible: can('backup.run') },
    { key: 'account', label: 'My account', visible: true },
  ];
  const visible = tabs.filter((t) => t.visible);
  const requested = search.tab as TabKey | undefined;
  const tab: TabKey = requested && visible.some((t) => t.key === requested) ? requested : visible[0]!.key;
  useEffect(() => { if (requested && requested !== tab) nav({ to: '/settings', search: { tab }, replace: true }); }, [requested, tab, nav]);

  const needsStore = tab === 'store' || tab === 'printing';
  const storeQ = useQuery({ queryKey: ['store'], queryFn: () => api.get<Store>('/store'), enabled: needsStore && can('settings.write') });

  return (
    <div>
      <PageHeader title="Settings" description={can('settings.write') ? 'Store details, licences, users, printing and backups. Changes are logged in the audit trail.' : 'Your account. Store settings are managed by the owner.'} />
      <Tabs value={tab} onValueChange={(v) => nav({ to: '/settings', search: { tab: v } })}>
        <TabsList className="mb-4">{visible.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
        {needsStore && (
          <TabsContent value={tab}>
            {storeQ.isLoading ? <Spinner /> : storeQ.isError ? <Callout tone="danger" title="Could not load store details">{(storeQ.error as Error).message}</Callout> : storeQ.data && (tab === 'store' ? <StoreTab key={storeQ.data.updatedAt ?? 'store'} store={storeQ.data} /> : <PrintingTab key={storeQ.data.updatedAt ?? 'print'} store={storeQ.data} />)}
          </TabsContent>
        )}
        <TabsContent value="licences">{tab === 'licences' && <LicencesTab />}</TabsContent>
        <TabsContent value="users">{tab === 'users' && <UsersTab />}</TabsContent>
        <TabsContent value="backup">{tab === 'backup' && <BackupTab />}</TabsContent>
        <TabsContent value="account">{tab === 'account' && <AccountTab />}</TabsContent>
      </Tabs>
    </div>
  );
}
