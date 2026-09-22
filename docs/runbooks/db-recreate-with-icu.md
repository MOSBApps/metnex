# Runbook: Recreate Database with ICU Locale

> **Amaç:** mevcut proje veritabanını veriyi koruyarak ICU Turkish locale (`LOCALE_PROVIDER=icu, ICU_LOCALE=tr-TR`) ile yeniden oluşturmak.
>
> **Uygulama zamanı:** `scripts/db/verify-db-locale.sh` FAIL döndürdüğünde.
>
> **Etki:** Kısa downtime (DB erişilemez). Veri korunur.
>
> **Araçlar:** `scripts/db/recreate-db-with-icu.sh` · `scripts/db/verify-db-locale.sh`

---

## Önkoşullar

- [ ] `postgres:16-alpine` (ICU desteği mevcut)
- [ ] `pg_dump`, `pg_restore`, `psql` erişilebilir (container içinde veya PATH'de)
- [ ] Yeterli disk alanı: DB boyutunun 2×'i kadar (backup + restore için)
- [ ] Maintenance window bildirildi (prod için)
- [ ] Son kullanıcı kullanımı durduruldu veya gecenin saati seçildi (prod)
- [ ] Dev/test dry-run tamamlandı ve başarılı (prod öncesi zorunlu)

---

## 1. Mevcut Locale Durumunu Doğrula

```bash
# Yerel Docker
./scripts/db/verify-db-locale.sh

# Uzak ortam
./scripts/db/verify-db-locale.sh --env dev --host user@sunucu
./scripts/db/verify-db-locale.sh --env prod --host user@sunucu
```

Beklenen FAIL çıktısı (geçiş öncesi):

```
✗ datlocprovider = 'c' — beklenen: 'i' (ICU)
✗ daticulocale = 'NULL' — beklenen: tr-TR
SONUÇ: FAIL — 2 kontrol başarısız
```

---

## 2. Backup Komutları

### Yerel Docker

```bash
./scripts/db/recreate-db-with-icu.sh --env local --step backup
```

Backup şuraya kaydedilir: `backup/<db>-icu-migrate-<timestamp>.dump`

### Uzak Sunucu (dev / test)

```bash
./scripts/db/recreate-db-with-icu.sh \
  --env dev \
  --host user@sunucu \
  --step backup
```

Backup uzak sunucuda environment-scoped dizine kaydedilir:

| Ortam | Backup dizini              |
|-------|----------------------------|
| dev   | `/opt/metnex/dev/backup/`  |
| test  | `/opt/metnex/test/backup/` |
| prod  | `/opt/metnex/prod/backup/` |

> **Neden environment-scoped?** Farklı ortamların backup'ları karışmasın diye `/opt/metnex/<env>/backup/` altında tutulur.
> Backup dosyası formatı: `<db>-icu-migrate-<timestamp>.dump`

---

## 3. Recreate Komutu

> **DİKKAT:** Bu adım DB'yi siler ve yeniden oluşturur. Backup olmadan çalıştırmayın.

### Yerel Docker

```bash
./scripts/db/recreate-db-with-icu.sh \
  --env local \
  --step recreate \
  --backup-file backup/<backup_dosyası>.dump
```

Script şunu çalıştırır:

```sql
-- Active bağlantılar kesilir
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='metnex'...;

-- Drop
DROP DATABASE IF EXISTS metnex;

-- Create (ICU Turkish)
CREATE DATABASE metnex
    LOCALE_PROVIDER = icu
    ICU_LOCALE      = 'tr-TR'
    ENCODING        = 'UTF8'
    TEMPLATE        = template0;
```

### Uzak Sunucu

```bash
./scripts/db/recreate-db-with-icu.sh \
  --env prod \
  --host user@sunucu \
  --step recreate \
  --backup-file /opt/metnex/prod/backup/<backup_dosyası>.dump
```

---

## 4. Restore Komutu

```bash
# Yerel
./scripts/db/recreate-db-with-icu.sh \
  --env local \
  --step restore \
  --backup-file backup/<backup_dosyası>.dump

# Uzak
./scripts/db/recreate-db-with-icu.sh \
  --env prod \
  --host user@sunucu \
  --step restore \
  --backup-file /opt/metnex/prod/backup/<backup_dosyası>.dump
```

---

## 5. Verify Komutu

```bash
# Yerel
./scripts/db/verify-db-locale.sh

# Uzak
./scripts/db/verify-db-locale.sh --env prod --host user@sunucu
```

Beklenen PASS çıktısı (geçiş sonrası):

```
✓ datlocprovider = 'i' (ICU)
✓ daticulocale = 'tr-TR'
✓ encoding = UTF8
✓ pg_collation içinde 'tr-x-icu' mevcut
✓ Turkish sort: Ankara,çalışan,istanbul,İzmir,Şeker
SONUÇ: PASS ✓
```

---

## 6. Smoke Test

Restore başarıyla tamamlandıktan sonra uygulama smoke check:

```bash
# Yerel — migration smoke (psql)
PGPASSWORD=<pass> psql -h localhost -p 5433 -U metnex -d metnex \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
# → migration kayıtları görünür olmalı

PGPASSWORD=<pass> psql -h localhost -p 5433 -U metnex -d metnex \
  -c "SELECT count(*) FROM tenants;"
# → 1+ kayıt

PGPASSWORD=<pass> psql -h localhost -p 5433 -U metnex -d metnex \
  -c "SELECT count(*) FROM users;"
# → 1+ kayıt

# API health (uygulama çalışıyorsa)
curl -s http://localhost:3001/api/v1/health | jq .
# → { "status": "ok" }

# Turkish sort smoke
PGPASSWORD=<pass> psql -h localhost -p 5433 -U metnex -d metnex \
  -c "SELECT string_agg(v,',' ORDER BY v COLLATE \"tr-x-icu\") FROM unnest(ARRAY['İzmir','Ankara','Çorum','istanbul']) v;"
# → Ankara,Çorum,istanbul,İzmir
```

---

## 7. Tam Otomatik Akış (Tüm Adımlar)

Tek komutla precheck → backup → recreate → restore → verify → smoke:

```bash
# Yerel — dry-run (önce çalıştır)
./scripts/db/recreate-db-with-icu.sh --env local --dry-run

# Yerel — gerçek
./scripts/db/recreate-db-with-icu.sh --env local

# Uzak dev — dry-run
./scripts/db/recreate-db-with-icu.sh --env dev --host user@sunucu --dry-run

# Uzak dev — gerçek
./scripts/db/recreate-db-with-icu.sh --env dev --host user@sunucu

# Uzak prod — önce dry-run zorunlu
./scripts/db/recreate-db-with-icu.sh --env prod --host user@sunucu --dry-run
./scripts/db/recreate-db-with-icu.sh --env prod --host user@sunucu
```

---

## 8. Rollback

Restore başarısız veya uygulama çalışmıyorsa:

```bash
# Yerel rollback
./scripts/restore-db.sh \
  --file backup/<backup_dosyası>.dump

# Uzak rollback — backup dosyası önce yerele indirilir, sonra restore-db.sh remote'a SCP eder
scp user@sunucu:/opt/metnex/prod/backup/<backup_dosyası>.dump ./backup/
./scripts/restore-db.sh \
  --env prod \
  --file backup/<backup_dosyası>.dump \
  --host user@sunucu
```

> **Not:** `restore-db.sh` remote mod için backup dosyasını önce yerel makineye almanız gerekir;
> script SCP ile uzak sunucuya kopyalar ve orada restore eder.
> `CREATE DATABASE` ICU locale ile yapılır — restore edilen DB de ICU Turkish locale ile oluşturulur.

---

## 9. Dry-Run Planı (Dev → Test → Prod)

### Aşama 1 — Dev Dry-Run

```bash
./scripts/db/recreate-db-with-icu.sh --env local --dry-run
```

- Beklenen süre: < 1 dakika (sadece komut listesi)
- Doğrulama: Çıktıda `[DRY-RUN]` etiketli komutlar görünüyor
- Rollback noktası: Yok (destructive komut çalışmadı)

### Aşama 2 — Dev Gerçek Çalışma

```bash
./scripts/db/recreate-db-with-icu.sh --env local
```

- Beklenen süre: 2–5 dakika (DB boyutuna göre)
- Doğrulama: `verify-db-locale.sh` PASS + API health OK
- Rollback noktası: Backup alındıktan sonra adım adım ilerle

### Aşama 3 — Test Ortamı Dry-Run + Gerçek

```bash
# Uzak dry-run
./scripts/db/recreate-db-with-icu.sh --env dev --host user@sunucu --dry-run

# Uzak gerçek
./scripts/db/recreate-db-with-icu.sh --env dev --host user@sunucu
```

- Beklenen süre: 5–15 dakika (bant genişliğine bağlı dump/restore süresi)
- Doğrulama: Remote verify PASS + API /health OK

### Aşama 4 — Prod Maintenance

> Dev ve test geçmeden prod başlatılmaz.

```bash
# 1. Önce dry-run — çıktıyı incele
./scripts/db/recreate-db-with-icu.sh --env prod --host user@sunucu --dry-run

# 2. Maintenance window'da gerçek akış
./scripts/db/recreate-db-with-icu.sh --env prod --host user@sunucu
```

- Beklenen downtime: Backup + restore süresi (100MB DB için ~5–20 dakika)
- Doğrulama: Prod verify PASS + API /health + tenant listesi UI'dan kontrol

---

## 10. Bilinen Riskler ve Önlemler

| Risk | Önlem |
|------|-------|
| Active connection restore'u engeller | Script `pg_terminate_backend` ile tüm bağlantıları keser |
| Restore süresi tahmin edilenden uzun | Backup boyutunu önceden `du -sh backup/*.dump` ile ölçün |
| Owner/privilege kayıpları | `pg_restore --no-owner --no-privileges` — uygulama kendi permission'larını migration ile kurar |
| ICU locale adı farklı (`tr` vs `tr-TR`) | Script `tr-TR` kullanır; `pg_collation` `tr-x-icu` ismi farklıdır ama işlevsel olarak aynıdır |
| Environment parity bozulması | Tüm ortamlar `postgres:16-alpine` + `POSTGRES_INITDB_ARGS` ile sabitlenmiştir |
| Mevcut volume INITDB_ARGS'ı görmez | INITDB_ARGS sadece yeni cluster init'te geçerlidir — bu nedenle recreate scripti gereklidir |
| Extension kaybı | `pg_restore` extension'ları geri yükler; eksikse `docker exec psql CREATE EXTENSION` |

---

## 11. Downtime İletişim Notu

Prod maintenance öncesinde iletilecek mesaj taslağı:

```
Konu: Open Mas — Planlı Bakım [tarih saat]

Open Mas veritabanı Türkçe locale optimizasyonu için kısa planlı bakım yapılacaktır.
Tahmini süre: XX dakika.
Bakım süresi boyunca sisteme erişilememektedir.
Bakım tamamlandığında bildirim gönderilecektir.
```

---

## İlgili Belgeler

- [DB_META.md](../domain/DB_META.md) — Locale değerleri
- [db-collation-strategy.md](db-collation-strategy.md) — Collation stratejisi
- [DEC-0006](../decisions/DEC-0006-database-locale-and-collation-must-be-decided-at-project-init.md) — Karar kaydı
- `scripts/db/verify-db-locale.sh` — Doğrulama scripti
- `scripts/db/recreate-db-with-icu.sh` — Recreate scripti
