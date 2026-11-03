BEGIN;
-- Operational classification only: no employee backfill or org-unit changes.
CREATE TABLE public.departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
-- Access remains through the authenticated People server, not the Supabase Data API.
REVOKE ALL ON public.departments FROM PUBLIC;
INSERT INTO public.departments (id, name, sort_order) VALUES
 ('landscape','Landscape',1), ('archviz','ArchViz',2),
 ('interactive','Interactive',3), ('pelago','Pelago',4),
 ('marketing','Marketing',5), ('sales','Sales',6), ('management','Management',7);
ALTER TABLE public.employees ADD COLUMN department_id TEXT
 REFERENCES public.departments(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX idx_employees_department_id ON public.employees(department_id);
COMMIT;
