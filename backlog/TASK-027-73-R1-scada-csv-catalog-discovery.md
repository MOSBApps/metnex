---
id: TASK-027.73-R1
title: Development CSV Catalog ve Artifact Discovery
status: done
parent_epic: EPIC-004
related: [TASK-027.73, TASK-027.72-R1, TASK-027.63-R1, TASK-027.65]
updated_at: 2026-09-24
---

# TASK-027.73-R1: Development CSV Catalog ve Artifact Discovery

## Durum
done (AI1 koşullu onayı: kolon semantiği düzeltmesi tamamlandı, 2026-09-24)

## Amaç
`veriler/raw/` CSV snapshot'larını **yalnızca development'ta** analiz ekranına seçilebilir kaynak/seri olarak sunmak: Raporlar → SCADA analiz raporu → kaynak → seri → tarih aralığı → Saatlik/Günlük → Analiz çalıştır → gerçek CSV verisiyle grafik.

## Teslim edilen — backend (`apps/api`)
- **Merkezi fixture sözleşmesi** `reporting/scada/fixture/scada-fixture-artifact.ts`: artifact kodu `SCADA_HOURLY_ANALYSIS`, `dataOrigin = DEVELOPMENT_CSV_SNAPSHOT`, etiket "Geliştirme CSV snapshot verisi", fixture katalog UUID'leri, dilim kuralı (`REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE`, yalnız development **override**, katalog doğrulaması sayılmaz). Kod **tek dosyada** tanımlı (testle sabit). Artifact metadata: `code, name, description, status(DEVELOPMENT_ONLY), developmentOnly, supportedIntervals, supportedFormats, sourceCatalogIds, timezoneStatus, dataOrigin`.
- **Yalnız bellekte, kalıcı değil:** `ReportingService.listArtifacts/getArtifact` artifact'ı yalnız `NODE_ENV=development` + `REPORTING_DEV_FIXTURES=true` iken döner; aksi halde listede yok, `getArtifact` 404. `report_artifacts` satırı, seed, `onModuleInit` yok. Flag açık ama dilim değişkeni yoksa artifact vardır ve `timezoneStatus = UNVERIFIED` gösterir; kaynaklar **seçilemez** (aşağıda).
- **`GET /reports/:code/analysis/catalog`** (aynı JWT→MFA→header→membership→`REPORT:ARTIFACT:VIEW` zinciri, yeni izin yok; endpoint inventory +1 satır): limit → route kodu → provider → artifact → tenant scope → çağıranın durumu (mappable/aktif/kapsamda değilse `SCADA_SCOPE_DENIED`) → kaynaklar → whitelist projeksiyon → audit (aynı üç action, başarısızsa veri yok). Provider yoksa 503 `SCADA_SOURCE_NOT_CONFIGURED`; katalog o artifact'ı sunmuyorsa 404 `SCADA_NOT_FOUND`; manifest hash uyuşmazlığı/dosya yok ⇒ statik 503 `SCADA_SOURCE_UNAVAILABLE` (yol/hash/ham hata yok).
- **Kaynak alanları:** `catalogId, name, status, mappingStatus, schemaStatus, timezoneStatus, timezone, supportedIntervals, rowCount, minAt, maxAt, selectable, blockedReason, series[]`. Fiziksel tablo/kolon/dosya yolu/DB adı/SQL/credential **alan değil** (projeksiyon alan alan). Sıralama `catalogId` (deterministik). Başka customer-root'un kaynağı **listelenmez**; MOSEDAŞ'a eşli kaynak **listelenmez** (`isExcludedOrganisationTenant`, tenant-guards'a additive); çözümsüz mapping / pasif kaynak / eşlenemeyen tenant / dilimsiz / serisiz kaynak `selectable:false` + statik `blockedReason`, **seri ve tarih aralığı verilmez**.
- **Seri keşfi (CSV):** id/tarih/saat kolonları seri değil; hiç sayısal okuması olmayan (doğrulanamayan) kolon listelenmez; kimlik bilgisi/fiziksel görünümlü kolon adı (`isForbiddenKey`) listelenmez; tekrar yok; her seri `seriesKey, label, unit, valueType, available, qualityStatus(OK|PARTIAL), sourceCatalogId`. Listelenmeyen kolon analizde de reddedilir (sorgu servisi `COLUMN_UNKNOWN`).
- **Fixture:** `rowCount` (benzersiz zaman damgası), `minAt/maxAt` gerçek UTC anı (dilim yoksa `null`; naif zaman UTC damgalanmaz). Fixture kapalıyken hiçbir dosya okunmaz; hash/yol/tenant kapıları 027.63-R1 provider'ındadır. Ham CSV satırı loglanmaz (testle sabit).
- `scada-api.providers.ts`: fixture artık merkezi sözleşmeden beslenir; 027.72-R1 composition kuralları aynen (production'da fixture DI'a girmez).

## Teslim edilen — frontend (`apps/web`, `reports/[id]/analysis`)
- `scada-catalog.types.ts`, `scada-catalog-selection.ts` (saf kurallar), `scada-catalog-panel.tsx` (keşif + seçim), `report-analysis-client.tsx` (entegrasyon), `reports-list-client.tsx` (artifact kartında etiket).
- **Akış:** ekran açılınca keşif; **otomatik analiz yok, varsayılan/sahte kaynak-seri-tarih yok**. Kaynak seçilmeden seri seçilemez; kaynak değişince seriler ve aralık sıfırlanır; tenant değişince tüm keşif/seçim/sonuç anında temizlenir ve yeniden keşfedilir; eski keşif isteği yeni durumu ezemez (`seq` + tenant kontrolü); yükleme sırasında tüm kontroller kilitli.
- **Tarih/saat:** kullanıcı **kaynağın saat diliminde** kapsayıcı aralık seçer (`datetime-local`, `min/max` = CSV aralığı); API'ye `[startAt,endAt)` mutlak anları gider (HOURLY: son saat dahil; DAILY: son günün ertesi yerel gece yarısı, DST'ye duyarlı). Aralık veri dışında/ters/eksikse **çağrı yapılmaz**, statik mesaj gösterilir. İleri tampon sunucuya bırakıldı.
- İstek gövdesi yalnız: `artifactCode, mode, sourceCatalogIds[seçilen], seriesKeys[seçilenler], startAt, endAt, bucketInterval, timezone, statistics?` (yol/dosya/fiziksel ad yok). Preset seçiliyse yalnız `presetId`.
- **Durumlar (ayrı ve güvenli):** kaynak yok, seçilebilir kaynak yok (neden etiketli), katalog kapalı (404), provider yok (503), limit yok, erişim yok (403), katalog bloklu, genel hata, `BLOCKED/NO_VALID_DATA` analiz (grafik yok), analiz bekleniyor (grafik alanı boş). Mesajlarda SQL/şema/yol/host/credential/ham hata yok.
- **Etiket** "Geliştirme CSV snapshot verisi": artifact kartı, sayfa başlığı, kaynak listesi, istatistik başlığı, grafik başlığı; katalog etiketi sağlamıyorsa (kapalı/production) hiçbir yerde görünmez.
- Katalog tarafından sunulmayan artifact (eski `DEV_REPORTING_FIXTURE`) eski genel veri görünümünü korur (SCADA grafiği/etiketi yok).
- **Devraldığım 027.73 ekranında düzeltmeler (bilerek):** `AnalysisRow` import'u eksikti (`tsc` kırmızıydı), üç `console.error('DEBUG …')` kaldırıldı, `GET …/presets` yanıtı `{presets:[…]}` olarak okunuyor (önce dizi bekleniyordu ⇒ preset listesi hep boş kalıyordu), sahte varsayılanlar (`CAT-001`, `S1, S2`, sabit tarihler) ve açılışta otomatik analiz kaldırıldı.

