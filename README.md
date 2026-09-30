# Fitness Asistanı

Fitness salonları, PT stüdyoları ve spor kompleksleri için çok kiracılı işletme yönetim SaaS'ı. [Asistan Merkezi](https://github.com/asistan-merkezi) çatısı altında; mimari [Klinik Asistanı](https://github.com/asistan-merkezi/klinik) projesinden türetilir.

**Durum:** F1 tamam (uygulama iskeleti + giriş); veritabanı şeması sırada.

- Proje bağlamı: [`CLAUDE.md`](CLAUDE.md)
- Klinikten çıkarım planı: [`docs/klinikten-cikarim-plani.md`](docs/klinikten-cikarim-plani.md)
- İlk sürüm (MVP-1): üyelik + giriş (check-in) + cari

## Geliştirme

```bash
npm install
cp .env.example .env.local   # Supabase değerlerini doldur; .env.local commit edilmez
npm run dev
npm test && npm run lint && npx tsc --noEmit
```
