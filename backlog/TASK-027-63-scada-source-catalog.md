---
id: TASK-027.63
title: SCADA Kaynak / Tablo / Kolon Kataloğu
status: done
srs_refs: [FR-014, FR-015, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023, SEC-DATA-002, AC-004, AC-006]
parent_epic: EPIC-004
related: [TASK-027.62, TASK-027.58, TASK-027.58-R1, TASK-027.63-R1]
updated_at: 2026-09-23
---

# TASK-027.63: SCADA Kaynak / Tablo / Kolon Kataloğu

> **Durum `review` (2026-09-23, AI2):** bu turda yalnızca **task sözleşmesi ve BOTC `appsettings.json` başlangıç envanteri** işlendi; production kodu, migration/seed, gerçek DB bağlantısı **yazılmadı**. Katalog implementation’ı task’ın sonraki uygulama kapsamıdır (aşağıdaki “Kapsam” bölümü) ve AI1 onayından sonra başlar. Envanter kanıtı: `../BOTC/BOT/appsettings.json` (salt-okuma; credential değerleri hiçbir yere kopyalanmadı). Zincir ve ID eşlemesi: `backlog/TASK-027-62-wave5-hourly-consumption-task-decomposition.md`.

## Task ID

TASK-027.63

## Başlık

SCADA Kaynak / Tablo / Kolon Kataloğu

## Durum

review

## Amaç

Yetkili SCADA/DMS kaynaklarını (source key), her kaynağın database/schema/table adlarını, izinli kolonlarını, izinli filtrelerini, tenant sahipliğini, tarih/saat kolonunu, azami zaman aralığını ve azami satır sınırını **admin-küratörlü bir katalog/allowlist** olarak modellemek. Çalışma zamanı `INFORMATION_SCHEMA` keşfi (BOTC `QueryService`) yerini bu kataloğa bırakır.

## Ön koşullar

- TASK-027.58 ve TASK-027.58-R1 `done`.
- **Kapanan karar kapıları:** Q-W515, Q-E04, Q-SC01, Q-SC02, Q-SC03, Q-SP04, Q-SP04b, Q-W502, Q-W503, Q-W508, Q-W509, Q-W511, Q-W512, Q-SP02, Q-M05 (bkz. “Bağlayıcı karar kapanışları”).
- **Uygulamayı engellemeyen kalan noktalar (task içinde ele alınır, gerekirse AI1’e sorulur):** Q-W516 (katalog yazma yetkisi — bu task HTTP/CLI/seed yüzeyi **açmaz**), Q-W519 (katalog değişikliği audit adları — audit portu tanımlanır, adaptör adı kararı gelmeden bağlanmaz), Q-S03 (kaynak↔tenant mapping **verisi** onaylı gelmeden girdi `UNRESOLVED/BLOCKED` kalır).
- Bu task Q-SP01’in ilk halkasıdır (katalog); adapter/query/analiz halkaları sonraki task’lardadır.

## Bağlayıcı karar kapanışları (AI1/PO, 2026-09-23)

Kaynak: `docs/decisions/DEC-0015-wave5-hourly-consumption-and-scada-decisions.md`. Bu kararlar **bağlayıcıdır**; task bunlara uygun uygulanır.

- **Q-W515 B:** allowlist/katalog **control-plane veritabanında, versiyonlu ve audit’li**; kaynak↔tenant eşlemesi katalog sözleşmesinin parçası; yalnızca yetkili platform operasyonları değiştirir; config ile DB arasında iki doğruluk kaynağı yok.
- **Q-E04:** modül `apps/api/src/reporting/scada/` (ayrı bounded module; `reporting/dataset/` mevcut genel/finansal yapı olarak kalır).
- **Q-SC01 C / Q-SP04 B:** MOSEDAS tenant değildir; SCADA kaynağı yalnızca onaylı operasyon mapping’iyle tenant kapsamına girer; mapping yoksa `UNRESOLVED/BLOCKED`; otomatik MOSB eşlemesi yok.
- **Q-SC02 C / Q-SC03 B:** allowlist tabanlı yeni adapter; database/schema/table/column profilleri bu katalogdan; ayrı SCADA analiz sözleşmesi.
- **Q-W502 B / Q-W503 C / Q-W509 C / Q-W512 C / Q-W508 B / Q-SP02 B:** sayaç devri, Gerçek Değer/işlem tipi parametreleri, istatistik politikası, kaynak saat dilimi, açık zaman toleransı ve performans limit profili **katalog alanlarıdır**.
- **Q-W511 C:** katalog yönetimi analiz kullanıcılarına verilmez; yeni permission kodu uydurulmaz.
- **Q-SA02:** audit `entityId` = katalog kaydı UUID’si → katalog kayıtları kararlı UUID taşır.

## BOTC kaynak envanteri (`appsettings.json`, salt-okuma kanıtı)

