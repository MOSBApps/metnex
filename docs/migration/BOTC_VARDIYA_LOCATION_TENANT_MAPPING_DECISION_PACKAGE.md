# BOTC Vardiya Lokasyon–Tenant Mapping ve Scope Karar Paketi (TASK-027.23)

> **Durum: Karar/mapping hazırlık dokümanı — tenant oluşturma, seed, Drizzle schema, migration, API, UI,
> permission catalogue değişikliği YOK.** Kavramsal mapping sözleşmesi (§5) **uygulanmamıştır**.
> AI2 yalnızca kanıt, seçenek ve öneri sunar. **Q-T01, Q-V01, Q-S03, Q-V16, Q-V18 kapatılmamıştır.**
> Q-V10 (AI1/PO): tek `shift_reports` tablosu + `locationCode` — bu belge o kararı temel alır.

**Tarih:** 2026-09-19 · **Hazırlayan:** AI2

**Kanıt kaynakları:** BOTC (`BOT.Services/{VardiyaService,ArsivVardiyaService}.cs`, `BOT.Domain/User.cs`,
`grep` ile — yalnızca kod, gerçek veri yok); `BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md`,
`BOTC_MIP_TENANT_LOCATION_MAPPING.md`, `BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE.md`,
`DISCOVERY.md` §21.1/D-005/D-006; Metnex: `tenant-scope/tenant-scope.service.ts`,
`platform/tenant-membership.guard.ts`, `platform/permission.guard.ts`, `db/schema/platform.ts`,
`migration/botc-identity/tenant-mapping.ts`.

**Kanıt seviyesi ölçeği (bu belgeye özgü):**
`E1` BOTC kodunda doğrudan · `E2` Discovery/D-005 belgesi + isim örtüşmesi (BOTC kodunda tenant kavramı
yok) · `E3` yalnızca çıkarım · `E4` kanıt yok.

---

## 1. Lokasyon envanteri (kaynak kodla yeniden doğrulandı)

Doğrulama: `VardiyaService.cs` (satır 36–77 switch blokları, 258–260) ve `ArsivVardiyaService.cs`
(32–41, 61–70, 96–149) yalnızca şu 5 lokasyon dizgisini içerir: `MOSBİO`, `MOSB ENERJİ`, `KÖMÜR KAZANI`,
`MOSBİO KIRIM DEPO`, `SANTRAL`. `grep -rln "MOSEDA"` BOT.Domain/BOT.Services/BOT.Data'da **sonuçsuz**.
`.Sirket` yalnızca `UserService.cs:81` ve `UserManagementWindow.xaml.cs:78,118`'de geçer (kullanıcı
yönetimi) — **hiçbir Vardiya kodunda yok**. Kod yorumu: `ArsivVardiyaService.cs:41` `SANTRAL` için
"// YENİ EKLENDİ" (diğer 4 lokasyondan sonra eklenmiş).

**Kapsam dışı (Vardiya lokasyonu değildir):** MOSEDAŞ (Vardiya kodunda yok), GT/SG fiziksel
kaynakları ve SCADA endeks kaynakları (Wave 5). Bunlar bu tabloya **eklenmemiştir**.

