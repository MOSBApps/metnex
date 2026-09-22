# DB Collation Strategy Runbook

> Yeni proje başlatırken veya mevcut projede collation durumunu kontrol ederken bu rehberi kullan.
>
> **Kural:** Collation kararı proje init aşamasında alınmadan veri modeli "tamamlandı" sayılmaz. (DEC-0006)

---

## Bu Projenin Collation Kararı

Bu repository için bağlayıcı karar ayrıca [DEC-0007](../decisions/DEC-0007-metnex-db-locale-and-collation.md) içinde kayıtlıdır.

### Hedef Mimari: DB-Level ICU Turkish

| Alan | Değer |
|------|-------|
| App language | Turkish (tr-TR) |
| DB datlocprovider | `i` (ICU) — `LOCALE_PROVIDER = icu` |
| DB daticulocale | `tr-TR` |
| DB encoding | `UTF8` |
| Query collation | `tr-x-icu` — tüm kullanıcı başlığı/adı ORDER BY sorgularında |
| App-layer sort | `localeCompare('tr')` — frontend + Node enrichment |
| UNIQUE/index | `C` collation (email, slug) — case-sensitive, locale-bağımsız |
| ICU availability | ✓ `postgres:16-alpine` — `pg_collation` içinde `tr-x-icu` mevcut |
| Compose guardrail | `POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=tr-TR --encoding=UTF8"` |

> `metnex` için desteklenen model doğrudan DB-level ICU Turkish'tir.
> Farklı locale ile oluşturulmuş mevcut veritabanları uyumsuz kabul edilir ve
> `scripts/db/recreate-db-with-icu.sh` ile remediate edilmelidir.

---

## 1. Proje Init Checklist

Yeni proje ilk kurulurken şu kararları belgele:

```markdown
App language:       <dil>
DB locale_provider: icu                  # ZORUNLU — libc default kabul edilmez
DB icu_locale:      tr-TR                # BCP-47 tag
DB encoding:        UTF8
Query exceptions:   email/slug → C collation (UNIQUE, case-sensitive)
Search behaviour:   DB-level search + app-layer Turkish sort
Environment parity: dev/test/prod aynı image mi? ✓/✗
Compose guardrail:  POSTGRES_INITDB_ARGS set mi? ✓/✗
```

Bu kararı `docs/decisions/DEC-NNNN-db-locale.md` olarak kaydet.

---

## 2. Ortam Doğrulama

```bash
# Otomasyon: verify script
./scripts/db/verify-db-locale.sh                          # yerel Docker
./scripts/db/verify-db-locale.sh --env dev --host u@srv   # uzak

# Manuel kontroller:
# Mevcut DB locale
psql -c "SELECT datname, datlocprovider, daticulocale, pg_encoding_to_char(encoding) enc
         FROM pg_database WHERE datname = '<db>';"

# ICU collation listesi (tr için)
psql -c "SELECT collname, collprovider FROM pg_collation WHERE collname LIKE 'tr%';"

# Turkish sort smoke test
psql -c "SELECT v FROM unnest(ARRAY['Şeker','çalışan','İzmir','istanbul','Ankara']) v ORDER BY v COLLATE \"tr-x-icu\";"
# Beklenen sıra: Ankara, çalışan, istanbul, İzmir, Şeker
```

### Environment Parity

| Ortam | Image | ICU | INITDB_ARGS |
|-------|-------|-----|-------------|
| Dev (local) | `postgres:16-alpine` | ✓ | ✓ (compose.dev.yml) |
| Dev (server) | `postgres:16-alpine` | ✓ | ✓ (compose.infra.yml) |
| Test | `postgres:16-alpine` | ✓ | ✓ (compose.infra.yml) |
| Prod | `postgres:16-alpine` | ✓ | ✓ (compose.infra.yml) |

> **Uyarı:** Farklı image/OS kullanan ortamlarda `pg_collation` içeriği farklı olabilir. Her ortamda kontrol et.

---

## 3. Prisma / SQL ile Kullanım

```typescript
// Prisma çoğu orderBy ihtiyacı için DB default collation ile çalışır.
// Query-level explicit collation gerektiğinde raw SQL kullanılır:
await prisma.$queryRaw`
  SELECT name
  FROM tenants
  ORDER BY name COLLATE "tr-x-icu"
`
```

---

## 4. Frontend / Node Uygulama Katmanı

```typescript
// Türkçe sıralama — frontend ve enriched array sort
array.sort((a, b) => a.title.localeCompare(b.title, 'tr'))

// İkincil sort ile (itemOrder tie-break)
array.sort((a, b) => {
  if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder
  return a.title.localeCompare(b.title, 'tr')
})
```

---

## 5. Sonradan Değiştirmenin Maliyeti

> **`datlocprovider` değiştirilemez.** Veritabanı oluşturulurken belirlenir.

Collation değişikliği gerekirse (örn. libc → ICU geçişi):

```bash
# Otomatik (önerilen) — backup + recreate + restore + verify tek komutta:
./scripts/db/recreate-db-with-icu.sh --env local          # yerel Docker
./scripts/db/recreate-db-with-icu.sh --env prod --host user@sunucu  # uzak

# Manuel adımlar (gerekirse):
pg_dump -Fc metnex > backup.dump
psql -d postgres -c "DROP DATABASE metnex;"
psql -d postgres -c "CREATE DATABASE metnex
  LOCALE_PROVIDER = icu
  ICU_LOCALE      = 'tr-TR'
  ENCODING        = 'UTF8'
  TEMPLATE        = template0;"
pg_restore --no-owner --no-privileges -d metnex backup.dump
```

Detaylı runbook: `docs/runbooks/db-recreate-with-icu.md`

- Downtime: DB boyutuna bağlı (100 MB DB için ~5–20 dakika)
- Backup format: **`.dump` (pg_dump -Fc custom format)** — `restore-db.sh` bu formatı doğrudan destekler

**Bu yüzden: baştan karar ver.**

---

## 6. Sık Karşılaşılan Hatalar

| Belirti | Neden | Çözüm |
|---------|-------|-------|
| Türkçe karakterler (Ç, İ, Ö, Ş, Ü) listenin sonuna düşüyor | `C` veya `en_US` collation ORDER BY | `COLLATE "tr-x-icu"` ekle |
| `ERROR: collation "tr-x-icu" does not exist` | PostgreSQL ICU desteği yok | `postgres:16-alpine` yerine ICU destekli image kullan |
| Dev'de doğru sıra, prod'da yanlış | Ortamlar farklı image | Environment parity sağla |
| UNIQUE email büyük/küçük harf çakışması | Yanlış collation | Email için `lower()` + `C` collation |

---

## 7. Skeleton Initialization Note

> A derived project must not start schema design until app language and DB locale/collation are recorded.
>
> Minimum declaration:
> ```
> App language:   <language>
> DB locale:      <icu locale>
> Query collation:<x-icu collation>
> Exceptions:     <email/slug => C>
> ```

This note is intentionally generic. The concrete values belong to the derived project, not the skeleton.

---

## Related

- [DEC-0006](../decisions/DEC-0006-database-locale-and-collation-must-be-decided-at-project-init.md) — Generic policy
- [DEC-0007](../decisions/DEC-0007-metnex-db-locale-and-collation.md) — metnex kararı
- [DB_META.md](../domain/DB_META.md) — Bu projenin collation değerleri
