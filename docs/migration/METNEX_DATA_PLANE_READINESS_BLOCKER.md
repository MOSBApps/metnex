# Data-Plane Readiness — Blocker Paketi (TASK-027.26)

> **Güncel not (TASK-027.31):** registry durum güvenliği kısmen uygulandı — bkz. dosya sonu "TASK-027.31 Güncellemesi"; aşağıdaki "kod yazılmamıştır" ifadesi TASK-027.26 anı içindir.
> **Sonuç (TASK-027.26 anı): `shift_reports` schema/repository/API için data-plane hazır DEĞİL.** Hiçbir altyapı/kod yazılmamıştır. Karar paketi:
> `METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md`; standart: `METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`.
> Bu belge hiçbir soruyu kapatmaz. **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

Düzey: **A** = sonraki adımı tamamen engeller · **B** = kısmen · **C** = kapatılmadan ilerlenebilir (varsayılan-koruma).

## 1. Blocker tablosu

| # | Blocker | Düzey | Etki | Seçenekler | Varsayım riski | Gerekli karar | Karar sonrası dosyalar |
|---|---|---|---|---|---|---|---|
| **R1** | **Mimari seçim (Q-V11):** A/B/**C**/D | A | Her sonraki adımın temeli | AI2 önerisi C | Yanlış yerleşim = iş verisi yazıldıktan sonra taşıma (C→B/C→A yüksek) | AI1/PO | DEC-0010 güncellemesi, `DB_META.md` |
| **R2** | **Phase 5-9 kapsam tanımı** (D6, Q-DP06): Phase 7-9 belgesiz; DEC-0010 "pending review" | A | "Foundation hazır" ölçülemez | AI1 Phase 5-9'u yazılı tanımlar | Belirsiz kapsamla altyapı yazmak yeniden iş | AI1 | DEC-0010 (Phase 5-9 bölümü), yeni DEC |
| **R3** | **Registry düzeltmeleri:** D1 (`ARCHIVED` yeniden aktivasyon, Q-DP03), D2 (`FAILED` için retry sahibi, Q-DP04), registry↔fiziksel schema doğrulaması yok | A (Vardiya iş verisi öncesi) | Arşivlenmiş schema canlanabilir; FAILED kendiliğinden iyileşmez; `resolve()` var olmayan schema'yı ACTIVE sanabilir | Ayrı düzeltme task'ı; spec genişletme | Düzeltmeden iş verisi yazmak = yanlış schema'ya yazma/kayıp | AI1 (davranış kararı) | `customer-schema-registry.service.ts` (+ spec), `tenant-scope.service.ts` (fiziksel doğrulama noktası), `saas.service.ts` (retry) |
| **R4** | **Fan-out migration runner yok** | A | Data-plane tabloları oluşturulamaz/sürümlenemez | Standart (bu paket) uygulanır; tetikleyici Q-DP02 | Runner'sız tablo = elle DDL, sürüm kayması | AI1 (tetikleyici/yetki, hata eşikleri, retry sayısı, timeout) | `tenant-scope/data-plane-migration.*` (runner, ledger tabloları `public` schema'ya), `drizzle` yapılandırması (data-plane migration klasörü), `tenant-scope.constants.ts` |
| **R5** | **Per-schema/çok-müşterili test harness yok** | A | Cross-customer izolasyonu kanıtlanamaz | Gerçek PG test DB'si (ayrı task; bu task'ta bağlantı yasak) | Harness'siz izolasyon iddiası doğrulanamaz | AI1 (test DB politikası) | `db/test-helpers/`, `test/` altyapısı, CI (`pipeline.yml`) |
| **R6** | **`pgSchema` fabrikası ve statik güvenlik testleri** | B | `schemaName` yalnızca `resolve()`'dan + allowlist; başka `pgSchema` kullanımı yasak | Tek fabrika + statik test (kararsız değil, tasarım) | Fabrikasız dağınık `pgSchema` = D3 | — (R1'e bağlı) | `db/data-plane/*.ts`, statik spec |
| **R7** | **Sürüm geçidi + provisioning tutarlılığı (Q-DP01)** | B | Schema eski sürümde kalırsa uygulama yanlış şekle sorgu atar; yeni müşteri boş schema ile `ACTIVE` | `resolve()` sürüm kontrolü (davranış değişir) / ayrı katman | `resolve()`'u sessizce değiştirmek mevcut testleri/sözleşmeyi bozar | AI1/PO | `tenant-scope.service.ts` (+ spec), `customer-schema-registry.service.ts` |
| **R8** | **Tenant/registry varlığı (Q-V20) + eski tenant backfill (D8)** | A (apply için) | Registry/closure yoksa `resolve()` fail-closed; kayıtlar erişilemez | Preflight + BLOCKED; provisioning/backfill ayrı task | Var sanmak = boş liste; oluşturmak yasak | AI1/PO teyidi | Provisioning/backfill task'ı |
| **R9** | **Control-plane mapping/ledger yeri (Q-V21, Q-ID01, Q-V25)** | A (Vardiya schema/migration için) | Mapping olmadan RESOLVED satır yok; ledger yeri fan-out ledger'ı ile birlikte | `public` mapping+ledger (öneri) | Data-plane'e koymak PLATFORM_ROOT yönetimini kırar | AI1/PO | `db/schema/` yeni public tablolar + migration |
| **R10** | **Sertleştirme (Q-DP05):** müşteri-başına DB rolü/RLS | C | D3: schema ayrıcalık sınırı değil | H1/H2/H3 (öneri H3 başla) | H3'te uygulama hatası = cross-customer sızıntı | PO/AI1 | Rol/pool yönetimi (ayrı karar), DEC-0010 §12 güncellemesi |
| **R11** | **Güvenlik hijyeni (Q-DP07):** `drizzle.config` sabit varsayılan bağlantı | C | Yanlış ortamda varsayılan DB'ye bağlanma riski | `DATABASE_URL` zorunlu | Değişmezse üretimde sürpriz | AI1 | `drizzle.config.ts` (değer doküman(lar)a **kopyalanmamalı**) |
| **R12** | **Kalan Vardiya soruları:** Q-V16, Q-V12, Q-V17/F1, Q-V22–V24 vb. | B/C | Repository/API davranışı | İlgili paketler | — | AI1/PO | Vardiya task'ları |