**Yöntem:** `../BOTC/BOT/appsettings.json` (**canonical**) okundu; `bin/Debug`, `bin/Release` ve iki `publish` kopyasıyla karşılaştırıldı. Bağlantı dizeleri **yalnızca** fiziksel `Database` adı çıkarılarak ve diğer değerler hash/anahtar-adı düzeyinde karşılaştırılarak işlendi; sunucu, kullanıcı, parola veya başka hiçbir bağlantı değeri bu dosyaya, loglara veya raporlara yazılmadı.

### DynamicDataSources — 8 kaynak (kaynak adı ve fiziksel DB referansı)

| # | BOTC görünen adı | Fiziksel DB referansı | Kapsam | Başlangıç katalog durumu |
|---|---|---|---|---|
| 1 | Arıza Takip | `BOT_APP` | **Wave 2/3 kapsamı dışı** | `OUT_OF_SCOPE` — analiz kaynağı olarak katalogda erişilebilir değil |
| 2 | DÖF Modülü | `DOF_APP` | **Wave 2/3 kapsamı dışı** | `OUT_OF_SCOPE` |
| 3 | Performans | `MOSBIO_TELEGRAM` | Wave 5 aday | `UNRESOLVED` (onaylı mapping yok) |
| 4 | Vardiya Raporları | `VARDIYA_RAPORLARI` | Vardiya (Wave 4) verisi; BOTC saatlik analiz ekranı bu kaynağı ada göre **süzerek hariç tutar** (`BOT_APP`, `DOF_APP`, `VARDIYA_RAPORLARI`) | `BLOCKED` — analiz kaynağı olarak açılması için ayrı onay yok |
| 5 | Mosbio Raporları | `MOSBIO_RAPORLAR` | Wave 5 aday | `UNRESOLVED` |
| 6 | MOSB Enerji | `MOSB ENERJI DB` (**adında boşluk var**) | Wave 5 aday | `UNRESOLVED` |
| 7 | Kömür Raporları | `KOMUR_RAPORLAR` | Wave 5 aday | `UNRESOLVED` |
| 8 | Mosedas | `MOSEDAS` | Wave 5 aday — **yalnızca fiziksel kaynak/DB adı** | `UNRESOLVED/BLOCKED` — **tenant değildir** (aşağıya bkz.) |

Ek gözlem (katalog kapsamı dışı, bilgi): `ConnectionStrings` bölümündeki dört adlandırılmış bağlantı `BOT_APP`, `VARDIYA_RAPORLARI`, `MOSBIO_RAPORLAR` ve `VARDIYA_RAPORLARI_ARSIV` veritabanlarına işaret eder; bunlar uygulama/Vardiya bağlantılarıdır, SCADA katalog girdisi **değildir** ve `VARDIYA_RAPORLARI_ARSIV` `DynamicDataSources`’ta yoktur.

### TableDateMappings — 7 tablo (kanıtlı başlangıç verisi)

| Tablo | Tarih alanı | Saat alanı | Yapı | Fiziksel kaynak kanıtı | Kolon doğrulama |
|---|---|---|---|---|---|
| `MUSTERI_CEKIS_SAATLIK` | `DATE_TIME` | `DATE_TIME` | tek datetime kolonu | `[DOĞRULANAMADI]` — fiziksel DB kanıtı yok | `UNVERIFIED` |
| `endeksler` | `KayitTarihi` | `KayitSaati` | ayrı tarih + saat | `MOSBIO_RAPORLAR` (`FromSqlRaw` kanıtı) | `UNVERIFIED` |
| `sg_endeksler` | `KAYIT_TARIHI` | `KAYIT_SAATI` | ayrı tarih + saat | `MOSEDAS` (`FromSqlRaw` kanıtı) | `UNVERIFIED` (+ Debug farkı) |
| `komur_endeksler` | `KAYIT_TARIHI` | `KAYIT_SAATI` | ayrı tarih + saat | `MOSEDAS` (`FromSqlRaw` kanıtı) | `UNVERIFIED` (+ Debug farkı) |
| `gt_endeksler` | `KAYIT_TARIHI` | `KAYIT_SAATI` | ayrı tarih + saat | `MOSEDAS` (`FromSqlRaw` kanıtı) | `UNVERIFIED` (+ Debug farkı) |
| `Saatlik_Ort_Veriler` | `LogTime` | `LogTime` | tek datetime kolonu | `[DOĞRULANAMADI]` — fiziksel DB kanıtı yok | `UNVERIFIED` |
| `VardiyaPerformans` | `SonGuncelleme` | `SonGuncelleme` | tek datetime kolonu | `MOSBIO_TELEGRAM` (`FromSqlRaw` kanıtı) | `UNVERIFIED` |

