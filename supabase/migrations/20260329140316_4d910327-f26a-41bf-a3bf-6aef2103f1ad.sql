
-- Create public storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true);

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos');

-- Allow anyone to view photos (public bucket)
CREATE POLICY "Anyone can view photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'photos');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'photos');

-- Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos');
