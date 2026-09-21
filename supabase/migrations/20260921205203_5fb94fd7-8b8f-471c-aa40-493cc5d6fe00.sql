CREATE TABLE public.demand_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transcript TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.demand_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_requests TO authenticated;
GRANT ALL ON public.demand_requests TO service_role;

ALTER TABLE public.demand_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view demand requests" ON public.demand_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can add a demand request" ON public.demand_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update request status" ON public.demand_requests FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX demand_requests_product_idx ON public.demand_requests (product_name);
CREATE INDEX demand_requests_created_idx ON public.demand_requests (created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_requests;