| # | BOTC entity / tablo (canlı · arşiv) | Önerilen `locationCode` (taslak) | Tenant adayı | Kanıt | Kaynak referansı | Çelişki / belirsizlik | Erişim durumu (öneri) | PO kararı? |
|---|---|---|---|---|---|---|---|---|
| 1 | `MosbioRapor` · `ArsivMosbioRapor` / `mosbio` | `MOSBIO` | MOSBIO | **E2** (güven yüksek) | Vardiya `case "MOSBİO"` (E1: lokasyon var); Discovery §21.1/D-005 (E2: işletme MOSBİO) | BOTC'de tenant yok; eşleme belge-tabanlı. Tenant kaydının Metnex DB'sinde varlığı doğrulanamadı (§3.3) | `PENDING_APPROVAL` → onay kaydı yoksa erişim **kapalı** | Evet (onay kaydı) |
| 2 | `MosbEnerjiRapor` · `ArsivMosbEnerjiRapor` / `mosbenerji` | `MOSB_ENERJI` | MOSB | **E2** (güven yüksek) | `case "MOSB ENERJİ"`; Discovery §21.1 "MOSB Enerji" işletmesi = D-005 "MOSB" | "MOSB ENERJİ" ↔ tenant slug `MOSB` adı bire bir aynı değil (isim örtüşmesi) | `PENDING_APPROVAL` | Evet (onay kaydı) |
| 3 | `KomurKazaniRapor` · `ArsivKomurKazaniRapor` / `komurkazani` | `KOMUR_KAZANI` | MOSB (aday) | **E2** zayıf | Discovery §21.1: Kömür Kazanı MOSB Enerji üretim kaynağı; Vardiya'da **ayrı rapor tablosu** (E1) | Üretim kaynağı olması ≠ Vardiya sahipliği; aynı tablo şeması, ayrı iş birimi olabilir | `PENDING_APPROVAL` (MOSB adayı; erişim kapalı) | **Evet** (Q-V01) |
| 4 | `MosbioKirimDepoRapor` · `ArsivMosbioKirimDepoRapor` / `mosbiokirimdepo` | `MOSBIO_KIRIM_DEPO` | MOSBIO (aday) | **E3** | Yalnızca ad "MOSBİO …" ile başlıyor; Discovery'de geçmiyor | Ayrı işletme/tenant olma ihtimali dışlanamaz (Q-T01) | `PENDING_APPROVAL` (erişim kapalı) | **Evet** (Q-T01, Q-V01) |
| 5 | `VardiyaMuhendisiRapor` · `ArsivVardiyaMuhendisiRapor` / `vardiyamuhendisi` | `SANTRAL` | Aday yok kanıtlanamadı (MOSB olası ama **E3/E4**) | **E4** | `case "SANTRAL"`, "YENİ EKLENDİ" yorumu (E1 yalnızca varlığı) | Tablo adı (`vardiyamuhendisi`) ile lokasyon adı (`SANTRAL`) farklı; GT/SG ile ilişkisi belgesiz; sonradan eklenmiş | `UNRESOLVED` (erişim kapalı) | **Evet** (Q-T01, Q-V01) |

Not — `locationCode` adları **taslaktır**; kesin değer kümesi/enum-mu-CHECK-mi kararı implementation
task'ındadır (TASK-027.24). Canlı/arşiv karşılıkları **ayrı mapping kayıtlarıdır** (§5) ama aynı
`locationCode` için aynı tenant'a çözülmek zorundadır (§4, kural K7).

---

## 2. Tenant eşleme seçenekleri (lokasyon başına)

Seçenekler: **S1** mevcut işletme tenant'ına doğrudan · **S2** MİP root altında alt tenant/varlık ·
**S3** `tenantId = NULL` (eşleme yapılana kadar) · **S4** lokasyon yalnızca veri alanı (`locationCode`),
tenant değil.

Önemli ayrım: **S4 bir tenant kararı değildir** — `locationCode` Q-V10=A ile zaten her satırda vardır.
S4 "lokasyon için ayrı tenant **açılmaz**" demektir; satırın hangi tenant'a ait olduğu S1 ile (ya da
S3 ile geçici) yine belirlenmelidir. S2, **yeni tenant oluşturmayı** gerektirir ve bu belgede/task'ta
yapılmaz; yalnızca PO seçeneği olarak değerlendirilir. Yeni tenant/slug önerilmemiştir; mevcut onaylı
slug kümesi `MOSB`, `MOSEDAS`, `MOSBIO`'dur (`tenant-mapping.ts:8`).

