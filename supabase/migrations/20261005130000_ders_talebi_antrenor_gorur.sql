-- Ders talebi: talepte seçilen antrenör kendisine yönlendirilen BEKLEYEN/geçmiş talebi okuyabilir (salt-okunur; bildirim zili).
-- Yazma/yanıtlama değişmez: ders_talebi_yanitla ve ders_talebi_olustur yalnız isletme_admin/resepsiyon. Idempotent.

DROP POLICY IF EXISTS "ders_talebi_select" ON public.musteri_ders_talebi;
CREATE POLICY "ders_talebi_select" ON public.musteri_ders_talebi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (
      isletme_id = (SELECT public.current_isletme_id())
      AND (SELECT public.current_rol()) = 'antrenor'
      AND antrenor_id = (SELECT auth.uid())
    )
    OR (SELECT public.is_super_admin())
  );
