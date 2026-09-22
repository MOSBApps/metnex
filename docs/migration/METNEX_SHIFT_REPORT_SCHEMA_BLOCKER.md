# Vardiya PostgreSQL Schema/Migration Implementation — Blocker Paketi (TASK-027.25)

> **Sonuç: Production schema/migration/seed yazımı BLOKLU.** Hiçbir Drizzle schema, migration, seed veya tablo
> oluşturulmamıştır. Karar paketi: `METNEX_SHIFT_REPORT_POSTGRES_SCHEMA_DECISION_PACKAGE.md`. Bu belge hiçbir soruyu
> kapatmaz; her blocker için etki, seçenekler, varsayım riski, gerekli karar ve karar sonrası dosya listesini verir.
> **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

Düzey: **A** = schema yazımını tamamen engeller · **B** = belirli tablo/kolon/constraint'i engeller · **C** = kapatılmadan
ilerlenebilir, ama varsayılan-koruma gerekir.

| # | Blocker | Düzey | Neden implementasyonu etkiler | Seçenekler | Varsayım riski | Gerekli karar | Karar sonrası dosyalar |
|---|---|---|---|---|---|---|---|
| **S1** | **Q-V11** schema placement | A | Tablonun hangi şemada/hangi Drizzle nesnesiyle tanımlanacağını (`pgTable` vs runtime `pgSchema`) ve migration mekanizmasını belirler | A `public` / B data-plane / **C iş verisi data-plane + metadata public (AI2 önerisi)** / D hibrit | Yanlış yerleşim = sonradan veri taşıma (C→A veya A→C yüksek maliyet); A seçmek DEC-0010'a aykırı | AI1/PO | Bkz. §S1 |
| **S2** | **Phase 5 data-plane altyapısı yok** (`DATA_PLANE_SCHEMA_VERSION='0000_empty'`, `pgSchema` kullanımı yok, fan-out runner yok) | A (S1=B/C ise) | ShiftReport ilk data-plane tüketicisi; migration runner, per-schema test harness, `migrationVersion` yönetimi yok | Phase 5'i ayrı altyapı task'ı yap (öneri) / Vardiya içinde yap / S1=A ile geç | Altyapıyı Vardiya içinde "hızlıca" eklemek fan-out/rollback hatalarını üretimde keşfettirir | AI1: altyapı task'ı sahipliği/sırası | Bkz. §S2 |
| **S3** | **F1: `tenantId` nullable (TASK-027.22) ↔ DB_META standardı (NOT NULL)** + **Q-V17** | A (`tenantId` kolonu tanımını engeller) | Kolon nullability, CHECK ve `scopeStatus` alanının varlığı buna bağlı | N1 NOT NULL + staging'de tut (öneri) / N2 nullable+CHECK (belgeli istisna) / N3 pseudo-tenant (**yasak**) | N2'yi varsaymak standardı sessizce delmek; N1'i varsaymak Q-V17'yi fiilen kapatmak | AI1/PO (Q-V17 ile birlikte) | Bkz. §S3 |
| **S4** | **Q-V21** mapping saklama | A (mapping olmadan RESOLVED satır üretilemez) | Mapping resolver'ın veri kaynağı, onay izi, tenant FK | M1 config / **M2 `public` tablo (öneri)** / M3 data-plane / M4 ayrı şema / M5 identity ile ortak | Config seçmek onay izini kaybettirir; data-plane seçmek PLATFORM_ROOT yönetimini imkânsızlaştırır | AI1/PO | Bkz. §S4 |
| **S5** | **Q-V25 (yeni)** mantıksal tenant anahtarı ↔ gerçek slug/kimlik | A | Gerçek slug'lar küçük harfli ve ebeveyn önekli (`composeTenantSlug`); Wave 1 `'MOSB'` anahtarları eşleşmez | Mapping `tenantId` ile bağlanır (öneri) / slug konvansiyonu belirlenir / logical-key tablosu | `tenantSlug='MOSB'` ile arama → hiçbir tenant bulunmaz ya da yanlış bulunur | AI1/PO | Bkz. §S4 |
| **S6** | **Q-V20** tenant varlığı `[DOĞRULANAMADI]` | A (apply/seed için) | Tenant yoksa RESOLVED mapping ve apply anlamsız; tenant oluşturmak yasak | Tenant provisioning ayrı task / mevcutluk teyidi (PO, DB erişimi olan sahip) | Var sanmak → apply'da tüm kayıtlar `BLOCKED`; yok sanmak → gereksiz provisioning | AI1/PO teyidi | Bkz. §S6 |
| **S7** | **Q-ID01** staging şeması + retention | B (staging tabloları, ledger, terfi akışı) | Staging'in şeması, durum kümesi, retention ve temizleme yetkisi | S-a public prefix / S-b `migration` şeması / **S-c düzleme göre (öneri)** | Kısa retention = rollback imkânsız; uzun = PII birikimi | AI1/PO (süre PO) | Bkz. §S7 |
| **S8** | **Q-V12** audit tenant izi | C | Yalnızca audit kolon/index; Vardiya `metadata` ile ilerleyebilir | **AU1 metadata (öneri)** / AU2 kolon / AU3 / AU4 | AU1 varsayımı sonra AU2'ye geçişte backfill gerektirir (düşük) | AI1/PO | Bkz. §S8 |
| **S9** | **Q-V14** `shiftCode` değer kümesi, **Q-V15** `operatorNameSnapshot`, **Q-V03** `logbookDate` tipi/UTC, **Q-V04/V09** status kümesi | B | CHECK'ler, kolon tipleri, snapshot kolonunun varlığı | Sorular ilgili paketlerde | Yanlış CHECK geçerli kaydı reddeder; kolon eklemek additive (düşük), daraltmak pahalı | PO | İlgili kolonların tanımı |
| **S10** | **Q-V13** gerçek SQL Server DDL (performans alanı var mı) | C | Kaynak şema kod-tabanlı; gerçek DDL alınmadan kolon eksik kalabilir | DDL alınır | Eksik kolon = migration'da veri kaybı | PO/DB sahibi | Kolon eklemeleri |
| **S11** | **Q-V01/Q-T01** lokasyon tenant sahipliği | B | Mapping içeriği (hangi lokasyon RESOLVED) | TASK-027.23 | — | PO | Mapping başlangıç satırları (onay sonrası) |

