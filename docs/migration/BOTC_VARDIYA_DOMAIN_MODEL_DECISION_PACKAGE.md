# BOTC Vardiya → Metnex PostgreSQL Domain Model ve Karar Paketi (TASK-027.22)

> **Durum: Karar paketi / tasarım dokümanı — Drizzle schema, migration, seed, API/servis, DB bağlantısı YOK.**
> Bu belgedeki tablo/kolon adları **taslak notasyondur**; hiçbiri koda dönüştürülmemiştir.
> **Q-V10 AI1/PO kararıyla kapatılmıştır; diğer Q-V soruları açıktır.** AI2 yalnızca öneri,
> gerekçe, risk ve geri dönüş maliyeti sunmuştur; Q-V10 kararı ayrıca §2.2'de kayıtlıdır.
> Q-T01/Q-S03/Q-ID01/Q-P02 kapatılmamıştır.

**Tarih:** 2026-09-18 · **Hazırlayan:** AI2 · **Kaynak kanıtlar:** `BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md`,
`BOTC_VARDIYA_METNEX_TARGET_MAPPING.md`, `apps/api/src/db/schema/{platform,operations}.ts`,
`apps/api/src/tenant-scope/tenant-scope.service.ts`, `apps/api/src/platform/permission-catalogue.ts`,
`docs/decisions/DEC-0010-customer-root-schema-isolation-and-hierarchical-scope.md`, `docs/domain/DB_META.md`.

---

## 0. Bu task'ta bulunan, TASK-027.21 dokümanlarında olmayan mimari bulgular

