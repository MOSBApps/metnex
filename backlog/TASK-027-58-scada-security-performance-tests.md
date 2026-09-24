---
id: TASK-027.58
title: SCADA Güvenlik ve Performans Testleri
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
related: [TASK-027.9, TASK-027.57]
updated_at: 2026-09-23
---

# TASK-027.58: SCADA Güvenlik ve Performans Testleri

## Amaç

SQL injection, tenant isolation, timeout, row/payload limit, export ve grafik
performans sınırlarını test etmek.

## Bağımlılık

TASK-027.54–TASK-027.57

## Kabul kriterleri

- Kaynak/table/column manipülasyonu scope aşamaz.
- Read-only adapter write çalıştırmaz.
- Timeout, satır ve payload limitleri fail-closed çalışır.
- Kritik güvenlik senaryoları negatif/mutation testleriyle kanıtlanır.


## Teslim notu (2026-09-23, AI2)

### Keşif sonucu — gerçek adapter/port YOK (blocker)

Repoda SQL Server adapter'ı, port'u, kaynak kataloğu, allowlist veya dinamik sorgu sözleşmesi
**yok**: `apps/api` altında SQL Server sürücü bağımlılığı yok (`mssql`/`tedious`), üretim kodunda
`Scada*` adlı hiçbir sınıf/arayüz yok, `reporting.module.ts` hiçbir provider kaydetmiyor (DEC-0012).
TASK-027.31–027.36 ID'leri başka işler için kullanılmış; SCADA kataloğu/allowlist/adapter/dynamic
query/limit işleri hiç yapılmadı (METNEX_STATE kayıtları "YAPILMADI" diyor). Bu task'ın bağımlılık
zinciri (TASK-027.31–36'nın asıl SCADA kapsamı) dolayısıyla eksik. Mevcut olan ve bağlanabilen tek
şey: `TenantScopeService`, `PlatformAuditService`, `ReportDatasetProvider` sözleşmesi ve
`docs/migration/METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md` (yalnızca mimari belge).
Bu nedenle **adapter varsayımıyla production kodu yazılmadı**; mevcut port sözleşmesi genişletilmedi
(zaten yok). ID çakışması bu dosyada yok (başlık/kapsam eşleşiyor); yeni backlog dosyası açılmadı.

### Ne yapıldı

Yalnızca test ve statik tarama (production dosyası değişmedi). Yeni `apps/api/src/reporting/scada-contract/`:

1. **Çalıştırılabilir sözleşme** (`test-helpers/scada-readonly-port.contract.ts`) — factory ile
   parametrik; gerçek adapter geldiğinde `scada-readonly-port.reference.spec.ts`'e tek satır
   eklenerek aynı 105 doğrulama onun üzerinde koşturulur.
2. **TEST-ONLY referans model** (`test-helpers/reference-scada-port.ts`) — sözleşmeyi doğrulamak
   ve mutasyon kontrolünü mümkün kılmak için. Production adapter DEĞİLDİR: sürücü, connection string,
   secret yok; hiçbir production dosyası import etmez (statik test bunu zorlar); provider olarak kayıtlı
   değildir. **Sınır:** sözleşme davranışları bu modelde kanıtlandı; gelecekteki gerçek adapter'ın
   güvenliği bununla kanıtlanmış sayılmaz — sözleşmenin ona karşı koşması gerekir.
3. **Gerçek bileşenlerle testler** (`scada-real-components.spec.ts`, 24 test) — gerçek
   `TenantScopeService` (mock DB) ve gerçek `PlatformAuditService`.
4. **Statik taramalar** (`scada-static-security.spec.ts`, 10 test) — gerçek kaynak ağacı.

**Sayısal eşik uydurulmadı:** referans model hiçbir varsayılan sayı içermez; tüm limitler dışarıdan
verilir, eksik/geçersiz limit **yapıcı hatasıdır**. Testlerdeki küçük sayılar (timeout 30 ms, 5 satır…)
yalnızca test parametresidir, önerilen production değeri değildir.

### Gereksinim → test eşlemesi (özet)

| Gereksinim | Kanıt |
|---|---|
| Allowlist dışı db/schema/table/column reddi | Kaynak/kolon/filtre allowlist testleri; allowlist'te güvensiz identifier yapıcıda reddedilir; sürücüye gitmeden ret |
| Raw SQL / kullanıcı kontrollü identifier | `sql`,`query`,`database`,`schema`,`table`,`tenantId`,`sirket`… istek alanı olarak yok → `INVALID_REQUEST` |
| DML/DDL, read-only | 16 ifade türü `assertReadOnlyStatement` ile reddedilir; her sürücü ifadesi tek SELECT; golden ifade testi |
| Parametre binding / SQL injection | 6 payload yalnızca parametre olarak gider, ifade metninde asla yok |
| Runtime INFORMATION_SCHEMA yok | Sürücüye giden ifadelerde yok + üretim kodunda statik tarama |
| Tenant izolasyonu (MOSB/MOSBİO), root aggregation | Sözleşme + gerçek `TenantScopeService` kapsamı: yalnızca çözümlenen kapsam okunur, dışarıdaki kök reddedilir, dar closure genişlemez |
| Unresolved/ambiguous mapping | `ownerTenantId=null` kaynak root için bile okunamaz; yinelenen source key yapıcıda reddedilir |
| `Sirket` yetki kaynağı değil | İstek alanı olamaz; filtre olsa bile başka tenant kaynağını açmaz; üretim yetki/kapsam kodunda `sirket` yok (statik) |
| Tenant header tek başına yetki değil | Kapsam yalnızca resolver çıktısından gelir; PLATFORM_ROOT/askıdaki/kök'süz/bilinmeyen tenant kapsam alamaz. `PermissionGuard` tarafı TASK-027.57'deki `permission.guard.spec.ts` ile kapsanıyor |
| MOSEDAŞ tenant olarak oluşturulmaz | Üretim kodu (migration kaynak eşlemesi hariç) ve SQL migration'larında MOSEDAŞ yok (statik); **bkz. bulgu F-2** |
| Timeout / cancellation / retry | Zaman aşımı + sürücü sinyali iptali, sinyali yok sayan sürücüde de süre sınırı, çağıran iptali, ön-iptal, retry yok (sürücü 1 çağrı) |
| Satır / kolon / payload / tarih aralığı | Fail-closed (kırpma yok), kaynak başına daha düşük satır sınırı, cap+1 istenir, aşırı aralık reddedilir |
| Pool / concurrency | `maxConcurrent > poolSize` reddedilir, sınır üstü eşzamanlı çağrı reddedilir (kuyruk yok), hata/timeout sonrası slot serbest kalır |
| Hatalı sorgu state'i bozmaz, A/B state sızıntısı yok | Hata sonrası sonraki çağrı çalışır; eşzamanlı A/B sorguları ayrı ifade/parametre/audit tenant'ı taşır |
| Audit redaction, sızıntı yok | Audit yalnızca actorId/tenantId/sourceKey/result/reasonCode/correlationId; satır/SQL/parametre/db/host/sürücü hatası yok; saldırgan kontrollü sourceKey/correlationId yansıtılmaz; audit hatası sonucu değiştirmez |

### Mutasyon kontrolleri (gerçekten çalıştırıldı, her biri geri alındı)

24 mutasyon; **tümü testleri kırdı**: allowlist doğrulaması (3 varyant), istek alanı katılığı, tenant scope
(2), read-only, parametre binding, timeout zamanlayıcısı, süre yarışı (deadline race), harici iptal,
satır / payload / kolon / tarih-aralığı limitleri, unresolved-mapping fail-closed, pool/concurrency,
slot serbest bırakma, limit varsayılanı yasağı, audit alan allowlist'i, saldırgan sourceKey yansıması,
sürücü hata metni sızıntısı, audit hatasının sonucu çevirmesi ve gerçek `scrubSecrets` (redaction listesi
boşaltılınca 5 test kırıldı). 3 statik tarama (sürücü importu, INFORMATION_SCHEMA+Sirket, `Scada*` sembolü)
probe dosyasıyla kırıldı. **Dürüstlük notu:** ilk turda 4 mutasyon geçersiz çıktı (biri jest'i
kilitledi, ikisi derleme hatası verdi, biri iki katmanlı savunma yüzünden eşdeğer mutantdı); düzeltilip
yeniden çalıştırıldı, hepsi kırdı. Mutasyonlar referans model ve gerçek `scrubSecrets` üzerinde yapıldı —
henüz gerçek adapter olmadığı için adapter mutasyonu yapılamadı.

### Bulgular (kod değiştirilmedi, AI1 kararı gerekir)

- **F-1 — `scrubSecrets` kapsamı dar:** yalnızca `password/passwordHash/refreshToken(Hash)/token/apiKey(Ciphertext)`
  anahtarlarını maskeler; `connectionString`, `secret`, `cookie`, `otp`, `host`, `rawSql`, `schemaName` anahtarlarını
  ve değer içindeki connection string'i maskelemez. Paylaşılan davranışı değiştirmek kapsam dışı olduğundan
  düzeltilmedi; 7 `it.failing` testi açığı yanıltıcı yeşil vermeden kaydeder (scrubSecrets genişletilince
  kırılırlar → normal teste çevrilmeli). SCADA sözleşmesi bu yüzden scrubSecrets'e değil sıkı alan allowlist'ine dayanır.
- **F-2 — DEC-0014 ile kod çelişkisi:** DEC-0014 MOSEDAŞ'ın tenant olmadığını söylüyor; identity migration
  kodu (`apps/api/src/migration/botc-identity`) hâlâ `ApprovedTenantSlug = MOSB | MOSEDAS | MOSBIO` ve
  ilgili kapsam/mapping mantığını taşıyor. Değiştirilmedi; statik testler bu dizini bilerek dışarıda bırakır.
- **F-3 — audit modeli açık:** SCADA audit `actionCode`/`entityType` adları ve Q-AD01 (genel log mu ayrı tablo mu) hâlâ karar bekliyor;
  testteki `SCADA_READ_CONTRACT_TEST` yalnızca test etiketidir.

### Gerçek SQL Server ve sınırlar

Gerçek SQL Server bağlantısı/smoke testi **yapılmadı**; SQL Server container, Docker build/run, gerçek
secret, gerçek SCADA verisi kullanılmadı. Browser/E2E yapılmadı (bu task'ta UI yok). Yeni permission/rol,
yeni tenant, migration, adapter/provider eklenmedi. Git commit/push yapılmadı.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit` → temiz.
- `pnpm --filter api exec jest reporting platform audit --runInBand` → 33 suite / 1251 test PASS.
- `NODE_PATH=$(pwd)/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose ./scripts/check.sh --skip-docker`
  (**Q-ENV01 workaround'u kullanıldı**) → tam PASS: api 64 suite / 1790 test (+3 suite / +139 test; 7'si `it.failing`),
  web 22 suite / 253 test, lint, typecheck, build.

### Değişen/yeni dosyalar (hepsi yeni, hepsi test)

- `apps/api/src/reporting/scada-contract/test-helpers/reference-scada-port.ts`
- `apps/api/src/reporting/scada-contract/test-helpers/scada-readonly-port.contract.ts`
- `apps/api/src/reporting/scada-contract/scada-readonly-port.reference.spec.ts` (105 test)
- `apps/api/src/reporting/scada-contract/scada-real-components.spec.ts` (24 test)
- `apps/api/src/reporting/scada-contract/scada-static-security.spec.ts` (10 test)

### R1 referansı (2026-09-23)

AI1 bu task'ı `done` yapmadı ve açıkları TASK-027.58-R1'e yönlendirdi: **`backlog/TASK-027-58-R1-scada-contract-closure.md`**.
R1 ile: F-1 (`scrubSecrets`) istenen anahtar sınıfları için **kapatıldı** (kalan sınır Q-SR01); F-2 (DEC-0014 ↔ slug)
envanterlendi ve açık karar (Q-SP04/Q-SP04b) olarak kaydedildi, sürüklenme koruması eklendi; F-3 (SCADA audit)
karar paketi (`docs/migration/METNEX_SCADA_AUDIT_CONTRACT_DECISION_PACKAGE.md`) + test matrisi olarak ele alındı.
Yukarıdaki F-1 testleri (7 `it.failing`) R1'de güncellendi: 5'i normal teste dönüştü, `rawSql`/`schemaName`
kalıntısı 2 `it.failing` olarak kaldı. Bu dosyanın status'u `review` olarak kalır; `done` kararı AI1'de.
