
-- 1) Tabela schools
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  cnpj text,
  address text,
  phone text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_schools_updated_at
BEFORE UPDATE ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Escola padrão
INSERT INTO public.schools (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Escola Principal', 'principal');

-- 3) school_id em todas as tabelas
ALTER TABLE public.classrooms        ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.children          ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.guardians         ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.devices           ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.guardian_children ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.guardian_devices  ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.monitor_classrooms ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.pickup_events     ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.recognition_log   ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles        ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.profiles          ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

-- 4) Backfill
UPDATE public.classrooms        SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.children          SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.guardians         SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.devices           SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.guardian_children SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.guardian_devices  SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.monitor_classrooms SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.pickup_events     SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.recognition_log   SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.profiles          SET school_id='00000000-0000-0000-0000-000000000001';
UPDATE public.user_roles        SET school_id='00000000-0000-0000-0000-000000000001';

-- 5) NOT NULL
ALTER TABLE public.classrooms        ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.children          ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.guardians         ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.devices           ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.guardian_children ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.guardian_devices  ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.monitor_classrooms ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.pickup_events     ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.recognition_log   ALTER COLUMN school_id SET NOT NULL;

-- 6) Promover admin atual a super_admin (acumula)
INSERT INTO public.user_roles (user_id, role, school_id)
VALUES ('24a2bda5-2414-4185-9ecb-6259a68a3259', 'super_admin'::public.app_role, NULL)
ON CONFLICT DO NOTHING;

-- 7) Funções
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='super_admin')
$$;

CREATE OR REPLACE FUNCTION public.get_user_school(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT school_id FROM public.user_roles
  WHERE user_id=_user_id AND school_id IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_school(_user_id uuid, _role app_role, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=_user_id AND role=_role AND school_id=_school_id
  )
$$;

-- 8) Trigger preenche school_id automaticamente
CREATE OR REPLACE FUNCTION public.set_school_id_from_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    NEW.school_id := public.get_user_school(auth.uid());
  END IF;
  IF NEW.school_id IS NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'school_id é obrigatório';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['classrooms','children','guardians','devices','guardian_children','guardian_devices','monitor_classrooms','pickup_events','recognition_log']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_set_school BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_school_id_from_user()', t, t);
  END LOOP;
END $$;

-- 9) RLS schools
CREATE POLICY "Super admin manage schools" ON public.schools FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Authenticated view own school" ON public.schools FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR id = public.get_user_school(auth.uid()));

-- 10) Reescrever RLS
-- classrooms
DROP POLICY IF EXISTS "Admins can manage classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Authenticated users can view classrooms" ON public.classrooms;
CREATE POLICY "Super admin all classrooms" ON public.classrooms FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage classrooms" ON public.classrooms FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Same-school view classrooms" ON public.classrooms FOR SELECT
  TO authenticated USING (school_id = public.get_user_school(auth.uid()));

-- children
DROP POLICY IF EXISTS "Admins can manage children" ON public.children;
DROP POLICY IF EXISTS "Reception can view all children" ON public.children;
DROP POLICY IF EXISTS "Teachers can view children in their classroom" ON public.children;
CREATE POLICY "Super admin all children" ON public.children FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage children" ON public.children FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Reception view children same school" ON public.children FOR SELECT
  USING (public.has_role_in_school(auth.uid(),'reception',school_id));
CREATE POLICY "Teachers view children own classroom" ON public.children FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.classrooms c
    WHERE c.id=children.classroom_id AND c.teacher_user_id=auth.uid() AND c.school_id=children.school_id));

-- guardians
DROP POLICY IF EXISTS "Admins can manage guardians" ON public.guardians;
DROP POLICY IF EXISTS "Authenticated users can view guardians" ON public.guardians;
CREATE POLICY "Super admin all guardians" ON public.guardians FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage guardians" ON public.guardians FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Same-school view guardians" ON public.guardians FOR SELECT
  TO authenticated USING (school_id = public.get_user_school(auth.uid()));

-- devices
DROP POLICY IF EXISTS "Admins can manage devices" ON public.devices;
DROP POLICY IF EXISTS "Reception can view devices" ON public.devices;
CREATE POLICY "Super admin all devices" ON public.devices FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage devices" ON public.devices FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Same-school view devices" ON public.devices FOR SELECT
  TO authenticated USING (school_id = public.get_user_school(auth.uid()));