| Lokasyon | S1 doğrudan işletme tenant'ı | S2 alt tenant/varlık | S3 `tenantId=NULL` | S4 yalnızca veri alanı | AI2 önerisi (karar değil) |
|---|---|---|---|---|---|
| MOSBİO | MOSBIO — E2, doğal | Gereksiz (zaten işletme) | Onay gelene kadar | — | S1 (MOSBIO) **onay sonrası**; şimdilik S3 |
| MOSB ENERJİ | MOSB — E2, doğal | Gereksiz | Onay gelene kadar | — | S1 (MOSB) **onay sonrası**; şimdilik S3 |
| KÖMÜR KAZANI | MOSB'a S1 (üretim kaynağı olarak) | Ayrı tenant için kanıt yok; yeni tenant gerektirir | **Şimdilik** | Lokasyon MOSB içinde S4 olarak kalır | S3 şimdi → PO onayıyla **S1(MOSB)+S4** |
| MOSBİO KIRIM DEPO | MOSBIO'ya S1 (E3 çıkarım) | Ayrı işletme ise S2 (Q-T01) | **Şimdilik** | S1(MOSBIO)+S4 | S3 şimdi; PO'ya S1+S4 vs S2 seçeneği sun |
| SANTRAL | MOSB'a S1 **kanıtsız** (E3/E4) | Yeni tenant kanıtı yok | **Şimdilik (UNRESOLVED)** | S4 ancak tenant kararından sonra | S3; **hiçbir aday önerilmez**, PO/iş bilgisi gerekir |

Karşılaştırma ölçütleri (özet): **izolasyon** — S3 en güvenli (fail-closed), S1+S4 mevcut mekanizmayla
uyumlu, S2 yeni tenant + closure/registry/membership operasyonu gerektirir (DEC-0010 §5-6 iki adımlı
provizyon riski). **Migration** — S3→S1 sonradan yeniden çözümleme ile geçilebilir (§4-K8); S1→S2
verinin tenant'lar arası taşınması (izolasyon-hassas, pahalı). **Geri dönüş maliyeti:** S3→S1 düşük;
S1→S2 yüksek; S2→S1 yüksek. Bu yüzden belirsiz lokasyonlarda **S3 ile başlamak** en ucuz geri
dönülebilir yoldur.

---

## 3. Mevcut tenant yapısıyla uyum (kod kanıtı)

### 3.1 Doğrulanan davranışlar

| Mekanizma | Kanıt | Vardiya için sonuç |
|---|---|---|
| `TenantScopeService.resolve(tenantId)` | `tenant-scope.service.ts:33-72`: bilinmeyen tenant → 404, `PLATFORM_ROOT` → 403, aktif değil → 403, `customerRootId` yok → 403, aktif schema registry yok → 403; sonuç `dataScopeTenantIds` | Vardiya okuma sorgusu **yalnızca `dataScopeTenantIds` içindeki tenant'ların** satırlarını döndürebilir. `tenantId IS NULL` satır hiçbir tenant'ın kapsamında değildir |
| `canAggregateChildren` | `:57-59`: `true` ise `closure.getDescendantTenantIds(tenantId)`, değilse `[tenantId]` | Root aggregation **yalnızca torun tenant ID'leri** üzerinden; `NULL`/CONFLICT satırlar torun listesinde olamaz → root da göremez. Yeni yetki gerekmez |
| `tenant_closure` | `platform.ts:34-51` (ancestor/descendant/depth) | Alt-tenant (S2) seçilirse kapsam otomatik genişler — bu yüzden S2 **root aggregation'ı dolaylı genişletir**; yalnızca bilinçli PO kararıyla |
| `canEnterData` | `tenants.canEnterData`, `resolve()` sonucunda döner | Vardiya **yazma** yalnızca `canEnterData=true` tenant'a; mapping çözümü bunu kontrol etmelidir (TASK-027.24 testi). Lokasyon→tenant eşlemesi, `canEnterData=false` (raporlama-only) bir tenant'a çözülüyorsa → satır `CONFLICT`/uyarı olarak işaretlenmeli (öneri, §4-K9) |
| `TenantMembershipGuard` | `tenant-membership.guard.ts`: `X-Tenant-Id` için aktif `tenantMemberships` satırı şart; **`user.isSystemAdmin` → doğrudan `true`** (satır 44) | Kullanıcı erişimi tenant üyeliğine bağlı. Kullanıcının tenant'ı Wave 1'de çözümlenmemişse (`UNRESOLVED`) membership yoktur → Vardiya da görünmez (tutarlı) |
| `PermissionGuard` | `permission.guard.ts:32`: `isSystemAdmin` → `true` | Guard katmanı sistem yöneticisini geçirir; **ama** data-plane scope çözümü `PLATFORM_ROOT` için 403 verir (`:48-50`) → sistem yöneticisi de bu yoldan Vardiya verisi okuyamaz |

