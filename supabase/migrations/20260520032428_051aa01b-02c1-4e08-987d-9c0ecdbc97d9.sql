-- Clear dummy data
TRUNCATE TABLE public.favorites, public.user_events, public.properties;

-- Add columns for real apartment trade data
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS apt_name text,
  ADD COLUMN IF NOT EXISTS floor integer,
  ADD COLUMN IF NOT EXISTS lawd_cd varchar(5);

-- Indexes for ~10k row search performance
CREATE INDEX IF NOT EXISTS idx_properties_district ON public.properties(district);
CREATE INDEX IF NOT EXISTS idx_properties_transaction_type ON public.properties(transaction_type);
CREATE INDEX IF NOT EXISTS idx_properties_contract_date ON public.properties(contract_date DESC);
CREATE INDEX IF NOT EXISTS idx_properties_price ON public.properties(price_ten_thousand);
CREATE INDEX IF NOT EXISTS idx_properties_lawd_cd ON public.properties(lawd_cd);
CREATE INDEX IF NOT EXISTS idx_user_events_session ON public.user_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type ON public.user_events(event_type);