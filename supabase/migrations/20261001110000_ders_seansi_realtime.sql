-- Ana ekran "Günün Çizelgesi" canlı güncelleme: ders_seansi değişiklikleri Supabase Realtime yayınına eklenir.
-- (UYGULANMADI — 20260930160000 sonrası.) Realtime, RLS'i abonelikte de uygular: yönetici/resepsiyon tüm dersleri,
-- antrenör yalnız kendi derslerini alır. Yayın yoksa (yerel/test) hiçbir şey yapılmaz; uygulama 30 sn'lik yenilemeye düşer.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ders_seansi'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ders_seansi;
  END IF;
END $$;

-- Kontrol:
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ders_seansi';
