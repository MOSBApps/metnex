# BOTC Vardiya / Arşiv Vardiya → Metnex Hedef Mapping (Wave 4)

> **Durum: Discovery/mapping dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-21-vardiya-srs-ve-migration-mapping.md`. Bu belge
> `BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md`'nin (kaynak kanıtı) üzerine, Metnex hedef modelini,
> tenant/lokasyon kararlarını, yaşam döngüsü eşlemesini, migration kapsamını, tenant izolasyonu
> etkisini, permission mapping'ini ve Wave 4 implementation sırasını inşa eder. **Hiçbir
> implementation kararı kesinleştirilmemiştir** — Q-T01/Q-S03/Q-ID01/Q-P02 bu belgede
> kapatılmamıştır.

**Tarih:** 2026-09-18
**Hazırlayan:** AI2 (Engineering Executor)

---

## 1. Hedef Domain Modülü

Önerilen: `apps/api/src/shift-reports/` (Vardiya) — mevcut modül isimlendirme kuralına uygun,
İngilizce/domain-nötr ("shift" = vardiya). Bu **bir implementation kararı değil, öneridir**;
kesin modül adı TASK-027.22'de (PostgreSQL domain model) AI1 onayıyla sabitlenecektir.

## 2. Entity/Tablo Mapping (önerisi — kanıt kaydı §3'te BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md'ye referans verilir)

BOTC'nin 5 ayrı tablosu (`vardiyamuhendisi`/`mosbenerji`/`mosbio`/`komurkazani`/`mosbiokirimdepo`),
**birebir aynı kolon şemasına** sahip olduğu için (bkz. kaynak envanteri §4), Metnex tarafında **iki
seçenek** vardır — bu belge her ikisini de sunar, **seçim yapmaz**:

| Seçenek | Tanım | Artı | Eksi |
|---|---|---|---|
| **A — Tek tablo + lokasyon kolonu** | `shift_reports` tablosu, `locationSlug` (enum/text) alanıyla 5 lokasyonu ayırt eder | Basit şema, tek migration, sorgu birleştirme kolay | BOTC'nin "her lokasyon kendi tablosu" izolasyonunu kaybeder |
| **B — Lokasyon başına ayrı tablo** | BOTC'nin 5-tablo yapısını birebir korur | Kaynak yapıyla 1:1, geçiş kolaylığı | Metnex'in mevcut tenant-scope modeliyle daha az uyumlu, 5x şema tekrarı |

**Öneri (implementation kararı değil):** Seçenek A — Metnex'in mevcut tenant-scope/permission
modeli zaten "tenant + kayıt" ilişkisini `tenantId` kolonuyla çözüyor (`tenants`/`tenant_closure`,
TASK-027.4/15'te kanıtlandı); BOTC'nin "lokasyon = ayrı tablo" deseni, kod-öncesi bir SQL Server
sınırlamasıydı, Metnex'in relational modelinde gerekli değildir. **Bu, AI1'in TASK-027.22'de
karara bağlayacağı bir öneridir, burada kesinleştirilmemiştir.**

Arşiv için de aynı ikilem geçerlidir — ek olarak: BOTC'de arşiv **ayrı bir fiziksel veritabanı**
(`ArsivVardiyaDbContext`), Metnex'te bunun karşılığı ayrı bir **tablo** (`shift_reports_archive`)
veya aynı tablonun bir `status = ARCHIVED` satırı olabilir (bkz. §5). Karar TASK-027.26'ya
bırakılmıştır.

## 3. Kolon Mapping (kaynak: BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md §3)

| BOTC alanı | Metnex hedefi (öneri) | Not |
|---|---|---|
| `Id` (int identity) | `id` (text, `randomUUID()` — mevcut `apps/api/src/db/id.ts` deseni) | Legacy ID mapping gerekir (bkz. §6.5) |
| `Vardiya` (1 veya 50 char) | `shiftCode` (text) | Değer kümesi `[DOĞRULANAMADI]`, doğrudan taşınır |
| `OperatorBotUserId` (int, cross-DB mantıksal referans) | `operatorUserId` (text, Wave 1 identity migration'ının `targetId`'sine legacy-ID-mapping ile çözülür) | Wave 1 tamamlanmadan bu alan çözülemez — **Wave 4, Wave 1'e bağımlıdır** |
| `OperatorTamAdi` (denormalize ad) | Taşınmaz — Metnex `users.displayName`'den her zaman canlı okunur | BOTC'nin denormalizasyonu, Metnex'in normalize kullanıcı modelinde gereksiz |
| `Operator2TamAdi` (serbest metin) | `secondOperatorName` (text, nullable) — **gerçek bir user FK değil**, BOTC'deki gibi serbest metin olarak taşınır | Gerçek bir kullanıcıya bağlamak yeni bir karar gerektirir, bu belgede verilmedi |
| `KayitTarihi` | `recordedAt` (timestamp) | Saat dilimi `[DOĞRULANAMADI]` — Metnex'in `tr-TR`/ICU locale kararıyla (DEC-0006) uyumlu UTC saklama önerilir, PO onayı gerekir |
| `RaporNotlari` | `notes` (text, nullable) | Doğrudan taşınır |
| `IsCompleted` (yalnızca canlı) | `status` alanına dönüştürülür (bkz. §5) | Boolean → enum dönüşümü |
| `DefterTarihi` (yalnızca arşiv) | `logbookDate` (timestamp, yalnızca arşiv kayıtlarında dolu) | Doğrudan taşınır |

## 4. Tenant Ownership

Wave 1/15'te onaylanan tenant modeli (MOSB/MOSEDAŞ/MOSBİO, `tenantMemberships`) burada **aynen
kullanılır** — yeni bir tenant kavramı icat edilmez. Ancak §5'teki lokasyon-tenant eşlemesi
**tam değildir** (bkz. §5), bu nedenle bazı Vardiya kayıtları `PENDING_MAPPING` kalabilir.

---

## 5. Tenant/Location Modeli — Q-T01/Q-S03 Kapatılmadan (görev talimatı §4)

| BOTC lokasyonu | Vardiya modülünde kod kanıtı var mı | Önerilen tenant | Kesinlik |
|---|---|---|---|
| `MOSBİO` | ✅ (`mosbio` tablosu) | **MOSBİO** | Yüksek — Discovery §21.1 ile örtüşüyor (TASK-027.4'te zaten değerlendirilmişti) |
| `MOSB ENERJİ` | ✅ (`mosbenerji` tablosu) | **MOSB** | Yüksek — aynı gerekçe |
| `KÖMÜR KAZANI` | ✅ (`komurkazani` tablosu, **ayrı Vardiya tablosu olarak** — BOTC_MIP_TENANT_LOCATION_MAPPING.md §3'te yalnızca SCADA bağlamında değerlendirilmişti, burada Vardiya'nın **kendi ayrı raporlama tablosu olduğu** yeni bir kanıttır) | **PENDING_MAPPING** | Düşük — MOSB Enerji'nin bir üretim kaynağı mı yoksa Vardiya raporlaması için **ayrı bir tenant-içi scope mu** olacağı Q-T01'e bağlı |
| `MOSBİO KIRIM DEPO` | ✅ (`mosbiokirimdepo` tablosu) | **PENDING_MAPPING** | Düşük — aynı gerekçe, Q-T01 |
| `SANTRAL` | ✅ (`vardiyamuhendisi` tablosu) | **UNRESOLVED** | Düşük — Discovery'de "Santral" biriminin GT/SG ile ilişkisi `[DOĞRULANAMADI]` olarak işaretliydi (`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §3), Vardiya modülünde de aynı belirsizlik geçerli |
| `MOSEDAŞ` | ❌ Vardiya modülünde **hiç kod kanıtı yok** (bkz. kaynak envanteri §4) | — | Vardiya kapsamına girmiyor, mapping gerekmiyor |
| `GT/SG fiziksel kaynakları` | ❌ Vardiya raporu değil (SCADA endeks, Wave 5) | — | Bu belgenin kapsamı dışı |

