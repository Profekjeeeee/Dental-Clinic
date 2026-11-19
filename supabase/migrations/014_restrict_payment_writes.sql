BEGIN;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER POLICY payments_insert_authenticated ON public.payments
  WITH CHECK (public.same_user_clinic(clinic_id) AND public.is_staff_user());

ALTER POLICY payments_update_authenticated ON public.payments
  USING (public.same_user_clinic(clinic_id) AND public.is_staff_user())
  WITH CHECK (public.same_user_clinic(clinic_id) AND public.is_staff_user());

COMMIT;
