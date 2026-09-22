# Vardiya (ShiftReport) PostgreSQL Schema Placement ve Persistence Karar Paketi (TASK-027.25)

> **Durum: Karar/tasarım paketi — Drizzle schema, migration, seed, tablo, tenant, mapping kaydı, gerçek DB
> bağlantısı YOK.** Tablo/kolon/index adları **taslak notasyondur**; SQL üretilmemiştir.
> **AI2 hiçbir soruyu kapatmaz.** Görev "kapatılması hedeflenen" kararları AI1/PO'ya sunar; her biri için karar
> matrisi, AI2 önerisi, gerekçe, risk, geri dönüş maliyeti ve karar sonrası dosya listesi verilir. Bu belgedeki
> öneriler, AI1/PO seçimi yapılana kadar **bağlayıcı değildir**. Q-V10 (tek `shift_reports` tablosu +
> `locationCode`) korunmuştur.

**Tarih:** 2026-09-21 · **Hazırlayan:** AI2

**Okunan kanıtlar:** `DEC-0009`, `DEC-0010`, `docs/domain/DB_META.md` (Tenant Isolation Standard + Customer-Root
bölümü), `db/schema/{platform,operations}.ts`, `tenant-scope/{tenant-scope.service,customer-schema-registry.service,
schema-name.util,tenant-scope.constants}.ts`, `db/{db.module,tenant-isolation-schema.spec}.ts`,
`platform/{tenant.service,bootstrap.service}.ts`, `platform/domain/tenant.domain.ts`, `audit/platform-audit.service.ts`,
`migration/botc-identity/types.ts`, `METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md`, TASK-027.22/23/24 paketleri.

---

