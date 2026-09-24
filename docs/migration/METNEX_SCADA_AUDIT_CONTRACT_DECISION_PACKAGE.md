# Metnex SCADA Audit Sözleşmesi — Karar Paketi

> **Durum: karar paketi (TASK-027.58-R1). Kod, migration, permission, audit kodu, tablo veya adapter
> üretilmemiştir; hiçbir karar AI2 tarafından verilmemiştir.** Her konuda kanıt, seçenekler, etkiler
> ve **boş karar alanı** vardır. Kararsız alanlar açık soru (Q-SA serisi) olarak bırakıldı.
> Yeni permission veya audit action kodu **uydurulmamıştır**; testlerdeki `SCADA_READ_CONTRACT_TEST`
> yalnızca test-yerel bir etikettir.

**Tarih:** 2026-09-23 · **Hazırlayan:** AI2 · **Bağlı:** Q-AD01, Q-M03, Q-M05, Q-SP01, TASK-027.9 §7,
TASK-027.57 (export audit deseni), `docs/migration/METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md`

## 0. Kanıt (repo'da bugün gerçekten olan)

| # | Kanıt | Kaynak |
|---|---|---|
| E1 | Audit tablosu `platform_audit_logs`: `id, actorId, actorSnapshot(jsonb), actionCode, entityType, entityId, summary, metadata(jsonb), createdAt`. **Tenant/root kolonu yok** — kapsam yalnızca `metadata` içinde taşınabilir. İndeksler: `actionCode`, `actorId`, `(entityType, entityId)`, `createdAt`. Bölümleme/saklama (retention) politikası yok. | `apps/api/src/db/schema/operations.ts` |
| E2 | Yazım yolu `PlatformAuditService.log`: her çağrıda bir actor `SELECT` + bir ham SQL `INSERT`; yalnızca eksik-tablo hatası yutulur, diğer hatalar fırlatılır → çağıran best-effort için kendi try/catch'ini yazmak zorunda. | `platform-audit.service.ts` |
| E3 | Okuma yolu `GET platform-audit-logs` **yalnızca sistem yöneticisi** (`isSystemAdmin`), MFA-setup zorunlu. Müşteri/tenant yöneticisi kendi tenant'ının audit'ini göremez. | `platform-audit.controller.ts` |
| E4 | Redaction `scrubSecrets`: yalnızca **anahtar** bazlı (R1 ile genişletildi); değerlere bakmaz; `rawSql`/`schemaName` anahtarlarını maskelemez. | `audit/scrub-secrets.ts` |
| E5 | Mevcut action adı deseni: `SCREAMING_SNAKE_CASE`, çoğunlukla `<VARLIK>_<FİİL_GEÇMİŞ>` (`REPORT_EXPORT_SUCCEEDED/DENIED/FAILED`, `TENANT_ROLE_ASSIGNED`, `USER_CREATED`); bir istisna iki nokta üst üste stili (`MIGRATION:BOT_APP_USERS:DRY_RUN`). Permission kodları ayrı: `DOMAIN:RESOURCE:ACTION`. | repo taraması |
| E6 | Mevcut `entityType` deseni PascalCase (`User`, `ReportArtifact`, `TenantMembership`); bir istisna `migration_run`. `entityId` = ilgili kaydın kimliği/kodu. | repo taraması |
| E7 | TASK-027.57 export audit'i: başarı yalnızca çıktı üretildikten sonra; ret, çalışma öncesi; audit yazım hatası sonucu **asla** değiştirmez; metadata allowlist'i (`tenantId, artifactCode, format, result, reasonCode, rendererMode`). | `reporting.service.ts`, `permission.guard.ts` |
| E8 | İstek başına `requestId` yalnızca `perf/slow-request.interceptor.ts` içinde üretilir (`randomUUID`), servis katmanına veya header'a taşınmaz. Bir correlation-id kaynağı **yok**. | `perf/` |
| E9 | Görev metni (027.58) audit metadata'sında **yalnızca** şu alanlara izin verir: `actorId`, `tenantId` veya `customerRootId`, source key, result, static reasonCode, correlation/event id. | TASK-027.58 |
| E10 | TASK-027.9 §7 önerisi (yalnızca mimari öneri): `actionCode` örn. `SCADA:QUERY:EXECUTE`, `entityType` `scada_source`, metadata'da tarih aralığı/dönen satır sayısı/süre. **E9'daki alan listesiyle çelişiyor** (tarih aralığı, satır sayısı, süre listede yok). | `METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md` §7 |
| E11 | SCADA kaynak kataloğu, allowlist veri modeli ve adapter **yok** (Q-SP01); dolayısıyla "source key"in gerçek bir karşılığı henüz tanımsız. | keşif |