**Bu belge Q-T01/Q-S03'ü kapatmaz** — `KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL` için hedef
tenant/scope kararı **PENDING_MAPPING/UNRESOLVED** olarak açık bırakılmıştır (görev talimatı
§4'ün açık kuralı). Bu 3 lokasyona ait Vardiya kayıtları, gerçek bir migration'da Wave 1'in
`tenantMembershipStatus = UNRESOLVED` desenine benzer şekilde **erişime kapalı** kalmalıdır (bkz.
§7).

---

## 6. Yaşam Döngüsü Eşlemesi (görev talimatı §5 — uydurma yok)

| Kaynak kod karşılığı | Hedef durum (öneri) | Kaynak/Not |
|---|---|---|
| `IsCompleted = false` (canlı) | `DRAFT` | Doğrudan kaynak karşılığı var |
| `IsCompleted = true` (canlı) | `COMPLETED` | Doğrudan kaynak karşılığı var — ama BOTC'de bu **yalnızca UI'da** kilitli (bkz. kaynak envanteri §5.1); Metnex hedefinde **sunucu-taraflı** bir kilit önerilir (aşağıya bakınız) |
| Arşiv veritabanına taşınmış kayıt | `ARCHIVED` | Kaynakta ayrı bir durum alanı yok (ayrı bir **veritabanı**), ama Metnex'te tek bir `status` enum'una eklenmesi **hedef model önerisidir**, kaynak zorunluluğu değildir |
| *(kaynakta yok)* | `LOCKED` | **Hedef model önerisi** — `COMPLETED`'ın BOTC'de yalnızca UI-seviyesinde uygulandığı bulgusuna (kaynak envanteri §5.1) dayanarak, Metnex'in bu boşluğu **sunucu tarafında** kapatması önerilir: `COMPLETED` olduğunda backend `UPDATE`'i reddetmeli. Bu, kaynakta doğrudan karşılığı **olmayan**, güvenlik gerekçesiyle önerilen bir hedef davranıştır — PO onayı gerektirir. |
| *(kaynakta yok)* | `FAILED` | **Hedef model önerisi** — yalnızca migration/import hatası senaryosu için (dry-run standardının genel hata kategorileriyle tutarlı), BOTC'nin kendi lifecycle'ında **hiç yoktur**. Gerekip gerekmediği PO kararı gerektirir. |

**Kilit bulgusu açık soru olarak kaydedildi (bkz. §11 açık sorular).**

---

## 7. Migration Kapsamı (görev talimatı §6)

| Kategori | İçerik |
|---|---|
| **Taşınacak** | `Id`→legacy mapping, `Vardiya`(shiftCode), `KayitTarihi`, `RaporNotlari`, `IsCompleted`/durum, `DefterTarihi` (yalnızca arşiv), `Operator2TamAdi` (serbest metin olarak) |
| **Dönüştürülecek** | `OperatorBotUserId` → Wave 1 identity migration'ının `targetId`'sine legacy-ID-mapping ile çözülür (Wave 1 **önce** tamamlanmalı); `IsCompleted` (bool) → `status` (enum) |
| **Taşınmayacak** | `OperatorTamAdi` (denormalize ad — Metnex'te `users.displayName`'den canlı okunur, veri kopyası tutulmaz) |
| **Karar bekleyen** | `KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL` kayıtlarının tenant ataması (Q-T01), arşiv retention süresi (bkz. §11), timezone dönüşümü (bkz. §11) |
| **Legacy ID mapping** | BOTC `int Id` + kaynak tablo adı (`sourceEntityType` benzeri bir birleşik anahtar) → Metnex `text/UUID` — Wave 1'in `migration_staging_identity` tasarım deseniyle (TASK-027.11, Q-ID01 açık) **aynı ilke**, ama Q-ID01 kapatılmadan bir staging şeması **bu belgede de üretilmemiştir** |
| **Tarih/saat timezone dönüşümü** | `[DOĞRULANAMADI]` kaynak saat dilimi (kaynak envanteri §9) — açık soru olarak kaydedildi |
| **Duplicate/orphan davranışı** | Duplicate: BOTC'de `Id` zaten benzersiz (identity PK), duplicate riski yalnızca **migration'ın kendisinin** iki kez çalıştırılmasından doğar — Wave 1'in idempotency standardı (`sourceChecksum`, TASK-027.10/12) **aynen uygulanmalıdır**, yeniden icat edilmemelidir. Orphan: `OperatorBotUserId` Wave 1'de çözülemeyen (`UNRESOLVED`) bir kullanıcıya işaret ediyorsa, Vardiya kaydı da **erişime hazır sayılmamalıdır** (bkz. §8) |
| **Archive migration stratejisi** | **Karar bekliyor** (TASK-027.26) — BOTC'nin ayrı arşiv veritabanını Metnex'in tek `shift_reports` tablosuna (bir `status=ARCHIVED` satırı olarak) mı, yoksa ayrı bir `shift_reports_archive` tablosuna mı taşıyacağı §2'deki A/B seçenekleriyle bağlantılı, burada kesinleştirilmedi |

---

## 8. Tenant İzolasyonu Etkisi (görev talimatı §7)

- Kullanıcı yalnızca yetkili olduğu tenant'ın Vardiya kayıtlarını görebilmelidir — bu, Wave 1/15'te
  kurulan `tenantMemberships` + `PermissionGuard` mekanizmasının **doğrudan yeniden kullanımıdır**,
  yeni bir izolasyon mekanizması icat edilmez.
- MİP root tenant aggregate yetkisi, **yalnızca** mevcut `TenantScopeService.resolve()` +
  `canAggregateChildren` kuralıyla sınırlı kalmalıdır (TASK-027.4/20'de zaten kanıtlanan
  mekanizma) — bu belge **yeni bir aggregate yetkisi önermez veya icat etmez**.
  `security-tenant-isolation.spec.ts`'in "Root tenant / aggregate" kategorisi (TASK-027.20),
  gelecekteki Vardiya implementation'ının da uyması gereken **aynı** güvenlik sınırını zaten
  test etmektedir.
- Lokasyon eşleşmesi çözülemeyen kayıtlar (`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL`, §5),
  Wave 1'in `UNRESOLVED` desenine birebir paralel olarak **erişime açık gösterilmemelidir** —
  bu, görev talimatının açık kuralıdır ve bu belgede **korunmuştur**, gevşetilmemiştir.

---

## 9. Permission Mapping (görev talimatı §8 — kaynak: kaynak envanteri §7)

| BOTC permission | Mevcut Metnex catalogue'da karşılığı var mı (`apps/api/src/platform/permission-catalogue.ts`) | Sonuç |
|---|---|---|
| `CanManageShifts` | Hayır (Q-M03 taslağında `SHIFT:REPORT:UPDATE` **önerilmişti**, TASK-027.12-R1'de Q-M03 kapandı ama bu kod henüz gerçek `ASSIGNABLE_CATALOGUE`'a **eklenmedi** — TASK-027.16'da da bu boşluk not edilmişti) | Kod adı sabit: `SHIFT:REPORT:UPDATE` — **gerçek catalogue'a eklenmesi Wave 4 implementation'ının önkoşuludur, bu task'ta eklenmedi** |
| `CanViewShiftReports` | Aynı durum | Kod adı sabit: `SHIFT:REPORT:VIEW` — aynı önkoşul |
| `CanReceiveShiftReportEmail` | Hayır, **hiç önerilmemişti** | **Wave 4 için eksik permission — yeni açık soru olarak kaydedildi (§11)**. Bu belge **yeni bir kod icat etmez** — yalnızca eksikliği raporlar |

**Onaysız yeni permission kodu üretilmedi.** Arşiv-özel ayrı bir permission (`CanManageShiftArchive`
gibi) BOTC kodunda **yok** (kaynak envanteri §7) — bu belge de böyle bir kod icat etmez; canlı ve
arşiv işlemlerinin aynı 2 permission ile mi yönetileceği, yoksa Metnex'te ayrıştırılıp
ayrıştırılmayacağı **açık soru olarak** kaydedildi (§11).

Wave 2 (Bakım/Arıza) ve Wave 3 (DÖF) permission'ları bu belgeye **taşınmamıştır**.

---

## 10. Workflow / Email Dağıtımı Ayrımı (görev talimatı §9)

| Kavram | Kapsam | Bu task'ta ne yapıldı |
|---|---|---|
| **Domain lifecycle** | `DRAFT`→`COMPLETED`(→`LOCKED`/`ARCHIVED`) | §6'da mapping yapıldı (implementation değil) |
| **Kilitleme/tamamlama** | `COMPLETED` sonrası düzenleme reddi | §6'da **hedef model önerisi** olarak işaretlendi, implementation **yapılmadı** |
| **Archive** | Ayrı DB → ayrı tablo/status | §2/§7'de seçenekler sunuldu, karar **verilmedi** |
| **Email distribution** | `CanReceiveShiftReportEmail` alıcı sorgusu + HTML gövde | Yalnızca **mapping ve bağımlılık olarak belgelendi** (kaynak envanteri §6) — **implementation bu task'ta kesinlikle yapılmadı**, TASK-027.28'e bırakıldı |

Bu 4 kavram **kasıtlı olarak ayrı task'lara bölünmüştür** (§12) — email dağıtımının kendisi bir
provider entegrasyonu gerektirir ve bu task'ın "Kesinlikle yapılmayacaklar" listesinde açıkça
yasaktır.

---

## 11. Yeni Açık Sorular (append-only, `BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye işlendi)

- **Q-V01** — Vardiya lokasyon sahipliği: `KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL` hangi
  tenant'a (veya tenant-içi hangi scope'a) ait olacak? (Q-T01'in Vardiya'ya özgü somutlaşması)
- **Q-V02** — Arşiv retention: arşiv kayıtları süresiz mi tutulacak, yoksa bir saklama süresi
  (retention) politikası mı uygulanacak?
- **Q-V03** — Timezone: `KayitTarihi`/`DefterTarihi` hangi saat diliminde saklanıyor (kaynak),
  Metnex UTC/tr-TR standardına (DEC-0006) nasıl dönüştürülecek?
- **Q-V04** — Status karşılıkları: `LOCKED`/`FAILED`/`ARCHIVED`'ın BOTC'de doğrudan karşılığı
  olmayan bu 3 önerilen durumu Wave 4'ün hedef modeline dahil edilecek mi (§6)?
- **Q-V05** — Email dağıtım davranışı: gönderim hatası sessizce yutulmaya devam mı edecek, yoksa
  Metnex'te audit/retry mekanizması mı eklenecek? Hangi email/SMTP provider kullanılacak
  (TASK-027.28'in önkoşulu)?
- **Q-V06** — Legacy kayıtların duplicate stratejisi: Wave 1'in `sourceChecksum` tabanlı
  idempotency deseni Vardiya'ya birebir uygulanacak mı, yoksa Vardiya'ya özgü ek bir kural
  gerekiyor mu (örn. aynı lokasyon+vardiya+tarih kombinasyonunun iş kuralı olarak tekil olması)?
- **Q-V07** — Permission catalogue boşluğu: `SHIFT:REPORT:UPDATE`/`SHIFT:REPORT:VIEW`'ın gerçek
  `ASSIGNABLE_CATALOGUE`'a ne zaman ekleneceği (Wave 4 implementation'ının önkoşulu);
  `CanReceiveShiftReportEmail`'in hedef kod karşılığı nedir (hiç önerilmemişti)?
- **Q-V08** — `CanManageShifts`/`CanViewShiftReports`'ın canlı ve arşiv için **aynı** permission
  olarak mı kalacağı, yoksa Metnex'te arşiv-özel ayrı bir permission'a mı ayrılacağı?
- **Q-V09** — Sunucu-taraflı kilitleme: BOTC'de `COMPLETED` sonrası düzenleme yalnızca UI'da
  engelleniyor (kaynak envanteri §5.1) — Metnex'in bunu servis katmanında da zorunlu kılıp
  kılmayacağı (öneri: evet, ama PO kararı gerekir).
- **Q-V10** — Tablo modeli: BOTC'nin 5 ayrı tablosu Metnex'te tek tabloya (Seçenek A, §2) mı
  yoksa 5 ayrı tabloya (Seçenek B) mı dönüştürülecek?

---

## 12. Wave 4 Implementation Task Sırası (görev talimatı §12)

| Sıra | Task | Bağımlılık | Not |
|---|---|---|---|
| 1 | TASK-027.22 — PostgreSQL domain model | Bu task (TASK-027.21) + Wave 1 (identity) done | Q-V10 (tablo modeli) burada karara bağlanmalı |
| 2 | TASK-027.23 — Vardiya lokasyon mapping | TASK-027.22 | Q-V01 (Q-T01'in somutlaşması) burada karara bağlanmalı |
| 3 | TASK-027.24 — Vardiya API/servis | TASK-027.22, TASK-027.23 | Q-V07 (permission catalogue) önkoşuldur |
| 4 | TASK-027.25 — workflow kilitleme | TASK-027.24 | Q-V09 (sunucu-taraflı kilit) burada karara bağlanmalı |
| 5 | TASK-027.26 — arşiv migration | TASK-027.22, Wave 1 idempotency standardı | Q-V02 (retention), Q-V06 (duplicate stratejisi) önkoşuldur |
| 6 | TASK-027.27 — arşiv read API | TASK-027.26 | |
| 7 | TASK-027.28 — email distribution | TASK-027.24 | Q-V05 (provider kararı) önkoşuldur — email provider entegrasyonu bu Wave 4 zincirinde **en son** gelir |
| 8 | TASK-027.29 — Vardiya UI ekranları | TASK-027.24, TASK-027.25 | |

Bu sıralama **bir öneridir** — AI1'in backlog planlama yetkisindedir, bu belge bir atama yapmaz.

---

## 13. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu belge Ticket/MaintenanceRecord/FaultRecord (Wave 2) ve DÖF (Wave 3) için hiçbir mapping veya
implementation önerisi üretmemiştir (D-007 ile tutarlı).

## 14. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 15. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı kesinleştirmemiştir** — Q-V01–Q-V10 (ve zaten açık olan
  Q-T01/Q-S03/Q-ID01/Q-P02) çözülmeden Wave 4 implementation task'ları (TASK-027.22+) başlatılamaz.
- `SHIFT:REPORT:UPDATE`/`SHIFT:REPORT:VIEW` kodları hâlâ gerçek `permission-catalogue.ts`'e
  eklenmedi — bu, TASK-027.16'da da not edilen, Wave 1'den beri açık kalan bir önkoşuldur.
- Wave 1 (identity migration) implementation'ı (gerçek SQL Server adapter'ı + gerçek PostgreSQL
  apply) henüz üretilmedi — `OperatorBotUserId` çözümlemesi bu adım tamamlanmadan mümkün değildir.
- Gerçek secret/parola/connection string/kullanıcı verisi hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Git commit/push
  yapılmadı.

---

## 16. TASK-027.22 Güncellemesi (2026-09-18) — Domain Model Karar Paketi

Detay: `BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE.md`. Bu belgenin önceki bölümleri **değiştirilmedi**;
aşağıdakiler onlara ek/netleştirmedir. Q-V01–Q-V10 hâlâ açık.

- **§2 (tablo modeli):** İki seçenek yerine üç seçenek (A tek tablo / B 5 tablo / C taban+detail)
  karşılaştırıldı; Q-V10 karar paketi hazırlandı. AI2 önerisi A, **karar açık**.
- **§3 (kolon mapping):** Tam mapping (tip/null/dönüşüm/doğrulama/kanıt/belirsizlik) karar paketi §3'te.
  **Netleştirme:** `OperatorTamAdi` "taşınmaz" ifadesi Q-V15 ile yeniden değerlendirmeye açıldı
  (varsayılan öneri snapshot taşı); karar bekliyor.
- **§5 (tenant/location):** Yüksek-güvenli MOSBİO/MOSB ENERJİ dahil **hiçbir lokasyon Q-T01 kapanmadan
  `tenantId` almaz** (`NULL` + `scopeStatus`); erişime açık default yok.
