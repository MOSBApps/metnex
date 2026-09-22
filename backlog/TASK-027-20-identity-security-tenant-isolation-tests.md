---
id: TASK-027.20
title: Identity Security and Tenant Isolation Tests
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-18
---

> **Başlık/kapsam notu (2026-09-18):** Bu dosya, EPIC-004'ün ilk toplu backlog üretiminde
> `TASK-027.20 — Identity security tenant isolation tests` (status: `planned`) olarak
> oluşturulmuştu ve hiç başlatılmamıştı. AI1, aynı `TASK-027.20` kimliğini yakın bir kapsamla, 11
> somut kapsam maddesi (tenant/conflict/permission/root-tenant/password/session/dry-run/
> reconciliation güvenlik testleri + özyinelemeli statik dependency taraması) ile yeniden
> görevlendirdi. Orijinal kapsam hiç uygulanmadığı için çakışma/veri kaybı riski yoktur.

## AI2 Teslim Raporu — Identity Security and Tenant Isolation Tests (2026-09-18)

### Amaç

TASK-027.12–027.19 ile oluşturulan identity migration motoru, dry-run CLI ve reconciliation
akışının güvenlik/tenant izolasyonu/permission/credential sınırlarını **motoru gereksiz yere
değiştirmeden** kapsamlı testlerle doğrulamak.

### Teslimat

`apps/api/src/migration/botc-identity/security-tenant-isolation.spec.ts` (yeni, 33 test, 9
kategori — görev kapsam maddeleriyle birebir): tenant isolation, conflict security, permission
isolation, root tenant/aggregate, password security, session/email security, dry-run security,
reconciliation security, statik dependency boundary. Motorun/CLI'ın/reconciliation'ın (TASK-027.12–
027.19) mevcut hiçbir dosyası **değiştirilmedi**.

`docs/migration/METNEX_IDENTITY_SECURITY_TEST_MATRIX.md` (yeni) — tüm güvenlik test dosyalarının
konsolide envanteri ve kanıt özeti. `docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md`'ye
§0-H, `docs/migration/METNEX_IDENTITY_MIGRATION_RECONCILIATION.md`'ye §8 eklendi.

### Kritik Bulgu

`apps/api/src/migration/botc-identity/cli/` alt dizini, TASK-027.13/16/17'de yazılan hiçbir statik
bağımlılık taramasında (`readdirSync` özyinelemeli değildi) **hiç taranmamıştı** —
`dry-run-cli.ts`/`dry-run-cli-entry.ts`/`reconcile-cli-entry.ts`'in gerçek SQL Server/PostgreSQL/
session/email bağımlılığı içerip içermediği **doğrulanmamıştı**. Bu task'ta özyinelemeli bir
tarayıcı yazıldı ve `cli/`'nin gerçekten tarandığı bir sanity-check testiyle kanıtlandı (§9.1 test
grubu). **Sonuç: temiz** — hiçbir ihlal bulunamadı, ama artık varsayım değil kanıttır.

### Güvenlik Test Matrisi (özet)

| # | Kategori | Kanıt |
|---|---|---|
| 1 | Tenant isolation | MOSB/MOSEDAŞ/MOSBİO kullanıcıları yalnızca kendi tenant'ını alır (tam eşitlik), çapraz sızıntı yok, conflict başka kullanıcıyı etkilemez |
| 2 | Conflict security | FATAL raporlanır, membership yazılmaz, tekrar çalıştırma erişim üretmez, düzeltilince tek membership, üçüncü/fabrik değer yok |
| 3 | Permission isolation | Wave 2/3 izinleri role template'e asla girmez, kullanıcılar-arası izin sızıntısı yok, yalnızca 5 onaylı kod üretilebilir |
| 4 | Root tenant/aggregate | Membership satırı yalnızca `{userId,tenantSlug}`, `TenantScopeService`/`canAggregateChildren`'a referans yok |
| 5 | Password security | `RESET_REQUIRED` her zaman taban, `ADMIN_ASSIGNED` kaybolmuyor, credential alanı yok |
| 6 | Session/email security | Session/token alanı sıfır, tainted input `BLOCKED` |
| 7 | Dry-run security | Kalıcı state yok, `--apply` argv-parser'da tanınmıyor, deterministik |
| 8 | Reconciliation security | `UNRESOLVED` asla `MATCHED` görünmüyor |
| 9 | Statik dependency boundary | `cli/` dahil özyinelemeli tarama — SQL Server/PostgreSQL/session/email/Sirket/Wave2/Wave3 referansı yok |

### Kesinlikle yapılmayanlar (görev talimatına uygun)

Production migration davranışı değiştirme, gerçek SQL Server bağlantısı, gerçek PostgreSQL apply,
Drizzle schema/migration/seed, fiziksel staging tablosu, Q-ID01 kararı, Q-T01/Q-S03/Q-P02 kararı,
yeni tenant/permission kodu üretme, gerçek kullanıcı/veri/secret kullanma, session/email/self-
service akışı geliştirme, Wave 2/Wave 3 kodu, Docker çalıştırma, git commit/push — **hiçbiri
yapılmadı**.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → 0 hata.
- `pnpm --filter api exec jest migration/botc-identity --runInBand` → **234/234 test PASS** (21
  suite — önceki 201/201'den; TASK-027.12–19'un testlerinden hiçbiri bozulmadı).
- `./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır.
- Gerçek secret/parola/hash/connection string/kullanıcı verisi hiçbir dosyaya yazılmadı — tüm
  fixture'lar sentetiktir.

### Kalan riskler / sonraki bağımlılık

- Q-ID01, Q-T01, Q-S03, Q-P02 hâlâ açık/kapsam dışı; bu task hiçbirine dokunmadı.
- Bu test paketi motorun **mevcut** davranışını doğrular — gerçek bir SQL Server adapter'ı veya
  gerçek PostgreSQL apply katmanı yazıldığında, güvenlik testlerinin o katmanlar için de ayrıca
  genişletilmesi gerekecektir.
- Production kodu yalnızca yeni test/dokümantasyon dosyalarından oluşuyor; motorun/CLI'ın/
  reconciliation'ın mevcut hiçbir dosyası değiştirilmedi.

### Durum (2026-09-18 güncelleme — AI1 onayladı)

`status: done` — AI1/Product Owner incelemesiyle identity security and tenant isolation testleri
teslimi onaylandı (bkz. aşağıdaki "AI1 Final Onayı" bölümü).

## AI1 Final Onayı (2026-09-18)

TASK-027.20 teslimi onaylandı ve `done` olarak kapatıldı. Tenant isolation, conflict,
permission, root aggregate, password, session/email, dry-run, reconciliation ve recursive
dependency boundary testlerinin tamamı kabul edildi. `cli/` dizininin gerçekten tarandığı
sanity check ile doğrulandı.

Production migration davranışı, gerçek DB bağlantıları ve secret/veri kullanımı değişmedi.
`./scripts/check.sh --skip-docker` PASS ve 36 suite / 333 test kanıtı kabul edildi.

---

# TASK-027.20 (orijinal): Identity security tenant isolation tests

## Amaç

Auth, permission, tenant isolation ve audit testlerini oluştur.

## Wave ve bağımlılık

TASK-027.19

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
