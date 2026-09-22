---
id: TASK-027.25
title: Vardiya PostgreSQL Schema Placement ve Persistence Karar Paketi
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya workflow kilitleme" placeholder'ıydı (önceki task'larda da
> ID'ler AI1 talimatıyla yeniden tanımlandı). AI1'in 2026-09-21 talimatıyla kapsam **schema placement/persistence karar
> paketi** olarak yeniden tanımlandı. Server-side kilitleme (Q-V09) bu task'ta **yapılmadı**; orijinal placeholder en
> altta korunmuştur. Talimat dosya adı `TASK-027-25-vardiya-postgresql-schema-karar-paketi.md` idi; aynı ID ye ait ikinci
> dosya açmamak için mevcut dosya adı korundu.

## AI2 Teslim Raporu (2026-09-21)

**Sonuç: karar paketi + blocker teslimi; schema/migration/seed BLOKLU, hiçbir şey uygulanmadı.**

Teslimatlar: `docs/migration/METNEX_SHIFT_REPORT_POSTGRES_SCHEMA_DECISION_PACKAGE.md`,
`docs/migration/METNEX_SHIFT_REPORT_SCHEMA_BLOCKER.md`, `BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only),
`docs/domain/DB_META.md` (yalnızca "pending data-plane candidate" referans notu).

**Kod kanıtıyla bulunanlar (yeni):**
- **F1** `tenantId` nullable (TASK-027.22) ↔ `DB_META` Tenant Isolation Standard madde 1 (NOT NULL) çelişkisi → N1/N2/N3 matrisi.
- **F2** Data-plane altyapısı yok (`DATA_PLANE_SCHEMA_VERSION='0000_empty'`, `pgSchema` kullanımı yok, fan-out runner yok);
  ShiftReport ilk data-plane tüketicisi olur.
- **F3** Gerçek tenant slug'ları küçük harfli ve ebeveyn önekli (`composeTenantSlug`), Wave 1 `'MOSB'/'MOSBIO'` anahtarlarıyla
  eşleşmez → **Q-V25 (yeni)**.
- **F4** MOSB/MOSBİO/MOSEDAŞ'ı oluşturan seed yok; tenant'lar çalışma zamanı verisi → Q-V20 `[DOĞRULANAMADI]`.
- **F5** PLATFORM_ROOT data-plane'i okuyamaz → mapping/staging yeri operasyonel etkili.
- **F6–F8** legacy unique ↔ tenant-scoped uniqueness, audit sink tenant filtresi yok, composite FK yalnızca çocuk tablo varsa.

**Karar paketleri (AI2 önerisi; nihai karar AI1/PO):**
- Q-V11: A `public` / B data-plane / **C iş verisi data-plane + metadata public (öneri)** / D hibrit (önerilmez).
- `shift_reports` 19 alanlı taslak (tip, null, FK, index, unique, izolasyon etkisi, kanıt, karar bağımlılığı) + index/constraint taslağı (SQL yok).
- Q-V21: M1–M5 matrisi → **M2 `public` mapping tablosu**, tenant `tenantId` FK ile; sözleşme alanları + `supersedesMappingId`.
- Q-ID01: staging şemaları, durumlar, ledger (kalıcı, PII'siz) vs payload (kısa ömürlü), retention (süre PO), temizleme yetkisi.
- Q-V20: preflight P1–P6 + `BLOCKED` kuralı; tenant oluşturulmaz.
- Q-V12: AU1–AU4 → **AU1 `metadata.tenantId`** şimdi, tenant kolonu ihtiyaç doğarsa ayrı additive migration.

**Kapatılan sorular: yok** (AI2 karar veremez). **Karar bekleyen (AÇIK):** Q-V11, Q-V20, Q-V21, Q-ID01, Q-V12, Q-V25, F1.
**Dokunulmayan açık sorular:** Q-V07/V08/V19, V16/V18, V22, V23, V24, V02/V03/V04/V05/V06/V09/V14/V15/V17, Q-T01, Q-V01, Q-S03, Q-P02.
Q-V10 tek tablo kararı korunmuştur.

**Yapılmayanlar:** Drizzle schema/migration/seed, tablo/tenant/mapping kaydı oluşturma, gerçek DB bağlantısı, API/service, permission
catalogue, UI, email, archive migration, Wave 2/3, Docker, git commit/push. `apps/` altında değişiklik yok.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (36 suite / 333 test; yalnızca dokümantasyon değişti).

### Durum
`status: done` — karar/blocker paketi AI1 tarafından onaylanmıştır. Schema/migration uygulaması
ilgili karar kapıları kapanana kadar başlatılmayacaktır.

## AI1 Onay — 2026-09-21

TASK-027.25 teslimatı yeniden tanımlanan schema placement/persistence karar paketi kapsamına
uygun bulunarak onaylandı ve `done` olarak kapatıldı. `tenantId NOT NULL` standardı ile önceki
nullable taslak arasındaki çelişki, gerçek slug formatı, data-plane altyapısının yokluğu,
tenant seed eksikliği ve PLATFORM_ROOT yönetim sınırı doğru biçimde blocker olarak kaydedildi.

Q-V11, Q-V20, Q-V21, Q-ID01, Q-V12, Q-V25 ve F1/Q-V17 ilişkisi açık kalmıştır. AI2 önerileri
karar olarak uygulanmamış; schema, migration, seed, tenant, mapping kaydı, API ve production
kodu oluşturulmamıştır. Q-V09 workflow kilitleme bu task'ın kapsamına alınmamıştır.

---

# TASK-027.25: Vardiya workflow kilitleme

## Amaç

Taslak, tamamlandı ve kilitli durum geçişlerini uygula.

## Wave ve bağımlılık

TASK-027.24

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
