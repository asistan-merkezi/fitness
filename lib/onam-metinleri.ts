/**
 * KVKK onam/aydınlatma metinleri.
 *
 * ⚠️ TASLAK — avukat incelemesi olmadan canlıda kullanılmaz. Metin sürümü her onam kaydıyla birlikte
 * saklanır (kim, ne zaman, HANGİ metne): metin değişince sürüm değişmelidir. Sağlık verisi ve 18 yaş altı
 * sporcu verisi özel önem taşır; bkz. docs/hukuki/ ve skill: kvkk-legal.
 */
export const ONAM_METIN_SURUMU = "taslak-2026-09-30";

export const ONAM_METINLERI = {
  kvkk_aydinlatma: {
    baslik: "KVKK Aydınlatma Metni",
    gerekli: true,
    metin:
      "Kişisel verileriniz (kimlik ve iletişim bilgileri, üyelik ve ödeme kayıtları, giriş kayıtları) üyelik ve hizmet sözleşmesinin kurulması ve ifası, ödeme ve muhasebe işlemleri ile yasal yükümlülüklerimizin yerine getirilmesi amaçlarıyla işlenir. Ayrıntılar için işletmenin aydınlatma metnini müşteriye okutun/iletin. [TASLAK]",
    etiket: "Müşteriye KVKK aydınlatma metni okutuldu / bildirildi",
  },
  acik_riza_saglik: {
    baslik: "Sağlık Verisi Açık Rızası",
    gerekli: false,
    metin:
      "Spora uygunluğun değerlendirilmesi ve antrenman güvenliği için sağlık beyanınız ve sakatlık bilgileriniz (özel nitelikli kişisel veri) yalnızca bu amaçla ve yetkili personel tarafından işlenir. Açık rızanızı dilediğiniz zaman geri alabilirsiniz. [TASLAK]",
    etiket: "Sağlık bilgilerinin işlenmesine açık rıza verdi",
  },
  ticari_ileti: {
    baslik: "Ticari Elektronik İleti İzni",
    gerekli: false,
    metin:
      "Kampanya ve duyuruların SMS/e-posta/arama ile iletilmesine izin verilmesi isteğe bağlıdır ve üyelik şartı değildir. Onay verilirse İleti Yönetim Sistemi (İYS) kaydı da yapılmalıdır. [TASLAK]",
    etiket: "Ticari elektronik ileti alabilir (İYS kaydı ayrıca yapılmalı)",
  },
  taahhutname: {
    baslik: "Salon Kullanım Taahhütnamesi",
    gerekli: false,
    metin: "Müşteri, salon kullanım kurallarını ve sorumluluk şartlarını okuyup kabul ettiğini beyan eder. [TASLAK]",
    etiket: "Salon kullanım taahhütnamesi imzalandı",
  },
  veli_onayi: {
    baslik: "Veli / Vasi Onayı (18 yaş altı)",
    gerekli: false,
    metin: "18 yaşından küçük sporcunun üyeliği ve kişisel verilerinin işlenmesi için veli/vasi onayı alınmıştır. [TASLAK]",
    etiket: "Veli / vasi onayı alındı",
  },
} as const;
