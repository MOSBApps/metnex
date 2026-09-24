---
id: TASK-027.58-R1
title: SCADA Sözleşmesi Açıklarının Kapatılması
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
related: [TASK-027.58, TASK-027.57, DEC-0014]
updated_at: 2026-09-23
---

# TASK-027.58-R1: SCADA Sözleşmesi Açıklarının Kapatılması

TASK-027.58 `done` yapılmadı (AI1 kararı). Bu tur: adapter, SQL Server bağlantısı, PostgreSQL, Docker, gerçek
veri/secret ve Wave 5 implementation **yok**. Üç açık: (1) `scrubSecrets` kapsamı, (2) DEC-0014 ↔ identity
migration slug çelişkisi, (3) SCADA audit sözleşmesi. Sonuç özeti:

| Konu | Sonuç |
|---|---|
| 1. `scrubSecrets` | **Düzeltildi** (istenen 11 anahtar sınıfı + eşanlamlılar); paylaşılan production davranışı değişti — gerekçe ve etki §1'de |
| 2. DEC-0014 ↔ slug | **Envanter + açık karar** (kod/doküman otomatik düzeltilmedi); sürüklenme koruması statik testle eklendi |
| 3. SCADA audit | **Karar paketi** (`docs/migration/METNEX_SCADA_AUDIT_CONTRACT_DECISION_PACKAGE.md`, boş karar formlu) + çalıştırılabilir test matrisi; kararsız alanlar açık soru |

## 1. `scrubSecrets`

**Değişiklik (production, paylaşılan):** `scrubSecrets` `platform-audit.service.ts` içindeki özel fonksiyondan
`apps/api/src/audit/scrub-secrets.ts` modülüne taşındı ve genişletildi (davranış `PlatformAuditService.log`
üzerinden aynı yerden uygulanıyor; başka çağıranı yok).

- Anahtarlar **normalize edilerek** karşılaştırılır (küçük harf, yalnızca harf/rakam): `connectionString`,
  `connection_string`, `Connection-String`, `X-Api-Key` aynı anahtardır.
- **Parça (substring) sınıfı** — `password, passwd, secret, token, apikey, accesskey, privatekey, credential,
  cookie, authorization, connectionstring`. Önceki listenin (`password, passwordHash, refreshToken(Hash), token,
  apiKey(Ciphertext)`) **katı üst kümesi**; hiçbir eski anahtar maskesiz kalmaz.
- **Tam eşleşme sınıfı** — `otp, totp, user, username, dbuser, dbusername, host, hostname, dbhost`. Bilerek tam
  eşleşme: `user` için substring `userId/targetUserId/impersonatorUserId` gibi meşru audit kimliklerini,
  `otp`/`host` ise `footprint`/`ghost` gibi sözcükleri maskelerdi.
- Redaction yalnızca **anahtar** bazlı; değerlere bakılmaz (aşağıya bkz. kalan sınır).

**Gerekçe:** TASK-027.58 F-1 — `connectionString`, `secret`, `cookie`, `otp`, `host` audit'e sızabiliyordu; SCADA
audit'i ve gelecekteki her audit çağrısı bu riski taşıyordu.