-- guardian_children
DROP POLICY IF EXISTS "Admins can manage guardian_children" ON public.guardian_children;
DROP POLICY IF EXISTS "Authenticated users can view guardian_children" ON public.guardian_children;
CREATE POLICY "Super admin all gc" ON public.guardian_children FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage gc" ON public.guardian_children FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Same-school view gc" ON public.guardian_children FOR SELECT
  TO authenticated USING (school_id = public.get_user_school(auth.uid()));

-- guardian_devices
DROP POLICY IF EXISTS "Admins can manage guardian_devices" ON public.guardian_devices;
DROP POLICY IF EXISTS "Authenticated can view guardian_devices" ON public.guardian_devices;
DROP POLICY IF EXISTS "Reception can view guardian_devices" ON public.guardian_devices;
CREATE POLICY "Super admin all gd" ON public.guardian_devices FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage gd" ON public.guardian_devices FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Same-school view gd" ON public.guardian_devices FOR SELECT
  TO authenticated USING (school_id = public.get_user_school(auth.uid()));

-- monitor_classrooms
DROP POLICY IF EXISTS "Admins can manage monitor_classrooms" ON public.monitor_classrooms;
DROP POLICY IF EXISTS "Users can view own monitor_classrooms" ON public.monitor_classrooms;
CREATE POLICY "Super admin all mc" ON public.monitor_classrooms FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage mc" ON public.monitor_classrooms FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Users view own mc" ON public.monitor_classrooms FOR SELECT
  USING (auth.uid() = user_id);

-- pickup_events
DROP POLICY IF EXISTS "Admins can manage pickup_events" ON public.pickup_events;
DROP POLICY IF EXISTS "Reception can view all pickup_events" ON public.pickup_events;
DROP POLICY IF EXISTS "Teachers can update their classroom pickup_events" ON public.pickup_events;
DROP POLICY IF EXISTS "Teachers can view their classroom pickup_events" ON public.pickup_events;
CREATE POLICY "Super admin all pe" ON public.pickup_events FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage pe" ON public.pickup_events FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Reception view pe same school" ON public.pickup_events FOR SELECT
  USING (public.has_role_in_school(auth.uid(),'reception',school_id));
CREATE POLICY "Teachers view pe own classroom" ON public.pickup_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.classrooms c
    WHERE c.id=pickup_events.classroom_id AND c.teacher_user_id=auth.uid() AND c.school_id=pickup_events.school_id));
CREATE POLICY "Teachers update pe own classroom" ON public.pickup_events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.classrooms c
    WHERE c.id=pickup_events.classroom_id AND c.teacher_user_id=auth.uid() AND c.school_id=pickup_events.school_id));

-- recognition_log
DROP POLICY IF EXISTS "Admins can manage recognition_log" ON public.recognition_log;
DROP POLICY IF EXISTS "Reception can view recognition_log" ON public.recognition_log;
CREATE POLICY "Super admin all rl" ON public.recognition_log FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage rl" ON public.recognition_log FOR ALL
  USING (public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Reception view rl same school" ON public.recognition_log FOR SELECT
  USING (public.has_role_in_school(auth.uid(),'reception',school_id));

-- user_roles
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Super admin all ur" ON public.user_roles FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin manage ur" ON public.user_roles FOR ALL
  USING (school_id IS NOT NULL AND public.has_role_in_school(auth.uid(),'admin',school_id))
  WITH CHECK (school_id IS NOT NULL AND public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admin all profiles" ON public.profiles FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School admin view profiles" ON public.profiles FOR SELECT
  USING (school_id IS NOT NULL AND public.has_role_in_school(auth.uid(),'admin',school_id));
CREATE POLICY "School admin update profiles" ON public.profiles FOR UPDATE
  USING (school_id IS NOT NULL AND public.has_role_in_school(auth.uid(),'admin',school_id));

-- 11) Índices
CREATE INDEX IF NOT EXISTS idx_classrooms_school ON public.classrooms(school_id);
CREATE INDEX IF NOT EXISTS idx_children_school ON public.children(school_id);
CREATE INDEX IF NOT EXISTS idx_guardians_school ON public.guardians(school_id);
CREATE INDEX IF NOT EXISTS idx_devices_school ON public.devices(school_id);
CREATE INDEX IF NOT EXISTS idx_pickup_events_school ON public.pickup_events(school_id);
CREATE INDEX IF NOT EXISTS idx_recognition_log_school ON public.recognition_log(school_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_school ON public.user_roles(school_id);