## 1. Kararlar

Her karar için: **AI2 notu** yalnızca kanıttan çıkan gözlemdir, karar değildir.

### D1 — Action adı

| Seçenek | Anlamı | Etki |
|---|---|---|
| A | Sonuca özel üç kod (`E5`'teki `REPORT_EXPORT_*` deseni) | Filtrelemesi kolay (`actionCode` indeksli); üç kod sabitlenir |
| B | Tek kod + `result` metadata'da | Az kod; `result` üzerinden filtre indeksli değil (jsonb) |
| C | İki nokta üst üste stili (E10) | E5'teki ana desenden sapma; permission kod biçimiyle karışma riski |

Bağımlılık: Q-M03 (SCADA permission adı) çözülmeden action adı ile permission adı arasındaki ilişki netleşmez.
**Karar:** ☐ A ☐ B ☐ C ☐ diğer: ______ · **Ad(lar):** ______________ (AI1/PO)

### D2 — Entity adı ve `entityId`

`entityType` PascalCase desenine (E6) göre bir ad ve `entityId` olarak neyin yazılacağı: (a) katalogdaki
**source key**, (b) katalog satırının kimliği. Her iki durumda **database/schema/table/column adı yazılmaz**.
Katalog yok (E11) → (a)/(b) seçimi Q-SP01'e bağlı.
**Karar:** entityType ______ · entityId ☐ source key ☐ katalog id (AI1)

### D3 — Tenant/root kapsamı

E1: kapsam yalnızca `metadata`'da taşınır. Sorular:

1. **Hangi tenant?** (a) yalnızca istek yapan (acting) tenant (`tenantId`, E7 ile aynı) · (b) ek olarak
   `customerRootTenantId` · (c) root aggregation'da ek olarak kaynağın **sahibi** tenant.
2. **Root aggregation** bir istekte birden çok kaynağı okur: kaynak başına bir audit satırı mı, istek
   başına tek satır mı? (E9 tek `source key` alanı tanımlıyor → kaynak başına satır uyumlu.)
3. **Görünürlük (E3):** tenant/müşteri yöneticisi kendi SCADA audit'ini görecek mi? Bugün hayır. Görünürlük
   değişikliği ayrı bir yetki/endpoint kararıdır ve bu paketin kapsamı dışındadır — yalnızca işaretlenmiştir.
**Karar:** ☐ (a) ☐ (b) ☐ (c) · satır birimi ☐ kaynak başına ☐ istek başına · görünürlük: ______ (AI1/PO)

### D4 — Source/table/column bilgisinin redaksiyonu

Değişmez kurallar (E9 + test sözleşmesi): audit'e **asla** girmez — ham SQL, parametre değerleri, satırlar,
database/schema/table/column **adları**, host/kullanıcı, ham SQL Server hata metni. `scrubSecrets` yalnızca
anahtar bazlı olduğu için (E4) **audit alanları bir alan-allowlist'iyle inşa edilmelidir** (referans model
bunu yapar), scrub'a güvenilmez.

Açık noktalar:

