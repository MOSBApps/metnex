# Data-Plane Port, Ledger ve Migration Kaynağı Karar Paketi (TASK-027.33)

> **Durum: Karar paketi. Production kodu, veritabanı, ledger tablosu/migration/schema, advisory lock kodu, fiziksel schema probe, gerçek executor, fan-out job/CLI, Docker, Git history DEĞİŞTİRİLMEDİ.**
> **AI2 hiçbir soruyu kapatmaz.** Her konu için kanıt, seçenekler, etkiler, **AI2 önerisi** ve **boş "AI1/PO KARARI" alanı** ayrı tutulmuştur; AI2 önerileri karar değildir ve **AI1/PO alanı dolmadan implementation yapılmaz**
> (özellikle ledger'ın düzlemi ve migration kaynağı/checksum politikası kesinleşmeden gerçek migration dosyası veya ledger tablosu oluşturulmaz). Kanıtlanamayan bilgi `[DOĞRULANAMADI]`.
> **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

**Karşılaştırılan kaynaklar:** `apps/api/src/{data-plane/*, tenant-scope/*, migrate.ts, db/db.service.ts, db/schema/platform.ts, db/id.ts}`, `apps/api/{Dockerfile, drizzle/migrations/meta/_journal.json, drizzle.config.ts}`,
`apps/api/node_modules/drizzle-orm/{migrator.js, pg-core/dialect.js}`, `infra/docker/{init-db.sql, docker-compose.dev.yml}`, `.github/workflows/pipeline.yml`, `DEC-0009/0010/0011`, `docs/domain/DB_META.md`,
`METNEX_DATA_PLANE_FOUNDATION_CONTRACT.md` (TASK-027.32), `METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`, `METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md`, `METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` (§9 kimlik sınırı), TASK-027.25/26/27 paketleri.

---

## 0. Bu task'ta bulunan, önceki paketlerde olmayan bulgular

| # | Bulgu | Kanıt | Karar konusuna etkisi |
|---|---|---|---|
| **E1** | **Mevcut sözleşmede üç ayrı commit var ve atomik değil:** `executor.apply` → `ledger.recordApplied` → `registry.compareAndSetVersion`. Aralarında süreç ölürse: (a) executor commit oldu, ledger yok → sonraki run **aynı DDL'i yeniden çalıştırır** (idempotent değilse hata/çift nesne); (b) ledger var, registry sürümü geride → toparlanır (skipped + CAS, test kanıtlı) | `data-plane-migration.orchestrator.ts` sırası | T4, T6, T9: ledger'ın yeri ve transaction sınırı **birlikte** karara bağlanmalı; ledger kaydı DDL ile **aynı transaction'da** olmazsa (a) penceresi kalır |
| **E2** | **Drizzle prior art'ı:** migrator hash'i `sha256(dosya içeriği)` olarak **normalizasyonsuz** hesaplıyor (`migrator.js:23`); repoda `.gitattributes`/`.editorconfig` **yok** → CRLF/LF farkı aynı dosyada farklı checksum üretir | `migrator.js`, `ls -a` | T8: checksum politikası satır sonu normalizasyonu ve `.gitattributes` ister |
| **E3** | **`init-db.sql`'de eski şablondan kalma schema'lar:** `platform`, `shared`, `customer_root` (DEC-0010 `cust_<slug>_<hex>` biçimine uymuyor); amaçları/kullanımı `[DOĞRULANAMADI]` (bu ortamdan kod kullanımı bulunamadı, DB'ye bağlanılmadı) | `infra/docker/init-db.sql` | `assertCustomerSchemaName` bunları reddeder (doğru); probe/admission bu adlara asla yönelmemeli — Q-DP14 |
| **E4** | **Control-plane kilidi `pg_try_advisory_lock(hashtext($1))` (32-bit, oturum düzeyi, ayrılmış bağlantı)**; data-plane kontratı ad-alanı ayrı bir dize anahtarı kullanır. `hashtext` çakışması yalnızca **yanlış BLOCKED** üretir (güvenli yön) | `migrate.ts`, `data-plane-migration.contract.ts` | T3 |
| **E5** | **`DbService` tek `Pool`/tek `DATABASE_URL` (uygulama kimliği)**; migration kimliğiyle çalışacak port implementasyonları `DbService`'i kullanamaz (uygulama kimliğine DDL/CAS yetkisi gerektirir) | `db.service.ts` | T1, T12 |
| **E6** | **Dockerfile `apps/api/drizzle/` klasörünü bütünüyle image'a kopyalar**; control-plane migrator yalnızca `drizzle/migrations`'ı okur (`MIGRATIONS_FOLDER`). `drizzle/data-plane/` gibi ayrı bir klasör **ek Dockerfile değişikliği olmadan** image'a girer ve control-plane'e karışmaz. Tersine `src/` altındaki `.sql` dosyalarını `tsc` kopyalamaz (`nest-cli.json`'da asset ayarı yok) | `Dockerfile` (`COPY … apps/api/drizzle`), `migrate.ts`, `nest-cli.json` | T7 |
| **E7** | **Tenant id'leri `generateId()` (`randomUUID`) ile üretilir; `insert(tenants)` çağrılarında açık `id` bulunamadı** (sınırlı grep). Gerçek DB'deki mevcut satırların biçimi `[DOĞRULANAMADI]` (DB'ye bağlanılmadı) | `db/id.ts`, `platform.ts:9`, `saas.service.ts` | T10 |
| **E8** | **Dev PostgreSQL sürümü 16** (`postgres:16-alpine`); production sürümü `[DOĞRULANAMADI]`. Bağlantı havuzlayıcı (ör. transaction-pooling) kullanılıp kullanılmadığı `[DOĞRULANAMADI]` — oturum düzeyi advisory lock ve `SET LOCAL` buna duyarlıdır | `docker-compose.dev.yml` | T3, T6 |
| **E9** | **Schema oluşturma bugün uygulama kimliğiyle yapılır** (`ensureSchemaProvisioned` → `dbService.pool.query('CREATE SCHEMA …')`) → customer schema'larının sahibi büyük olasılıkla uygulama rolü (**çıkarım**, `[DOĞRULANAMADI]`); kimlik ayrımı (T12) sahiplik/provizyon kimliğini de etkiler | `customer-schema-registry.service.ts`, `db.service.ts` | T12, Q-DP13 |

---

## 1. Kayıt sınıfları ve Q-ID01 ilişkisi

"Ledger" tek bir şey değildir; dört ayrı kayıt sınıfı vardır. Q-ID01 (staging/ledger yeri) bunlardan yalnızca 3–4'ü kapsar; bu paket 1–2'yi karara bağlar, 3–4'ü **etkilemez ve kapatmaz**.

| # | Kayıt sınıfı | Ne tutar | İlgili soru | AI2 önerisi (karar değil) |
|---|---|---|---|---|
| **1** | **Uygulanmış-migration takibi** (data-plane sözleşmesindeki `ledger` portu: `findApplied`/`recordApplied`) | Bu schema'da hangi sürüm hangi checksum ile uygulandı | Q-DP11 (T4) | **Customer schema içinde**, migration DDL'i ile **aynı transaction'da** |
| **2** | **Schema-migration çalıştırma ledger'ı** (run düzeyi) | runId, mod, sonuç kategorisi, süre, sayaçlar | Q-DP11 (T4/T5), Q-DP02 | **`public` control-plane** (platform izleyebilmeli, F5) |
| **3** | **Identity staging / legacy-ID eşleme** | BOTC→Metnex kullanıcı eşleme durumu | **Q-ID01** | Önceki öneri: `public` (değişmedi, **kapatılmadı**) |
| **4** | **Vardiya payload staging + legacy-anahtar ledger'ı** | Kaynak satır payload'ı, `(sourceSystem, sourceTable, legacyId)` eşleme | **Q-ID01**, TASK-027.25 §9 | Önceki öneri: payload customer schema; ledger karar bekliyor (**kapatılmadı**) |

Kural: sınıf 1–2 **şema** migration'ının kayıtlarıdır; sınıf 3–4 **veri** taşıma kayıtlarıdır. İkisi ayrı tablolar/yaşam döngüleridir (bir migration adı/sürümü veri taşıma kaydı olarak kullanılmaz).

---

## 2. Karar tabloları

Notasyon: her tabloda **AI1/PO KARARI** satırı bilerek boştur (☐ bekliyor).

### T1 — Registry portunun gerçek implementasyon sınırı (Q-DP11-a)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (registry portu) |
| **Mevcut kanıt** | Registry `public.customer_schema_registry` (`migrationVersion` text, `status` text-enum, `updatedAt` `$onUpdate`); okuma/yazma bugün `CustomerSchemaRegistryService` üzerinden **uygulama havuzuyla** (E5); sözleşme portu `get` + `compareAndSetVersion` (status yazan işlem **yok**) |
| **Seçenekler** | **A** mevcut `CustomerSchemaRegistryService`'e yeni metot (uygulama kimliği, Nest DI) · **B** ayrı ince repository, **migration kimliğinin kendi havuzuyla** (`DbService` kullanmaz) · **C** DB tarafı fonksiyon (`SECURITY DEFINER`) |
| **Güvenlik etkisi** | A: uygulama kimliğine sürüm-yazma yetkisi verir (istenmez). B: yetki yalnızca migration kimliğinde; `UPDATE … SET migrationVersion` yalnızca **`status='ACTIVE'` ve beklenen sürüm** koşuluyla, satır sayısı 1 ise `true`; status'a **hiç** yazmaz. C: en dar ama DB nesnesi/migration gerektirir |
| **Tenant izolasyonu etkisi** | Tek satır (root başına); `WHERE customerRootTenantId = $1` zorunlu; başka root'a yazamaz. `get` kilitsiz tek satır okuma |
| **Operasyonel etkisi** | B: ayrı bağlantı/secret (T12); Nest dışı (CLI/job) çalışır |
| **Geri dönüş maliyeti** | A↔B düşük (aynı SQL); C→B orta |
| **AI2 önerisi** | **B** — `apps/api/src/data-plane/ports/` altında, migration kimliğinin havuzuyla; `compareAndSetVersion` tek koşullu `UPDATE … RETURNING`; hiçbir status/schemaName yazımı |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | "Data-plane registry portu (B)" — dosyalar: `data-plane/ports/registry.port.ts` (+spec, sahte havuzla), migration kimliği bağlantı çözümleyici (T12) |

### T2 — Fiziksel schema probe: nerede, hangi yetkiyle (Q-DP11-b)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (probe) |
| **Mevcut kanıt** | `RegistryPhysicalSchemaProbe` yalnızca **arayüz** (TASK-027.31); tanı `EXISTS/MISSING/UNKNOWN` bekler; registry↔fiziksel doğrulama hiçbir yerde yok (D3/R3) |
| **Seçenekler** | **A** `select 1 from pg_namespace where nspname = $1` (parametreli) · **B** `information_schema.schemata` (rol yetkisine göre **filtrelenir** → yanlış "yok" riski) · **C** `to_regnamespace($1)` (PG ≥ 9.5; sürüm `[DOĞRULANAMADI]` prod) · **D** `CREATE SCHEMA IF NOT EXISTS` ile sınama — **reddedilir** (yazar/onarır) |
| **Güvenlik etkisi** | A/C: tek parametreli salt-okuma, **identifier enterpolasyonu yok**; yalnızca `assertCustomerSchemaName` geçen ad sorgulanır. B: yanlış `SCHEMA_MISSING` alarmı. D: D3/R3'te tarif edilen sessiz-onarım riski |
| **Tenant izolasyonu etkisi** | Yalnızca ad varlığı sızar; başka müşterinin adı yalnızca kendi root id parmak iziyle eşleşmediği için **hiç sorgulanmaz** (admission `SCHEMA_ROOT_MISMATCH` önce gelir) |
| **Operasyonel etkisi** | Migration kimliğiyle, **runner/tanı bağlamında**; her `resolve()` isteğinde çalıştırılmaz (Q-DP01 karar bekliyor); hata/zaman aşımı → `UNKNOWN` (fail-closed) |
| **Geri dönüş maliyeti** | Düşük (tek sorgu) |
| **AI2 önerisi** | **A** (veya prod'da PG ≥ 9.5 doğrulanırsa C), migration kimliği, yalnızca runner/tanı; istek yolunda **yok** |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | "Data-plane fiziksel schema probe" — `data-plane/ports/physical-probe.port.ts` (+spec) |

### T3 — Advisory lock implementasyonu ve granülaritesi (Q-DP11-c)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (lock) |
| **Mevcut kanıt** | Kontrat: root başına anahtar `metnex:data-plane-migration:<root>`, `tryAcquire/release` portu; control-plane: oturum düzeyi `pg_try_advisory_lock(hashtext(...))` ayrılmış bağlantıda (E4); fan-out standardı: "global + schema başına" |
| **Seçenekler** | **Tür:** **L-a** oturum düzeyi (run boyunca ayrılmış bağlantıda) · **L-b** transaction düzeyi `pg_try_advisory_xact_lock` (yalnızca executor transaction'ı boyunca) · **L-c** ikisi. **Granülarite:** **G-1** root başına · **G-2** yalnızca global · **G-3** root başına + fan-out sürücüsü için ayrı global. **Anahtar:** **K-1** `hashtext` (32-bit) · **K-2** iki-int biçimi `(ad-alanı sabiti, hashtext(root))` |
| **Güvenlik etkisi** | Kilit güvenlik sınırı değil eşzamanlılık korumasıdır; çakışma yalnızca **yanlış BLOCKED** üretir. L-b tek başına admission→CAS penceresini (birden çok commit) **kapsamaz** (E1) |
| **Tenant izolasyonu etkisi** | G-1: bir müşterinin migration'ı diğerini bloklamaz (izolasyon/erişilebilirlik). G-2 tüm müşterileri seri hâle getirir |
| **Operasyonel etkisi** | L-a: bağlantı kopması kilidi düşürür → runner sonraki migration öncesi **kilit bağlantısının canlı olduğunu doğrulamalı**; havuzlayıcı `[DOĞRULANAMADI]` (E8) transaction-pooling ile **uyumsuz**. G-3 fan-out'ta çift çalıştırmayı engeller |
| **Geri dönüş maliyeti** | Düşük (anahtar ad-alanı/tür değişimi, veri yok) |
| **AI2 önerisi** | **L-a + G-3 + K-2:** root başına oturum kilidi (admission'dan CAS'a kadar), fan-out sürücüsü için ayrı global kilit, iki-int anahtar; kilit bağlantısı kaybı = run **durur** (bir sonraki migration başlamaz) |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | "Data-plane advisory lock portu" — `data-plane/ports/lock.port.ts` (+spec: sahte bağlantı), pooler teyidi (Q-DP14 ile birlikte) |

### T4 — Migration ledger'ın yeri (Q-DP11-d; Q-ID01 ilişkisi §1)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (ledger yeri); Q-ID01 ile ilişki §1 |
| **Mevcut kanıt** | Fan-out standardı §3.1: ledger `public` (öneri, TASK-027.26); TASK-027.32 `ledger` portu `(root, version)` benzersiz; **E1:** ledger ve DDL ayrı commit; registry `migrationVersion` public'te ayrı commit; DEC-0010 §9: takip için `migrationVersion` |
| **Seçenekler** | **L1** yalnızca `public` · **L2** yalnızca customer schema · **L3 bölünmüş:** uygulanmış-takip (sınıf 1) customer schema'da, run ledger (sınıf 2) `public`'te · **L4** ayrı metadata/`migration` schema'sı · **L5** staging schema (Q-ID01'in staging'i ile birleşik) |
| **Güvenlik etkisi** | L1: ledger DDL'den ayrı commit → (a) penceresi (E1); schema yedekten geri yüklenirse ledger/schema **ayrışır**. L2: takip DDL ile atomik ve schema ile birlikte yedeklenir/geri yüklenir. L4/L5: yeni schema + yetki + `drizzle-kit` `schemaFilter` yükü; ek kazanç yok |
| **Tenant izolasyonu etkisi** | L2/L3-sınıf1: takip **müşterinin schema sınırı içinde** (cross-customer sızıntı yok). Run ledger yalnızca root id, sürüm, checksum, sonuç içerir (PII yok) |
| **Operasyonel etkisi** | L2 tek başına platform görünürlüğünü kaybettirir (N schema taranmalı; PLATFORM_ROOT zaten okuyamaz, F5); L3 hem atomiklik hem görünürlük sağlar; run ledger tablosu küçüktür |
| **Geri dönüş maliyeti** | L1→L3 orta (takip tablosu eklenir, orkestratör `recordApplied`'ı executor'a taşır); L3→L1 orta; tablolar henüz yok → **şimdi ucuz, veri yazıldıktan sonra pahalı** |
| **AI2 önerisi** | **L3.** Sözleşme etkisi: `recordApplied` executor transaction'ının **içine** taşınır (orkestratör yalnızca `findApplied` okur) — bkz. §3 |
| **AI1/PO KARARI** | ☐ bekliyor (**bu karar verilmeden ledger/executor implementasyonu yapılmaz**) |
| **Karar sonrası task** | (1) Customer-schema takip tablosu tanımı + run ledger `public` tablosu (schema/migration task'ı — **bu task'ta oluşturulmadı**); (2) sözleşme revizyonu (T6/T9 ile birlikte) |

### T5 — Ledger retention ve PII içermeme kuralları (Q-DP11-e; Q-ID01 ilişkisi)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (retention/PII); Q-ID01 (retention) ile ilişki |
| **Mevcut kanıt** | Staging/retention önerisi (TASK-027.25 §5): ledger kalıcı/PII'siz, payload kısa ömürlü, süre PO; kontrat çıktıları schema adı/hata metni/secret içermez |
| **Seçenekler** | **Alanlar:** izinli = `customerRootTenantId`, `version`, `checksum`, `runId`, `mode`, sonuç/kategori kodu, zaman damgaları, sayaçlar, başlatan **servis kimliği adı** (kişi değil). Yasak = SQL metni, hata mesajı, bağlantı bilgisi, schema adı (root id'den türetilebilir; ledger'a gerek yok), kullanıcı/iş verisi, serbest metin. **Saklama:** sınıf 1 (takip) schema ömrü boyunca **kalıcı** (idempotency için zorunlu); sınıf 2 (run ledger) **PO süresi** |
| **Güvenlik etkisi** | Sabit alan listesiyle PII/secret girmesi tasarım gereği imkânsız; serbest metin alanı **eklenmez** |
| **Tenant izolasyonu etkisi** | Ledger satırları root id ile kapsamlı; run ledger yalnızca platform migration kimliğine açık |
| **Operasyonel etkisi** | Temizlik yetkisi yalnızca migration servis kimliği; tetikleyici PO kararı (F5: PLATFORM_ROOT data-plane'e ve bu ledger'a **yetkisizdir**) |
| **Geri dönüş maliyeti** | Süre kısaltmak kolay, uzatmak **silinmiş kayıt nedeniyle imkânsız** |
| **AI2 önerisi** | Yukarıdaki alan allowlist'i + "serbest metin yok" kuralı; sınıf 1 kalıcı; sınıf 2 süresi **"PO kararı gerekli" — sayı uydurulmadı** |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | Ledger tablo tanımı ile birlikte (T4); allowlist testi (DTO alan sabiti) |

### T6 — Executor transaction sınırı (Q-DP11-f)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (executor tx) |
| **Mevcut kanıt** | Port yorumu "migration başına transactional"; control-plane migrator **tüm bekleyenleri tek transaction**'da uygular (`session.transaction`); fan-out standardı: "schema başına tek transaction + advisory lock"; E1 |
| **Seçenekler** | **X1** migration başına transaction (DDL + takip kaydı + isteğe bağlı doğrulama, tek commit) · **X2** tüm bekleyenler tek transaction (control-plane modeli) · **X3** transaction dışı (deyim deyim) · **İstisna** `CREATE INDEX CONCURRENTLY` vb. transaction'da çalışmaz → `transactional: false` beyanı gerekir |
| **Güvenlik etkisi** | X1: kısmi migration görünmez (DDL PostgreSQL'de transaction'lı). X2: N. migration hatasında N−1'ler de geri alınır → sözleşmedeki **migration başına ilerleme/CAS modeliyle çelişir**. X3: kısmi şema (kabul edilemez, yalnızca beyanlı istisna) |
| **Tenant izolasyonu etkisi** | Executor yalnızca verilen `pgSchema` handle'ı ve doğrulanmış tek schema üzerinde çalışır; migration metni başka schema'ya başvuramaz (T7 lint) |
| **Operasyonel etkisi** | X2 uzun süre kilit tutar (müşteri tablolarında); X1 kilit süresini migration ile sınırlar. `lock_timeout`/`statement_timeout` değerleri **PO kararı gerekli (sayı yok)**. Transaction-pooling `[DOĞRULANAMADI]` (E8) `SET LOCAL` için engel olabilir |
| **Geri dönüş maliyeti** | X1↔X2 düşük (executor iç mantığı) |
| **AI2 önerisi** | **X1** varsayılan (DDL + takip kaydı aynı commit'te → E1(a) kapanır); beyanlı `transactional:false` istisnası **idempotent** yazılmak zorunda ve takip kaydı sonradan (atomik değil, açıkça işaretli) — istisnalar ayrı onay ister |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | "Data-plane executor" — `data-plane/ports/executor.port.ts` (+spec), transaction/timeout parametreleri (PO) |

### T7 — Migration tanımlarının kaynak konumu (Q-DP12-a)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP12 (kaynak) |
| **Mevcut kanıt** | `validateMigrationChain` tanımları dışarıdan alır (yerleşik liste **yok**); control-plane `drizzle/migrations` ayrıdır; Dockerfile `drizzle/`'i bütün olarak kopyalar (E6); DEC-0011: `search_path` yasak → nesneler schema-nitelikli olmalı; `drizzle-kit`'in çalışma-zamanı-değişken schema adı için üretimi `[DOĞRULANAMADI]` (çalıştırılmadı) |
| **Seçenekler** | **S1** `apps/api/drizzle/data-plane/NNNN_ad.sql` + **tek** yer tutucu (ör. `{{schema}}`), executor doğrulanmış adı `quoteIdentifier` ile yerine koyar · **S2** TypeScript modülleri (`up({ schema, tx })`, `sql.identifier`) · **S3** `drizzle-kit`'in yer tutucu schema'ya karşı ürettiği SQL + metin değiştirme · **S4** kod içi dizeler |
| **Güvenlik etkisi** | S1: metinsel değişim tek, doğrulanmış tanımlayıcı; CI lint: başka yer tutucu/`public.`/başka schema başvurusu yasak; kod çalıştırma yok. S2: rastgele kod çalıştırır, checksum kaynak/derleme ayrımı belirsiz. S3: değişimin kapsamı geniş, yanlış eşleşme riski. S4: incelenemez |
| **Tenant izolasyonu etkisi** | S1/S2: dosya schema-bağımsız, bağlama çalışma zamanında tek schema'ya |
| **Operasyonel etkisi** | S1: `drizzle/` zaten image'da (ek Dockerfile değişikliği yok); control-plane migrator'a karışmaz (test edilebilir); S2/S4 `src` içinde `.sql` kopyalama sorunu yok ama derleme gerekir |
| **Geri dönüş maliyeti** | Dosyalar henüz yok → şimdi ucuz; uygulanmış sürüm sonrası biçim değişimi pahalı (checksum değişir) |
| **AI2 önerisi** | **S1** — `apps/api/drizzle/data-plane/` (control-plane'den ayrı), forward-only, sürüm = dosya adı öneki |
| **AI1/PO KARARI** | ☐ bekliyor (**karar ve T8 verilmeden gerçek migration dosyası oluşturulmaz**) |
| **Karar sonrası task** | "Data-plane migration kaynak/yükleyici" — dosya okuyucu + doğrulayıcı (`data-plane/migration-source.ts`), lint testi; **ilk migration dosyası ayrı ve sonra** |

### T8 — Checksum üretim ve değişiklik politikası (Q-DP12-b)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP12 (checksum) |
| **Mevcut kanıt** | Kontrat: farklı checksum → `CHECKSUM_MISMATCH`, üzerine yazma yok; drizzle hash = `sha256(ham içerik)` (E2); `.gitattributes` yok |
| **Seçenekler** | **C1** çalışma zamanında dosyadan `sha256(LF-normalize edilmiş bayt)` · **C2** commit'li manifest (`versiyon→checksum`) + birim/CI testi dosyalarla eşleşmeyi doğrular, çalışma zamanı yine hesaplar ve ledger ile karşılaştırır · **C3** normalizasyonsuz ham (drizzle deseni) |
| **Güvenlik etkisi** | Uygulanmış sürüm **değişmez**; değişiklik = **yeni, daha yüksek sürüm**; "checksum onarma" aracı **yoktur** (ayrıcalıklı eylem olurdu — istenirse ayrı karar). C3'te CRLF/LF farkı sahte `CHECKSUM_MISMATCH` (yanlış BLOCKED) üretir |
| **Tenant izolasyonu etkisi** | Etkisiz (checksum içerik özeti) |
| **Operasyonel etkisi** | C2 yayın öncesi düzenlemeyi CI'da yakalar (yayınlanmış bir sürümün dosyası değişirse test kırılır); `.gitattributes` (`drizzle/data-plane/** text eol=lf`) gerekir |
| **Geri dönüş maliyeti** | Politika değişimi mevcut checksum'ları geçersizleştirebilir → uygulanmadan önce karar ucuz |
| **AI2 önerisi** | **C2** (LF normalizasyonlu sha256, manifest + test, çalışma zamanı doğrulaması) + `.gitattributes`; uygulanmış sürüm değişmezliği + "düzeltme = yeni sürüm" |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | T7 task'ıyla birlikte (`checksum` yardımcı + manifest testi); `.gitattributes` |

### T9 — `VERIFY` aşaması runner sözleşmesine eklensin mi (Q-DP11-g)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP11 (VERIFY) |
| **Mevcut kanıt** | Fan-out standardı §2: APPLY → **VERIFY** → FINALIZE, registry sürümü **yalnızca VERIFY başarılıysa** güncellenir; mevcut orkestratör her migration sonrası doğrudan CAS yapar, VERIFY yok (TASK-027.32 raporunda bildirilmişti) |
| **Seçenekler** | **V1** ayrı VERIFY yok (X1 atomikliği + takip kaydı yeterli) · **V2** migration-içi doğrulama (beklenen nesneler için tx içi assertion, commit öncesi) · **V3** ayrı salt-okuma VERIFY aşaması/portu (CAS'tan önce): takip kaydı var ve checksum eşit, schema hâlâ mevcut · **V2+V3** |
| **Güvenlik etkisi** | VERIFY başarısızken registry sürümü **ilerlemez** (yanlış "sağlıklı" işaretlenmez); V1'de tx başarılı ama beklenmeyen durum sessiz kalabilir |
| **Tenant izolasyonu etkisi** | Salt-okuma, tek schema |
| **Operasyonel etkisi** | Yeniden çalıştırmada takip kaydı "uygulandı" ise executor atlanır, **yalnızca VERIFY yeniden çalışır** (idempotent toparlanma) |
| **Geri dönüş maliyeti** | Kontrat değişikliği + test; henüz gerçek port yok → **şimdi ucuz** |
| **AI2 önerisi** | **V3** (fan-out standardıyla hizalı) — bkz. §4 sözleşme etkisi; V2 migration'a özgü, sonradan eklenebilir |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | Sözleşme revizyonu (`verifier` portu, `VERIFY_FAILED`, sıra), test güncellemeleri |

### T10 — UUID customer-root zorunluluğu (Q-DP12-c)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP12 (UUID) |
| **Mevcut kanıt** | E7: id'ler `generateId()` UUID; açık id ile tenant ekleme bulunamadı; gerçek DB satırları `[DOĞRULANAMADI]`; kontrat UUID dışını reddeder (wildcard/`all`/ad) |
| **Seçenekler** | **U1** katı UUID (mevcut) · **U2** güvenli karakter kümesi + ayrılmış sözcük yasak listesi · **U3** biçim kuralı yok, yalnızca varlık (tenant+registry) · **U4** UUID + açıkça listelenmiş eski-id istisnası |
| **Güvenlik etkisi** | U1 en katı: belirsiz kapsam anahtarları biçimden dolayı imkânsız. U2/U3 yasak listesi/varlık kontrolüne güvenir (zayıf). U4 istisna listesi ayrıcalıklı veri olur |
| **Tenant izolasyonu etkisi** | Parmak izi (`sha256(id)`) id dizgisinden türer; biçim kuralı schema adı üretimini değiştirmez |
| **Operasyonel etkisi** | UUID dışı meşru id varsa runner **fail-closed** reddeder (operasyonel, güvenlik değil) |
| **Geri dönüş maliyeti** | Düşük (kural gevşetmek kolay, sıkılaştırmak eski id'ler varsa zor) |
| **AI2 önerisi** | **U1 + hedef ortamda salt-okuma preflight** (tüm `ROOT` tenant id'leri UUID mi? yalnızca rapor); UUID dışı bulunursa U4'ü ayrı karar olarak aç |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | Preflight raporu (salt-okuma) — tenant/DB erişimi ister (bu task'ta yapılmadı) |

### T11 — Fan-out runner: tetikleyici, yetki, çalışma modeli (Q-DP02 data-plane)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP02 (data-plane ayrıntıları) |
| **Mevcut kanıt** | Control-plane: ayrı `migrate` işi + Environment onayı + `cancel-in-progress:false` (TASK-027.30); data-plane runner tek explicit root ile çalışır, discovery/wildcard **yoktur** (TASK-027.32); fan-out standardı canary/halt/onay noktaları; **bugün data-plane migration'ı yok** → her fan-out `NOOP` olurdu |
| **Seçenekler** | **F1** yönetici CLI (elle) · **F2** ayrı pipeline işi (Environment onayı, `needs: migrate`) · **F3** zamanlanmış iş · **F4** startup — **reddedilir**. **Model:** sıralı (v1) vs sınırlı paralel; **sürücü** registry'den `ACTIVE` root'ları listeler ve **her root için runner'ı açık root ile ayrı çağırır** (runner'da wildcard yok; keşif sürücünün işi); dry-run raporu onay kapısı; canary root; halt politikası |
| **Güvenlik etkisi** | Yetki yalnızca data-plane migration DB kimliği; `isSystemAdmin`/`PLATFORM_ROOT`/`TENANT_ADMIN` yetki **değildir**; onay = mevcut GitHub Environment reviewer kapısı; F4 çok-replika yarışı + uygulama kimliğine DDL |
| **Tenant izolasyonu etkisi** | Per-root kilit/izolasyon korunur; bir müşterinin hatası diğerini otomatik durdurmaz (canary hariç); global kilit çift fan-out'u engeller |
| **Operasyonel etkisi** | İlk data-plane migration'ı gelene kadar pipeline'da **ölü adım** oluşur → sürücü/iş ancak ilk migration ile birlikte eklenmeli; canary boyutu, hata eşiği, retry sayısı, timeout **PO kararı gerekli (sayı yok)** |
| **Geri dönüş maliyeti** | Tetikleyici değişimi düşük (aynı sürücü); ölü adım eklemek/kaldırmak düşük |
| **AI2 önerisi** | **F2** (+ **F1** acil durum), sıralı v1, dry-run→onay→canary→kalanlar, **ilk data-plane migration'ı ile birlikte** uygulanır; startup yok; runner kimliği T12'deki data-plane migration kimliği |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | "Fan-out sürücüsü + pipeline data-plane migration işi" (T1–T9 kararlarından sonra; ilk migration ile) |

### T12 — Control-plane ve data-plane DB kimliklerinin ayrımı (Q-DP02/Q-DP05 ilişkisi)
| Alan | İçerik |
|---|---|
| **Soru ID** | Q-DP02 (kimlik), Q-DP05 ile ilişki (DB rol/RLS — **kapatılmadı**), yeni Q-DP13 |
| **Mevcut kanıt** | Tek kimlik (uygulama = migration, TASK-027.29 §9); `MIGRATION_DATABASE_URL` yalnızca **öneri**, hiçbir kod okumaz; provizyon `CREATE SCHEMA` uygulama kimliğiyle (E9); `DbService` tek havuz (E5) |
| **Seçenekler** | **I1** tek kimlik (bugün) · **I2** iki kimlik: uygulama (DML) ↔ migration (DDL, iki düzlem) · **I3** üç kimlik: uygulama (DML), control-plane migration (DDL `public`), data-plane migration (DDL `cust_*` + registry sürüm yazımı) · **I4** müşteri başına rol (Q-DP05 H2) |
| **Güvenlik etkisi** | I1: uygulama kimliği DDL yetkili (bugünkü açık). I2/I3: uygulama SQL enjeksiyonu DDL'e dönüşemez. I3 data-plane kimliğini `public` DDL'inden ayırır (en az yetki). I4 cross-customer sınırı DB ayrıcalığına iner |
| **Tenant izolasyonu etkisi** | I2/I3 tek başına cross-customer ayrıcalık sınırı **getirmez** (data-plane kimliği tüm `cust_*` schema'lara yetkili) — bu yalnızca I4/H2'de; kimlik ayrımı **uygulama** yüzeyini daraltır |
| **Operasyonel etkisi** | Ek secret/env adı ve yetki yönetimi; **schema sahipliği ve provizyon kimliği** kararı gerekir (yeni schema'lar migration kimliği tarafından mı oluşturulacak, yoksa uygulama kimliği oluşturup `ALTER … OWNER`/GRANT mı yapılacak) → Q-DP13; `DATABASE_URL` sözleşmesi (fail-fast) aynen geçerli |
| **Geri dönüş maliyeti** | I1→I3 orta (rol/GRANT, provizyon akışı, secret); I3→I1 yüksek değil ama güvenlik gerilemesi |
| **AI2 önerisi** | **I3 hedef**, **I2 ara adım olarak kabul edilebilir**; env adları önerisi: `MIGRATION_DATABASE_URL` (control-plane, mevcut öneri) ve `DATA_PLANE_MIGRATION_DATABASE_URL` (yeni **öneri**, hiçbir kod okumaz); rol/GRANT tasarımı Q-DP05 ile birlikte; **bu task'ta rol/kimlik oluşturulmadı** |
| **AI1/PO KARARI** | ☐ bekliyor |
| **Karar sonrası task** | "DB kimlik ayrımı" (Q-DP05 kararıyla): rol/GRANT, provizyon sahipliği (Q-DP13), pipeline secret'ları, `data-plane` port bağlantı çözümleyici |

---

## 3. Sözleşme etkisi — atomiklik ve pencere analizi (E1)

Mevcut sıra: `[executor.apply commit] → [ledger.recordApplied commit] → [registry CAS commit]`.

| Çökme noktası | Mevcut durum | T4=L3 + T6=X1 (öneri) sonrası |
|---|---|---|
| Executor commit'ten **sonra**, ledger'dan **önce** | Schema değişti, ledger yok → sonraki run aynı DDL'i yeniden dener (**tehlikeli pencere**) | **Pencere kapanır:** DDL + takip kaydı tek commit |
| Ledger'dan sonra, CAS'tan önce | Ledger var, registry geride → sonraki run `skipped` + CAS (**toparlanır**, test kanıtlı) | Aynı; takip tablosu customer schema'da, registry sürümü `public`'te: sürüm **takip tablosundan yeniden türetilebilir** (tanı: registry ≠ takip) |
| CAS reddedilir (`VERSION_CONFLICT`) | `FAILED` çıktı | Aynı |
| Yedekten geri yükleme (schema eski) | Ledger `public`'te kalır → schema ile **ayrışır** (E1 ek riski) | Takip schema ile birlikte geri yüklenir → tutarlı; registry sürümü ayrışması tanı ile yakalanır (`REGISTRY_INCONSISTENT`) |

**Orkestratör değişikliği (karar sonrası, şimdi yapılmadı):** `ledger.recordApplied` orkestratörden çıkar (executor'ın atomik biriminin parçası olur); orkestratör `findApplied` (okuma) ve `compareAndSetVersion` (V3 sonrası) ile devam eder; `ledger` portu ikiye ayrılır: **takip (customer schema)** ve **run ledger (public)**.

## 4. `VERIFY` aşamasının runner sözleşmesine etkisi (T9)

V3 seçilirse sözleşme değişir:
1. Yeni port `verifier.verify({ schema, migration }): Promise<{ ok: boolean; category?: string }>` (salt-okuma: takip kaydı var + checksum eşit + schema mevcut).
2. Yeni sonuç: `FAILED` kategorisi **`VERIFY_FAILED`** (registry sürümü **ilerlemez**, ledger'daki takip kaydı kalır).
3. Sıra: `executor (DDL+takip, tek commit)` → **`verifier`** → `registry.compareAndSetVersion`; yeniden çalıştırma: takip "uygulandı" → executor atlanır, **yalnızca verifier + CAS** yeniden çalışır.
4. DRY_RUN etkilenmez (verifier çağrılmaz). Yeni testler: verify başarısız → CAS çağrılmaz; verify idempotent tekrar; verify yalnızca okuma yapar (port'ta yazma yok).
V1 seçilirse sözleşme **değişmez**; V2 yalnızca executor portunun beklentisini genişletir (orkestratör değişmez).

## 5. Q-DP02 data-plane fan-out etkisi (özet)
- Runner tek explicit UUID root ile çalışır; **çok müşterili fan-out ayrı sürücü**dür ve her root için runner'ı ayrı çağırır (T11).
- Fan-out'un gerektirdiği önkoşullar: registry portu (T1), probe (T2), kilit (T3), takip/run ledger yeri (T4/T5), executor (T6), migration kaynağı/checksum (T7/T8), VERIFY (T9), UUID kuralı (T10), kimlik (T12).
- **Bugün data-plane migration'ı yok** → fan-out ölü olurdu; uygulama ilk gerçek data-plane migration'ıyla birlikte planlanmalı.
- **Sayısal parametreler (canary boyutu, hata eşiği, retry sayısı, timeout, retention süresi): "PO kararı gerekli", sayı uydurulmadı.**

## 6. Karar sonrası uygulama sırası (öneri; hiçbiri şimdi uygulanmadı)
1) T4/T5/T6/T9 kararları → sözleşme revizyonu (`recordApplied` taşınması, `verifier` portu) → 2) T7/T8 kararları → migration kaynak/checksum yükleyicisi (dosya yok) → 3) T12/Q-DP05/Q-DP13 → kimlik ayrımı →
4) T1/T2/T3 port implementasyonları (sahte havuzla birim testli; gerçek DB ayrı harness task'ı) → 5) T10 preflight → 6) ilk data-plane migration'ı (Vardiya öncesi/ile) → 7) T11 fan-out sürücüsü + pipeline işi.

## 7. AI1/PO Karar Formu (AI1/PO doldurur — AI2 doldurmaz)

| Konu | AI2 önerisi | **AI1/PO KARARI** |
|---|---|---|
| T1 Registry portu | B (migration kimliğiyle ince repository; koşullu tek `UPDATE`; status yazımı yok) | ☐ bekliyor |
| T2 Fiziksel probe | A `pg_namespace` parametreli (C prod PG teyidiyle); yalnızca runner/tanı | ☐ bekliyor |
| T3 Advisory lock | L-a + G-3 + K-2 (root başına oturum kilidi + fan-out global kilidi) | ☐ bekliyor |
| T4 Ledger yeri | **L3** (takip customer schema, run ledger public) | ☐ bekliyor |
| T5 Retention/PII | Alan allowlist'i, serbest metin yok; takip kalıcı; run ledger süresi PO | ☐ bekliyor |
| T6 Executor tx | X1 (migration başına tek commit: DDL + takip) | ☐ bekliyor |
| T7 Migration kaynağı | S1 (`apps/api/drizzle/data-plane/*.sql`, tek yer tutucu) | ☐ bekliyor |
| T8 Checksum | C2 (LF-normalize sha256 + manifest testi + `.gitattributes`; değişmezlik) | ☐ bekliyor |
| T9 VERIFY | V3 (ayrı salt-okuma stage, CAS'tan önce) | ☐ bekliyor |
| T10 UUID | U1 + salt-okuma preflight | ☐ bekliyor |
| T11 Fan-out | F2 (+F1 acil), sıralı v1, ilk migration ile birlikte; startup yok | ☐ bekliyor |
| T12 Kimlikler | I3 hedef (I2 ara); env adları öneri | ☐ bekliyor |

## 8. Açık blocker listesi
1) T4 (ledger yeri) kararı **implementasyonu engeller**; 2) T7/T8 kararı **gerçek migration dosyasını engeller**; 3) T12/Q-DP05/Q-DP13 **kimlik ayrımı ve provizyon sahipliği**; 4) pooler/PG sürümü teyidi (Q-DP14: E8); 5) UUID preflight için hedef DB erişimi (T10) **`[DOĞRULANAMADI]`**; 6) ilk data-plane migration'ı yok → fan-out/probe/executor için somut test hedefi yok; 7) gerçek PostgreSQL testi (harness, Q-DP11 port implementasyonları) ayrı task; 8) Q-DP01/03/04/09 açık (bu paket kapatmaz).

## 9. Teyit
`apps/`, `drizzle/`, `infra/`, Dockerfile, pipeline, DEC dosyaları değiştirilmedi; ledger/migration/schema/tablo/rol/permission/tenant oluşturulmadı; advisory lock kodu, probe implementasyonu, executor, fan-out job/CLI yazılmadı; gerçek PostgreSQL, secret, production verisi, Docker kullanılmadı;
Wave 2/3 ve Git commit/push yok. **Kapatılan soru yok.**
