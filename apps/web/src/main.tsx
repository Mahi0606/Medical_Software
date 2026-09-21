import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { TooltipProvider } from './components/ui';
import { queryClient } from './lib/query';
import { router } from './router';
import { applyTheme, getTheme } from './lib/theme';

applyTheme(getTheme());
if (import.meta.env.DEV) (window as unknown as { __qc: unknown }).__qc = queryClient;
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