## Testler
Backend: `scada-api-catalog.spec.ts` (34; artifact görünürlüğü, manifest kaynakları, ham dosya yok/hash uyuşmazlığı, doğrulanmamış/kimlik-benzeri/id-tarih-saat kolon, MOSEDAŞ, mapping/pasif tenant, dilim yok, tenant/kaynak izolasyonu, path/DB/SQL yok, deterministik sıralama, tekrar yok, analize yalnız seçilen kaynak+seri geçmesi, provider yokluğu, ham satır loglanmaması; gerçek snapshot varsa gerçek CSV keşfi), güncellenen controller/inventory/service spec'leri. Api tam paket **3034/3034**.
Frontend: `scada-catalog-selection.spec.ts` (23), `report-analysis-client.spec.tsx` yeniden yazıldı (31), `reports-list-client.spec.tsx` (+1). Web tam paket **24 dosya / 282+ test** yeşil.

## Mutasyon kontrolleri (uygulandı, geri alındı, `diff` ile doğrulandı; hepsi testleri kırdı)
Backend: production'da fixture (10) · fixture flag kontrolü (4) · manifest hash kontrolü (2) · doğrulanmamış kolon (2) · kimlik-benzeri kolon (1) · fiziksel tablo (1) / kolon adı (3) response'a · MOSEDAŞ kaynağı (1) · kök izolasyonu (1) · çağıran standing (4) · dilim yokken keşif (2) · sentetik satır (1) · tüm serileri sorguya gönderme (1).
Web: kaynak değişiminde seri korunması (2) · tenant değişiminde sonuç (1) / seçim / katalog korunması · boş durum dalının kaldırılması (9) · seri seçiminin istekten çıkması (2) · eski isteğin yeni durumu ezmesi (1) · aralık kontrolünün kaldırılması (3) · kaynaksız seri (2) · etiketin her zaman görünmesi (7).
**Dürüstlük notu:** tenant değişiminde "seçimi/kataloğu koru" mutantları ilk turda **yakalanmadı** (mevcut test bunu görünür kılmıyordu); iki test eklendi (aynı kaynak kimliğini sunan yeni tenant; yeni keşif beklerken eski kaynakların gizlenmesi) ve mutantlar yeniden uygulanınca yakalandı.