| Nokta | Seçenekler | Not |
|---|---|---|
| Bilinen ama kapsam-dışı kaynağın reddinde source key kaydı | (a) kaydet (test modeli varsayımı) · (b) `null` yaz | (a) adli inceleme için değerli; (b) kaynak varlığını audit'te bile ifşa etmez. Bilinmeyen (saldırgan kontrollü) anahtar her durumda **kaydedilmez** |
| E9 dışı alanlar (tarih aralığı, satır sayısı, süre, kolon **sayısı**) | ekleme / ekleme | E10 önerdi, E9 izin vermiyor → **AI1 onayı gerekir** |
| `scrubSecrets` değer taraması / `rawSql`,`schemaName` anahtarları | yapılmasın / yapılsın | Q-SR01; SCADA builder'ı için gerekmez, paylaşılan davranış değişikliğidir |
**Karar:** ☐ (a) ☐ (b) · ek alanlar: ______ (AI1)

### D5 — Q-AD01: genel audit mi, ayrı SCADA audit mi

| Seçenek | Artı | Eksi |
|---|---|---|
| A — Genel `platform_audit_logs` | Yeni tablo/migration yok; mevcut okuma UI'ı ve indeksler | Hacim bilinmiyor (Q-M05: canlı sorgu mu cache mi belirsiz); tenant kolonu yok (E1); saklama yok; her yazım 2 round-trip (E2) |
| B — Ayrı SCADA audit tablosu | Tenant/kaynak kolonları ve saklama ayrı yönetilebilir; genel log'u şişirmez | **Yeni tablo + migration** (bu task ailesinde yasaklıydı, açık onay gerekir); ayrı okuma yüzeyi |
| C — Hibrit: ret/hata genel log'a, başarı ayrı/toplu | Güvenlik olayları tek yerde görünür; yüksek hacimli başarı ayrılır | İki yazım yolu, iki okuma yüzeyi; başarı-audit tamlığı tanımı gerekir |

Sayısal hacim/saklama değeri **verilmedi** (kanıt yok, uydurulmadı).
**Karar:** ☐ A ☐ B ☐ C · saklama süresi: ______ (PO)

### D6 — Başarılı / reddedilmiş / hatalı sorguların audit davranışı

Kanıtlı ve test matrisiyle sabit olanlar (`scada-audit-contract-matrix.spec.ts`): istek başına **tam bir** audit
girdisi; başarı yalnızca satırlar elde edildikten **sonra**, ret sürücüye hiç gitmeden **önce**; çağıranın gördüğü
`reasonCode` audit'tekiyle aynı; audit yazım hatası sonucu **çevirmez ve maskelemez** (E7 ile aynı kural).

Karara açık olanlar (test modeli **varsayım** kullandı, karar değildir):

| # | Konu | Test modelindeki varsayım | Alternatif |
|---|---|---|---|
| D6.1 | Limit aşımları (satır/payload/eşzamanlılık) ve iptal: `DENIED` mı `FAILED` mı | `FAILED` | `DENIED` (kullanıcı sınırı aştı) |
| D6.2 | Başarı audit'i her sorguda mı | her sorguda | örnekleme/toplulaştırma (D5-C ile birlikte) |
| D6.3 | Audit yazımı fail-open mı fail-closed mı | **fail-open** (E7 ile tutarlı) | uyumluluk gerektiriyorsa fail-closed (okuma engellenir) |
| D6.4 | Eşzamanlılık reddi audit'i | denetlenir | yük altında audit amplifikasyonu riski → hız sınırı/örnekleme |
| D6.5 | İptal (`CANCELLED`) audit'i | denetlenir | denetlenmez (kullanıcı eylemi) |
**Karar:** D6.1 ______ D6.2 ______ D6.3 ______ D6.4 ______ D6.5 ______ (AI1)

### D7 — Correlation/event id kaynağı

