'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { Admin } from '@/lib/types';

const DeskContext = createContext<Admin | null>(null);
const ToastContext = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});

export function useDesk() {
  const admin = useContext(DeskContext);
  if (!admin) throw new Error('Desk is not ready');
  return admin;
}

export function useToast() {
  return useContext(ToastContext);
}

export function DeskProviders({
  admin,
  children,
}: {
  admin: Admin;
  children: React.ReactNode;
}) {
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const notify = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  return (
    <DeskContext.Provider value={admin}>
      <ToastContext.Provider value={notify}>
        {children}
        {toast ? (
          <div className={toast.tone === 'bad' ? 'toast bad' : 'toast'} role="status">
            {toast.text}
          </div>
        ) : null}
      </ToastContext.Provider>
    </DeskContext.Provider>
  );
}