- Tarih ve saat alanı **aynı** ise (3 tablo) kaynak zamanı tek datetime kolonudur; farklıysa BOTC iki kolonu birleştirir (`tarih + saat`). Metnex’te bu birleştirme kuralı katalog alanıdır (Q-W512 C kaynak saat dilimiyle birlikte).
- **Tablo ↔ kaynak** ilişkisi `appsettings.json`’da **yoktur**; yukarıdaki fiziksel DB sütunu `docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md` §2’deki `FromSqlRaw` kod kanıtından gelir; iki tablo için kanıt yoktur (Q-S03 açık).
- **Hiçbir kolon “doğrulanmış” sayılmaz:** gerçek SQL Server şeması görülmedi; kolon adları BOTC yapılandırmasının iddiasıdır (`UNVERIFIED`).

### Debug / Release / publish karşılaştırması — canonical kural ve veri kalitesi notu

**Kural:** `BOT/appsettings.json` **canonical** kabul edilir; başka kopyalar bu kaynağı değiştirmez ve **otomatik düzeltme yapılmaz**.

| Kopya (tarih) | `DynamicDataSources` adları | `TableDateMappings` | Bağlantı temsili |
|---|---|---|---|
| `bin/Release` (canonical ile aynı tarih) | aynı 8 ad | **aynı** | `DynamicDataSources` bağlantıları **şifreli/opak** (canonical’da düz metin) |
| `bin/Debug` (daha eski) | aynı 8 ad | **3 tablo farklı:** `sg_endeksler`, `komur_endeksler`, `gt_endeksler` için saat alanı `KAYIT_TARIHI` (canonical: `KAYIT_SAATI`) | `DynamicDataSources` şifreli/opak; `ConnectionStrings` değerleri farklı |
| iki `publish` kopyası | aynı | aynı | canonical ile **aynı** (düz metin) |

**Veri kalitesi notu:** Debug kopyasındaki saat alanı farkı (`KAYIT_TARIHI` yerine `KAYIT_SAATI`) daha eski bir yapılandırma olabilir; hangisinin gerçek şemaya uyduğu **doğrulanamaz** (Q-W524). Katalog canonical değeri taşır, fark `UNVERIFIED` notuyla işaretlenir. Şifreli Debug/Release bağlantılarının çözülmesi/karşılaştırılması yapılmadı (kapsam dışı).

### Credential non-transfer politikası

**Kaynak kataloğuna veya bu task’ın raporlarına değer olarak taşınmaz:** `ConnectionStrings.*`, `DynamicDataSources[].ConnectionString` (sunucu, kullanıcı, parola, tüm tokenlar), `Auth:PasswordSalt`, `Telegram:BotToken` ve `Telegram:ChatId`, `Email:SmtpHost/SmtpEmail/SmtpPassword` ve diğer SMTP/Telegram bilgileri. Bunlar SCADA kaynak kataloğunun parçası **değildir**. Katalog yalnızca kaynak adı, fiziksel DB **adı**, tablo/kolon adları ve mapping durumunu tutar; erişim bilgisi runtime secret store/ortamdan gelir (Q-SP01).

**Güvenlik bulgusu (Metnex kapsamı dışı, bilgi):** canonical `BOT/appsettings.json` (ve `publish` kopyaları) bağlantı dizelerini ve diğer gizli ayarları **düz metin** taşır; yalnızca Debug/Release `DynamicDataSources` değerleri şifrelidir. Credential rotasyonu/ifşa değerlendirmesi bu görevin kapsamı **dışındadır** ve yapılmadı; PO/AI1’e bildirim olarak Q-W523’te kaydedilmiştir. Hiçbir değer buraya kopyalanmadı.

### MOSEDAS — tenant dışı kuralı

`MOSEDAS` **Metnex tenant’ı değildir**; yalnızca fiziksel kaynak/database adıdır. Tenant otomatik eşlenmez, oluşturulmaz; DB adı ve varlık sahipliği tenant yetkisi belirlemez. Onaylı operasyon mapping’i (control-plane) yoksa erişim `UNRESOLVED`/`BLOCKED` kalır (DEC-0014, DEC-0015 Q-SC01 C).

### Katalog alanları, mapping durumu ve fail-closed davranışlar (task sözleşmesi)