1. **Data-plane şema yerleşimi (DEC-0010).** Metnex'te iş verisi tabloları `public`'te değil,
   müşteri-root başına şemada (`customer_schema_registry.schemaName`, runtime `pgSchema(name)`) yaşamak
   üzere kararlaştırılmış; ancak `DB_META.md` §"Status: Phase 1-4 foundation only" ve satır 360'a göre
   **Phase 5-9 (data-plane'e taşıma) henüz uygulanmadı** ve "review bekliyor". Sonuç: Vardiya tablosunun
   `public`'e mi yoksa data-plane şemasına mı yazılacağı bu task'ın karar alanı **değildir** ve
   Phase 5'e bağımlıdır → yeni **Q-V11**. Bu belge tablo tasarımını şema-nötr tanımlar.
2. **Tenant kolonu deseni.** `tenants.id` `text` (UUID, `generateId()`); mevcut tablolar `tenantId text`
   + `createdAt/updatedAt timestamp(precision 3)` (**timezone'suz** `timestamp`, `withTimezone` yok —
   `platform.ts:20-23`) kullanıyor. "UTC saklama" önerisi bu mevcut desenle **uyumlu okunmalıdır**:
   kolon `timestamp` (tz'siz) ama içerik UTC olarak yorumlanır; bu mevcut kod kuralıdır, yeni bir karar
   değildir (`[DOĞRULANAMADI]`: kuralın yazılı olduğu bir DEC bulunamadı — Q-V03'e not).
3. **Intra-customer izolasyon sınırı.** DEC-0010 §11/§12: aynı müşteri-root şemasında MOSB/MOSBİO gibi
   kardeş tenant'ların satırları fiziksel olarak aynı tabloda; ayrım yalnızca `tenantId` filtresine
   dayanır ("real but smaller-blast-radius gap"). Vardiya tek/çok tablo seçiminde bu, izolasyonu
   **değiştirmez** (bkz. §2 matris).
4. **Audit deseni.** Mevcut `platform_audit_logs` (`actionCode`, `entityType`, `entityId`, `metadata`)
   **tenant kolonu taşımıyor** (`operations.ts:6-23`); tenant bilgisi `metadata` içine girer. Vardiya
   audit'i bu tabloyu yeniden kullanırsa tenant-bazlı audit sorgusu `metadata` üzerinden olur —
   Vardiya'ya özgü bir yan etki, **Q-V12** olarak kayıtlı.

---

## 1. Hedef domain modeli (şema-nötr, taslak)

Kavramsal aggregate: **ShiftReport** (vardiya raporu). Alanlar (kanıt: kaynak envanteri §3):

| Kavram | Taslak alan | Not |
|---|---|---|
| Kimlik | `id` text(UUID, `generateId()`) | Mevcut desen |
| Tenant ilişkisi | `tenantId` text FK→`tenants.id`, **nullable** (bkz. §6) | Çözülmemiş lokasyon için `NULL` + `scopeStatus` |
| Lokasyon | `locationCode` text (kontrollü değer kümesi) | Değerler §6'da; enum mı text+check mi → TASK-027.23 |
| Vardiya kodu | `shiftCode` text | Kaynak `MaxLength(1)` (canlı) / `50` (arşiv), değer kümesi `[DOĞRULANAMADI]` |
| Operatör | `operatorUserId` text, nullable, FK→`users.id` | Wave 1 legacy-ID çözümü sonrası; çözülemezse `NULL` |
| 2. operatör | `secondOperatorName` text nullable | Serbest metin, FK değil |
| Kayıt tarihi | `recordedAt` timestamp(3) | UTC yorumu, bkz. §7 |
| Defter tarihi | `logbookDate` timestamp(3) nullable | Yalnızca arşivden gelen kayıtlar |
| Notlar | `notes` text nullable | |
| Tamamlanma/durum | `status` (bkz. §5) | |
| "Performans alanları" | **Kaynakta yok** | Bkz. §1.1 |
| Audit alanları | `createdAt`, `updatedAt` (mevcut desen), `completedAt` nullable (öneri) | `createdBy/updatedBy` ve olay audit'i `platform_audit_logs` ile |
| Legacy ID | `legacySourceSystem`, `legacySourceTable`, `legacyId` | Bkz. §9 |
| Source checksum | `sourceChecksum` text | Bkz. §9 |
| Migration run | `migrationRunId` text nullable | Bkz. §9 |

### 1.1 "Performans alanları" — kanıt bulunamadı
Görev talimatı "performans alanları" listeler. `VardiyaRaporuBase`/`ArsivVardiyaRaporuBase` ve 5 somut
sınıfta (boş gövde) **hiçbir performans/ölçüm alanı yoktur** (kaynak envanteri §3–4: yalnızca
`Vardiya, OperatorBotUserId, OperatorTamAdi, Operator2TamAdi, KayitTarihi, RaporNotlari, IsCompleted /
DefterTarihi`). Bu alanlar uydurulmadı. Olası karşılıklar: (a) kavram yanlışlıkla SCADA endeksleriyle
karışmış (Wave 5), (b) gerçek SQL Server şemasında kod-dışı ek kolonlar var (**şema doğrulanamıyor**,
migration yok) → **Q-V13**: "Vardiya raporlarında performans/ölçüm alanı var mı? Gerçek DDL doğrulaması
gerekir." Gerçek DDL alınana kadar hedef modelde performans alanı **yoktur**.

---

## 2. Tablo modeli seçenekleri matrisi (Q-V10)

- **A** — tek `shift_reports` tablosu + `locationCode`.
- **B** — 5 ayrı lokasyon tablosu (BOTC birebir).
- **C** — ortak taban tablo (`shift_reports`: tüm ortak alanlar + `locationCode`) + lokasyona özel
  detail tabloları. **Kanıt notu:** BOTC'de 5 tablo **birebir aynı şemaya** sahip, lokasyona özel hiçbir
  alan yok (kaynak envanteri §4) → C'nin detail tabloları bugün **boş** olur; yalnızca *gelecekteki*
  lokasyon-özel alan ihtimaline yatırım.

| Kriter | A: tek tablo | B: 5 tablo | C: taban + detail |
|---|---|---|---|
| Tenant izolasyonu | `tenantId` + `locationCode` filtresi; DEC-0010 §11 ile aynı intra-schema sınır. Tek sorgu hatası (filtre unutma) 5 lokasyonu birden açar | Tablo başına ayrı ama **tablolar aynı şemada** → fiziksel izolasyon kazancı yok; 5 kez aynı filtre zorunlu | A ile aynı + join hatası riski |
| Arama/filtreleme | En basit; tek indeks seti `(tenantId, locationCode, recordedAt)` | Lokasyonlar arası arama `UNION` | Join gerekir |
| Archive davranışı | `status=ARCHIVED` veya ayrı archive tablo (Q-V02/06 sonrası) | Arşiv için 5 ek tablo (toplam 10) ya da status | Taban+detail × archive karmaşası |
| Migration karmaşıklığı | 10 BOTC tablosu → 1 hedef; `legacySourceTable` ile ayrım. Tek dönüşüm kodu | 10→10 birebir; **5× tekrar eden** migration/test kodu | 10→1+5; en karmaşık |
| Duplicate/idempotency | Tek unique anahtar `(legacySourceSystem, legacySourceTable, legacyId)` | Tablo başına ayrı unique; aynı mantık 5 kez | A ile aynı + detail tutarlılığı |
| Raporlama | Tek kaynak; lokasyonlar arası rapor doğal | Lokasyonlar arası rapor `UNION ALL` | Join |
| API karmaşıklığı | Tek servis/DTO, `locationCode` parametresi | 5 repository ya da dinamik tablo seçimi (BOTC `switch` desenini taşır) | Tek servis + polimorfik detail |
| Yeni lokasyon ekleme | Yeni `locationCode` değeri (veri/kontrol değişikliği, tablo migration'ı yok) | Yeni tablo + migration + kod | Yeni detail tablosu (gerekirse) |
| Audit/permission etkisi | Tek `entityType`; permission lokasyon-bağımsız (BOTC de öyle: kaynak envanteri §7) | 5 `entityType` veya ayırt edici metadata | Tek |

### 2.1 Q-V10 karar paketi

| Alan | İçerik |
|---|---|
| **AI2 önerisi** | **Seçenek A** (tek tablo + `locationCode`). *Öneridir, karar değildir.* |
| Gerekçe | (1) BOTC'nin 5 tablosu birebir aynı şema — tablo ayrımı domain'de değil SQL Server/EF `switch` desenindeki teknik tercihtir (`VardiyaService.cs:34-83`). (2) Metnex'te izolasyon zaten `tenantId` + closure tabanlı; B fiziksel izolasyon kazandırmaz (aynı şema). (3) En düşük migration/test/API yüzeyi. (4) Yeni lokasyon = veri değişikliği. |
| Riskler | (a) Lokasyon-özel alan ileride gerekirse A→C evrimi gerekir. (b) Tek tablo, satır sayısı büyürse `(tenantId, locationCode, recordedAt)` indeks/partition ihtiyacı (hacim **bilinmiyor**, gerçek veri okunmadı — `[DOĞRULANAMADI]`). (c) `locationCode` kontrolü uygulama/CHECK ile yapılmalı, yoksa serbest metin kirlenir. (d) Gerçek DDL doğrulanmadığından 5 tablonun gerçekten aynı şemada olduğu **yalnızca kod-kanıtlıdır**. |
| Geri dönüş maliyeti | **A→C**: düşük-orta (detail tablosu ekle, veri taşımaya gerek yok, additive). **A→B**: yüksek (tabloyu böl, FK/indeks/audit `entityType`/API yeniden yazımı; canlı veri varsa veri taşıma). **B→A**: yüksek (5 tabloyu birleştir, ID çakışması `legacyId`+tablo ile çözülür ama canlı veriyle riskli). Yani **karar geri dönüşü, "erken A" yönünde en ucuzdur**. |
| Karar için gereken bilgi | Gerçek SQL Server DDL'i (Q-V13), veri hacmi, lokasyon-özel alan beklentisi (PO), Q-V11 (şema yerleşimi) |
| Kararın bağlı olduğu task'lar | TASK-027.23 (lokasyon mapping), 027.24 (API), 027.26 (archive migration) |
| Alternatif öneri | Lokasyon-özel alan **kesin biliniyorsa** C. B yalnızca BOTC'yle birebir geçici uyumluluk gerekiyorsa (önerilmez). |

**Karar durumu:** Q-V10, AI1/PO kararıyla **A — tek `shift_reports` tablosu + `locationCode`**
olarak kapatılmıştır. Bu karar üretim şeması veya migration oluşturmaz; Q-V01–Q-V09 ve
Q-V11–Q-V19 açık karar kapılarıdır.

### 2.2 AI1/PO kararı — 2026-09-18

Seçenek A onaylandı. Beş BOTC tablosunun kod kanıtına göre ortak şemada olması, fiziksel tablo
ayrımının tenant izolasyonu sağlamaması, daha düşük migration/API/test yüzeyi ve A→C additive
evriminin mümkün olması belirleyicidir. Seçenek B uygulanmayacaktır. Lokasyona özel alan ihtiyacı,
gerçek DDL veya hacim bulgusu ortaya çıkarsa C'ye geçiş ayrıca değerlendirilir.

---

## 3. Kolon mapping (tam)

Notasyon: **K** = `[KOD]` kanıtı (BOTC C# Data Annotation), **D** = `[DOĞRULANAMADI]`.
Kanıt dosyaları: `BOT.Domain/VardiyaRaporuBase.cs`, `ArsivVardiyaRaporuBase.cs` (kaynak envanteri §3).

| BOTC alanı | Metnex hedef | Veri tipi | Null | Dönüşüm | Doğrulama | Kanıt | Belirsizlik |
|---|---|---|---|---|---|---|---|
| `Id` (int identity) | `legacyId` (+ yeni `id` UUID) | text (legacy), text UUID (id) | Hayır | `String(Id)`; `id` yeni üretilir | boş/≤0 reddedilir | K `[Key]`,Identity | Canlı/arşiv `Id` uzayları **ayrı** → `legacySourceTable` ile birlikte anahtar |
| `Vardiya` | `shiftCode` | text | Hayır | trim; **büyük/küçük harf korunur** (kaynak davranışı bilinmiyor) | boş değil; canlı kaynakta uzunluk=1, arşivde ≤50 → **hedefte ≤50** kabul, değer kümesi Q-V14 | K `MaxLength(1)` / `(50)` | **D** değer kümesi; iki farklı MaxLength'in nedeni (kod yorumu: "Hata yapmasın diye 50") |
| `OperatorBotUserId` | `operatorUserId` | text FK→users | **Evet** (çözülemezse) | Wave 1 legacy-ID mapping ile `targetId`; çözülemez → `NULL` + `legacyOperatorId` metadata | Wave 1 `UNRESOLVED` ise kayıt `scopeStatus` etkilenmez ama operatör `NULL` | K `int` (cross-DB mantıksal, FK yok) | Wave 1 apply yok (Q-ID01) → şimdilik çözülemez |
| `OperatorTamAdi` | `operatorNameSnapshot` **(öneri, karar bekliyor)** | text(150) | Evet | Taşınırsa olduğu gibi | ≤150 | K `MaxLength(150)` | **Önceki mapping "taşınmaz" demişti (TASK-027.21 §7). Yeniden değerlendirme:** `operatorUserId` çözülemeyen kayıtlarda isim tek insan-okunur iz olabilir; *tarihsel doğruluk* (kayıt anındaki ad) için de snapshot mantıklı. **Q-V15** olarak açık; varsayılan öneri: **snapshot taşı** |
| `Operator2TamAdi` | `secondOperatorName` | text(150) | Evet | trim; boş→NULL | ≤150 | K `MaxLength(150)` | Serbest metin, kullanıcıya bağlama kararı yok |
| `KayitTarihi` | `recordedAt` | timestamp(3) | Hayır | Kaynak yerel→UTC (§7) | geçerli tarih; makul aralık (ör. 2000–gelecek+1 gün) uyarı | K `DateTime`; `DateTime.Now` | **D** kaynak saat dilimi (Q-V03) |
| `RaporNotlari` | `notes` | text | Evet | olduğu gibi | — | K `string?` | Uzunluk sınırı kaynakta yok |
| `IsCompleted` (canlı) | `status` | enum/text | Hayır | `false`→`DRAFT`, `true`→`COMPLETED` (§5) | bool dışı değer reddedilir | K `bool default false` | — |
| *(arşivde alan yok)* | `status` | | | Arşiv kaydı: **karar bekliyor** (§5, §8) | | K "IsCompleted TAMAMEN SİLDİK" yorumu | Arşivdeki kaydın önceki `IsCompleted` değeri **bilinmiyor** |
| `DefterTarihi` (arşiv) | `logbookDate` | timestamp(3) | Evet (canlıdan gelenlerde) | Kaynak yerel→UTC | geçerli tarih | K `[Required] DateTime` | **D** tz; "kağıt defter tarihi" anlamı kod yorumundan |
| Tablo adı (5) | `locationCode` | text | Hayır | Tablo→kod: `mosbio`→MOSBIO, `mosbenerji`→MOSB_ENERJI, `komurkazani`→KOMUR_KAZANI, `mosbiokirimdepo`→MOSBIO_KIRIM_DEPO, `vardiyamuhendisi`→SANTRAL | 5 değerden biri | K `[Table]`, `switch` | Kod adlandırması öneri (TASK-027.23) |
| — | `legacySourceSystem` | text | Hayır | sabit `BOTC_VARDIYA` / `BOTC_ARSIV_VARDIYA` | | — | Yeni alan |
| — | `legacySourceTable` | text | Hayır | fiziksel tablo adı | | | |
| — | `sourceChecksum` | text | Hayır | deterministik hash (kanonik alanlar) | | | Wave 1 desenine paralel |
| — | `migrationRunId` | text | Evet | migration run kimliği | | | |
| — | `scopeStatus` | enum | Hayır | §6 | | | Yeni, öneri |

Kaynakta olup **hedefe taşınmayan**: yok (OperatorTamAdi'nın durumu Q-V15).
Hedefte olup **kaynakta olmayan**: `id`, `tenantId`, `status` (türetilmiş), `scopeStatus`, legacy/checksum/run alanları, `createdAt/updatedAt`.
`createdAt/updatedAt` migration'da `recordedAt` ile **karıştırılmamalı**: `createdAt` = hedefe yazılma zamanı.

---

## 4. Kaynak izlenebilirlik notu
Tüm satırlar `[KOD]` kaynaklı: Vardiya/Arşiv DbContext'lerinin migration geçmişi olmadığından (kaynak
envanteri §2) gerçek SQL Server tip/hassasiyet/index/constraint **doğrulanamıyor**. Bu, Q-V13'ün
(gerçek DDL doğrulaması) gerekçesidir; kod-tabanlı mapping bir alt sınırdır, gerçek şema ek kolon veya
farklı tip içerebilir.

---

## 5. Lifecycle modeli

| Kaynak | Hedef `status` | Statü | Not |
|---|---|---|---|
| Canlı `IsCompleted=false` | `DRAFT` | **Kaynak kanıtlı** | |
| Canlı `IsCompleted=true` | `COMPLETED` | **Kaynak kanıtlı** | BOTC'de kilit yalnızca UI'da |
| — | `LOCKED` | **Öneri (Q-V04/Q-V09)** | Öneri: ayrı status yerine **`COMPLETED` = servis katmanında salt-okunur** kabul et; `LOCKED` ayrı bir durum olarak gereksiz olabilir çünkü kaynakta `COMPLETED` zaten "değişiklik yapılamaz" anlamı taşıyor. Karar PO'da |
| — | `FAILED` | **Öneri (Q-V04)** | Domain durumu olarak **önerilmez**: `FAILED` bir *migration/import satır sonucu*dur (dry-run raporunda), rapor lifecycle'ı değildir. Öneri: hedef tabloda tutma, migration sonuç raporunda tut |
| Arşiv DB kaydı | `ARCHIVED` | **Öneri (Q-V04/Q-V02/Q-V06)** | Arşiv kayıtlarında `IsCompleted` alanı **yok**; önceki durum bilinmiyor. Arşivin "tamamlanmış" varsayımı kaynak kanıtı **değildir** (ayrı DB'ye taşıma mantığı gereği muhtemel ama `[DOĞRULANAMADI]`) |

Önerilen minimal küme (**karar değil**): `DRAFT`, `COMPLETED`, `ARCHIVED`. `LOCKED` ve `FAILED` domain
durumu olarak dahil edilmez; kilit davranışı servis kuralı, `FAILED` migration raporu. **Q-V04 açık.**
Geçiş kuralları önerisi: `DRAFT→COMPLETED` (tek yön; `COMPLETED→DRAFT` BOTC'de UI'da yok, yeniden
açma gerekliliği **kaynakta kanıtsız** → Q-V09'a ek soru), `COMPLETED→ARCHIVED`.

---

## 6. Tenant/location ilişkisi ve unresolved davranışı

Kural: **Erişime açık default üretilmez; tenant uydurulmaz.**

| Lokasyon | Hedef tenant durumu | `tenantId` | `scopeStatus` (öneri) |
|---|---|---|---|
| MOSBİO (`mosbio`) | Yüksek güven (Discovery ile örtüşüyor) — **yine de Q-T01 açık olduğundan** nihai onay TASK-027.23 | `NULL` **veya** yalnızca AI1/PO onayı sonrası MOSBİO tenant | `PENDING_APPROVAL` → `RESOLVED` |
| MOSB ENERJİ (`mosbenerji`) | Yüksek güven → MOSB | aynı | aynı |
| KÖMÜR KAZANI | PENDING_MAPPING (Q-V01) | `NULL` | `PENDING_MAPPING` |
| MOSBİO KIRIM DEPO | PENDING_MAPPING (Q-V01) | `NULL` | `PENDING_MAPPING` |
| SANTRAL | UNRESOLVED (Q-V01) | `NULL` | `UNRESOLVED` |
| MOSEDAŞ | Vardiya kodunda kanıt yok | — | Kapsam dışı |

Notlar:
- Yüksek-güvenli 2 lokasyon bile, Q-T01 kapatılana kadar **varsayılan olarak `tenantId = NULL`**
  kalır; "yüksek güven" bir onay değildir. Bu, TASK-027.21'deki yüksek-güven ifadesinin **daha
  temkinli** okunuşudur, çelişmez.
- **Erişim kuralı:** `scopeStatus ≠ RESOLVED` veya `tenantId IS NULL` olan satırlar hiçbir tenant
  kullanıcısının veri kapsamında görünmez (fail-closed; `TenantScopeService.resolve()`'un mevcut
  fail-closed felsefesi ve Wave 1 `UNRESOLVED` deseniyle paralel). Bu satırları kim görür/atar → **Q-V16**
  (yalnızca PO/platform operasyon kararı; yeni root yetkisi **icat edilmedi**).
- `tenantId` `NULL` + tenant filtreli sorgu: `WHERE tenantId IN (dataScopeTenantIds)` `NULL`'ı zaten
  dışlar (SQL üç-değerli mantık) — ek koruma olarak `scopeStatus='RESOLVED'` koşulu servis katmanında
  zorunlu (TASK-027.24'te test edilecek).
- Tenant çözümü **lokasyon → tenant mapping tablosu/konfigürasyonu** üzerinden yapılmalı, kayıt
  içeriğinden çıkarım yapılmamalı (TASK-027.23'ün konusu).

---

## 7. Timezone ve tarih alanları

| Alan | Kaynak | Hedef | Durum |
|---|---|---|---|
| `KayitTarihi` | `DateTime`, servis `DateTime.Now` (sunucu yerel saati; `VardiyaService.cs` — kaynak envanteri §3.1) | `recordedAt` `timestamp(3)` UTC | Kaynak tz **`[DOĞRULANAMADI]`**. `DateTime.Now` + `Kind` belirtilmemiş → tz bilgisi kayıpta |
| `DefterTarihi` | `[Required] DateTime` (kullanıcı girişi, kağıt defter tarihi) | `logbookDate` | Muhtemelen **takvim günü** semantiği (saat anlamsız) → **öneri:** `date` tipi mi `timestamp` mı Q-V03'e ek soru; kaynakta saat bileşeni kullanılıyor mu `[DOĞRULANAMADI]` |
| Depolama | — | Mevcut desen `timestamp` (tz'siz), içerik UTC | Bkz. §0-2 |
| Görüntüleme | WPF yerel | Öneri: kullanıcı/tenant display timezone (varsayılan `Europe/Istanbul`, **DEC-0006/0007 locale kararı tz içermiyor** — `[DOĞRULANAMADI]`) | Öneri, karar değil |

Dönüşüm kuralı önerisi: kaynak saat dilimi PO/operasyon tarafından teyit edilene kadar migration **kaynak
değeri ham olarak** `recordedAtSourceRaw` (metadata) ile saklar, UTC dönüşümü yalnızca tz teyidinden
sonra yapılır; DST belirsiz saatler (Türkiye 2016'dan beri kalıcı UTC+3, öncesi DST'li — **tarihsel
kayıtlar için önemli**) rapor edilir. **Q-V03 kapatılmadı.**

---

## 8. Archive modeli ve kararlara bağlantı

| Seçenek | Açıklama | Bağımlılık |
|---|---|---|
| Aynı tabloda `ARCHIVED` | Q-V10=A ile doğal. Arşiv+canlı tek yerde; `logbookDate` nullable | Append-only davranışı **servis kuralı** olarak zorunlu (BOTC'de update yolu yokluğu = koda dayalı, DB constraint değil) |
| Ayrı `shift_reports_archive` | BOTC arşiv DB'sine benzer; `IsCompleted` yok, `logbookDate` zorunlu | Şema farkı gerçek: iki farklı yapı (`Vardiya` 1 vs 50 char, `DefterTarihi` zorunlu) |

- **Append-only:** BOTC arşivinde update/delete yolu kodda yok (kaynak envanteri §5.2); Metnex'te bunun
  *DB seviyesinde* zorunluluğu (trigger/izin) tasarım kararıdır → TASK-027.26/27.
- **Retention (Q-V02)**: açık; hedef modelde `purgeAfter` alanı **eklenmedi**.
- **Duplicate (Q-V06)**: bkz. §9. Canlı ve arşiv `Id` uzayları bağımsız → aynı raporun hem canlıda hem
  arşivde olup olmadığı **bilinmiyor**; arşive taşınırken canlıdan silinip silinmediği kaynak kodda
  **kanıtsız** → potansiyel mantıksal duplicate (aynı `lokasyon+Vardiya+tarih`) migration'da tespit
  edilmeli. **Q-V06 iş kuralı sorusu olarak açık.**
- Bu belge Q-V02/Q-V06'yı **implementation kararı olarak uygulamaz**; TASK-027.26 bağımlılığı §12'de.

---

## 9. Idempotency ve legacy mapping tasarımı

Wave 1 desenine (TASK-027.10/012) paralel, ama Wave 1 staging şeması (Q-ID01) **açık olduğundan yeni
staging tablosu tasarlanmadı**.

| Öğe | Tasarım (taslak) |
|---|---|
| Duplicate anahtarı | `UNIQUE (legacySourceSystem, legacySourceTable, legacyId)` |
| `sourceChecksum` | Kanonik alan kümesi üzerinde deterministik hash: `shiftCode, operatorLegacyId, secondOperatorName, recordedAtSourceRaw, notes, isCompleted|logbookDate, locationCode`. **Internal UUID/`migrationRunId`/hedef zamanları checksum'a girmez** (TASK-027.18–19 dersi: iç üretilen değerler karşılaştırmaya sokulmaz) |
| Retry | Aynı anahtar + **aynı checksum** → `NOOP` (idempotent); aynı anahtar + **farklı checksum** → **`CONFLICT_SOURCE_CHANGED`** (sessizce üzerine yazılmaz; `COMPLETED/ARCHIVED` kayıt asla migration ile değiştirilmez) |
| Conflict | Aynı anahtar farklı `locationCode` (imkânsız olmalı) veya farklı tenant → FATAL, kayıt yazılmaz (TASK-027.15-R1 desenine paralel: conflict = erişim yok) |
| Mantıksal duplicate (Q-V06) | Anahtar farklı ama `(locationCode, shiftCode, recordedAt-günü)` aynı → **UYARI** olarak raporla, otomatik silme/birleştirme yok |
| Dry-run | Wave 1 `DRY_RUN` standardı; kalıcı yazım yok; rapor deterministik |
| `migrationRunId` | Hedef satırda son yazan run'ı izler; idempotent NOOP'ta güncellenmez |
| Tenant çözülemeyen | Kayıt **yazılır** (`tenantId NULL`, `scopeStatus` PENDING/UNRESOLVED), veri kaybı olmaz ama erişime kapalıdır — alternatif: hiç yazma. **Hangisi?** → **Q-V17** (öneri: yaz + kapat, çünkü tekrar migration'ı gereksiz kılar) |

---

## 10. Tenant isolation ve aggregate sınırları

- `tenantId` (nullable, FK), `scopeStatus`, `locationCode`.
- Okuma kapsamı: `TenantScopeService.resolve(tenantId)` → `dataScopeTenantIds`; sorgu
  `tenantId ∈ dataScopeTenantIds AND scopeStatus='RESOLVED'`. Root aggregate **yalnızca** mevcut
  `canAggregateChildren`/closure kuralıyla (`tenant-scope.service.ts`); **yeni aggregate yetkisi yok**.
- `canEnterData=false` tenant (raporlama-only) Vardiya **yazamaz** — mevcut alan yeniden kullanılır
  (`tenants.canEnterData`); yazma servisi `resolve().canEnterData` kontrol etmeli (TASK-027.24 testi).
- Lokasyon scope (tenant içi lokasyon bazlı kısıtlama): mevcut modelde **yok**. Aynı tenant'ın
  birden çok lokasyonu olursa (ör. MOSB: MOSB ENERJİ + KÖMÜR KAZANI?) kullanıcının tüm lokasyonları mı
  gördüğü **Q-V18** (yeni lokasyon-permission icat edilmedi; BOTC de lokasyon-bazlı yetki tanımıyordu —
  `CanViewShiftReports` global).
- `TenantScopeService` fail-closed davranışları (PLATFORM_ROOT, inactive, registry yok) Vardiya için
  aynen geçerli. Data-plane şema yerleşimi (§0-1) bu servis çıktısındaki `schemaName` ile ilişkili → Q-V11.

---

## 11. Permission ve audit etkisi

| BOTC | Metnex kodu | Catalogue'da? | Durum |
|---|---|---|---|
| `CanViewShiftReports` | `SHIFT:REPORT:VIEW` | **Hayır** (`permission-catalogue.ts`'te `SHIFT` yok — grep boş) | Q-V07 açık; production'a **eklenmedi** |
| `CanManageShifts` | `SHIFT:REPORT:UPDATE` | **Hayır** | Q-V07 açık; ayrıca BOTC'de create+edit+list birlikte → ayrı `CREATE` gerekip gerekmediği **Q-V19** |
| `CanReceiveShiftReportEmail` | *yok* | Hayır | Q-V07/Q-V08; kod icat edilmedi |
| Arşiv | BOTC aynı 2 permission | — | Q-V08 |

Audit: kaynakta Vardiya için **audit izi yok** (kaynak envanteri: e-posta hataları bile yutuluyor) →
audit tamamen yeni gereksinim. Öneri (karar değil): `platform_audit_logs` yeniden kullanımı,
`entityType='SHIFT_REPORT'`, `actionCode` seti TASK-027.24'te; tenant bilgisi `metadata` içinde
(bkz. §0-4, **Q-V12**). Audit kaydına **rapor notları/PII yazılmaz**, yalnızca id/status/locationCode.

---

## 12. Sonraki task bağımlılıkları (TASK-027.23–027.30)

| Task | Bu belgeden aldığı girdi | Bloke eden açık sorular |
|---|---|---|
| 027.23 lokasyon mapping | `locationCode` değerleri, `scopeStatus` modeli, §6 tablo | Q-V01, Q-T01, Q-S03, Q-V16 |
| 027.24 API/service | Aggregate, izolasyon sorgusu, `canEnterData`, permission | Q-V07, Q-V08, Q-V19, Q-V18, Q-V11 |
| 027.25 server-side lock | Lifecycle §5 | Q-V04, Q-V09 |
| 027.26 archive migration | §8–9 idempotency/duplicate | Q-V02, Q-V06, Q-V17, Q-V03, Q-ID01 |
| 027.27 archive read API | Archive modeli | 027.26 sonucu |
| 027.28 email distribution | `CanReceiveShiftReportEmail`, status geçişi=COMPLETED | Q-V05, Q-V07 |
| 027.29 UI | API kontratı | 027.24/25 |
| 027.30 permission/audit testleri | §11 permission/audit etkisi, §10 izolasyon sorgusu, §6 unresolved erişim kuralı = test edilecek davranışlar | Q-V07, Q-V08, Q-V12, Q-V16, Q-V19 (027.24/25 çıktısına bağlı) |

Ortak önkoşullar: Wave 1 identity apply (Q-ID01) — `operatorUserId` çözümü; DEC-0010 Phase 5 — şema yerleşimi.

---

## 13. Yeni açık sorular (append-only, `BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye işlendi)

Q-V11 data-plane şema yerleşimi (DEC-0010 Phase 5) · Q-V12 audit tenant izi · Q-V13 gerçek DDL + performans alanı ·
Q-V14 `shiftCode` değer kümesi/uzunluk · Q-V15 `OperatorTamAdi` snapshot · Q-V16 çözülmemiş satırları kim yönetir ·
Q-V17 tenant çözülemeyen kayıt yazılsın mı · Q-V18 tenant-içi lokasyon scope · Q-V19 CREATE/UPDATE permission ayrımı. **Q-V01–Q-V09 ve Q-V11–Q-V19 açık; Q-V10 A olarak kapatıldı.**

## 14. Kesin teyit

Drizzle schema/migration/seed oluşturulmadı; PostgreSQL/SQL Server'a bağlanılmadı; gerçek BOTC verisi
okunmadı/kopyalanmadı; API/service/workflow/archive migration/email/UI yazılmadı; yeni tenant, lokasyon
kodu veya permission kodu **production'a** eklenmedi (§3'teki `locationCode` adları ve §11 kodları taslaktır);
Wave 2/3, Docker, git commit/push yapılmadı; Q-T01/Q-S03/Q-ID01/Q-P02 ve Q-V01–Q-V09/Q-V11–Q-V19 açık;
root aggregate yetkisi genişletilmedi.
