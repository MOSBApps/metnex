---
id: TASK-027.67
title: Sayaç Devri ve Veri Kalite Servisi
status: done
srs_refs: [FR-025, FR-026, FR-029, AC-008]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1]
updated_at: 2026-09-23
---

# TASK-027.67: Sayaç Devri ve Veri Kalite Servisi

> Bu dosya TASK-027.62 ile üretilen planın parçasıdır; **AI1/PO karar kapanışları (DEC-0015) işlenmiştir.** Durum `planned`: önceki halka tamamlanmadan ve ön koşullardaki “kalan” noktalar kapanmadan AI1 tarafından `ready` yapılmaz. Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.67

## Başlık

Sayaç Devri ve Veri Kalite Servisi

## Durum

planned

## Amaç

Sayaç devri (rollover/reset), eksik ölçüm, negatif fark, uç değer ve boşluk gibi veri kalitesi durumlarını **açık, denetlenebilir kurallarla** ele alan servisi yazmak; sonuçları sessizce düzeltmek yerine **kalite bayraklarıyla** işaretlemek.

## Ön koşullar

- TASK-027.66 `done`.
- **Kapanan karar kapıları:** Q-W502, Q-W507, Q-W508, Q-W509 (bkz. “Bağlayıcı karar kapanışları”).
- **Kalan (ready olmadan önce):** Q-W522 (tanımlı devri olmayan negatif farkın çıktıdaki değeri ve tüketici davranışı); kalite durumu **sözlüğünün** (durum adları) task başında AI1 onayı.

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W502 B:** sayaç devri kaynak/kolon **katalog yapılandırmasıyla**; kolon adına göre otomatik karar yok; sabit `+100000` yok; tanımsız devirde negatif fark **sessizce 0 yapılmaz**, veri kalite uyarısıyla işaretlenir.
- **Q-W507 B / Q-W508 B:** eşleşmeyen/eksik zaman kovaları sessizce 0 yapılmaz; **veri kalite durumu** olarak gösterilir.
- **Q-W509 C:** null/boş seri/eksik veri sessizce 0 yapılmaz; veri yoksa null/kalite durumu.

## Kapsam

- Kural kaynağı: **katalogdaki kaynak/kolon devir tanımı** (azami sayaç değeri/devir eşiği; Q-W502 B). Sabit `100000`/`−50` ve kolon-adı sezgileri (`Turbin`, `Fark`, `(S)`) **yoktur**.
- Tanımlı devir varsa: devir düzeltmesi uygulanır ve nokta işaretlenir (ham değer korunur). **Tanımlı devir yoksa negatif fark sessizce 0 yapılmaz**; nokta veri kalite uyarısıyla işaretlenir (çıktıdaki değer Q-W522).
- Kalite durum sözlüğü (öneri adlar; karar değil, task başında onaylanır): devir düzeltildi, devri tanımsız negatif, eksik nokta, boşluk, uç değer, **eşleşmeyen kova** (dönem/kaynak karşılaştırması için, TASK-027.69 tüketir), sonraki okuma yok (Q-W501).
- Düzeltme ile ham değer birlikte korunur (ham değer asla üzerine yazılmaz); kalite özeti (seri başına sayımlar).

## Kapsam dışı

- Kaynak sistemde veri düzeltme (SCADA salt-okunurdur, AC-005).
- İsim tabanlı (“Turbin”) sezgisel kuralların taşınması.
- Sanal kolon sonuç sınırları (TASK-027.70).

## Bağımlılıklar

TASK-027.66. Sonraki: TASK-027.68.