## 0. Bu task'ta bulunan, önceki paketlerde olmayan bulgular

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **F1** | **`tenantId` nullable taslağı, repo'nun Tenant Isolation Standard'ıyla çelişiyor.** TASK-027.22 §1/§3 `tenantId`'yi nullable (çözülmemiş lokasyon için `NULL`) taslakladı; `DB_META.md` "Tenant Isolation Standard" madde 1: "`tenantId` is `NOT NULL` with a plain FK to `tenants.id`" (her tenant-owned tablo için zorunlu checklist) | `DB_META.md:180` | Tablo tasarımı ya standarda uyar (NOT NULL; çözülmemiş satırlar `shift_reports` **dışında** tutulur) ya da **belgelenmiş bir istisna** gerekir (§2.3). Q-V17 ile doğrudan etkileşir; AI2 Q-V17'yi kapatmaz |
| **F2** | **Data-plane altyapısı yok.** `DATA_PLANE_SCHEMA_VERSION = '0000_empty'`; repoda hiç `pgSchema(...)` kullanımı yok; data-plane migration fan-out'u "designed, not built" (DEC-0010 §9); `drizzle/migrations` yalnızca `public`; `DB_META.md`: "no domain module's tables have moved out of `public`… Demo Operations … was removed… a future domain module is the next candidate for Phase 5" | grep `pgSchema` boş; `tenant-scope.constants.ts:7` | ShiftReport data-plane'e giderse **ilk data-plane tüketicisi** olur ve Phase 5 altyapısını (runtime `pgSchema`, fan-out migration runner, per-schema test harness) **kendisi tetikler** |
| **F3** | **Gerçek tenant slug'ları, Wave 1 "onaylı slug" sabitleriyle eşleşmiyor.** Gerçek tenant oluşturma `slugify()` ile küçük harfe çevirir ve alt tenant slug'ını **ebeveyn ön ekiyle birleştirir** (`composeTenantSlug`: `<parent>-<base>`); tenants.slug global unique. Wave 1 motoru ise `'MOSB' \| 'MOSEDAS' \| 'MOSBIO'` (büyük harf, ön eksiz) mantıksal anahtarlarını kullanıyor (`types.ts:49`) | `tenant.domain.ts:1-15`, `tenant.service.ts:193,209`, `types.ts:49` | `tenantSlug='MOSB'` alanı **hiçbir gerçek tenant'ın slug'ıyla birebir eşleşmeyecektir** → mantıksal anahtar → somut tenant kimliği bağlaması ayrı bir karardır → **Q-V25 (yeni)** |
| **F4** | **Tenant'ları oluşturan seed yok; tenant'lar çalışma zamanı verisidir.** `bootstrap.service.ts` tek bir başlangıç tenant'ı girdiden üretir; `TenantService.create`/`SaasService.createCustomerTenant` genel API'lerdir; `apps/` içinde MOSB/MOSBİO/MOSEDAŞ oluşturan kod yok | `bootstrap.service.ts:66-90`, grep | Q-V20 repodan **cevaplanamaz**; `[DOĞRULANAMADI]` (gerçek DB'ye bağlanılmadı) |
| **F5** | **PLATFORM_ROOT veri düzlemini okuyamaz.** `resolve()` PLATFORM_ROOT'ta 403 | `tenant-scope.service.ts:48-50` | Data-plane'deki mapping/staging/unresolved kayıtlarını platform operatörü doğrudan yönetemez → mapping'in **nerede** durduğu Q-V16 (unresolved yönetimi) ile çakışan operasyonel sonuç doğurur |
| **F6** | **Ortak legacy anahtarı vs tenant-scoped uniqueness.** DB_META madde 2: business-key uniqueness `(tenantId, businessKey)`. Legacy anahtar `(sourceSystem, sourceTable, legacyId)` tenant'a bağlı değil ve `tenantId` NULL/değişebilir olabilir (NULL'lar unique'te ayrı sayılır) | `DB_META.md:181` | `tenantId`'yi legacy unique'e **koymak** NULL/reassignment durumunda çift kayda izin verir; koymamak ise standarttan sapmadır. Data-plane şemasında (müşteri-root başına) legacy anahtar zaten müşteri-root'a kapsamlıdır → Seçenek B/C'nin avantajı |
| **F7** | **Mevcut audit sink tenant filtresi sunmuyor.** `PlatformAuditListQuery` (`actorId, actionCode, entityType, from, to`) tenant alanı içermiyor; tablo tenant kolonsuz | `platform-audit.service.ts:7-24`, `operations.ts:6-23` | §7 |
| **F8** | **Composite FK standardı.** Yalnızca **çocuk tabloya sahip** tenant-owned tablolar için `unique(id, tenantId)` gerekir (DB_META madde 3); statik test yalnızca `platform.ts`'i doğruluyor | `tenant-isolation-schema.spec.ts` | `shift_reports`'un şimdilik çocuk tablosu yok → `unique(id, tenantId)` **zorunlu değil** (ileride çocuk gelirse eklenir; drizzle-kit `uniqueIndex()` yerine `unique()` sırası notu) |

---

## 1. Q-V11 — Schema placement seçenekleri

Tanımlar (bu belge içinde): **A** `public.shift_reports` · **B** müşteri-root data-plane şemasında `shift_reports`
**ve** onunla ilgili tüm Vardiya meta/mapping/staging tabloları · **C** iş verisi (`shift_reports`, import staging
**payload**'ı) data-plane şemasında, **control-plane metadata (lokasyon→tenant mapping, run ledger özeti) `public`'te** ·
**D** geçiş dönemi hibriti (önce `public`, sonra data-plane'e taşı).

| Kriter | A: `public` | B: hepsi data-plane | C: iş verisi data-plane, metadata public | D: hibrit geçiş |
|---|---|---|---|---|
| Tenant izolasyonu | Yalnızca `tenantId` filtresi (DEC-0009 baseline); **cross-customer** izolasyonu uygulama disiplinine kalır — DEC-0010'un çözmek istediği asıl risk | Şema sınırı = müşteri sınırı; intra-customer `tenantId` filtresi | B ile aynı (iş verisi için) | Geçiş süresince A'nın zayıflığı; sonra B/C |
| `resolve()` entegrasyonu | `schemaName` kullanılmaz; `dataScopeTenantIds` filtresi yeter | Repository `pgSchema(schemaName)` ile çalışır; `resolve()` çıktısındaki `schemaName` doğrudan kullanılır (tasarlanan yol) | Aynı; mapping okuması `public` (customerRootTenantId anahtarı) | İki repository yolu, geçişte çift kod |
| `schemaName` çözümleme | Gerekmez | Zorunlu; `isSafeSchemaIdentifier`+`quoteIdentifier` (mevcut util) | Zorunlu (iş verisi) | Geçişte zorunlu |
| Root aggregation | `canAggregateChildren` ile `tenantId IN (...)` | Aynı; ayrıca **tek müşteri şeması içinde** kalır (root zaten tek müşteri) | Aynı | Aynı |
| Migration/rollback | Tek `drizzle-kit` migration'ı, mevcut akış | **Fan-out runner gerekir** (F2): her `ACTIVE` registry satırına uygula, `migrationVersion` yükselt, hata → `FAILED`; rollback her şemada ayrı | B ile aynı iş verisi tarafı + `public` tarafı standart | En pahalı: iki mekanizma + veri taşıma |
| Test edilebilirlik | En kolay (tek şema) | Çok-şemalı test harness gerekir (yeni) | B ile aynı | En zor |
| Operasyonel maliyet | Düşük | Orta-yüksek (fan-out, per-schema bakım, `FAILED` izleme) | Orta-yüksek | Yüksek (iki dönem) |
| DEC-0010 uyumu | **Uyumsuz** (§2: business tabloları data-plane'e girer); yalnızca geçici sapma olarak savunulabilir | **Uyumlu** | **Uyumlu** (§1: `public` = metadata; §2: business = data-plane) | Geçici sapma; çıkış kriteri şart |
| Çoklu müşteri/root desteği | Tek tablo tüm müşteriler; legacy unique global (F6) | Müşteri başına ayrı tablo; legacy unique zaten müşteri-root'a kapsamlı | Aynı | Geçişte karışık |
| Geçişte veri kaybı riski | Yok başta; **sonradan data-plane'e taşımada** risk (tenant başına satır kopyalama, FK/idempotency yeniden kurma) | Yok | Yok (mapping `public`, taşınma yok) | **Yüksek** (taşıma penceresi, çift yazma/okuma) |
| PLATFORM_ROOT (F5) | Okuyabilir mi? Guard/scope yolu üzerinden hayır (`resolve()` 403) ama tablo `public` olduğu için doğrudan SQL/admin araçlarıyla erişilebilir (izolasyon zayıf) | Erişilemez (kasıtlı) | Mapping/ledger özeti platform operatörüne açık, iş verisi kapalı → **onay/yönetim akışına uygun** | — |

### 1.1 AI2 önerisi (karar değil)
**C**. Gerekçe: (1) DEC-0010 hedef izolasyon profiliyle uyumlu; (2) Vardiya iş verisi müşteri-root sınırında kalır
(cross-customer sızıntı şema sınırına iner); (3) lokasyon→tenant mapping ve run ledger özeti **iş verisi değil,
tenant ağacı hakkında control-plane metadata'dır** ve PLATFORM_ROOT'un onay/yönetim yapabilmesi gerekir (F5);
(4) legacy unique müşteri-root şemasına kapsamlı olur (F6). **Ön koşul:** Phase 5 data-plane altyapısı (F2) —
bu, Vardiya'dan önce/ile birlikte ayrı bir altyapı task'ı olarak yapılmalıdır; **Vardiya implementasyonu bu altyapıya bağımlıdır**.

**Riskler:** Phase 5 altyapısı Vardiya'yı geciktirir; ilk data-plane tüketicisi olmak fan-out/rollback hatalarını
Vardiya üzerinde keşfetmek demektir; C'de mapping `public`'te tutulduğundan tenant ID'leri `public` FK ile bağlanır.
**Geri dönüş maliyeti:** C→B (mapping'i data-plane'e taşı) orta (küçük metadata tablosu); C→A (iş verisini `public`'e
indir) yüksek (satır taşıma); A→C yüksek (F2 + taşıma). **Bu yüzden ilk seçim önemlidir; en ucuz güvenli yol C'dir.**
**Alternatif:** A yalnızca AI1/PO "Phase 5'i beklemeyeceğiz" derse ve **yazılı çıkış kriteri + taşıma planı** ile (D). D **önerilmez**.

**Karar için gereken:** AI1/PO; Phase 5 altyapı task'ının sahipliği/sırası. **Karar durumu: AÇIK.**

---

## 2. ShiftReport persistence taslağı (`shift_reports`)

Notasyon: PG/Drizzle tipi taslaktır. "Kanıt": TASK-027.21/22/23 belgeleri. "Karar bağ.": bekleyen soru.
Mevcut kod kuralları: `id text primary key $defaultFn(generateId)`, zaman damgaları `timestamp(precision 3)`
(timezone'suz), `text`+`enum`/`text` durum kolonları.

### 2.1 Alan tablosu

| Alan | Tip (PG/Drizzle taslağı) | Null | FK | Index | Unique | Tenant izolasyon etkisi | Kaynak kanıtı | Karar bağ. |
|---|---|---|---|---|---|---|---|---|
| `id` | `text` PK (`generateId`) | Hayır | — | PK | PK | — | Metnex deseni | — |
| `tenantId` | `text` | **F1: Hayır (öneri)** / Evet (istisna) | → `tenants.id` (plain, DB_META md.1) | Bileşik lider kolon (§3) | — | Tüm sorgular bu kolonla kapsamlanır | BOTC'de yok (tenant kavramı yok) | **F1, Q-V17, Q-V01** |
| `locationCode` | `text` + CHECK/enum | Hayır | — | Bileşik | — | Tenant içi lokasyon ayrımı (görünürlük kararı **Q-V18**) | Tablo→kod (5 tablo, kaynak envanteri §4) | Q-V14 değer kümesi, TASK-027.23 |
| `shiftCode` | `text` (≤50) | Hayır | — | — | — | — | `Vardiya` `MaxLength(1)` canlı / `(50)` arşiv | **Q-V14** |
| `operatorUserId` | `text` | Evet | → `users.id` (plain FK; kullanıcı tenant'a bağlı membership ile) | — | — | Operatör başka tenant'ın kullanıcısı olabilir mi → veri sızıntısı değil, referans; `tenantMemberships` ile doğrulama servis işidir | `OperatorBotUserId` int (cross-DB) | Wave 1 legacy ID, Q-ID01 |
| `operatorNameSnapshot` | `varchar(150)` | Evet | — | — | — | PII (ad) — audit'e yazılmaz | `OperatorTamAdi` `MaxLength(150)` | **Q-V15** |
| `secondOperatorName` | `varchar(150)` | Evet | — | — | — | PII (ad) | `Operator2TamAdi` | — |
| `recordedAt` | `timestamp(3)` | Hayır | — | Bileşik | — | — | `KayitTarihi` | **Q-V03** (UTC yorumu) |
| `logbookDate` | `timestamp(3)` veya `date` | Evet | — | — | — | — | `DefterTarihi` (arşiv, Required) | **Q-V03** (date mi timestamp mı) |
| `notes` | `text` | Evet | — | — | — | Serbest metin/PII riski; audit'e yazılmaz | `RaporNotlari` `string?` | Uzunluk sınırı kararsız |
| `status` | `text` enum (`DRAFT`,`COMPLETED`,`ARCHIVED`?) | Hayır | — | Bileşik | — | — | `IsCompleted` bool | **Q-V04, Q-V09** |
| `scopeStatus` | `text` enum | **F1'e bağlı:** NOT NULL öneri; NOT NULL tenantId seçilirse alan **gereksizleşir** (yalnızca RESOLVED satır girer) | — | Kısmi | — | Fail-closed koşulun ikinci kemeri | TASK-027.22/23 | F1, Q-V17 |
| `legacySourceSystem` | `text` | Evet (etkileşimli kayıt) | — | Bileşik | Bileşik | Kaynak kapsamı | `BOTC_VARDIYA`/`BOTC_ARSIV_VARDIYA` | Q-V06 |
| `legacySourceTable` | `text` | Evet | — | Bileşik | Bileşik | — | 5 fiziksel tablo adı | — |
| `legacyId` | `text` | Evet | — | Bileşik | Bileşik | — | `Id` int identity | Canlı/arşiv Id uzayları ayrı |
| `sourceChecksum` | `text` | Evet | — | — (aranmaz; karşılaştırılır) | — | — | Wave 1 desen | Q-V06 |
| `migrationRunId` | `text` | Evet | — (ledger'a mantıksal ref) | — | — | — | Standard §9 | Q-ID01 |
| `createdAt` | `timestamp(3)` default now | Hayır | — | — | — | — | Metnex deseni | — |
| `updatedAt` | `timestamp(3)` default now, `$onUpdate` | Hayır | — | — | — | — | Metnex deseni | — |
| `completedAt` | `timestamp(3)` | Evet | — | — | — | — | Kaynakta **yok** (öneri) | Q-V09 |

Kaynakta olmayıp hedefe eklenen: `id`, `tenantId`, `status`(türetilmiş), `scopeStatus`, legacy/checksum/run,
`createdAt/updatedAt`, `completedAt`. **`performans alanları` yok** (Q-V13); kaynaktan alan uydurulmadı.
`operatorNameSnapshot`/`logbookDate` etkileşimli (arşiv-dışı) kayıtlarda boş kalabilir; arşiv modeli TASK-027.26.

### 2.2 `tenantId` nullable mı? — F1 karar matrisi (Q-V17 ile bağlantılı; kapatılmaz)

| Seçenek | Açıklama | Standart uyumu | Güvenlik | Migration | Not |
|---|---|---|---|---|---|
| **N1** `tenantId NOT NULL`; çözülmemiş/pending/conflict kaynak satırlar **staging'de** kalır, `shift_reports`'a yalnızca RESOLVED satır **terfi eder** | Uyumlu | En güçlü: `shift_reports`'ta erişim-dışı satır **fiziksel olarak yok**; R1/R2 (NULL/≠RESOLVED) sorguları kalıcı olarak gereksiz kemer olur | Mapping çözülünce staging→`shift_reports` terfi (idempotent, K8) | **Q-V17 = "hiç yazma / staging'de tut"** ile örtüşür ama AI2 Q-V17'yi kapatmaz |
| **N2** `tenantId` nullable + CHECK `(tenantId IS NOT NULL OR scopeStatus <> 'RESOLVED')` | Standarda **istisna** (belgelenmeli) | Fail-closed servis koşullarına bağlı; bir sorgu hatası unresolved satırı sızdırabilir | Mapping çözülünce yerinde güncelleme | Q-V17 = "yaz + erişime kapat" |
| **N3** `tenantId NOT NULL` + geçici "quarantine" pseudo-tenant | Tenant **uydurmak** demektir → **yasak** (talimat: tenant uydurma) | — | — | Reddedildi |

AI2 önerisi (karar değil): **N1**. Gerekçe: DB_META standardıyla uyumlu; DB düzeyinde fail-closed; N2'nin istisnasını
gerektirmez; `scopeStatus` alanı `shift_reports`'tan çıkarılabilir (yalnızca staging'de). Risk: staging kalıcı bir "bekleme odası"
olur → retention/temizlik yönetimi (§5). Geri dönüş: N1→N2 düşük (kolonu nullable yap, additive); N2→N1 orta
(NULL satırları önce staging'e taşı).

## 3. Index ve constraint taslağı (SQL yok)

| # | Taslak | Amaç | Not |
|---|---|---|---|
| I1 | `(tenantId, locationCode, recordedAt)` | Liste/filtre (kontrat §2.1) | DB_META md.5: `tenantId` lider |
| I2 | `(tenantId, status, recordedAt)` | Durum bazlı liste | Kullanım gerçekse (md.5 "mechanical rule değil") |
| U1 | **Unique** `(legacySourceSystem, legacySourceTable, legacyId)` **kısmi** (`WHERE legacyId IS NOT NULL`) | Idempotent import (TASK-027.23 §9) | `tenantId` **içermez** (F6); data-plane şemasında müşteri-root'a kapsamlı. Public seçilirse (A) müşteri-root/kaynak-kimlik gerekir → A'nın ek maliyeti |
| I3 | `sourceChecksum` | **Index önerilmez** — checksum arama anahtarı değil karşılaştırma değeridir (U1 ile bulunan satırda kıyaslanır) | Gereksiz yazma maliyetini önler |
| I4 | `scopeStatus` (kısmi: `WHERE scopeStatus <> 'RESOLVED'`) | Yalnızca N2'de operasyonel görünürlük | N1'de yok |
| C1 | CHECK `locationCode` ∈ kontrollü küme | Geçersiz lokasyonu DB'de reddet | Değer kümesi TASK-027.23 taslağı, Q-V14 |
| C2 | CHECK durum kümesi | | Q-V04 |
| C3 | (N2 ise) CHECK `tenantId IS NOT NULL OR scopeStatus <> 'RESOLVED'` | Fail-closed DB kemeri | N2 seçilirse zorunlu |
| C4 | `unique(id, tenantId)` | Yalnızca ileride çocuk tablo gelirse (F8) | Şimdi yok |

Conflict kayıtları: `shift_reports`'a **asla** yazılmaz/erişilmez (N1: staging'de `CONFLICT`; N2: `tenantId NULL` +
`scopeStatus=CONFLICT`, ikisinde de erişim yok). `tenantId IS NULL` satırlar N2'de servis koşuluyla, N1'de yokluğuyla erişim dışıdır.

---

## 4. Q-V21 — Lokasyon→tenant mapping persistence seçenekleri

| Kriter | M1 Sürüm kontrollü konfigürasyon | M2 `public` control-plane tablo | M3 Customer-root (data-plane) tablo | M4 Ayrı migration staging şeması | M5 Identity staging ile ortak model |
|---|---|---|---|---|---|
| Onay/audit izi (`approvedBy/At`) | **Yok** (kod deposu geçmişi dışında); PO onayı dosyaya girmez | Var (satır+audit) | Var, ama PLATFORM_ROOT erişemez (F5) | Var | Var, ama lifecycle farklı |
| Değişiklik maliyeti | Deploy gerekir | Veri değişikliği | Veri değişikliği | Veri değişikliği | Veri değişikliği |
| `supersedesMappingId` / tek-RESOLVED kuralı | Sürümle kayıt | Kısmi unique index ile DB'de zorlanır | Aynı | Aynı | Aynı |
| Tenant FK bütünlüğü | Yok (metin) | `tenants.id` FK | Data-plane→public FK (şemalar arası; F2 belirsiz) | Şema arası | Şema arası |
| Platform operatörü yönetimi (F5) | Repo erişimi | **Evet** | **Hayır** | Duruma göre | Duruma göre |
| Test edilebilirlik | Kolay | Kolay | Çok-şema harness | Zor | Orta |
| Q-V11 bağımlılığı | Yok | Yok (C/A ile uyumlu) | B'ye bağlı | Ayrı karar | Q-ID01 ile aynı karar |
| Riski | Onay izsiz "gerçek" mapping; conflict tespiti manuel | Yanlış tenant ID'siyle satır → K3 çakışma tespiti şart | Operasyonel görünmezlik | Karmaşıklık | Farklı yaşam döngüsü karışması |

**AI2 önerisi (karar değil): M2** — `public` control-plane tablosu, `customerRootTenantId` kapsamlı; tenant'ı
**`tenantId` (FK)** ile bağlar (F3/Q-V25 → slug yerine kimlik). Gerekçe: onay/audit izi, tenant FK bütünlüğü, PLATFORM_ROOT'un
yönetebilmesi, Q-V11=C ile uyum. M1 reddedilmesi gerekçesi: `approvedBy/approvedAt/effectiveFrom/supersedesMappingId`
sözleşmesini karşılayamaz. Geri dönüş: M2→M3 orta; M1→M2 düşük (veriyi tabloya al).

**Sözleşme (kavramsal, uygulanmaz)** — TASK-027.23 §5 + task alanları: `sourceSystem`, `sourceTable`, `locationCode`,
`tenantSlug`, `mappingStatus` (`PENDING_APPROVAL|RESOLVED|UNRESOLVED|CONFLICT|REJECTED`), `evidenceLevel` (E1–E4),
`approvedBy`, `approvedAt`, `effectiveFrom`, `supersedesMappingId` (self-FK, nullable), `notes`. **Önerilen ek:**
`customerRootTenantId` (kapsam), `tenantId` (FK; `tenantSlug` yalnızca bilgi/anlık görüntü — F3). Benzersizlik: kısmi unique
`(customerRootTenantId, sourceSystem, sourceTable) WHERE mappingStatus='RESOLVED'`. Zorunluluk/null kuralları TASK-027.23 §5'te.
`Sirket` alan/mapping kaynağı **değildir**. Başlangıç değerleri **hiçbiri RESOLVED değildir**; değer üretilmedi.

---

## 5. Q-ID01 — Migration staging şeması ve retention

Bağlam: Identity staging (`migration_staging_identity`, kavramsal, TASK-027.11) users/membership gibi **control-plane**
hedeflere yazar; Vardiya staging **iş verisi** (notlar, operatör adları) taşır → düzlem farkı.

| Konu | Seçenekler | AI2 önerisi (karar değil) |
|---|---|---|
| Şema yerleşimi | **S-a** `public.migration_staging_*` (prefix) · **S-b** ayrı PG şeması `migration` (control-plane) · **S-c** kaynak düzlemine göre ayır: identity→`public`, Vardiya payload→müşteri-root data-plane | **S-c** — iş verisi payload'ı `public`'e girmemeli (DEC-0010); identity zaten `public` hedefli. S-b ek şema yönetimi (drizzle-kit `schemaFilter`, migration sırası) getirir |
| Production data-plane ile ilişki | Staging **ayrı tablo**, hedef tabloya **terfi** (idempotent); hedefe doğrudan yazım yok | N1 (§2.2) ile uyumlu: staging→`shift_reports` terfi, yalnızca RESOLVED |
| Durumlar | `COMPLETED`, `FAILED`, `SKIPPED`, `BLOCKED` (+ mevcut `PENDING/UNRESOLVED/CONFLICT` yaşam döngüsü, staging doc §4.2) | `FAILED` = **migration satır sonucu** (domain status'ü değil, TASK-027.22 §5); `BLOCKED` = preflight/tenant/mapping kapısı; `SKIPPED` = idempotent NOOP (hedef mevcut); tam durum kümesi Q-ID01 kararına bağlı, **bu belge kümeyi kesinleştirmez** |
| Ledger vs payload | **Ledger** (legacy anahtar, hedef ID, durum, checksum, run ID, hata kodu): kalıcı, PII'siz. **Payload** (kaynak alan değerleri: notlar, operatör adları): kısa ömürlü | İkisini ayır. Legacy-ID eşleme **kalıcı** olmalı (idempotency/reconciliation ömür boyu ister) |
| Retention | Sayı **uydurulmadı** | Ledger: kalıcı. Payload: run **AI1 mutabakat onayına** + PO'nun belirleyeceği geri alma penceresine kadar; sonra payload kolonları temizlenir, ledger kalır. **Süre (gün) PO kararı** |
| PII/secret sınırı | | Payload'a parola/hash/token/connection string **asla** girmez (mevcut boundary'ler: `password-boundary`, `session-boundary`); Vardiya `notes` serbest metin PII riski → payload'da, ledger'da **yok**; hata açıklamaları veri değeri içermez |
| Run ID/checksum/idempotency | | `migrationRunId` (Standard §9), `sourceChecksum` **iç UUID içermez** (TASK-027.18–19 dersi); aynı anahtar+aynı checksum = SKIPPED, farklı checksum = CONFLICT_SOURCE_CHANGED (sessiz overwrite yok) |
| Rollback/reconciliation | | Reconciliation (`reconcileMigrationRuns`, TASK-027.19) ledger + hedef karşılaştırır; rollback = run'a ait terfi satırlarını run ID ile geri al (yalnızca payload+ledger varken mümkün → payload temizliği rollback penceresini **bitirir**) |
| Temizleme yetkisi | | Yeni yetki icat edilmedi. Öneri: temizleme yalnızca migration servisi kimliğiyle, run kapanış işlemi olarak; kim tetikler → **PO/AI1** (F5: PLATFORM_ROOT data-plane'e erişemez) |

Risk: S-c iki yerde staging demektir (operasyonel yük); retention'ı yanlış (çok kısa) seçmek rollback'i imkânsız kılar,
(çok uzun) PII birikimi yaratır. Geri dönüş: S-a→S-c orta; retention kısaltmak kolay, uzatmak **kayıp veri nedeniyle imkânsız**.

---

## 6. Q-V20 — Tenant varlığı doğrulama sınırı

- **Repo kanıtı (F4):** seed/bootstrap MOSB/MOSBİO/MOSEDAŞ oluşturmuyor; tenant'lar API ile çalışma zamanında yaratılıyor →
  **`[DOĞRULANAMADI]`** (DB'ye bağlanılmadı, tenant mevcutmuş gibi varsayılmadı, yeni tenant/slug üretilmedi).
- **Ek engel (F3):** gerçek slug'lar küçük harfli ve ebeveyn önekli olduğundan `'MOSB'` mantıksal anahtarı doğrudan slug değildir → **Q-V25**.
- **Apply/migration için bloklama tanımı (öneri; uygulanmadı):** her apply öncesi **preflight** (yalnızca okuma):
  P1 mapping `RESOLVED` ve `approvedBy/At` dolu; P2 `mapping.tenantId` gerçek bir tenant'a çözülüyor (satır bulunuyor);
  P3 tenant `ACTIVE`, tipi beklenen, `customerRootId` = mapping'in `customerRootTenantId`; P4 root'un `customer_schema_registry` satırı `ACTIVE`
  (`resolve()`'un aynı koşulu); P5 `canEnterData=true`; P6 canlı/arşiv aynı `locationCode`→aynı tenant (K7).
  **Herhangi biri başarısızsa run `BLOCKED`** (hiçbir hedef yazımı; tüm satırlar ledger'da `BLOCKED` + neden kodu), **tenant otomatik
  oluşturulmaz**, kısmi başarı yok (tenant başına değil **tablo başına** blok; diğer tablolar sürer mi → PO). Dry-run aynı preflight'ı raporlar.
- Karar sahibi/işi: tenant provisioning (iki adımlı, DEC-0010 §10) **ayrı task**; bu task tenant oluşturmaz.

## 7. Q-V12 — Audit tenant izi

| Seçenek | Açıklama | `PlatformAuditLogInput` uyumu | Sorgulanabilirlik | Maliyet/Risk |
|---|---|---|---|---|
| **AU1** `metadata.tenantId` | Mevcut sözleşme; `scrubSecrets` uygulanır | **Tam uyum, kod/migration yok** | Tenant bazlı filtre JSONB üzerinden (istenirse `metadata->>'tenantId'` ifade index'i) | Düşük; tenant bazlı audit ekranı zayıf |
| **AU2** `platform_audit_logs`'a **nullable** `tenantId` kolonu (+ index) | Sözleşmeye alan eklenir | `PlatformAuditLogInput` genişler (opsiyonel) | Doğrudan filtre, `PlatformAuditListQuery` genişletilebilir | Paylaşılan platform tablosuna migration; **diğer modüllere etki**; backfill yok (eski satırlar NULL); ayrı task |
| **AU3** Tenant-scope'a göre ayrı audit tabloları | Tenant başına | Uyumsuz (tek sink kırılır) | İyi | Yüksek; operasyonel patlama |
| **AU4** Data-plane audit tablosu | Müşteri-root şemasında | Yeni sink; `PlatformAuditService` tek sink varsayımı kırılır | Müşteri-root içi iyi | PLATFORM_ROOT denetleyemez (F5); Q-V11=C ile çelişir |

AI2 önerisi (karar değil): **AU1 şimdi**, AU2 ihtiyaç doğarsa **ayrı, additive migration** (metadata'dan backfill mümkün → geri dönüş
düşük). Gerekçe: mevcut sözleşme; Vardiya'yı paylaşılan tablo migration'ına bağlamaz; AU3/AU4 tek-sink ve F5 nedeniyle önerilmez. Kural:
audit metadata'ya `notes`/ad/secret **yazılmaz**. Q-V24 (audit hata politikası) ayrı ve **kapatılmadı**.

---

## 8. Güvenlik kuralları çapraz kontrolü

| Kural | Bu paketteki karşılığı |
|---|---|
| `tenantId=NULL` görünmez | N1: `shift_reports`'ta yok; N2: R1 + CHECK |
| `scopeStatus≠RESOLVED` erişimsiz | N1: staging'de; N2: R2 |
| Root aggregation genişlemez | Schema seçimi `canAggregateChildren`/`resolve()`'a dokunmaz |
| PLATFORM_ROOT davranışı değişmez | `resolve()` değişmedi; F5 sonuçları belgelendi |
| `isSystemAdmin` yeni erişim vermez | Data-plane tabloya guard bypass ile değil `resolve()` ile erişilir (kontrat R8) |
| `Sirket` kaynak değil | Alan/mapping/staging'de yok |
| Çakışma ilk/son kazanmaz | Mapping tek-RESOLVED kısmi unique + K3; import CONFLICT |
| Gerçek tenant/kullanıcı/secret yazılmaz | Yalnızca kod/doküman kanıtı; yeni tenant/slug/permission/mapping değeri yok |

## 9. AI1/PO'ya karar talepleri (özet) ve durum raporu

| Soru | AI2 önerisi | Durum bu task sonunda |
|---|---|---|
| **Q-V11** schema placement | **C** (iş verisi data-plane, metadata public); Phase 5 altyapı ön koşul | **AÇIK — AI1/PO kararı bekleniyor** |
| **Q-V20** tenant varlığı | Preflight+`BLOCKED` kuralı; tenant provisioning ayrı task | **AÇIK — `[DOĞRULANAMADI]`** |
| **Q-V21** mapping saklama | **M2** (`public` tablo, `tenantId` FK) | **AÇIK — karar bekleniyor** |
| **Q-ID01** staging | **S-c**, ledger kalıcı / payload kısa ömürlü; süre PO | **AÇIK — karar bekleniyor** |
| **Q-V12** audit tenant izi | **AU1** şimdi, AU2 sonra (additive) | **AÇIK — karar bekleniyor** |
| **Q-V25 (yeni)** mantıksal tenant anahtarı → somut tenant kimliği | `tenantId` ile bağla; slug bilgi amaçlı | **AÇIK** |
| **F1 (yeni)** `tenantId` NOT NULL vs nullable | **N1**; Q-V17'yi kapatmaz ama onunla birlikte karara bağlanmalı | **AÇIK** |

Bu task hiçbir soruyu **kapatmamıştır** (görev "kapatılması hedeflenen" der; karar hakkı AI1/PO'dadır). Kapatılmayacak listedeki
sorular (Q-V07/V08/V19, V16/V18, V22, V23, V24, V02/V03/V04/V05/V06/V09/V14/V15/V17, Q-T01, Q-V01, Q-S03, Q-P02) dokunulmadan açıktır.
Q-V10 tek tablo kararı korunmuştur.

## 10. Teyit
`apps/` altında dosya eklenmedi/değiştirilmedi; Drizzle schema/migration/seed, tablo, tenant, mapping kaydı, permission kodu,
gerçek PostgreSQL/SQL Server bağlantısı, API/UI/email/archive migration, Wave 2/3, Docker, git commit/push yok.