## 2. Vardiya için uygulanabilirlik sırası (bağımlılıklı)

| Sıra | Adım | Bağımlı olduğu blocker'lar | Not |
|---|---|---|---|
| 1 | **Data-plane foundation kararı** (mimari + Phase 5-9 kapsamı) | R1, R2 | Yalnızca karar |
| 2 | **Registry doğrulama/düzeltme** (D1/D2, fiziksel schema kontrolü, closure tutarlılık guard'ı) | R3, R7 | İş verisinden **önce**; mevcut Phase 1-4 kodunun düzeltmesi |
| 3 | **Fan-out migration runner** (+ ledger) | R4, R8 | Standart §2–§8 |
| 4 | **Per-schema test harness** (+ `pgSchema` fabrikası ve statik testler) | R5, R6 | Cross-customer kanıtı |
| 5 | **Control-plane mapping/ledger** | R9 | Q-V21/Q-ID01/Q-V25 kararı sonrası |
| 6 | **Vardiya schema** (`shift_reports`, data-plane migration) | 1–5, F1/Q-V17, Q-V14, Q-V03 | Bu task'ta **yapılmaz** |
| 7 | **Vardiya repository** | 6, R6 | Bu task'ta yapılmaz |
| 8 | **Vardiya API/service** | 7, Q-V07/V19, Q-V09, Q-V23/V24 | TASK-027.24 kontratı |

Sıra **öneridir**; AI1'in backlog planlama yetkisindedir.

## 3. Karar sonrası dosya listeleri (özet; hiçbiri şimdi uygulanmadı)
- Adım 2: `apps/api/src/tenant-scope/customer-schema-registry.service.ts` + spec, `tenant-scope.service.ts` + spec, `platform/saas.service.ts`.
- Adım 3: `apps/api/src/tenant-scope/data-plane-migration.runner.ts` (+ ledger schema `db/schema/`, `public` migration), data-plane migration klasörü, `tenant-scope.constants.ts`, `package.json` script, `dev.sh`/`pipeline.yml` tetikleyici (Q-DP02).
- Adım 4: `apps/api/src/db/data-plane/` (fabrika), `db/test-helpers/`, statik spec, CI test DB.
- Adım 5–8: TASK-027.25 blocker paketindeki dosya listeleri (`METNEX_SHIFT_REPORT_SCHEMA_BLOCKER.md`).

## 4. Teyit
Bu task'ta `apps/` altında hiçbir dosya eklenmedi/değiştirilmedi; hiçbir blocker varsayımla kapatılmadı.

---

## TASK-027.31 Güncellemesi (2026-09-21) — R3 kısmen ilerledi

- **R3 (registry düzeltmeleri):** `ARCHIVED→ACTIVE` sessiz yeniden aktivasyon **giderildi** (`SCHEMA_ARCHIVED`); durum geçişleri korumalı ve bilinmeyen durumlar reddediliyor; `PROVISIONING`/`FAILED` erişime kapalı ve hiçbir okuma yolu terfi ettirmiyor; hata/log/`lastError` DB metni içermiyor.
  **Hâlâ açık:** registry↔fiziksel schema doğrulamasının **implementasyonu** (yalnızca saf sözleşme + interface var; probe yok, production'a bağlı değil), `FAILED` retry sahibi/limit/backoff (Q-DP04), açık reactivation akışı (Q-DP03), stale `PROVISIONING` için eşik (çağıran tarafından verilecek; sayı PO kararı), closure tutarlılığı (D4).
- **R7 (sürüm geçidi, Q-DP01):** uygulanmadı; "sürüm bilinmiyor" yalnızca tanı sözleşmesinde `VERSION_GATE_BLOCKER` olarak modellendi.
- Diğer blocker'lar (R1 mimari seçim, R2 Phase 5-9 kapsamı, R4 fan-out runner, R5 test harness, R6 `pgSchema` fabrikası, R8 tenant varlığı, R9 mapping/ledger, R10 sertleştirme, R11 bağlantı hijyeni [TASK-027.29'da giderildi], R12 Vardiya soruları) bu task'ta değişmedi.

