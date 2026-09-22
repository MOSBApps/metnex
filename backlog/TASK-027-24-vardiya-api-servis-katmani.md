---
id: TASK-027.24
title: Vardiya API/Service Domain Boundary ve Scope Contract
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-19
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya API servis katmanı" placeholder'ıydı. AI1'in
> 2026-09-19 talimatıyla kapsam **kontrat/blocker teslimi** olarak yeniden tanımlandı (açık karar kapıları
> kapanmadıkça production kodu yok). Orijinal placeholder en altta korunmuştur.

## AI2 Teslim Raporu (2026-09-19)

**Sonuç: implementasyon BLOKLU — blocker + contract teslimi yapıldı; `apps/` altında hiçbir kod yazılmadı.**

Teslimatlar:
- `docs/migration/METNEX_SHIFT_REPORT_API_SERVICE_CONTRACT.md` — 5 endpoint (liste, detay, oluşturma,
  güncelleme, tamamlama) şema-nötr kontratı (istek/yanıt/doğrulama/scope kaynağı/permission/hata/audit/
  idempotency), servis sınırları, R1–R10 izolasyon kuralları, lifecycle, 12 satırlık idempotency/hata matrisi,
  audit tasarımı. Permission adları sembolik yer tutucu; kod uydurulmadı.
- `docs/migration/METNEX_SHIFT_REPORT_API_SERVICE_BLOCKER.md` — B0 (şema yok, yapısal) + Q-V07, V19, V11, V20,
  V21 (implementasyonu engeller), V22/V09/V14/V23 (endpoint bazlı), V16/V18/V08/V04/V12/V15/V24 (kontrata
  girer). Her biri için etki, seçenekler, varsayım riski, gerekli karar, karar sonrası dosya listesi + öneri
  uygulama sırası (schema → permission → tenant/mapping → `shift-reports/` → TASK-027.30).
- `BOTC_MIGRATION_OPEN_QUESTIONS.md` append-only: Q-V23 (idempotency anahtarı), Q-V24 (audit hata politikası).

Kod kanıtıyla bulunanlar:
1. `TenantScopeService` için üretim tüketicisi yok; ShiftReport ilk tüketici (Q-V11 doğrudan etkili).
2. `tenant-scope.service.spec.ts` (8 test) `resolve()` fail-closed/kapsam davranışını zaten kanıtlıyor → yeni
   Vardiya-siz test aynı kanıtı tekrarlar; bu yüzden **yeni test yazılmadı** (bilinçli karar, AI1 isterse eklenebilir).
3. `isSystemAdmin` iki guard'ı geçer ama `resolve()` PLATFORM_ROOT'ta 403 verir; normal tenant başlığıyla
   sistem yöneticisi o tenant kapsamını görür (mevcut davranış, yeni bypass yok).
4. `PermissionGuard`: `TENANT_ADMIN` rolü belirli permission aramadan geçer; `@RequirePermission` yoksa `true`
   döner (fail-open) → Vardiya endpoint'leri permission kodu olmadan yayınlanmamalı.
5. `platform_audit_logs` tenant kolonu yok → `tenantId` `metadata`'da (Q-V12 korundu); `log()` hata politikası Q-V24.
6. Uygulamada idempotency-key kuralı yok (Q-V23).

Kapatılmayanlar: Q-V07, V08, V11, V16, V18, V19, V20, V21, V22 (+ V09, V04, V12, V14, V15, V23, V24).
Yapılmayanlar: Drizzle schema/migration/seed, permission catalogue kodu, tenant/mapping tablosu, gerçek DB/veri,
UI, email, archive migration, Wave 2/3, Docker, git commit/push.
Doğrulama: `./scripts/check.sh --skip-docker` PASS (36 suite / 333 test; kod değişmedi).

### Durum
`status: done` — blocker/kontrat teslimi AI1 tarafından onaylanmıştır. Production implementation
açık karar kapıları kapanana kadar başlatılmayacaktır.

## AI1 Onay — 2026-09-20

TASK-027.24 teslimatı yeniden tanımlanan kapsamına uygun bulunarak onaylandı ve `done` olarak
kapatıldı. Şema-nötr API/service kontratı ve blocker paketi; tenant scope, permission fail-open
riskini, `isSystemAdmin`/`PLATFORM_ROOT` ayrımını, idempotency ve audit kararlarını izlenebilir
şekilde ortaya koymuştur. Production kodu, schema, migration, seed, DB bağlantısı veya mapping
tablosu oluşturulmaması kabul edildi.

Q-V07, Q-V08, Q-V11, Q-V16, Q-V18, Q-V19, Q-V20, Q-V21, Q-V22, Q-V23 ve Q-V24 ile ilgili
diğer lifecycle/audit soruları açık kalmıştır. `@RequirePermission` olmayan endpoint'lerin
fail-open davranışı TASK-027.30 güvenlik test girdisi olarak korunmuştur. Wave 2 ve Wave 3
kapsam dışıdır.

---

# TASK-027.24: Vardiya API servis katmanı

## Amaç

Vardiya listeleme, detay, oluşturma ve güncelleme akışını uygula.

## Wave ve bağımlılık

TASK-027.22; TASK-027.23

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
