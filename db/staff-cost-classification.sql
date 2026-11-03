BEGIN;
ALTER TABLE public.departments ADD COLUMN production_classification TEXT
 CHECK (production_classification IN ('production','non_production'));
-- Explicit classification by durable Department ID, never inferred from Team or labels.
UPDATE public.departments SET production_classification = 'production'
 WHERE id IN ('landscape','archviz','interactive','pelago');
UPDATE public.departments SET production_classification = 'non_production'
 WHERE id IN ('marketing','sales','management');
COMMIT;
