ALTER TABLE public.supplier_tasks 
  ADD CONSTRAINT supplier_tasks_titular_id_fkey 
  FOREIGN KEY (titular_id) REFERENCES public.supplier_titulares(id);