-- =====================================================
-- MIGRATION: Schedule Blocks (Bloqueio de Agenda)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_org_date ON public.schedule_blocks(org_id, start_at);

-- RLS
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org blocks" ON public.schedule_blocks
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage org blocks" ON public.schedule_blocks
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );
