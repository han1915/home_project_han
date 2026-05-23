
-- properties
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(255) NOT NULL,
  district VARCHAR(100),
  sigun_gu VARCHAR(100),
  area_sqm FLOAT,
  price_ten_thousand INT,
  building_year INT,
  transaction_type VARCHAR(50),
  road_address VARCHAR(255),
  jibun_address VARCHAR(255),
  contract_date DATE,
  contract_month VARCHAR(6),
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_properties_sigun_gu ON public.properties(sigun_gu);
CREATE INDEX idx_properties_price ON public.properties(price_ten_thousand);
CREATE INDEX idx_properties_type ON public.properties(transaction_type);

-- events
CREATE TABLE public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_session ON public.user_events(session_id);
CREATE INDEX idx_events_type ON public.user_events(event_type);
CREATE INDEX idx_events_created ON public.user_events(created_at);

-- favorites
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, property_id)
);

-- RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_read" ON public.properties FOR SELECT USING (true);
CREATE POLICY "events_read" ON public.user_events FOR SELECT USING (true);
CREATE POLICY "events_insert" ON public.user_events FOR INSERT WITH CHECK (true);
CREATE POLICY "favorites_read" ON public.favorites FOR SELECT USING (true);
CREATE POLICY "favorites_insert" ON public.favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "favorites_delete" ON public.favorites FOR DELETE USING (true);

-- views
CREATE VIEW public.v_daily_funnel AS
SELECT
  DATE(created_at) AS event_date,
  COUNT(DISTINCT CASE WHEN event_type = 'home_view' THEN session_id END) AS home_views,
  COUNT(DISTINCT CASE WHEN event_type = 'search_start' THEN session_id END) AS search_starts,
  COUNT(DISTINCT CASE WHEN event_type = 'search_filter_apply' THEN session_id END) AS filter_applies,
  COUNT(DISTINCT CASE WHEN event_type = 'property_view' THEN session_id END) AS property_views,
  COUNT(DISTINCT CASE WHEN event_type = 'favorite_add' THEN session_id END) AS favorite_adds,
  COUNT(DISTINCT CASE WHEN event_type = 'contact_click' THEN session_id END) AS contact_clicks
FROM public.user_events
GROUP BY DATE(created_at)
ORDER BY event_date DESC;

CREATE VIEW public.v_filter_analysis AS
SELECT
  event_data->>'sigun_gu' AS sigun_gu,
  event_data->>'transaction_type' AS transaction_type,
  COUNT(*) AS filter_count
FROM public.user_events
WHERE event_type = 'search_filter_apply'
GROUP BY sigun_gu, transaction_type;
