
ALTER VIEW public.v_daily_funnel SET (security_invoker = on);
ALTER VIEW public.v_filter_analysis SET (security_invoker = on);

DROP POLICY "events_insert" ON public.user_events;
DROP POLICY "favorites_insert" ON public.favorites;
DROP POLICY "favorites_delete" ON public.favorites;

CREATE POLICY "events_insert" ON public.user_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "favorites_insert" ON public.favorites FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "favorites_delete" ON public.favorites FOR DELETE TO anon, authenticated USING (true);
