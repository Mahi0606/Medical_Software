import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTimeIN } from '@/lib/utils';
import { Badge, Callout, PageHeader, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { DuesTab } from './dues-tab';
import { OutboxTab } from './outbox-tab';
import { RefillsTab } from './refills-tab';
import { SettingsTab } from './settings-tab';
import type { MessagingStatus, PublicSettings } from './shared';

type TabKey = 'outbox' | 'refills' | 'dues' | 'settings';

export function MessagesPage() {
  const search = useSearch({ from: '/app/messages' });
  const nav = useNavigate();
  const { can } = useAuth();
  const status = useQuery({ queryKey: ['messages-status'], queryFn: () => api.get<MessagingStatus>('/messages/status'), refetchInterval: 30_000 });
  const settings = useQuery({ queryKey: ['messages-settings'], queryFn: () => api.get<PublicSettings>('/messages/settings') });

  const tabs: { key: TabKey; label: string; visible: boolean; count?: number }[] = [
    { key: 'outbox', label: 'Outbox', visible: true, count: status.data ? status.data.manual + status.data.queued + status.data.failed : undefined },
    { key: 'refills', label: 'Refills due', visible: true },
    { key: 'dues', label: 'Dues', visible: true },
    { key: 'settings', label: 'Settings', visible: can('settings.write') },
  ];
  const visible = tabs.filter((t) => t.visible);
  const requested = search.tab as TabKey | undefined;
  const tab: TabKey = requested && visible.some((t) => t.key === requested) ? requested : 'outbox';
  useEffect(() => { if (requested && requested !== tab) nav({ to: '/messages', search: (s) => ({ ...s, tab }), replace: true }); }, [requested, tab, nav]);
  const setTab = (t: string) => nav({ to: '/messages', search: (s) => ({ ...s, tab: t as TabKey, page: undefined }) });

  const s = status.data;
  const modeBadge = !s ? null : s.provider === 'meta_cloud' ? (s.configured ? <Badge tone="success">Cloud API connected</Badge> : <Badge tone="danger">Cloud API not configured</Badge>) : <Badge tone="neutral">Manual mode</Badge>;

  return (
    <div>
      <PageHeader title="Messages & reminders" description="Send bill copies, dues reminders and refill reminders on WhatsApp. Everything you queue is listed in the outbox.">
        {s && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-2">
            {modeBadge}
            {s.manual > 0 && <Badge tone="warning">{s.manual} to send</Badge>}
            {s.queued > 0 && <Badge tone="accent">{s.queued} queued</Badge>}
            {s.failed > 0 && <Badge tone="danger">{s.failed} failed</Badge>}
            {s.lastSentAt && <span>Last sent {formatDateTimeIN(s.lastSentAt)}</span>}
          </div>
        )}
      </PageHeader>
      {status.isError && <Callout tone="danger" title="Could not load messaging status" className="mb-3">{(status.error as Error).message}</Callout>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">{visible.map((t) => <TabsTrigger key={t.key} value={t.key} count={t.count || undefined}>{t.label}</TabsTrigger>)}</TabsList>
        <TabsContent value="outbox">{tab === 'outbox' && <OutboxTab status={s} filters={{ status: search.status, template: search.template, q: search.q, page: search.page }} onFilter={(f) => nav({ to: '/messages', search: (prev) => ({ ...prev, ...f }) })} />}</TabsContent>
        <TabsContent value="refills">{tab === 'refills' && <RefillsTab status={s} leadDays={settings.data?.refillLeadDays ?? 2} />}</TabsContent>
        <TabsContent value="dues">{tab === 'dues' && <DuesTab status={s} />}</TabsContent>
        <TabsContent value="settings">{tab === 'settings' && (settings.isLoading ? <Spinner /> : settings.isError ? <Callout tone="danger" title="Could not load settings">{(settings.error as Error).message}</Callout> : settings.data && <SettingsTab key={JSON.stringify(settings.data)} settings={settings.data} />)}</TabsContent>
      </Tabs>
    </div>
  );
}
