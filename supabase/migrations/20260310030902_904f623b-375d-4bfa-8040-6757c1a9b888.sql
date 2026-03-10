
-- Create storage bucket for bookmaker logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('bookmaker-logos', 'bookmaker-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow anyone to read (public logos)
CREATE POLICY "Public read access for bookmaker logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'bookmaker-logos');

-- RLS: Allow authenticated users to upload (for the sync function)
CREATE POLICY "Authenticated upload for bookmaker logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bookmaker-logos');

-- RLS: Allow service role to manage (edge function uses service role)
CREATE POLICY "Service role full access for bookmaker logos"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'bookmaker-logos')
WITH CHECK (bucket_id = 'bookmaker-logos');