### 3.2 Yeni mekanizma üretilmedi
Yeni scope mekanizması, yeni root yetkisi, lokasyon bazlı permission önerilmemiştir. Lokasyon bazlı
görünürlük ihtiyacı yalnızca **soru** olarak kayıtlıdır (Q-V18).

### 3.3 Bulgular (yeni)
1. **Tenant kayıtlarının varlığı doğrulanamadı.** `MOSB`/`MOSEDAS`/`MOSBIO` slug'ları yalnızca Wave 1
   migration motorunda (`tenant-mapping.ts`) onaylı-slug sabiti olarak geçiyor; `apps/` altında bu
   tenant'ları oluşturan bir seed/bootstrap **bulunamadı** (`grep` yalnızca `migration/botc-identity/`
   dosyalarını döndürdü). Gerçek DB'ye bağlanılmadığından tenant'ların bugün mevcut olup olmadığı
   `[DOĞRULANAMADI]` → **Q-V20**. Bu belge tenant oluşturmaz.
2. **Sistem yöneticisi bypass'ı.** `isSystemAdmin` iki guard'ı da geçer; Vardiya servisi yazılırken
   kural açıkça test edilmeli: "guard geçse bile veri sorgusu `resolve()` scope'una bağlıdır" (TASK-027.30).
3. **`Sirket` tenant kaynağı değildir.** Yalnızca kullanıcı yönetimi kodunda geçer; hiçbir Vardiya
   sorgusunda/yetkisinde kullanılmaz (`BOTC_MIP_TENANT_LOCATION_MAPPING.md` §2.2 ile tutarlı).
   Vardiya mapping'i `Sirket`'ten **türetilmez**; operatörün `Sirket` değeri bir kaydın tenant'ını
   belirlemek için kullanılamaz.

---

## 4. Güvenlik ve fail-closed davranış kuralları (karar paketi)

Varsayılan ilke: çözülmemiş veya çakışmalı kayıt tenant kullanıcılarına gösterilmez; çakışmalı
mapping erişim üretmez; `Sirket` tenant kaynağı değildir; root aggregation otomatik genişlemez.