E8: bugün yok. Seçenekler: (a) istek başına üretilen id'yi (perf interceptor'ı gibi) servis katmanına taşıyan
ortak bir mekanizma · (b) istemci header'ı (**güvenilmez**, doğrulama gerekir — test modeli yalnızca
`[A-Za-z0-9_-]{1,64}` kabul eder, aksi `INVALID_REQUEST`) · (c) yalnızca sunucu üretimi.
**Karar:** ______ (AI1)

## 2. Test matrisi (çalıştırılabilir)

`apps/api/src/reporting/scada-contract/scada-audit-contract-matrix.spec.ts` — 19 test. Her satır aynı
değişmezleri doğrular (tek girdi, yalnızca izinli alanlar, tutarlı reasonCode, sızıntı yok, doğru tenant/actor/
correlation) ve satıra özel `result/reasonCode/sourceKey/driverCalls` bekler:

| Sınıf | Senaryo | result | reasonCode | source key | sürücü |
|---|---|---|---|---|---|
| Başarı | kendi kaynağı | SUCCEEDED | OK | kaynak | 1 |
| Ret | bilinmeyen kaynak | DENIED | SOURCE_NOT_ALLOWED | null | 0 |
| Ret | başka tenant'ın kaynağı | DENIED | TENANT_SCOPE_DENIED | kaynak | 0 |
| Ret | çözümsüz mapping | DENIED | SOURCE_MAPPING_UNRESOLVED | kaynak | 0 |
| Ret | allowlist dışı kolon | DENIED | COLUMN_NOT_ALLOWED | kaynak | 0 |
| Ret | allowlist dışı filtre | DENIED | FILTER_NOT_ALLOWED | kaynak | 0 |
| Ret | ham SQL / yasak alan | DENIED | INVALID_REQUEST | null | 0 |
| Ret | kolon sınırı | DENIED | COLUMN_LIMIT_EXCEEDED | kaynak | 0 |
| Ret | geçersiz / aşırı tarih aralığı | DENIED | TIME_RANGE_INVALID / TIME_RANGE_EXCEEDED | kaynak | 0 |
| Hata | sürücü hatası | FAILED | SOURCE_UNAVAILABLE | kaynak | 1 |
| Hata | timeout | FAILED | TIMEOUT | kaynak | 1 |
| Hata | çağıran iptali | FAILED | CANCELLED | kaynak | 1 |
| Hata | satır / payload sınırı | FAILED | ROW_LIMIT_EXCEEDED / PAYLOAD_LIMIT_EXCEEDED | kaynak | 1 |
| Hata | eşzamanlılık sınırı | FAILED | CONCURRENCY_LIMIT | kaynak | 0 |

Ek: gerçek `PlatformAuditService` üzerinden her sonuç tam bir satır yazar ve metadata anahtarları tam olarak
izinli kümedir; audit-yazım kesintisi çağıranın sonucunu değiştirmez. **Sınır:** matris test-only referans
modele karşı çalışır (gerçek adapter yok); D6.1/D4 satırlarındaki `result` ve `source key` beklentileri
**varsayımdır** ve karar sonrası güncellenmelidir.

## 3. Açık sorular

- **Q-SA01** action adı(lar)ı ve permission adıyla ilişkisi (D1, Q-M03) · **Q-SA02** entityType/entityId (D2) ·
  **Q-SA03** tenant/root kapsamı, satır birimi, görünürlük (D3) · **Q-SA04** source-key kaydı ve E9 dışı alanlar (D4) ·
  **Q-SA05** Q-AD01: A/B/C ve saklama (D5) · **Q-SA06** D6.1–D6.5 · **Q-SA07** correlation-id kaynağı (D7).

## 4. Yapılmayanlar

Yeni permission/audit kodu, audit tablosu, migration, endpoint, adapter, gerçek SQL Server/PostgreSQL, Docker,
gerçek veri/secret. Git commit/push yapılmadı.
