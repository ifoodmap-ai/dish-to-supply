// Lightweight in-house product analytics: writes events to the app_events
// table (anon INSERT-only RLS; admins read them on the dashboard funnel).
// No external service/account needed. Fire-and-forget — never blocks UX.
import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY_STORAGE = 'ifm_session_key';

const getSessionKey = (): string => {
  try {
    let key = localStorage.getItem(SESSION_KEY_STORAGE);
    if (!key) {
      key = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(SESSION_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return 'anonymous';
  }
};

export type AppEvent =
  | 'analysis_started'
  | 'analysis_completed'
  | 'contact_captured'
  | 'match_viewed'
  | 'inquiry_sent'
  | 'supplier_applied';

export const track = (event: AppEvent, properties: Record<string, unknown> = {}): void => {
  try {
    void (supabase as never as {
      from: (t: string) => { insert: (row: object) => Promise<unknown> };
    })
      .from('app_events')
      .insert({ event, properties, session_key: getSessionKey() });
  } catch {
    // analytics must never break the app
  }
};