| Kural | Durum | Tanımlanan davranış (öneri; PO/AI1 onayına tabi) |
|---|---|---|
| **K1** `tenantId = NULL` | Kayıt tenant'sız | Hiçbir `dataScopeTenantIds` içinde değil → tenant kullanıcıları ve root göremez. Servis ayrıca `tenantId IS NOT NULL AND scopeStatus='RESOLVED'` koşulunu **açıkça** uygular (SQL üç-değerli mantığa güvenmez) |
| **K2** `scopeStatus != RESOLVED` | `PENDING_APPROVAL/UNRESOLVED/CONFLICT/REJECTED` | Tenant `NOT NULL` olsa bile (ör. eski bir çözüm sonrası geri alınmış) **erişim yok** |
| **K3** Çakışan lokasyon→tenant eşlemeleri | Aynı `(sourceSystem, sourceTable)` için farklı tenant'a işaret eden ≥2 kayıt, veya canlı/arşiv karşılığı farklı tenant'a çözülüyor | Bütün ilgili mapping `CONFLICT`; ilgili satırların **hepsi** `tenantId=NULL`, `scopeStatus=CONFLICT`. "İlk/son kazanır" **yok** (TASK-027.15-R1 dersi: çakışma raporlanıp erişim verilmez) |
| **K4** Aynı lokasyon için birden fazla tenant kararı | Örn. iki onay kaydı | K3 ile aynı; tarih çakışması yoksa (biri `effectiveTo`/yerine geçen) yalnızca en yeni onaylı geçerli — bunun için `supersede` ilişkisi gerekir (§5, Q-V22); yoksa `CONFLICT` |
| **K5** Onaysız mapping | `approvedBy/approvedAt` boş | Yalnızca `PENDING_APPROVAL`; erişim üretmez. `RESOLVED` **yalnızca** onay alanları dolu ise geçerlidir |
| **K6** Root tenant + unresolved | Root (canAggregateChildren) unresolved/NULL satırları görür mü? | **Hayır** — `dataScopeTenantIds` yalnızca torun tenant ID'leri; `NULL` yoktur. Sistem yöneticisi (`PLATFORM_ROOT`) de `resolve()` 403 nedeniyle okuyamaz. Unresolved kayıtları yönetme yolu **ayrı, açık bir PO kararıdır** (Q-V16); yeni yetki icat edilmedi |
| **K7** Canlı↔arşiv tutarlılığı | Aynı `locationCode` canlı/arşivde farklı tenant | K3 uygulanır (CONFLICT) |
| **K8** Yeniden çözümleme | Mapping düzeltildi/onaylandı | Yalnızca `scopeStatus ∈ {PENDING_APPROVAL, UNRESOLVED, CONFLICT}` ve `tenantId NULL` satırlar, mapping `RESOLVED` olunca **idempotent** olarak çözülür (`sourceChecksum` değişmez, satır içeriği yeniden yazılmaz, yalnızca `tenantId/scopeStatus`). Audit kaydı (eski→yeni). Çözülmüş (`RESOLVED`) satırın tenant'ı **sessizce değiştirilmez**: tenant değişikliği ayrı, onaylı, audit'li bir "reassignment" işlemidir (tenant'lar arası veri taşıma izolasyon-hassastır) → Q-V22 |
| **K9** `canEnterData=false` hedef | Mapping bu tür tenant'a çözülüyor | Yazma/çözümleme reddedilir, `CONFLICT` + uyarı (önerilen; yeni kural değil, mevcut alanın yeniden kullanımı) |
| **K10** `Sirket` | Kullanıcı `Sirket` değeri | Mapping girdisi olamaz; kayıt tenant'ı kullanıcının tenant'ından **çıkarılmaz** (operatörün membership'i ile kaydın lokasyon sahipliği ayrı kavramlar) |
| **K11** Hedef tenant `ACTIVE` değil / registry yok | `resolve()` 403 | Satır erişilemez; mapping durumu değişmez, ayrıca uyarı |
| **K12** Kayıt kaybı | Tenant çözülemeyen kayıt | Kayıt **yazılıp erişime kapatılabilir** (öneri) ya da hiç yazılmayabilir → Q-V17 (kapatılmadı) |

---

## 5. Kavramsal mapping sözleşmesi (uygulanmayacak)

Tek bir kayıt = bir kaynak tablonun bir tenant kararı. **Production tablo/seed/migration değildir**;
yalnızca implementation task'larının (TASK-027.24/26) uyacağı sözleşmedir.

| Alan | Zorunlu? | Null | Not |
|---|---|---|---|
| `sourceSystem` | Zorunlu | Hayır | `BOTC_VARDIYA` \| `BOTC_ARSIV_VARDIYA` (TASK-027.22 §3 ile aynı) |
| `sourceTable` | Zorunlu | Hayır | `mosbio`, `mosbenerji`, `komurkazani`, `mosbiokirimdepo`, `vardiyamuhendisi` (kaynak kodda doğrulanmış 5 ad) |
| `locationCode` | Zorunlu | Hayır | §1 taslak değerleri; aynı `locationCode` canlı/arşiv için tutarlı olmalı |
| `tenantSlug` | Koşullu | `RESOLVED` için **Hayır**; diğer durumlarda Evet | Yalnızca mevcut onaylı slug kümesinden (`MOSB`,`MOSEDAS`,`MOSBIO`) — başka değer **reddedilir**. Vardiya için `MOSEDAS` kanıtsız → `RESOLVED` olamaz |
| `mappingStatus` | Zorunlu | Hayır | Aşağıda |
| `evidenceLevel` | Zorunlu | Hayır | `E1..E4` (§0 ölçeği) |
| `approvedBy` | Koşullu | `RESOLVED` için Hayır | Onaylayan kimlik; yeni yetki tanımlamaz |
| `approvedAt` | Koşullu | `RESOLVED` için Hayır | |
| `effectiveFrom` | Koşullu | `RESOLVED` için Hayır | Mapping'in geçerlilik başlangıcı; geçmiş kayıtlara etkisi Q-V22 |
| `notes` | İsteğe bağlı | Evet | Gerçek veri/secret içermez |
| *(öneri)* `supersedesMappingId` | İsteğe bağlı | Evet | K4 için; Q-V22 kararına bağlı, sözleşmeye dahil edilmesi PO'ya sorulur |

Benzersizlik önerisi: aynı `(sourceSystem, sourceTable)` için aynı anda **en fazla bir** `RESOLVED`
kayıt geçerli olabilir; ek `RESOLVED` → K3/K4.

**`mappingStatus`:**

| Durum | Anlam | Erişim üretir mi? | Geçiş |
|---|---|---|---|
| `PENDING_APPROVAL` | Aday var, onay yok | **Hayır** | → `RESOLVED` (onayla), → `REJECTED`, → `CONFLICT` |
| `UNRESOLVED` | Aday/kanıt yok | **Hayır** | → `PENDING_APPROVAL` (aday+kanıt gelince) |
| `RESOLVED` | Onaylı, tek, çakışmasız | **Evet** (yalnızca K1–K12 ile birlikte) | → `CONFLICT` (çakışma), → yeni `RESOLVED` (supersede) |
| `CONFLICT` | Çelişen ≥2 karar / tutarsız | **Hayır** | → `PENDING_APPROVAL` (çakışma giderilince) |
| `REJECTED` | PO aday tenant'ı reddetti | **Hayır** | → `PENDING_APPROVAL` (yeni aday) |

Satır düzeyi `scopeStatus` (TASK-027.22) bu mapping durumunun **türevidir**: satır `RESOLVED` ancak
mapping `RESOLVED` ise ve K1–K12 ihlali yoksa. Mapping onay kaydı olmadan satırın `RESOLVED` olması
mümkün olmamalıdır.

**Başlangıç durumu (bu task'ın önerisi, uygulanmadı):** 10 mapping (5 tablo × canlı/arşiv):
MOSBİO/MOSB ENERJİ → `PENDING_APPROVAL` (E2); KÖMÜR KAZANI/MOSBİO KIRIM DEPO → `PENDING_APPROVAL`
(E2/E3, aday MOSB/MOSBIO); SANTRAL → `UNRESOLVED` (E4). Hiçbiri `RESOLVED` değildir; onay PO/AI1'indir.

---

## 6. Açık sorular — kanıt, seçenek, öneri (hiçbiri kapatılmadı)

**Q-T01 — MOSBİO KIRIM DEPO ve SANTRAL ayrı tenant mı, lokasyon/veri alanı mı?**
Kanıt: ikisi de BOTC'de yalnızca ayrı rapor tablosu ve lokasyon dizgisi (E1); tenant/işletme ayrımı
kaynakta yok. Discovery MOSBİO KIRIM DEPO'yu anmıyor; SANTRAL'ın GT/SG ilişkisi belgesiz ve sonradan
eklenmiş. Seçenekler: (a) mevcut işletme tenant'ı + veri alanı (S1+S4), (b) ayrı tenant (S2, yeni
tenant/closure/registry/üyelik), (c) karar gelene kadar `NULL` (S3). AI2 önerisi: **S3 şimdi**; PO iş
bilgisiyle (a) vs (b) seçer. (b) yalnızca ayrı erişim/yönetim sınırı gerekiyorsa. Geri dönüş: (c)→(a)
ucuz, (a)→(b) ve (b)→(a) pahalı.

**Q-V01 — KÖMÜR KAZANI, MOSBİO KIRIM DEPO, SANTRAL sahipliği.** Kanıt: §1. KÖMÜR KAZANI için MOSB
(E2 zayıf); KIRIM DEPO için MOSBIO (E3); SANTRAL için aday kanıtlanamadı (E4). Öneri: PO iş
sahiplerinden teyit; teyide kadar `PENDING_APPROVAL/UNRESOLVED`. Karar için gereken: her lokasyonun
operasyonel/idari sahibi, ayrı erişim sınırı gerekip gerekmediği.

**Q-S03 — SCADA kaynaklarının tenant/lokasyon görünürlük modeli.** Bu task'ın kapsamı Vardiya'dır;
SCADA Vardiya lokasyonu **değildir** ve burada eşlenmedi. Vardiya mapping kaydı `sourceSystem`
ile ayrıştığından SCADA mapping'i bağımsız bir kayıt kümesi olarak aynı sözleşmeyi **yeniden
kullanabilir** (öneri); tenant kararları arasında tutarlılık (aynı işletme aynı tenant) Wave 5'te
doğrulanmalı. Kapatılmadı; kanıt: `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §4.

**Q-V16 — Unresolved kayıtları kim yönetecek?** Kanıt: §3.1/§4-K6 — tenant kullanıcısı, root ve
`PLATFORM_ROOT` bu satırları veri düzleminde okuyamaz; yani yönetim yolu **mevcut mekanizmada
yoktur**. Seçenekler: (a) yalnızca migration/mapping düzeltme süreci (satırlar okunmaz, yalnızca
mapping düzeltilir ve K8 yeniden çözümler) — **yeni yetki gerektirmez**; (b) platform operasyon
kullanıcısına özel, audit'li read-only inceleme (yeni yetki → ayrı karar); (c) hiç doğrudan erişim
yok. AI2 önerisi: **(a)**; (b) yalnızca PO ihtiyaç bildirirse ve ayrı task'ta.

**Q-V18 — Aynı tenant içindeki lokasyonlar için ayrı görünürlük?** Kanıt: BOTC'de
`CanViewShiftReports`/`CanManageShifts` lokasyon-bağımsız, tek permission; X
lokasyon seçiminin kendisinin ek kısıt taşıyıp taşımadığı ayrıca doğrulanmadı (kaynak envanteri §7). Talimat gereği lokasyon bazlı
permission/scope **üretilmedi**. Öneri: BOTC davranışını koru (tenant içi tüm lokasyonlar görünür),
Q-V01 sonrası yeniden değerlendir. Bu, KÖMÜR KAZANI/KIRIM DEPO/SANTRAL sahiplik kararına bağlıdır
(bir tenant'ın kullanıcıları başka birimin raporlarını görmemeli mi?).

### 6.1 Yeni açık sorular (append-only işlendi)
- **Q-V20** — MOSB/MOSBİO/MOSEDAŞ tenant kayıtları hedef ortamda mevcut mu (seed/bootstrap `apps/`
  içinde bulunamadı); mapping onayından önce tenant oluşturma kimin/hangi task'ın işi?
- **Q-V21** — Mapping kayıtları nerede tutulacak (kod/konfigürasyon sabiti mi, `public` control-plane
  tablosu mu, data-plane şeması mı — Q-V11'e bağlı) ve onay kaydı hangi audit ile izlenecek?
- **Q-V22** — `effectiveFrom` geçmiş kayıtlara etkisi ve tenant değişikliği (reassignment) politikası:
  RESOLVED satır sonradan başka tenant'a taşınabilir mi, hangi onayla, `supersedes` ilişkisi gerekli mi?

---

## 7. Sonraki task bağımlılıkları

| Task | Bu belgeden girdi | Bloke eden |
|---|---|---|
| TASK-027.24 API/servis | K1–K12 sorgu/yazma kuralları, `canEnterData`, mapping sözleşmesi | Q-V20, Q-V21, Q-V07, Q-V18 |
| TASK-027.25 workflow kilitleme | Etkilenmez (yalnızca `scopeStatus=RESOLVED` kayıtlar) | Q-V09 |
| TASK-027.26 arşiv migration | Mapping çözümü + K8 yeniden çözümleme + Q-V17 | Q-V01, Q-T01, Q-V17, Q-V22, Q-ID01 |
| TASK-027.30 permission/audit testleri | K6 (root/sysadmin okuyamaz), K3 (çakışma erişimsiz), K10 (`Sirket`), isSystemAdmin bypass testi | 027.24 |

## 8. Teyit

Tenant oluşturulmadı/atanmadı, seed/Drizzle schema/migration yazılmadı, PostgreSQL/SQL Server'a
bağlanılmadı, gerçek BOTC verisi okunmadı (yalnızca kod `grep`), API/UI/permission catalogue/root
aggregation değişmedi, yeni tenant/slug/permission/lokasyon uydurulmadı, Wave 2/3 ve Docker'a
dokunulmadı, git commit/push yapılmadı. Q-T01, Q-V01, Q-S03, Q-V16, Q-V18 (ve diğer açık sorular)
kapatılmadı; hiçbir lokasyon `RESOLVED` olarak işaretlenmedi.