Zincir: `TASK-027.66` → **TASK-027.67** → `TASK-027.68`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/quality/* (yeni, **olası**)
- apps/api/src/reporting/scada/aggregation/* (entegrasyon noktası)

## API/UI/veri sözleşmesi

- **Veri:** versiyonlu normalize analiz sonucu sözleşmesinin (Q-W513 C) `quality[]` alanı: nokta başına kalite durumları; `QualityReport { adjusted, missing, unresolvedNegative, unmatched }`.
- **API/UI:** kalite bayrakları TASK-027.72/.73’te sunulur; bu task’ta yok.

## Tenant ve permission kuralları

- Saf hesap; tenant/scope bilmez. Kural yapılandırması kaynak kataloğuna bağlıdır (TASK-027.63) ve aynı sahiplik/scope kurallarına tabidir.
- Yeni permission yok.

## Audit ve güvenlik kuralları

- Otomatik düzeltme uygulanması audit’e **sayaç düzeyinde özet** olarak (kaç nokta, hangi bayrak sınıfı) yazılabilir; nokta değerleri/satırlar yazılmaz. Format Q-SA kararına bağlı.

## Test senaryoları

1. Devir: katalogda tanımlı eşik üstü/altı/tam eşik, birden çok ardışık devir, devir + eksik veri, ham değerin korunması; **tanım yoksa** düzeltme yok ve nokta işaretli.
2. Negatif fark: devir tanımlıysa devir, tanımsızsa **sessiz 0 yok** (kalite işareti + Q-W522 değeri); kolon adına bakan hiçbir davranış yok (`Turbin` adlı kolon test edilir).
3. Katalog tanımı yok/geçersiz → kural uygulanmaz, `tanımsız kural` durumu (fail-closed); sabit sayı içeren kod yolu yok (statik).
4. Determinizm, idempotency (iki kez uygulama sonucu değiştirmez), girdi mutasyonu yok.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Devir düzeltmesi kaldırılınca devir testi kırılır.
2. Bayrak üretimi kaldırılınca bayrak testleri kırılır.
3. Ham değerin üzerine yazılması testi kırar.
4. Kuralsız (yapılandırmasız) devir uygulanması testi kırar.

## Kabul kriterleri

- Devir kuralı katalogdan gelir, sabit sayı ve ad sezgisi yoktur; her düzeltme ve her sorunlu nokta işaretlidir; ham değer korunur; sessiz 0 yoktur.
- BOTC’nin iki ayrı mekanizması tek, belgelenmiş kuralda birleştirilmiştir (karar kaydı referanslı).
- Gerçek DB/SQL Server yok; `check.sh --skip-docker` geçer.

## Rollback yaklaşımı

Saf modül; devre dışı bırakınca aggregation ham kalite-bayraksız sonuç verir (ürün kararı: bu durumda “düzeltilmemiş” uyarısı gösterilir).

## Sonraki task

TASK-027.68

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Hayır. Sentetik fixture.

## AI1/PO kararı gerektiren açık sorular

- **Q-W522** — Tanımlı devri olmayan negatif farkın çıktıdaki değeri (ham negatif mi null mu)
- Kalite durum sözlüğü (task başında AI1 onayı)

## BOTC referansı

- **Referans davranış:** `HourlyConsumptionWindow.FixCounterRollover` (`val < -50` → `+100000`, ad tabanlı), SQL `CASE WHEN … < 0 THEN 0`.
- **Taşıma sınırı:** Taşınmaz: sabit `100000`/`−50` sayıları, kolon-adı sezgisi (`Turbin`, `Fark`, `(S)`), UI’da ikinci kez düzeltme, sessiz düzeltme.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-24 — AI1: `ready` + spesifikasyon; teslim (`review`)

AI1 TASK-027.67'yi `ready` yaptı (TASK-027.65 ve **TASK-027.66** `done`; 027.66 aggregation engine `backlog/TASK-027-66-hourly-daily-aggregation-engine.md`). Spesifikasyon (policy sözleşmesi, negatif fark davranışı, 14 kalite durumu, DST politikası, çoklu seri, testler, mutasyonlar) AI1 metnindeki gibidir. Bu task **saf hesaplama**dır: audit yazmaz, yeni action üretmez, log yok, Q-W516/Q-W519'a dokunmaz.

### Teslim edilen (`apps/api/src/reporting/scada/quality/`, hiçbir modüle kayıtlı değil)
- `scada-data-quality.contract.ts` — 14 kalite durumu, **önem sırası** (`QUALITY_SEVERITY`, en kritik başlık olur; tüm durumlar `qualityFlags`'te görünür kalır), `RolloverPolicy` (`catalogId, seriesKey, valueType, rolloverMode NONE|FIXED_MAXIMUM|MODULO, rolloverValue, maxExpectedDelta, enabled, version, effectiveFrom, effectiveTo`), `PolicyTrace` (durum + **version/effective izi**), giriş/çıkış tipleri.
- `rollover-policy.port.ts` — `RolloverPolicyProvider` (katalog-sahipli policy kaynağı; yazma Q-W516 dışı) + `InMemoryRolloverPolicyProvider` (tam `(catalogId, seriesKey, valueType)` eşleşmesi; ad deseni yok).
- `scada-counter-rollover.service.ts` — `isPolicyValid` (her modun gerektirdiği parametre açık ve sağlam olmalı; **varsayılan doldurulmaz**), `resolvePolicy` (kesin anahtar, `[effectiveFrom, effectiveTo)` **sonraki okumaya** göre, çakışan etkin sürümler ve **herhangi bir bozuk kayıt → seri `POLICY_INVALID`**, kapalı/etkin-dışı → uygulanmaz), `correctedDelta`, ve **027.66 engine'i için `toAggregationRolloverPort`** (engine yalnızca açık policy ile devri çözer; engine portunda zaman olmadığından `asOfUtc` sabit verilir).
- `scada-dst-quality.service.ts` — DST işaretleri, `isTimeZoneVerified`, deterministik UTC sıralaması.
- `scada-data-quality.service.ts` — `ScadaDataQualityService.evaluate` (saf, deterministik, girdiyi mutate etmez, seri başına bağımsız) ve `summariseBucket` (bir saat/gün kovası: en kritik durum + herhangi bir eksik satır → `INCOMPLETE_BUCKET`).
- **027.65 sözleşmesine ek (yalnız ekleme):** `ScadaRawRecord.dstResolution` (`NORMAL|AMBIGUOUS|GAP`). Sebep: 027.65'te DST işareti `dataQuality`'de `UNVERIFIED`/`INVALID` olarak geçiyordu ve `INVALID`, bozuk sayıdan ayırt edilemiyordu; kalite servisi DST'yi buradan okur, saat değerlerinden yeniden türetmez.

### Kurallar (uygulanan)
- **Q-W522:** policy yoksa `rawValue` korunur, `deltaValue = null`, `dataQuality = COUNTER_RESET_UNRESOLVED`, `isComplete = false` (bayraklar: `NEGATIVE_DELTA`, `POLICY_UNDEFINED`). **Geçersiz policy:** aynı sonuç + `POLICY_INVALID`, sessiz varsayılan yok. **Geçerli policy:** düzeltilmiş delta, `COUNTER_RESET_RESOLVED`, `isComplete = true`, ham değerler (`rawValue`, `nextRawValue`) korunur, policy version/etkinlik penceresi sonuçta. `NONE` modu: düzeltme yok, açıkça `COUNTER_RESET_UNRESOLVED` (`policy.status = NONE_MODE`).
- **Formüller (tanım burada sabitlendi — AI1 onayına açık):** `FIXED_MAXIMUM`: `rolloverValue` = sayaç **maksimum okuması** M, `düzeltilmiş = next + (M − current)`; `MODULO`: `rolloverValue` = sayaç **aralığı** R (okumalar `[0, R)`), `düzeltilmiş = next − current + R`. Okuma bildirilen aralık dışındaysa **düzeltilmez** (`OUT_OF_RANGE`, unresolved); `maxExpectedDelta` aşılırsa kabul edilmez. Sabit `+100000` **yok** (statik testle sabit); kolon adı/ad deseniyle seçim **yok**.
- **Q-W529b (bu task yetkili — uygulandı):** *tekrar eden yerel saat:* iki okuma **ayrı** kalır, birleştirilmez, `DST_AMBIGUOUS`, UTC sıralı, aynı anlı çiftler arasında delta yok; tek belirsiz okuma deltasını korur ama işaretli ve `isComplete=false`. *Var olmayan yerel saat:* başka saate **taşınmaz** ve **düşürülmez**, `DST_NONEXISTENT`, delta güvenilmez (`null`), `isComplete=false`. *Saat dilimi tanımsız/geçersiz:* `TIMEZONE_UNVERIFIED`, `analysisAllowed=false`, delta/policy yok (ham değerler korunur).
- **Diğer durumlar:** `MISSING_VALUE` (0 yapılmaz; gerçek 0 0 kalır), `INVALID_NUMERIC_VALUE` (NaN/∞/sayı-olmayan/kaynakta `INVALID`; eksikten ayrı), `DUPLICATE_TIMESTAMP` (satırlar korunur), `INSUFFICIENT_NEXT_READING` (son okuma; tampon satırı "sonraki okuma" sağlar ama çıktıda yok), `REAL_VALUE` serilerde negatif değere dokunulmaz.

### Testler / mutasyon
- `__tests__/`: `scada-data-quality.spec.ts` (istenen 25 senaryonun tümü + önem sırası, kova özeti, malformed girdi), `scada-counter-rollover.spec.ts` (policy doğrulama/aritmetik/çözümleme + 027.66 engine adaptörü), `scada-data-quality.csv-fixture.spec.ts` (**gerçek CSV snapshot**, salt-okuma; dosya yoksa atlanır), `scada-quality-static.spec.ts`. `reporting` altında **tümü yeşil** (bu turda ~+80 test).
- **Gerçek mutasyonlar (uygulanıp yakalandı, geri alındı):** policy yokken negatifin 0 yapılması, rollover değerinin yok sayılması, kolon-adı öneki ile policy seçimi, policy version'ın izden düşürülmesi ve doğrulamasının kaldırılması, ham/sonraki değerin korunmaması, `dataQuality` başlığının kaldırılması, DST ambiguous ve nonexistent kontrolleri, saat dilimi zorunluluğu, seri izolasyonu, girdi mutasyonu, etkinlik başlangıç/bitiş kontrolü, çakışan sürümlere izin, duplicate/eksik-değer/sonraki-okuma bayrakları, eksik değerin 0'a çevrilmesi, nonexistent deltasına güvenme.

### Açık noktalar / karar gereken (uydurulmadı)
1. **Önem sırası** ve **FIXED_MAXIMUM/MODULO formülleri** yukarıdaki gibi tanımlandı (spesifikasyon yalnızca "açıkça tanımlanmış maksimum/aralık" dedi) — AI1 onayı/ayarı.
2. **Sıkı policy doğrulama:** bir serinin herhangi bir kaydı bozuksa seri `POLICY_INVALID` olur (eski geçerli kayıt bile kullanılmaz) — fail-closed tercih.
3. **Bağlanma:** bu servis 027.66 engine'ine kendi başına bağlanmadı (yalnızca `toAggregationRolloverPort` ve `dstResolution` hazır); 027.65→kalite→027.66 zinciri ve policy'lerin katalogdan gelişi 027.72 (API entegrasyonu) kapsamıdır. Katalogda policy saklama/yazma (Q-W516) yok.
4. Ambiguous saatlerde 027.65 hâlâ iki okumayı da **ilk oluşum** UTC'sine koyar (kaynak sırası ayrımı yok); ikisi ayrı ve işaretli kalır, fakat gerçek ikinci-geçiş UTC'si çözülmedi.

**Yapılmayanlar:** gerçek SQL Server/PostgreSQL/preflight/Docker; katalog yazma/CRUD; HTTP/UI/grafik/karşılaştırma/preset/export; Wave 2/3; yeni action/permission; `veriler/raw/` değişikliği. Git commit/push yok. Durum: **`review`**.

## 2026-09-24 — AI1 Değerlendirmesi ve R1 (append-only): DST doğruluk açığı — `review` kaldı

AI1: sayaç devri/veri kalite bölümü güçlü; **onaylanan tasarım noktaları:** `FIXED_MAXIMUM = next + (M − current)`, `MODULO = next − current + R`, policy `(catalogId, seriesKey, valueType)` eşleşmesi, kolon adı varsayımı yok, bozuk/çakışan policy fail-closed, `rawValue` korunur, tanımsız negatif farkta `deltaValue = null` + `COUNTER_RESET_UNRESOLVED`, `dstResolution` alanının additive eklenmesi.

**Kritik blocker:** ambiguous saatlerde iki farklı okuma **aynı ilk UTC zamanına** atanıyordu (ikinci geçişin gerçek zamanını yanlış gösterir; duplicate zaman → yanlış delta/günlük toplam). **Karar:** gerçek UTC/fold bilgisi yoksa iki kaydı aynı UTC'ye zorla yerleştirme, delta üretme, `analysisAllowed = false`, `dataQuality = DST_AMBIGUOUS`, çözümleme durumu `UNRESOLVED`; kaynak offset/fold sağlıyorsa iki okuma doğru UTC'ye çevrilebilir; sağlamıyorsa sistem tahmin yapmaz.

### R1 teslimi
1. **Ambiguous okumalar artık hiçbir UTC'ye yazılmıyor (027.65).** `ScadaRawRecord.occurredAtUtc` yalnızca çözümlenmemiş tekrar eden yerel saat için `null`; kaynağın naif saati her zaman `localWallTime`'da, olası iki an (ilk/ikinci geçiş) `dstCandidatesUtc`'de; `recordId` `LOCAL:<yerel saat>` ile kurulur; aynı yerel saatli iki kayıt **iki ayrı kayıt** olarak kalır. `dstResolution`: `NORMAL | AMBIGUOUS (çözümsüz) | AMBIGUOUS_RESOLVED (kaynak fold verdi) | GAP`. Pencere süzmesinde çözümsüz satır, olası anlardan biri pencerede ise tutulur.
2. **Kaynak fold/offset yoksa analiz bloklanır (027.67).** `ScadaQualityResult`: `analysisAllowed = timeZoneVerified && dstStatus RESOLVED`, yeni `dstStatus: RESOLVED | UNRESOLVED`; çözümsüz her satır `occurredAtUtc = null`, `dataQuality = DST_AMBIGUOUS`, `qualityFlags ∋ DST_AMBIGUOUS`, `deltaValue = null`, `isComplete = false`, `dstResolution = AMBIGUOUS`; çözümsüz okumanın olası anlarını kapsayan aralıktaki komşu delta'lar da üretilmez (gerçek "sonraki okuma" o olabilir); ilgisiz satırlar deltalarını korur ama sonuç `analysisAllowed=false` kalır. Eski biçimde (UTC taşıyan) `AMBIGUOUS` satırı da çözümsüz sayılır, UTC'si atılır.
3. **`DST_AMBIGUOUS` veri kalitesiyle korunur:** başlık durumu ve bayrak; sıralama deterministik (çözümsüzler en erken olası ana göre).
4. **027.65 geçici dönüşümü düzeltildi:** ilk-geçişe zorlama kalktı; `ScadaAnalysisQueryServiceDeps.foldOf?` (kaynağın satır başına verdiği fold: 0=ilk, 1=ikinci geçiş) — verilirse okuma gerçek anına yerleşir (`AMBIGUOUS_RESOLVED`, kalite `VALID`). Bugünkü katalog/adapter fold kolonu taşımadığından üretimde varsayılan davranış **çözümsüz**; fold kaynağının (katalogda offset/fold kolonu) tanımı ayrı karar/iş (Q-W529c). `scada-source-time.ts`: `ambiguousCandidates`, `localToUtcWithFold`.
5. **Aynı yerel saatli iki kaydın birleşmediği** hem 027.65 hem 027.67 testlerinde doğrulandı (iki ayrı `recordId`, ikisi de `occurredAtUtc=null`, ham değerler korunur).
6. **`dstResolution` ve `analysisAllowed` birlikte doğrulanır:** çözümsüz → `analysisAllowed=false` ∧ `dstStatus=UNRESOLVED`; fold ile çözülmüş → `analysisAllowed=true` ∧ `RESOLVED` ∧ kalite `VALID`.
- **Not (GAP):** var olmayan yerel saat (`GAP`) davranışı değişmedi (027.65 sıçrama öncesi offset ile bir an üretir ve `INVALID` işaretler; 027.67 deltasını güvenilmez sayar). AI1 R1'e dahil etmedi; aynı "tahmini an" ilkesi GAP'e de uygulanacaksa ayrı karar gerekir (Q-W529c ile birlikte).

### Testler / mutasyon
`reporting` altında **771 test yeşil** (yeni: ambiguous çözümsüz/aynı-yerel-saat/legacy/komşu delta/fold ile çözülmüş/sıralama, `ambiguousCandidates`/`localToUtcWithFold`, 027.65 çözümsüz+fold). **Gerçek mutasyonlar (uygulanıp yakalandı, geri alındı):** ilk geçişe zorlama (eski davranış), fold'un yok sayılması, fold geçişinin ters çevrilmesi, `analysisAllowed`'ın DST'yi yok sayması, `dstStatus` her zaman RESOLVED, komşu delta'nın bloklanmaması, sonuç satırında uydurma an, `DST_AMBIGUOUS` işaretinin kaldırılması, çözümsüz satırların pencereden düşürülmesi; çözümsüz satırın anını koruma mutasyonu **iki katman** (giriş kopyası + sonuç satırı) birlikte kaldırılınca yakalandı (tek katmanı denk mutant). `check.sh --skip-docker` sonucu teslim raporunda.
Gerçek DB/SQL Server/Docker yok; git commit/push yok. Durum: `review`.

## 2026-09-24 — AI1 Kararı (Q-W529c) ve R2 (append-only): GAP fail-closed — `review`

AI1: R1'deki ambiguous düzeltmesi **onaylandı**; ana task için `done` verilmedi çünkü **GAP** davranışı kararla uyumsuzdu (var olmayan yerel saat için sıçrama öncesi offset ile tahmini UTC üretiliyordu → sistem gerçek bir zaman varmış gibi davranıyor). **Q-W529c kararı:** var olmayan yerel saat için `occurredAtUtc = null`, `analysisAllowed = false`, `dataQuality = DST_NONEXISTENT`, delta yok, belirsiz aralıktan etkilenen komşu delta'lar da yok; sıçrama öncesi/sonrası offset ile tahmini UTC **atanmaz**; kayıt silinmez; `localWallTime` korunur; `dstCandidatesUtc` boş (gerçek aday an yok); etkilenmeyen kayıtlar hesaplanabilir ama sonuç kalite durumu taşır.

### R2 teslimi
- **027.65 (`ScadaRawRecord`):** `GAP` satırı `occurredAtUtc = null`, `dstCandidatesUtc = []`, `localWallTime` korunur; yeni **`dstUncertainRangeUtc: [from, to] | null`** (yalnızca GAP'te dolu): eksik saatin iki olası okuması (sıçrama öncesi/sonrası offset) arasındaki aralık — bu bir **an/aday değil**, yalnızca hangi zaman aralığının güvenilmez olduğunu söyler (pencere süzmesi ve komşu-delta bloğu bunu kullanır). `scada-source-time.ts`: `gapUncertainRange`. `recordId` `LOCAL:<yerel saat>` ile kurulur; kayıt pencereye değiyorsa düşürülmez.
- **027.67 (kalite):** GAP satırı çözümsüz sayılır → `dataQuality = DST_NONEXISTENT` (bayraklar korunur, ör. `MISSING_VALUE`), `deltaValue = null`, `isComplete = false`, `occurredAtUtc = null`; sonuç `dstStatus = UNRESOLVED` ve `analysisAllowed = false` (`timeZoneStatus` doğrulanmış kalır). Belirsiz aralığı kapsayan komşu delta'lar **üretilmez** ve `DST_NONEXISTENT` ile işaretlenir (ambiguous'ta `DST_AMBIGUOUS`); geçişten bağımsız satırlar deltalarını korur. Eski biçimde (an taşıyan) GAP satırı da aynı şekilde çözümsüz sayılır ve anı atılır. Ambiguous ve GAP artık **aynı fail-closed ilkeyle** çalışır.
- **Testler/mutasyon:** `reporting` altında **777 test yeşil**. Gerçek mutasyonlar (uygulanıp yakalandı, geri alındı): GAP'e yine sıçrama-öncesi an atanması, belirsiz aralığın kaydedilmemesi, GAP satırlarının pencereden düşürülmesi, GAP'in analizi bloklamaması, komşu delta'ların bloklanmaması, GAP satırında anın korunması (iki katman birlikte), uydurma aday an. `check.sh --skip-docker` sonucu teslim raporunda.
- **Q-W529c'nin kalan kısmı (açık):** kaynağın tekrar eden saati ayırt edecek offset/fold kolonunun katalogda tanımı (bugün yok → üretimde çözümsüz). Kararın "GAP" maddesi bu turda **kapandı**.
Gerçek DB/SQL Server/Docker yok; git commit/push yok. Durum: `review`.

## 2026-09-24 — AI1 Onayı: `done`
AI1, R1 ve R2 (Q-W529c GAP fail-closed) ile birlikte TASK-027.67'yi onayladı (`review` → `done`). Fold/offset kolonunun katalogda tanımı ayrı açık soru olarak kalır. Git commit/push yapılmadı.

## 2026-09-24 — Tüketici referansı (TASK-027.68)
`apps/api/src/reporting/scada/series/` (TASK-027.68, `backlog/TASK-027-68-scada-multi-series-statistics.md`) bu servisin çıktısını (`ScadaQualityResultRow`) `bucketsFromQualityRows` ile tüketir; kalite önem sırasını **yalnızca** buradaki merkezi `mostCritical/QUALITY_SEVERITY` sabitinden alır ve seri bazlı `analysisAllowed`'ı `analysisAllowedForSeries` ile türetir. 027.67 kodu değişmedi.

## 2026-09-24 — Merkezi kalite sabitine ek (TASK-027.70)
`SCADA_DATA_QUALITY_STATES` / `QUALITY_SEVERITY`'ye `VIRTUAL_COLUMN_INPUT_UNRESOLVED` ve `VIRTUAL_COLUMN_DIVISION_INVALID` eklendi (yalnızca ekleme; 14 → 16 durum; sıra yerleşimi Q-W532). Mevcut davranış değişmedi; ilgili test güncellendi.
