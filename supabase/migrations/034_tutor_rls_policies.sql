-- =====================================================
-- FIX: RLS Policies for Tutors (Customers)
-- =====================================================

-- 1. Profiles: Tutors can update their own phone and avatar
-- (Policy "Users can update own profile" already exists for ALL users)

-- 2. Customers: Tutors can view their own customer record
CREATE POLICY "Tutors can view own customer record" ON public.customers
FOR SELECT USING (
    user_id = auth.uid()
);

-- 3. Pets: Tutors can view only their own pets
CREATE POLICY "Tutors can view own pets" ON public.pets
FOR SELECT USING (
    customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
);

-- 4. Appointments: Tutors can view only their own appointments
CREATE POLICY "Tutors can view own appointments" ON public.appointments
FOR SELECT USING (
    pet_id IN (
      SELECT id FROM public.pets 
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
);

-- 5. Daily Reports: Tutors can view reports for their own pets
CREATE POLICY "Tutors can view own pet reports" ON public.daily_reports
FOR SELECT USING (
    pet_id IN (
      SELECT id FROM public.pets 
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
);