---

## TASK-027.32 Güncellemesi (2026-09-21) — data-plane temel sözleşmesi

Detay: `METNEX_DATA_PLANE_FOUNDATION_CONTRACT.md`. Gerçek DB, gerçek port implementasyonu, tetikleyici ve Vardiya tablosu **yok**.
- **R6 (`pgSchema` fabrikası + statik güvenlik testleri): uygulandı** — `pgSchema()` kod tabanında yalnızca `data-plane/data-plane-schema.ts`'te; `search_path` hiçbir production dosyasında yok; DDL enterpolasyonu yalnızca `quoteIdentifier` ile (statik testler). Merkezi identifier yardımcıları `schema-name.util.ts`'te.
- **R4 (fan-out/runner): yalnızca sözleşme + port-tabanlı saf çekirdek** — tek customer-root, DRY_RUN/APPLY, advisory lock, ledger idempotency, TOCTOU yeniden kabul; **gerçek portlar/tetikleyici/çok müşterili fan-out yok** (Q-DP02'nin data-plane kısmı açık).
- **R5 (çok-şemalı test harness):** hâlâ açık — testler bellek-içi sahte portlarla; gerçek PostgreSQL cross-customer testi yok.
- **R3/R7:** registry durum güvenliği TASK-027.31'de; runner fiziksel schema/sürüm/durum kapılarını kullanır ama **fiziksel probe implementasyonu ve çalışma zamanı sürüm geçidi (Q-DP01) yok**.
- Yeni: Q-DP11 (port implementasyonları), Q-DP12 (migration tanımlarının kaynağı, UUID kuralı teyidi).

---

## TASK-027.33 Güncellemesi (2026-09-21) — port/ledger/kaynak kararları hazırlandı (uygulama yok)

Karar paketi: `METNEX_DATA_PLANE_PORT_AND_LEDGER_DECISION_PACKAGE.md` (T1–T12, **AI1/PO karar formu boş**). Hiçbir kod/tablo/schema/port implementasyonu yapılmadı.
- **Yeni blocker'lar (karar bekleyen):** ledger yeri (T4) **ledger/executor implementasyonunu**, migration kaynağı + checksum politikası (T7/T8) **gerçek migration dosyasını**, kimlik ayrımı + schema sahipliği/provizyon kimliği (T12, Q-DP05, yeni Q-DP13) **port bağlantı çözümleyicisini** engeller.
- **Sözleşme bulgusu (E1):** mevcut orkestratörde DDL/ledger/registry-CAS üç ayrı commit — DDL sonrası çökme "aynı DDL'i yeniden çalıştırma" penceresi bırakır; T4=L3 + T6=X1 seçilirse kapanır (sözleşme revizyonu gerekir, VERIFY kararı T9 ile birlikte).
- Yeni: Q-DP13 (schema sahipliği/provizyon kimliği), Q-DP14 (pooler/PG sürümü teyidi; `init-db.sql`'deki eski şablon schema'ları `platform`/`shared`/`customer_root`).
- R4/R5/R6 durumu değişmedi: fan-out runner yalnızca sözleşme; gerçek port/harness yok.

---

## TASK-027.34 Güncellemesi (2026-09-21) — dev ortam kanıtı (salt-okuma)

Detay: `METNEX_DATA_PLANE_TARGET_ENVIRONMENT_READINESS.md`. Production **doğrulanamadı**; hiçbir şey değiştirilmedi.
- **R8 (tenant/registry varlığı) somutlaştı:** dev'de tek ROOT tenant'ın registry satırı/customer schema'sı **yok** — kod nedeni `TenantService.create`'in provizyon çağırmaması (yeni **Q-DP15**); Vardiya/data-plane hiçbir root için henüz çalışamaz.
- **R10/Q-DP05:** dev'de tek rol superuser+`BYPASSRLS` — RLS ve kimlik ayrımı kanıtı için düşük yetkili rol gereklidir (harness).
- **Q-DP14 (dev kısmı) kanıtlandı:** PG 16.15, doğrudan bağlantı, eski schema'lar boş/kullanılmıyor; **prod kısmı açık**. Yeni **Q-DP16** (eski schema'ların akıbeti).
