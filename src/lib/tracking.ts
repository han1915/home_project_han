import { supabase } from "@/integrations/supabase/client";

const KEY = "hd_session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export type EventType =
  | "home_view"
  | "search_start"
  | "search_filter_apply"
  | "property_view"
  | "favorite_add"
  | "contact_click"
  | "analytics_view"
  | "market_view";

export async function trackEvent(
  event_type: EventType,
  event_data: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  try {
    await supabase.from("user_events").insert({
      session_id: getSessionId(),
      event_type,
      event_data: event_data as never,
      page_url: window.location.pathname,
    });
  } catch (e) {
    console.warn("trackEvent failed", e);
  }
}