## Doğrulama
`pnpm --filter api exec tsc --noEmit` temiz; `jest src` 103 suite / 3034 test; `pnpm --filter web exec tsc --noEmit` temiz; `vitest run` yeşil; eslint hata yok; `./scripts/check.sh --skip-docker` yeşil. Docker, gerçek SQL Server/PostgreSQL, migration, production smoke test **çalıştırılmadı**; git commit/push yok.
**Tarayıcı/E2E: yapılamadı.** Kullanıcının çalışan `next dev` / api sunucularına dokunulmadı, kimlik doğrulamalı oturum gerekiyor. Bunun yerine: gerçek `veriler/raw` CSV'si üzerinde api entegrasyon testi (keşif + analiz + audit) ve web bileşen testleri çalıştı. Elle doğrulama için: api'de `NODE_ENV=development REPORTING_DEV_FIXTURES=true REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=Europe/Istanbul` + 13 `SCADA_API_*` limit değişkeni **gerekmez** (dev fixture kendi dev limitlerini sağlar); sonra Raporlar → "SCADA Saatlik/Günlük Analiz" → kaynak/seri/aralık/Saatlik → Analiz Çalıştır.

## Açık sorular
Bkz. `BOTC_MIGRATION_OPEN_QUESTIONS.md` Q-W537.

## AI1 Kararları ve Kolon Semantiği Düzeltmesi (2026-09-24)
- **Q-W537 kararı:** timezone env eksikse artifact kaybolmaz; `UNVERIFIED` + `selectable:false` olarak yalnız bilgi amaçlı görünür; kaynak/seri seçimi ve analiz bloklu; `REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE` olmadan grafik üretilemez (mevcut davranış, testlerle sabit).
- **CSV kolonlarının INDEX olduğu ve `_KWH/_TON/_SM3` ile birim türetildiği varsayımı KANONİK DEĞİLDİR → kaldırıldı.** Yeni kural:
  - Manifest kaynağına additive, opsiyonel `columns: [{ name, verified, valueType?, unit?, dailyOperation? }]` bloğu (`ScadaFixtureColumnDeclaration`). Yalnız `verified === true` ve `valueType ∈ {INDEX, REAL_VALUE}` olan kolon **doğrulanmıştır**; değer tipi manifestten gelir.
  - Bildirilmemiş / `verified:false` / tipsiz / bilinmeyen tipli kolon `UNVERIFIED` listelenir (`available:false`, `valueType:'UNVERIFIED'`, `verificationStatus:'UNVERIFIED'`), seçime kapalıdır ve sorgu servisi tarafından da tanınmaz (analiz edilemez).
  - Birim yalnız manifestte yazılıysa gösterilir; aksi halde `unit:''` ve arayüz **"Birim belirtilmemiş"** der. Kolon adı yalnız görünen `label`; ölçüm anlamı/birim/tip ondan çıkarılmaz.
  - Doğrulanmış kolonu olmayan kaynak `selectable:false`, `blockedReason:'NO_SERIES'` (arayüz: "Doğrulanmış seri yok"); UNVERIFIED kolonlar bilgi amaçlı listelenir.
- **Sonuç / dikkat:** repodaki `veriler/manifest/scada-fixtures.manifest.json` şu an **hiçbir kolon bildirmiyor** ⇒ gerçek CSV'lerde tüm kolonlar UNVERIFIED, hiçbir kaynak seçilemiyor (analiz bloklu). Gerçek grafik için manifeste `columns` bloğunun (değer tipi/birim doğrulaması ile) **sizin/AI1 tarafından** yazılması gerekir; uydurma yapılmadı. Gerçek-CSV entegrasyon testleri, gerçek dosyayı geçici bir köke kopyalayıp **test parametresi** olarak bir `columns` bildirimi ekler.
- Testler: api 3042/3042, web 287; kolon semantiği mutantları (bildirimsizi doğrulanmış sayma, addan birim türetme, tipi INDEX'e sabitleme, arayüzde varsayılan birim) yakalandı. `done`: koşullu onay (düzeltme tamamlandı).

## R2 referansı (2026-09-24)
Manifest kolon semantiği (Q-W538) `TASK-027.73-R2` ile kanıta dayalı olarak yazıldı: `backlog/TASK-027-73-R2-scada-csv-manifest-column-semantics.md`. R1'in manifest `columns` sözleşmesi `name` yerine `sourceColumn` + `label` + `evidenceRefs` olarak genişletildi; kanıtsız `verified:true` artık doğrulama sayılmaz.
