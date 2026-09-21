-- Lock down demand_requests: no direct public (anon) access.
-- All reads/writes now go through server-side functions using the service role.

DROP POLICY IF EXISTS "Anyone can add a demand request" ON public.demand_requests;
DROP POLICY IF EXISTS "Anyone can view demand requests" ON public.demand_requests;
DROP POLICY IF EXISTS "Anyone can update request status" ON public.demand_requests;

REVOKE ALL ON public.demand_requests FROM anon;
REVOKE ALL ON public.demand_requests FROM authenticated;
GRANT ALL ON public.demand_requests TO service_role;

-- RLS stays enabled with zero policies: anon/authenticated get nothing.
ALTER TABLE public.demand_requests ENABLE ROW LEVEL SECURITY;