- **Kaynak:** katalog UUID’si, BOTC görünen adı, fiziksel DB referansı, kapsam durumu (`IN_SCOPE | OUT_OF_SCOPE`), **kaynak saat dilimi** (zorunlu), limit profili, aktif sürüm.
- **Tablo/kolon:** tablo adı, kolon adı ve türü (sayısal/tarih/saat), tarih kolonu, saat kolonu (tek datetime ise aynı), **kolon doğrulama durumu** (`UNVERIFIED | VERIFIED`), izinli filtreler, sayaç devri tanımı, analiz işlem parametreleri, istatistik politikası, açık tolerans.
- **Kaynak↔tenant mapping durumu:** `RESOLVED | UNRESOLVED | BLOCKED`; yalnızca **onaylı control-plane mapping** ile `RESOLVED` olur. Bu envanterdeki tüm kaynaklar başlangıçta `UNRESOLVED` (veya `BLOCKED`/`OUT_OF_SCOPE`); **gerçek tenant mapping kaydı bu turda oluşturulmaz.**
- **Bilinmeyen kolon davranışı:** istek/sorgu katalogdaki **doğrulanmış (`VERIFIED`)** kolon listesinde olmayan her kolonu — `UNVERIFIED` dahil — sürücüye gitmeden **fail-closed reddeder**; kolon keşfi (`INFORMATION_SCHEMA`) ve tarayıcıdan kolon/tablo adı alınması yoktur.
- **Bilinmeyen/eksik saat dilimi davranışı:** `appsettings.json` **saat dilimi bilgisi içermez**; dolayısıyla tüm kaynaklar için saat dilimi başlangıçta **tanımsızdır** ve kaynak `BLOCKED` kalır (Q-W512 C: bilinmeyen saat dilimi fail-closed) — saat dilimi onaylı katalog girdisiyle tanımlanana kadar hiçbir sorgu üretilmez.
- **Kimlik doğrulama politikası notu:** `MOSB ENERJI DB` adı **boşluk içerir**; TASK-027.58 referans modelindeki `[A-Za-z_][A-Za-z0-9_]*` kuralı bu adı reddeder. Katalog, kaynak adlarını **bracket-quoted tam eşleşmeli allowlist** olarak (`]`, `;`, tırnak, yorum karakterleri yasak) doğrulamalıdır — kural Q-W525 ile AI1’e teyit ettirilir; sorgu metnine kullanıcı girdisinden identifier yerleştirilmez.

### Sonraki read-only adapter bağımlılığı

**TASK-027.64 (SQL Server Read-only Adapter)** yalnızca bu katalogdaki kayıtları okur: kaynak `IN_SCOPE` + mapping `RESOLVED` + kolonlar `VERIFIED` + saat dilimi tanımlı + limit profili eksiksiz olmadıkça adapter **hiçbir sorgu üretmez** (fail-closed). Bu nedenle TASK-027.64, TASK-027.63 katalog implementation’ı `done` olmadan ve en az bir kaynağın onaylı mapping/şema doğrulamasıyla `RESOLVED/VERIFIED` hale gelmeden gerçek veriye erişemez; adapter task’ı `planned` kalır.

## Kapsam

- **Control-plane (`public`) katalog modeli** (Drizzle şeması + idempotent migration; DEC-0009/DEC-0011 standartları): kaynak, tablo, kolon, analiz parametresi ve kaynak↔tenant eşleme kayıtları; **immutable sürümler + aktif sürüm** (Q-W515 “versiyonlu”); her kayıt kararlı UUID taşır (audit `entityId`).
- **Katalog alanları (kararlardan):** kaynak saat dilimi (**zorunlu**; tanımsız/bilinmeyen kaynak kullanılamaz — Q-W512); kolon türü (sayısal/tarih/saat) ve tarih/saat kolonu eşlemesi; **sayaç devri tanımı** (kaynak/kolon bazında, opsiyonel — Q-W502); **analiz işlem parametreleri** (Endeks/Gerçek Değer, saatlik/günlük işlem tipi, toplam/ortalama/min/max, zaman kaydırma — Q-W503; **tablo adına bağlı varsayılan yok**); **istatistik politikası** (sıfırın anlamı — Q-W509); açık **zaman toleransı** (yalnızca açık tanımlıysa — Q-W508); **limit profili** (timeout, satır, kolon, payload, tarih aralığı, pool, eşzamanlılık; ortam/kaynak profiline göre; eksik/geçersiz → kaynak kullanılamaz, fail-closed — Q-SP02; değerler kodda **yok**).
- **Kaynak↔tenant eşleme** kayıtları ve durumu `RESOLVED | UNRESOLVED | BLOCKED`. `docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md` envanteri **davranış/kaynak referansıdır**; doğrulanmamış girdiler eşleme olmadan `UNRESOLVED/BLOCKED`. MOSEDAS yalnızca kaynak/DB adı olarak geçebilir, tenant üretilmez.
- **Saf doğrulama:** identifier güvenliği, yinelenen kaynak reddi, `permittedFilters ⊆ allowedColumns`, limit profilinin eksiksizliği, saat dilimi geçerliliği, devir tanımı tutarlılığı — TASK-027.58 sözleşmesindeki allowlist alanlarıyla uyumlu (sourceKey artık **katalog UUID’sine bağlı** iç anahtardır).
- **Scope-çözümlü okuma servisi** (`listSources(scope)`, `getSource(scope, id)`; scope yalnızca `TenantScopeService`) ve **versiyonlu yazma servisi** (yalnızca iç servis; HTTP/CLI/seed yolu **yok**; audit portu olmadan çalışmaz).
- Katalog değişikliği audit **portu**: alanlar (aktör, tenant/root, katalog UUID, sürüm, sonuç, statik reason code, sunucu üretimli correlation id); action/entity **adı Q-W519 kararına** kadar bağlanmaz.

