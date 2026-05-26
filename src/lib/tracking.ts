import type { Json } from "@/integrations/supabase/types";

export type EventType =
  | "home_view"
  | "search_start"
  | "search_filter_apply"
  | "search_price_filter"
  | "search_filter_reset"
  | "search_load_more"
  | "property_view"
  | "favorite_add"
  | "favorite_remove"
  | "market_view"
  | "market_tab_change"
  | "market_district_select"
  | "analytics_view";

const SESSION_KEY = "hd_session";

export function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export async function trackEvent(type: EventType, data?: Record<string, unknown>) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.from("user_events").insert({
      session_id: getSessionId(),
      event_type: type,
      event_data: (data ?? {}) as Record<string, Json | undefined>,
      page_url: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  } catch {}
}
