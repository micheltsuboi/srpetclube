-- Create storage bucket for daily report photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-report-photos', 'daily-report-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload daily report photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'daily-report-photos' 
    AND (storage.foldername(name))[1] = 'daily-reports'
);

-- Allow authenticated users to view photos from their org
CREATE POLICY "Users can view daily report photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'daily-report-photos');

-- Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete daily report photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'daily-report-photos');
