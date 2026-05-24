export type EventType =
  | "home_view" | "search_start" | "search_filter_apply"
  | "property_view" | "favorite_add" | "contact_click"
  | "analytics_view" | "market_view";

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
      event_data: data ?? {},
    });
  } catch {}
}
