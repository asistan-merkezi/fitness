# Fitness Asistanı

Fitness salonları, PT stüdyoları ve spor kompleksleri için çok kiracılı işletme yönetim SaaS'ı. [Asistan Merkezi](https://github.com/asistan-merkezi) çatısı altında; mimari [Klinik Asistanı](https://github.com/asistan-merkezi/klinik) projesinden türetilir.

**Durum:** MVP-1 kodlandı (üyelik + check-in + cari + KVKK altyapısı); gerçek Supabase projesinde denenmeyi bekliyor → [`docs/kurulum.md`](docs/kurulum.md).

- Proje bağlamı: [`CLAUDE.md`](CLAUDE.md)
- Klinikten çıkarım planı: [`docs/klinikten-cikarim-plani.md`](docs/klinikten-cikarim-plani.md)
- Hukuki taslaklar (avukat onayı gerekir): [`docs/hukuki/`](docs/hukuki/README.md)

## Geliştirme

```bash
npm install
cp .env.example .env.local   # Supabase değerlerini doldur; .env.local commit edilmez
npm run dev
npm test && npm run lint && npx tsc --noEmit
```