## Kapsam dışı

- SQL Server bağlantısı, gerçek kolon/tablo keşfi, veri okuma (TASK-027.64+); kataloğa **gerçek** kaynak verisi/mapping doldurma (onaylı mapping gelmeden).
- Katalog yönetim HTTP endpoint’i/CLI’ı/UI’ı ve yetki bağlama (Q-W516); analiz kullanıcılarına katalog yönetimi verilmesi.
- Data-plane’e yeni payload tablosu (Q-W505 B); PostgreSQL read-model/cache (Q-M05 C).
- Yeni tenant, yeni permission/rol, MOSEDAŞ tenantı, `Sirket` tabanlı yetkilendirme, Vardiya, Wave 2, Wave 3.

## Bağımlılıklar

TASK-027.58, TASK-027.58-R1 (done). Karar kapıları yukarıda. Sonraki: TASK-027.64.

Zincir: `(zincirin başı) — TASK-027.58/R1 done` → **TASK-027.63** → `TASK-027.64`.

## Değişecek olası dosyalar

> “Olası”: dosya adları task içinde kesinleşir. Modül yeri **Q-E04 ile kapandı** (`apps/api/src/reporting/scada/`); kalıcı veri **control-plane**’dedir (Q-W505/Q-W515).

- apps/api/src/reporting/scada/catalog/* (yeni; Q-E04 kararıyla `reporting/scada/` altında)
- apps/api/src/db/schema/* (yeni control-plane tabloları) + `apps/api/drizzle/migrations/*` (idempotent forward migration)
- docs/domain/DOMAIN_MODEL.md (yeni modül/varlıklar), docs/domain/DB_META.md (migration indeksi)
- apps/api/src/reporting/scada-contract/* (mevcut sözleşme; catalog factory’si bağlanır — `ScadaPortFactory` güncellemesi TASK-027.64’tedir)

## API/UI/veri sözleşmesi

- **Veri (karar sonrası çerçeve; alan adları task içinde AI1 onayıyla kesinleşir):** `CatalogSource { id(UUID), version, status, sourceTimeZone, limitProfile, ... }`, `CatalogTable`, `CatalogColumn { kind, counterRollover?, analysisParams, statisticPolicy }`, `SourceTenantMapping { tenantId, status: RESOLVED|UNRESOLVED|BLOCKED }`. Sayısal limit değerleri **kodda yok** (profil verisi).
- **API:** bu task’ta HTTP endpoint **yok**. **UI:** yok.

## Tenant ve permission kuralları

- Kaynağın sahibi/eşleme durumu katalogda açıktır; `UNRESOLVED/BLOCKED` kaynak **hiçbir scope tarafından** (root dahil) görülmez; kaynak yalnızca `RESOLVED` eşlemeyle scope’a girer.
- Scope yalnızca `TenantScopeService.resolve()` çıktısından; PLATFORM_ROOT, askıdaki tenant, kök’süz tenant scope alamaz.
- Q-W511 C: **katalog yönetimi analiz kullanıcılarına verilmez**; yeni permission uydurulmaz. Yazma yetkisinin mevcut hangi izin/rolle ifade edileceği **Q-W516**; karar gelene kadar yazma servisi hiçbir dış yüzeye bağlanmaz.
- Katalog **okuma** çağıranı (TASK-027.72) mevcut `REPORT:ARTIFACT:VIEW` guard zincirini uygular.

## Audit ve güvenlik kuralları

- Katalog değişikliği (yeni sürüm, aktif sürüm değişimi, eşleme durumu) audit’lenir: aktör, tenant/root, katalog UUID’si, sürüm, sonuç, statik reason code, **sunucu üretimli** correlation id (Q-SA07). **Database/schema/table/column adları, bağlantı bilgisi, limit değerleri secret gibi ele alınıp audit’e yazılmaz** (allowlist ile kurulur — Q-SR01/Q-SA04 ruhu).
- Audit yazımı başarısızsa katalog yazması **geri alınır** (fail-closed; Q-SA06 D6.3 ruhu).
- Katalog hiçbir connection string/secret/host/kullanıcı adı içermez (bunlar secret store/ortamdan); statik test.

## Test senaryoları

1. Kaynak envanterindeki her girdi: mapping yoksa `UNRESOLVED/BLOCKED` ve hiçbir scope’ta görünmez; onaylı `RESOLVED` mapping (test verisi) ile yalnızca sahip scope’ta görünür.
2. Güvensiz identifier reddi, yinelenen kaynak reddi, `permittedFilters ⊄ allowedColumns` reddi.
3. Saat dilimi: tanımsız/geçersiz → kaynak kullanılamaz (fail-closed); geçerli IANA adı kabul.
4. Limit profili: eksik/sıfır/negatif/tam sayı olmayan değer → kaynak kullanılamaz; **koda gömülü varsayılan yok** (statik).
5. Sayaç devri: kolon bazlı tanım kaydedilir/okunur; kolon **adına** bakan otomatik davranış yok; tanım yoksa alan boş.
6. Sürümleme: sürümler immutable, aktif sürüm tek, eski sürüm okunabilir; eşzamanlı yazma çakışması.
7. Root aggregation: yalnızca scope kümesindeki `RESOLVED` eşlemeler; ağaç dışı sahip görünmez.
8. Audit portu: yazma audit’siz çalışmaz; audit hatasında yazma geri alınır; audit nesnesi izinli alanlarla (fiziksel ad/limit değeri yok).
9. Statik: katalog/seed dosyalarında secret benzeri değer yok; MOSEDAŞ tenant üretilmiyor; `Sirket` yetki kararında yok; katalog yönetimi yüzeyi HTTP/CLI/seed olarak bağlı değil.

## Mutasyon testleri

Aşağıdaki kontroller koddan gerçekten çıkarılıp/bozulup testlerin kırıldığı, sonra geri alındığı gösterilmelidir (varsayım değil, koşulmuş kanıt):

1. Identifier doğrulaması kaldırılınca güvensiz-identifier testi kırılır.
2. `UNRESOLVED/BLOCKED` kaynağın gizlenmesi (scope/eşleme filtresi) kaldırılınca izolasyon testi kırılır.
3. Saat dilimi zorunluluğu kaldırılınca fail-closed testi kırılır; limit profili eksiklik kontrolü kaldırılınca ilgili test kırılır.
4. Sürüm immutability’si veya audit-hatasında geri alma kaldırılınca ilgili test kırılır.
5. Tablo/kolon adına bağlı otomatik varsayılan eklenirse (Q-W502/W503 ihlali) statik/davranış testi kırılır.

## Kabul kriterleri

- Katalog control-plane’de versiyonlu ve audit’lidir; tek doğruluk kaynağıdır (config dosyası yoktur).
- Hiçbir kaynak, mapping onayı olmadan erişilebilir değildir; çalışma zamanı keşfi yoktur; MOSEDAŞ tenant değildir; `Sirket` yetki kaynağı değildir.
- Sayaç devri, işlem tipi, istatistik politikası, saat dilimi, tolerans ve limit profili katalog alanı olarak vardır; koda gömülü sayı/varsayılan yoktur.
- Migration idempotent ve forward-only; gerçek PostgreSQL doğrulaması yapılmadıysa açıkça raporlanır.
- `pnpm --filter api exec tsc --noEmit`, `jest reporting platform audit`, `./scripts/check.sh --skip-docker` geçer; domain/DB dokümanları güncellenir.
- **Envanter (bu tur):** BOTC `appsettings.json` kaynak ve `TableDateMappings` envanteri credential’sız işlenmiştir; Debug/Release farkı raporlanmıştır; `BOT_APP`/`DOF_APP` Wave 2/3 kapsamı dışıdır; MOSEDAS tenant değildir; hiçbir kaynak onaylı mapping ve doğrulanmış kolon olmadan erişilebilir değildir; TASK-027.64 bağımlılığı yazılıdır.

## Rollback yaklaşımı

Additive control-plane tabloları ve modül: modül kaydı kaldırılarak devre dışı bırakılır (okuyan/çağıran yok). Migration forward-only; geri alma yeni bir forward migration ile tabloların kaldırılmasıyla yapılır (yalnızca bu modül tarafından okunan tablolar; canlı bir tüketici olmadığı için veri kaybı riski yok). Sürümlü yapı, hatalı sürümün **yeni sürümle** geri alınmasına izin verir.

## Sonraki task

TASK-027.64

## Gerçek DB/SQL Server/Docker gerekip gerekmediği

Kod ve testler için **hayır** (mock DB). Migration’ın **gerçek PostgreSQL** üzerinde doğrulanması ayrı ve açık kullanıcı onayı ister; SQL Server ve Docker yok.

## AI1/PO kararı gerektiren açık sorular

- **Q-W516** — Katalog/allowlist yönetim yetkisi: “daha yüksek yetkili platform operasyon kapsamı” mevcut hangi izin/rol (yeni kod uydurulmaz)
- **Q-W519** — Katalog/sanal kolon/preset değişiklik audit action/entity adları; formül metninin audit’e yazılması
- **Q-S03** — `DynamicDataSources` anahtarlarının fiziksel DB eşlemesi
- **Q-W523** — BOTC canonical appsettings.json içinde düz metin credential’lar (rotasyon/ifşa değerlendirmesi; Metnex kapsamı dışı, bilgi)
- **Q-W524** — Kolon/şema doğrulama süreci (kim/ne zaman/hangi ortam) ve Debug↔canonical saat alanı farkı
- **Q-W525** — Boşluk içeren fiziksel DB adı (`MOSB ENERJI DB`) için identifier doğrulama politikası
- Alan adları/tablo şeması ayrıntıları (task içinde AI1 onayı)

## BOTC referansı

- **Referans davranış:** BOTC `DataSourceService` + `appsettings.json` `DynamicDataSources`, `QueryService.GetTablesAsync/GetColumnsAsync` (INFORMATION_SCHEMA), `TableDateMappings`, `GetDefaultValueTypeForTable`.
- **Taşıma sınırı:** Taşınmaz: config-dosyası deseni, ConfigProtector şifreli connection string, kaynak adı süzme (BOT_APP/DOF_APP/VARDIYA_RAPORLARI içerir/içermez), çalışma zamanı keşfi.

## Ortak sınırlar

- Production kodu ve migration bu **planlama** görevinde (TASK-027.62) yazılmadı; bu dosyadaki tasarım maddeleri, “öneri” ibaresi taşıyanlar dahil, **karar değildir**. Karar gerektiren her nokta “açık sorular” bölümündedir; karar gelmeden implementation kararı gibi uygulanmaz.
- `Sirket` alanı tenant/yetki otoritesi değildir. MOSEDAŞ Metnex’te tenant olarak eklenmez (DEC-0014). Yeni permission, rol veya tenant uydurulmaz. Wave 2 ve Wave 3 kapsam dışıdır.
- SCADA/DMS SQL Server kaynakları salt-okunurdur; raw SQL, kullanıcı kontrollü database/schema/table/column, runtime `INFORMATION_SCHEMA` keşfi ve tarayıcıdan şema keşfi yoktur.
- Gerçek SQL Server/PostgreSQL bağlantısı, Docker build/run, gerçek SCADA verisi veya secret kullanımı **ayrı ve açık kullanıcı onayı** olmadan yapılmaz. Git commit/push yapılmaz.
- Teslimde `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, ilgili jest/vitest ve `./scripts/check.sh --skip-docker` (Q-ENV01 workaround’u kullanılırsa belirtilir) sonucu raporlanır; backlog `status`, `METNEX_STATE.md` ve `PROGRESS_LOG.md` (append-only) güncellenir.
- Sayısal performans/limit eşikleri uydurulmaz; kararsız değerler açık soru olarak kalır (Q-SP02).

## 2026-09-23 — AI1 Kararları (append-only): Q-W524, Q-W525, Q-W523 devri (DEC-0016)

- **Q-W524 — Kontrollü read-only preflight:** kayıtlar `UNVERIFIED` başlar; kullanıcı kaynak/kolon keşfedemez; adapter yalnızca allowlist okur. Yetkili, kontrollü read-only preflight bağlantıyı, database/schema/table/column varlığını, tarih/saat kolonlarını ve veri tiplerini doğrular; başarılıysa `VERIFIED`. `UNVERIFIED` kayıt driver'a hiç gönderilmez; serbest `INFORMATION_SCHEMA` keşfi yok. **Gerçek preflight ayrı açık onay olmadan çalıştırılmaz.**
- **Q-W525 — Fiziksel isim korunur:** `MOSB ENERJI DB` yeniden adlandırılmaz/otomatik reddedilmez; fiziksel DB adı yalnızca onaylı kaynak profilinde durur, kullanıcıdan DB adı alınmaz, profil opak katalog ID ile seçilir; SQL identifier ham kullanıcı girdisinden gelmez (sürücünün güvenli identifier mekanizması, TASK-027.64); `MOSB_ENERJI_DB` gibi farklı DB'ye normalize edilmez.
- **Q-W523:** ayrı `TASK-027.75` (credential rotation/security, `planned`) görevine devredildi; Wave 5'ten bağımsız, düz metin credential Metnex'e taşınmaz, gerçek rotasyon açık onay ister.

## 2026-09-23 — Implementasyon (mock/in-memory sözleşme) — `review`

**Yeni kod (`apps/api/src/reporting/scada/catalog/`, hiçbir Nest modülüne kayıtlı değil, sürücü/DB/ORM/fs/ağ import'u yok):** `catalog.types.ts` (kaynak durumu, katalog kimliği, tenant mapping durumu, kolon doğrulama durumu, saat dilimi, limit profili), `catalog-rules.ts` (fiziksel ad deseni — boşluklu ad korunur, IANA saat dilimi, eksiksiz limit profili, deklare tablo/kolon, gözlenen-tip uyumu), `tenant-guards.ts` (PLATFORM_ROOT/aktif olmayan/bulunamayan/MOSEDAŞ tenant reddi), `catalog.ports.ts` (repository, yazma yetkilendiricisi — **varsayılanı yok**, audit, tenant dizini, saat), `in-memory-catalog.repository.ts` (değişmez/dondurulmuş sürümler, atomik işlem + rollback, ardışık sürüm zorunluluğu), `catalog.service.ts`.

**Geçişler:** kayıt → `UNVERIFIED` (kolonlar `UNVERIFIED`, mapping yok). `VERIFIED` **yalnızca** `applyPreflight` gözlem sonucuyla; uyumsuzluk (DB/tablo/kolon yok, tip uyumsuz) → `BLOCKED` + statik neden kodu; bağlantı hatası → durum/sürüm değişmez, `FAILED` audit. `BLOCKED → UNBLOCK → UNVERIFIED` (doğrudan `VERIFIED` yok). Tablo/fiziksel ad değişimi doğrulamayı düşürür (`UNVERIFIED`). Mapping: `UNRESOLVED ⇄ RESOLVED` (onay referansı zorunlu), `BLOCKED → UNRESOLVED` (doğrudan `RESOLVED` yok); MOSEDAŞ/PLATFORM_ROOT/pasif tenant onaylanamaz. Erişim: eşleşmeyen tenant için `NOT_FOUND`; `IN_SCOPE`+`RESOLVED`+`VERIFIED`+saat dilimi+eksiksiz limit profili+doğrulanmış tablo/kolon yoksa reddedilir (fail-closed, varsayılan yok). Fiziksel ad yalnızca `getExecutionProfile` (TASK-027.64 için dahili) ile verilir; liste görünümü fiziksel adı/mapping'i göstermez.

**Yetki/audit:** yazma yetkisi Q-W516 açık → varsayılan yetkilendirici yok, izin kodu uydurulmadı; yetkisiz → `NOT_AUTHORIZED` + `DENIED` audit. Audit **işlem içinde** (audit hatası değişikliği geri alır), yalnızca `actorId/catalogId/version/operation/result/reasonCode/correlationId/mappedTenantId`, sunucu correlation id; fiziksel/tablo/kolon adı yok. Audit action/entity adları Q-W519 açık — port'a bırakıldı.

**Kapsam dışı (yapılmadı):** gerçek repository/migration (uygulanmadı), gerçek preflight, SQL Server/PostgreSQL bağlantısı, Docker, smoke test, gerçek tenant mapping, seed, git commit/push. TASK-027.64 `planned`.

**Testler:** `catalog.service.spec.ts` + `catalog-static.spec.ts` (59 test). Mutasyon kontrolleri gerçekten uygulanıp yakalandı: preflight uyumsuzluğunda VERIFIED, mapping/izolasyon kontrolü, yetki bypass, audit hatası yutma, unblock→VERIFIED, tanım değişiminde doğrulama korunması, saat dilimi/limit profili zorunluluğu, kolon doğrulaması, MOSEDAŞ reddi, rollback, sürüm kontrolü (ilk turda 2 hayatta kalan mutant için doğrudan-repository testleri eklendi). Mevcut iki statik test (`scada-static-security`, `dec-0014-slug-consistency`) ve R1 envanteri `tenant-guards.ts` (ret kuralı) ve `catalog.service.spec.ts` (negatif test) için minimal allow-list ile güncellendi.

## 2026-09-23 — AI1 Onayı: TASK-027.63 `done`
AI1, teslimi onayladı (`review` → `done`): in-memory katalog modeli, fail-closed geçişler, opak ID + boşluklu fiziksel ad, tenant/saat dilimi/limit profili zorunlulukları, MOSEDAŞ ve pasif/UNRESOLVED mapping reddi, DB/ORM/driver bağımlılığı yok, mutasyon kontrolleri ve kalite kapısı başarılı. TASK-027.64 `planned`. Açık kalanlar (sonraki task'ların karar kapıları): Q-W516 (yazma yetkisi), Q-W519 (audit action adları), PostgreSQL repository/migration, gerçek read-only preflight. Git commit/push yapılmadı.

## 2026-09-23 — Adapter referansı (TASK-027.64)
`backlog/TASK-027-64-sqlserver-readonly-adapter.md` bu kataloğu `CatalogService.getExecutionProfile` üzerinden tüketir (mock driver; `apps/api/src/reporting/scada/adapter/`). Tek ek: `getExecutionProfile` okuma anında mapping'teki tenant'ın hâlâ mappable olduğunu yeniden doğrular (pasifleşen tenant erişim vermez) — katalog çekirdeği/geçişleri değişmedi. **Gerçek SQL Server smoke testi ve gerçek preflight ayrı açık onay gerektiren iştir.**

## 2026-09-23 — TASK-027.64 R1 ile katalog eki: schema (append-only)
AI1 kararı: schema VERIFIED kaydın **zorunlu** alanı; varsayılan `dbo` yok. Katalog modeli buna göre genişledi (`DeclaredTable/CatalogTable.schema`, `PreflightObservation.tables[].schemaExists`, `INVALID_SCHEMA_NAME`, `SCHEMA_UNDEFINED`, `PREFLIGHT_SCHEMA_UNDEFINED/MISSING`) — durum geçişlerinin geri kalanı değişmedi. Ayrıntı: `TASK-027-64-sqlserver-readonly-adapter.md` R1 bölümü. TASK-027.63 `done` kalır; bu ek AI1 kararının izlenebilir kaydıdır.
