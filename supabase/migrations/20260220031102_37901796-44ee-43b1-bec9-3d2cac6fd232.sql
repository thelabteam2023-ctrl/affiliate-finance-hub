UPDATE public.profiles
SET full_name = UPPER(full_name)
WHERE full_name IS NOT NULL
  AND full_name <> UPPER(full_name);