- **§6 (lifecycle):** Öneri minimal küme `DRAFT/COMPLETED/ARCHIVED`; `LOCKED` servis kuralı,
  `FAILED` migration sonucu olarak önerildi (Q-V04 açık). Arşivdeki kaydın önceki `IsCompleted`
  değeri kaynakta bilinmiyor.
- **Yeni bulgu:** DEC-0010 Phase 5 (data-plane şema) uygulanmadan tablonun şema yerleşimi belirsiz
  (Q-V11). Talimattaki "performans alanları" kaynak kodda yok (Q-V13).
- **§12 (sıra):** TASK-027.30 (Vardiya permission/audit testleri) de zincire dahildir; bağımlılıklar
  karar paketi §12'de.

---

## 17. TASK-027.23 Güncellemesi (2026-09-19) — Lokasyon–Tenant Mapping

Detay: `BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE.md`. Önceki bölümler değiştirilmedi.

- **§5 netleştirme:** Lokasyonlar kanıt seviyesiyle (E1–E4) sunuldu; hiçbir lokasyon `RESOLVED` değil.
  MOSBİO/MOSB ENERJİ (E2, güven yüksek) dahil hepsi onay kaydı olmadan `PENDING_APPROVAL`/`UNRESOLVED`
  ve **erişime kapalı**; SANTRAL için aday kanıtlanamadı (E4, `ArsivVardiyaService.cs:41` "YENİ EKLENDİ").
- Kavramsal mapping sözleşmesi ve fail-closed kuralları (K1–K12) karar paketi §4–5'te; `Sirket` tenant
  kaynağı değildir; root aggregation genişletilmedi.
- Yeni sorular Q-V20–Q-V22. Q-T01/Q-V01/Q-S03/Q-V16/Q-V18 açık.