**Geriye dönük etki (kanıtlı):** Tüm production `auditService.log` çağrılarının (auth, user, MFA, reporting export,
permission guard, break-glass, migration dry-run — 28 çağrı yeri) metadata anahtarları tarandı: `result, reason,
reasonCode, targetUserId, impersonatorUserId, actorMfaBypassWarning, customerRootId, tenantId, email, displayName,
method, route, migrationRunId, startedAt, finishedAt, format, artifactCode, rendererMode, simulation, report(iç:
errorsAndWarnings/description/salt)` — **hiçbiri yeni sınıflara takılmıyor**. Bu, `scrub-secrets.spec.ts`
içindeki "production-style metadata olduğu gibi kalır" testiyle kilitli. Yani mevcut audit satırlarının içeriği
değişmez; yalnızca **gelecekte** bu adlarla yazılacak anahtarlar maskelenir. Geçmiş satırlar yeniden yazılmaz.
Küçük risk: bir çağıran meşru bir alanı ör. `tokenCount`/`secretaryName` diye adlandırırsa maskelenir (eski `token`
kuralı zaten `tokenCount`'u maskeliyordu; yeni parçalar aynı biçimde çalışır).

**Testler (`scrub-secrets.spec.ts`, 52 test + `scada-real-components.spec.ts`'te gerçek servis üzerinden 8 → dosya artık 27 test):**
pozitif — istenen 12 anahtar (connectionString, secret, password, token, cookie, otp, host, username, user,
authorization, accessKey, refreshToken), eski anahtarlar (regresyon yok), 16 yazım/eşanlamlı varyantı, her
derinlik/dizi, her değer tipi; negatif — production-style metadata değişmez, 11 meşru/benzer anahtar korunur
(`userId`, `ghost`, `footprint`…), değer tipleri korunur, girdi mutasyona uğramaz, idempotent. Sınırlar belgelendi:
değer taraması ve `rawSql`/`schemaName` anahtarları **yapılmıyor** (2 test + 2 `it.failing` kalıntısı).

**Mutasyon (gerçek koşu, hepsi kırdı, geri alındı):** her parça (connectionstring/cookie/authorization/accesskey/
secret/token) tek tek kaldırıldı; tam-eşleşme sınıfı boşaltıldı; tam-eşleşme sınıfı substring yapıldı
(aşırı maskeleme, negatif testler kırdı); normalizasyon kaldırıldı; dizi ve iç içe özyineleme kaldırıldı; scrubber
hiç uygulanmadı (47 test kırıldı).

**Kalan sınır / açık karar — Q-SR01:** (a) değerin içine gömülü connection string / `Bearer …` (değer taraması yok);
(b) `rawSql`, `schemaName`, `server`, `datasource`, `uid` gibi anahtarlar; (c) `Date`/sınıf örnekleri `{}` olur (eski
davranış, dokunulmadı). SCADA audit'i bunlara güvenmez: alanlar allowlist ile inşa edilir (karar paketi D4).

## 2. DEC-0014 ↔ identity migration tenant slug'ları

**Karar kaydı (yetkili):** `docs/decisions/DEC-0014-…` (Accepted, 2026-09-22): *"Metnex'te MOSEDAŞ veya MOSB
operasyon tenantı yoktur. MİP root altında MOSB Enerji ve MOSBIO ayrı operasyon tenantlarıdır."* MOSEDAŞ tenant
değildir; external-system kimliğiyle bağlanır. **Bu karar korunur; kod ve doküman düzeltilmedi, tenant
üretilmedi, varsayım yapılmadı.**

**Çelişki 1 — MOSEDAŞ:** identity migration kodu `ApprovedTenantSlug = 'MOSB' | 'MOSEDAS' | 'MOSBIO'` modelliyor.
**Çelişki 2 (ek bulgu) — MOSB:** DEC-0014 tenant adını "MOSB Enerji" koyuyor ve "MOSB" operasyon tenantı olmadığını
söylüyor; kodun `MOSB` slug'ı hangisini kastediyor belirsiz. **Çelişki 3 (iç):** `DISCOVERY.md` aynı belgede hem
"MOSEDAŞ Metnex tenantı değildir" (satır 68, 686) hem "MOSB, MOSEDAŞ ve MOSBİO … tenant" (164, 198, 251 `D-005`,
410) diyor; `SRS.md` FR-002A DEC-0014 ile superseded işaretli.

**Kod tarafı kimseye tenant açmıyor:** migration kodu yalnızca onaylı mapping tablosundaki slug'ları **var olan**
tenant'lara bağlıyor (tenant oluşturan çağrı yok — `dec-0014-slug-consistency.spec.ts` bunu zorlar). Çelişki,
"MOSEDAŞ'ı geçerli bir hedef slug saymak" düzeyindedir; MOSEDAŞ'a atanacak kullanıcıların nereye gideceği (tenant yok)
ayrı açık sorudur (**Q-SP04b**).

### Envanter — her referans, sınıfı ve önerilen muamele (uygulanmadı)

Sınıflar: **[K]** karar kaydı (yetkili) · **[Y]** DEC-0014 sonrası yetkili/yeni belge · **[T]** tarihsel kayıt
(DEC-0014 öncesi, dokunulmaz/append-only) · **[DB]** "MOSEDAS" yalnızca fiziksel SQL Server veritabanı adı
(tenant referansı **değil**, çelişmez) · **[KOD]** production kodu · **[TEST]** spec/fixture · **[NEG]** MOSEDAŞ'ın
tenant olmadığını doğrulayan negatif kullanım.

**Kod ve test (`apps/api/src`) — 13 dosya (test bu listenin eksiksizliğini doğrular):**

| Dosya | Sınıf | İçerik | Muamele önerisi (AI1 kararı) |
|---|---|---|---|
| `types.ts` | KOD | `ApprovedTenantSlug` = `MOSB \| MOSEDAS \| MOSBIO` | Q-SP04: slug kümesini DEC-0014'e hizala |
| `tenant-mapping.ts` | KOD | `KNOWN_TENANT_SLUGS` | aynı |
| `tenant-coverage.ts` | KOD | `usersByTenant` kaydı MOSEDAS anahtarlı | aynı |
| `tenant-guards.ts` | KOD (ret kuralı) | TASK-027.63 katalog tenant koruması MOSEDAŞ'ı yalnızca **reddetmek** için adlandırır (`MOSEDAS_IS_NOT_A_TENANT`); tenant modellemez | aynı — tek izinli istisna |
| `catalog.service.spec.ts` | TEST (negatif) | TASK-027.63 katalog testi: MOSEDAŞ slug'lı tenant'ın mapping'e **reddedildiğini** doğrular | aynı |
| `adapter-static.spec.ts` | TEST (negatif) | TASK-027.64 adapter statik testi: MOSEDAŞ/`Sirket` sözcüklerinin adapter kodunda **bulunmadığını** doğrular | aynı |
| `sqlserver-readonly.adapter.spec.ts` | TEST (negatif) | TASK-027.64 adapter testi: MOSEDAŞ slug'lı tenant'ın okuma anında reddedildiğini doğrular | aynı |
| `scada-analysis-query.service.spec.ts` | TEST (negatif) | TASK-027.65 sorgu servisi testi: MOSEDAŞ slug'lı tenant'ın okuma anında reddedildiğini doğrular | aynı |
| `scada-query-static.spec.ts` | TEST (negatif) | TASK-027.65 statik test: MOSEDAŞ/`Sirket` sözcüklerinin sorgu servisi kodunda **bulunmadığını** doğrular | aynı |
| `scada-quality-static.spec.ts` | TEST (negatif) | TASK-027.67 statik test: MOSEDAŞ/`Sirket` sözcüklerinin veri-kalite modülü kodunda **bulunmadığını** doğrular | aynı |
| `scada-multi-series.spec.ts` | TEST (negatif) | TASK-027.68 çoklu-seri testi: MOSEDAŞ slug'lı tenant'ın seri analizinden dışlandığını doğrular | aynı |
| `scada-series-static.spec.ts` | TEST (negatif) | TASK-027.68 statik test: MOSEDAŞ/`Sirket` sözcüklerinin seri modülü kodunda **bulunmadığını** doğrular | aynı |
| `scada-comparison-static.spec.ts` | TEST (negatif) | TASK-027.69 statik test: MOSEDAŞ/`Sirket` sözcüklerinin karşılaştırma modülü kodunda **bulunmadığını** doğrular | aynı |
| `virtual-column.spec.ts` | TEST (negatif) | TASK-027.70 sanal kolon testi: MOSEDAŞ slug'lı tenant kapsamının reddedildiğini doğrular | aynı |
| `virtual-column-static.spec.ts` | TEST (negatif) | TASK-027.70 statik test: MOSEDAŞ/`Sirket` sözcüklerinin sanal kolon modülü kodunda **bulunmadığını** doğrular | aynı |
| `scada-preset-static.spec.ts` | TEST (negatif) | TASK-027.71 statik test: MOSEDAŞ/`Sirket` sözcüklerinin preset modülü kodunda **bulunmadığını** doğrular | aynı |
| `scada-preset.spec.ts` | TEST (negatif) | TASK-027.71: MOSEDAŞ adlı tenant eşlemesinin preset/kaynak çözümünde `PRESET_SCOPE_BLOCKED` ile reddedildiğini doğrular (sentetik) | aynı |
| `scada-analysis-api.service.spec.ts` | TEST (negatif) | TASK-027.72: MOSEDAŞ adlı tenant eşlemesinin API kaynak/çağıran çözümünde reddedildiğini doğrular (sentetik) | aynı |
| `scada-api-wiring.spec.ts` | TEST (negatif) | TASK-027.72 statik test: MOSEDAŞ/`Sirket` sözcüklerinin SCADA API modülü kodunda **bulunmadığını** doğrular | aynı |
| `scada-api-csv-fixture.spec.ts` | TEST (negatif) | TASK-027.72-R1: MOSEDAŞ adlı çağıran tenant kaydının CSV fixture yolunda `SCADA_SCOPE_DENIED` ile reddedildiğini ve fixture kodunda MOSEDAŞ/`Sirket` bulunmadığını doğrular (sentetik) | aynı |
| `wave5-e2e-acceptance.spec.ts` | TEST (negatif) | TASK-027.59: MOSEDAŞ adlı çağıran tenant kaydının analiz ve export yolunda `SCADA_SCOPE_DENIED` ile reddedildiğini ve kataloğun MOSEDAŞ içermediğini doğrular (sentetik) | aynı |
| `scada-api-catalog.spec.ts` | TEST (negatif) | TASK-027.73-R1: MOSEDAŞ adlı kaynak/çağıran tenant'ın keşifte **listelenmediğini / SCOPE_DENIED verildiğini** doğrular (sentetik) | aynı |
| `scada-manifest-semantics.spec.ts` | TEST (negatif) | TASK-027.73-R2 statik test: manifestte fiziksel DB adı (MOSEDAS/MOSBIO_ vb.) ve credential bulunmadığını doğrular; MOSEDAŞ tenant üretmez | aynı |
| `source-validation.ts` | KOD | hata metni "yalnızca MOSB/MOSEDAS/MOSBIO" | aynı |
| `tenant-coverage.spec.ts` | TEST | MOSEDAS beklentileri | koddan sonra güncelle |
| `security-tenant-isolation.spec.ts` | TEST | 7 MOSEDAS senaryosu (kullanıcı/üyelik/çakışma) | koddan sonra güncelle |
| `tenant-governance.spec.ts` | TEST | 5 çakışma senaryosu | koddan sonra güncelle |
| `duplicate-detection.spec.ts` | TEST | 2 referans | koddan sonra güncelle |
| `reconciliation.spec.ts` | TEST | 1 referans | koddan sonra güncelle |
| `sample-dry-run-input-conflict.json` | TEST (fixture) | örnek mapping satırı | koddan sonra güncelle |
| `scada-static-security.spec.ts` | NEG | MOSEDAŞ üretim koduna/migration'a girmez | değişmez |
| `scada-real-components.spec.ts` | NEG | MOSEDAŞ tenant değil → çözümlenmez | değişmez |
| `dec-0014-slug-consistency.spec.ts` | NEG | çelişki kaydı + sürüklenme koruması | Q-SP04 çözülünce kayıt küçültülür |

**Karar kaydı ve yetkili belgeler:**

| Dosya | Sınıf | Not |
|---|---|---|
| `docs/decisions/DEC-0014-mosedas-production-planning-and-metnex-operations-boundary.md` | K | 10 referans; yetkili |
| `docs/requirements/SRS.md` | Y | FR-002A superseded; FR-067–071, BR-008/015 DEC-0014 uyumlu |
| `docs/requirements/DISCOVERY.md` | Y (iç çelişkili) | satır 68, 686, 391, 673–678 uyumlu; **164, 198, 251 (D-005), 410 hâlâ MOSEDAŞ'ı tenant sayıyor** |
| `backlog/EPIC-005-…`, `backlog/TASK-029-00-…` | Y | MOSEDAŞ external system, tenant değil — tutarlı |
| `METNEX_AI1_DEGERLENDIRME_BRIFI.md` | T (girdi) | "tartışma girdisi; onaylı SRS/task değildir"; DEC-0014'ün girdisi |

**Tarihsel kayıtlar [T] — DEC-0014 öncesi, MOSEDAŞ'ı tenant sayan; düzeltilmeyecek/append-only:**
`docs/migration/`: `BOTC_MIP_TENANT_LOCATION_MAPPING`, `BOTC_TO_METNEX_MAPPING` (satır 136 "MOSEDAŞ tenant → MOSEDAS
veritabanı"), `BOTC_MIGRATION_ARCHITECTURE_DECISION`, `BOTC_ENTITY_DOMAIN_MAPPING`, `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING`,
`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING`, `BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE`,
`BOTC_VARDIYA_METNEX_TARGET_MAPPING`, `BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE`, `BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY`,
`METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION`, `METNEX_DATA_PLANE_DECISION_GATE_CLOSURE_PACKAGE`,
`METNEX_IDENTITY_MIGRATION_ENGINE_INTEGRATION_BOUNDARY`, `METNEX_IDENTITY_SECURITY_TEST_MATRIX`,
`METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA`, `METNEX_SHIFT_REPORT_API_SERVICE_BLOCKER`,
`METNEX_SHIFT_REPORT_POSTGRES_SCHEMA_DECISION_PACKAGE`, `METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE` (satır 126, 131
tenant; 52, 69, 183 DB adı); `backlog/`: `TASK-023-1`, `TASK-027-1`, `TASK-027-4`, `TASK-027-12`, `TASK-027-12-R1`,
`TASK-027-15`, `TASK-027-20`, `TASK-027-21`, `TASK-027-23`, `TASK-027-25`; `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md`
(Q-M02, Q-SC01, Q-V20, Q-V25 …); `docs/opendevcon/METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only).

**Yalnızca veritabanı adı [DB] (çelişmez):** `BOTC_SCADA_DMS_SOURCE_MAPPING` (satır 61–63, 90–92, 102, 106),
`BOTC_SOURCE_SCHEMA_INVENTORY` (26, 404), `backlog/TASK-027-5` (14, 41, 49, 60); `BOTC_SCADA_DMS_SOURCE_MAPPING` ve
`TASK-027-5`'teki "MOSEDAŞ mı MOSB mı" (Q-SC01) sorusu DEC-0014 ile yeniden çerçevelenmelidir.

**AI2'nin önerdiği (karar değil) sıra:** (1) AI1, DISCOVERY.md iç çelişkisini (164/198/251/410) gidersin; (2) `MOSB`
slug'ının "MOSB Enerji"e karşılığı netleşsin; (3) yalnızca ondan sonra kod/test/fixture slug kümesi hizalansın ve
`dec-0014-slug-consistency.spec.ts` kaydı küçültülsün; (4) tarihsel belgelere dokunulmasın, DEC-0014'e işaret eden
tek bir "superseded" notu (append) yeterli olabilir.

**Test (`dec-0014-slug-consistency.spec.ts`, 7 test):** DEC-0014 metni değişmedi; MOSEDAŞ'a değinen production kodu tam
olarak kayıt listesi (yeni referans → kırılır); migration dışında yalnızca test-only SCADA sözleşmesi anıyor;
kabul edilen her slug ya DEC-0014-uyumlu ya kayıtlı çelişki/belirsizlik (yeni slug kırılır); migration kodu tenant
**oluşturmaz**; SQL migration/bootstrap MOSEDAŞ tenant'ı üretmez; bu envanter `apps/api/src`'deki her dosyayı
listeler. Mutasyon: yeni slug eklendi (3 test kırdı), DEC-0014 metni değiştirildi (2 test kırdı).

## 3. SCADA audit sözleşmesi

Karar paketi: `docs/migration/METNEX_SCADA_AUDIT_CONTRACT_DECISION_PACKAGE.md` (kanıt E1–E11, 7 karar D1–D7,
seçenekler/etkiler, boş AI1/PO karar formu). **Kararlar verilmedi**; yeni permission/audit kodu, tablo, migration
yok. Kararsız alanlar **Q-SA01–Q-SA07** olarak bırakıldı: action adı, entity adı, tenant/root kapsamı ve görünürlük
(audit okuma yüzeyi yalnızca sistem yöneticisine açık), source/table/column redaksiyonu, Q-AD01 (genel/ayrı/hibrit),
başarı/ret/hata davranışı (D6.1–D6.5), correlation-id kaynağı (bugün yok).

**Test matrisi (`scada-audit-contract-matrix.spec.ts`, 19 test):** 15 satır (1 başarı, 9 ret, 5 hata) ×
aynı değişmezler (tek girdi, yalnızca izinli alanlar, çağıran ↔ audit reasonCode tutarlılığı, sızıntı yok) +
ayrı eşzamanlılık testi (FAILED, sürücüsüz), gerçek `PlatformAuditService` üzerinden kalıcılık, audit kesintisi. **Matris, karar bekleyen
varsayımları açıkça etiketler** (limit aşımı = FAILED; kapsam-dışı bilinen kaynağın anahtarı kaydedilir; `SCADA_READ_
CONTRACT_TEST` test-yerel etiket). Matris bir **model hatası da yakaladı**: referans model kapsam-dışı ama bilinen
kaynağın reddinde source key'i kaydetmiyordu; düzeltildi (bilinmeyen/saldırgan anahtar hâlâ kaydedilmez).
**Mutasyon (hepsi kırdı):** limit aşımı DENIED'a çevrildi, source key kaydı kaldırıldı, audit iki kez yazıldı,
audit'e fazladan alan eklendi, tenant yanlış kaynaktan alındı.

## 4. Mevcut testlerin korunması

`scada-readonly-port.reference.spec.ts` **105 test aynen korundu** (tek değişiklik: referans modelde allowlist ile
eşleşen source key'in ret audit'ine yazılması; 105 testin hepsi geçiyor, TASK-027.58'in 24 mutasyonundan seçilenler
yeniden koşuldu). Bu turda toplam 81 yeni test: scrub 52 + matris 19 + DEC-0014 7 + gerçek-bileşen spec'inde net +3 (24 → 27).

## 5. Doğrulama

- `pnpm --filter api exec tsc --noEmit` → temiz.
- `./scripts/check.sh --skip-docker` (Q-ENV01 workaround'u: `NODE_PATH` + `TURBO_ENV_MODE=loose`) → **PASS**: api 67 suite / 1871 test (+3 suite / +81 test), web 22 suite / 253 test, lint, typecheck, build.
- `pnpm --filter api exec jest reporting platform audit --runInBand` → 36 suite / 1332 test PASS.
- Gerçek SQL Server, PostgreSQL, Docker, production veri, secret: **kullanılmadı**. Git commit/push yapılmadı.

## 6. Açık kararlar ve blocker'lar (ayrı liste)

**Açık kararlar (AI1/PO):**
- **Q-SR01** scrubber kalan sınırı: değer taraması, `rawSql`/`schemaName`/`server`/`datasource`/`uid` anahtarları.
- **Q-SP04** slug hizalaması: MOSEDAS'ın kaldırılması, `MOSB` ↔ "MOSB Enerji" karşılığı, DISCOVERY.md iç çelişkisi;
  **Q-SP04b** MOSEDAŞ'a atanacak BOTC kullanıcılarının hedefi (tenant yok).
- **Q-SA01–Q-SA07** SCADA audit kararları (karar paketi §1).
- Q-SP02 sayısal eşikler (değişmedi), Q-M05, Q-M03, Q-AD01.

**Blocker'lar:**
- **Q-SP01** SCADA adapter/katalog/allowlist/dynamic query/limit halkaları yok → Wave 5 implementation ve gerçek
  adapter'a karşı sözleşme koşusu başlayamaz.
- Audit karar paketi (D1–D7) cevaplanmadan gerçek SCADA audit implementasyonu yazılamaz; D5-B/C yeni tablo/migration
  gerektirir (ayrı onay).