## Karar sonrası uygulama planı ve dosya listeleri (öneri sıra; hiçbiri şimdi uygulanmadı)

**§S2 — Phase 5 altyapı task'ı (önce):** `apps/api/src/db/` data-plane şema yardımcıları (`pgSchema(schemaName)` factory);
`apps/api/src/tenant-scope/data-plane-migration.runner.ts` (fan-out, `migrationVersion` güncelleme, `FAILED` işaretleme);
`tenant-scope.constants.ts` (`DATA_PLANE_SCHEMA_VERSION`); çok-şemalı test harness (`db/test-helpers/`); `docs/domain/DB_META.md`
+ `DEC-0010` Phase 5 durumu.

**§S1/§S3 — ShiftReport schema task'ı:** data-plane şema tanımı dosyası (ör. `apps/api/src/shift-reports/shift-report.schema.ts` veya
`db/data-plane/…`), data-plane migration SQL'i (`migrationVersion` artışı), tenant-isolation statik testi genişletmesi
(`db/tenant-isolation-schema.spec.ts`: `tenantId NOT NULL`, lider index'ler), `DB_META.md` "Applied so far" tablosu.

**§S4/§S5 — Mapping task'ı:** `apps/api/src/db/schema/` yeni public mapping tablosu + barrel (`index.ts`),
`apps/api/drizzle/migrations/000x_*.sql` (kısmi unique index dahil), mapping repository/servis, onay akışı task'ı.

**§S6 — Tenant provisioning task'ı:** tenant oluşturma/registry provizyonu (`TenantService`/`SaasService`/
`CustomerSchemaRegistryService.provision…` kullanan, seed yerine kontrollü provizyon); dosyalar o task'a ait.

**§S7 — Staging task'ı:** `public` identity staging tabloları + data-plane Vardiya staging tabloları; terfi (promotion) servisi;
retention/purge job'ı; `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md` §4 güncellemesi.

**§S8 — AU2 seçilirse:** `db/schema/operations.ts` (`platformAuditLogs.tenantId` + index), migration, `PlatformAuditService`
(`PlatformAuditLogInput.tenantId?`, `PlatformAuditListQuery.tenantId?`), metadata backfill task'ı.

## Doğrulama
Bu task'ta `apps/` altında hiçbir dosya eklenmedi/değiştirilmedi; hiçbir blocker varsayımla kapatılmadı.
