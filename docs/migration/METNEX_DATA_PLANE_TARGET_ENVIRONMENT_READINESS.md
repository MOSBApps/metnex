# Data-Plane Hedef Ortam ve PostgreSQL Readiness Evidence (TASK-027.34)

> **Durum: Yalnızca salt-okuma kanıt toplama. Hiçbir veri, schema, rol, yetki veya migration değişmedi. Kod/production yapılandırması değiştirilmedi.**
> Kanıtlar **yalnızca yerel dev PostgreSQL**'den alındı; **production'a bağlanılmadı** ve production bilgisi `[DOĞRULANAMADI]`. Bu belge hiçbir soruyu tek taraflı kapatmaz.
> **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

## 0. Yöntem ve güvenlik

| Konu | Uygulanan |
|---|---|
| Hedef | Yerel dev veritabanı (`metnex-postgres-dev`, `postgres:16-alpine`). Container **durmuş** bulundu (`Exited (255)`, Docker yeniden başlatması) → yalnızca bu mevcut container `docker start` ile başlatıldı, iş bitince `docker stop` ile durduruldu (silme/`down -v`/prune/reset/rename **yok**; diğer projelerin container'larına dokunulmadı; volume'lere dokunulmadı). Son durum: container `Exited (0)` (öncesi `255`; yalnızca çıkış kodu farkı) |
| Salt-okuma garantisi | Bağlantı `default_transaction_read_only=on` ile açıldı (oturumda `show transaction_read_only = on` doğrulandı); yalnızca `SELECT`/`SHOW`; `ALTER/CREATE/DROP/GRANT/REVOKE/UPDATE/DELETE`, migration, seed, advisory lock **alınmadı** |
| Kimlik bilgisi | Bağlantı dizesi `apps/api/.env`'den betikte okundu; **hiçbir yere yazılmadı/yazdırılmadı**; şifre malzemesi içeren katalog (`pg_authid`) **sorgulanmadı** (yalnızca `pg_roles`). Rapora: rol adları ve nitelikleri (metadata), şema **sayıları/biçim sonuçları**; **tenant adı/slug/kullanıcı verisi yazılmadı**; müşteri schema adları (yok) redakte biçimde raporlanırdı |
| Betikler | Kalıcı repo dosyası **oluşturulmadı** (scratchpad); kullanılan sorgu türleri **Ek A**'da (gizli değer içermez) |
| Erişim kapsamı | Yalnızca dev; production/test/dev-stack sunucuları için erişim yok |

## 1. Özet tablo — soru ilişkilendirmesi

| Konu | Sonuç (dev) | Güven | Prod'da doğrulanamayan | İlgili soru |
|---|---|---|---|---|
| 1 PG sürümü | **16.15** (`server_version_num 160015`, alpine/musl); infra compose da `postgres:16-alpine` | Yüksek (dev) | Prod'un gerçek sürüm/minor'ı | Q-DP14 |
| 2 Pooler | Dev'de **doğrudan bağlantı** (PgBouncer yok) | Yüksek (dev) | **Production** | Q-DP14, Q-DP11 |
| 3 `pg_namespace`/görünürlük | 8 namespace; `pg_namespace` PUBLIC-SELECT; `information_schema.schemata` yetkiye göre süzülür (görünüm tanımı kanıtlı) | Yüksek | Düşük yetkili rolde ampirik süzme | Q-DP11 |
| 4 Eski schema'lar | `platform`,`shared`,`customer_root` **var ama tamamen boş**; kodda **kullanım yok**; yalnızca eski script referansı | Yüksek (dev) | Prod'da içerik | Q-DP14 |
| 5 Customer schema adları | Dev'de **hiç customer schema yok** (0) → gerçek veride doğrulanamaz; **üretici gerçek ROOT id'si için uyumlu ad üretir** | Orta | Prod'daki mevcut schema'lar | Q-DP12/13 |
| 6 Tenant ID UUID | **2/2 UUID** (parent/root da) | Orta (n=2) | Prod tenant id'leri | Q-DP12 |
| 7 Schema sahipliği/owner | Tüm non-system schema'lar `metnex` sahipli; `public` = `pg_database_owner`; `public` tabloları 29/29 `metnex`; customer schema **yok** | Yüksek (mevcut) / düşük (customer) | Prod rolleri/sahiplik | Q-DP13 |
| 8 Kimlikler | **Tek rol `metnex`: superuser + BYPASSRLS + createrole + createdb + DB owner**; migration/fan-out kimliği **yok** | Yüksek (dev) | Prod'da ayrım var mı | Q-DP05, Q-DP13 |
| 9 Minimum salt-okuma yetkileri | `pg_namespace`/`pg_roles` PUBLIC `SELECT`, advisory-lock fonksiyonları PUBLIC `EXECUTE`, `to_regnamespace` mevcut; düşük yetkili rol **denenemedi** | Orta | Ampirik doğrulama | Q-DP11, Q-DP05 |
| 10 Dev↔prod farkları | Bkz. §11 | — | — | Q-DP14 |

## 2. Yeni ve öne çıkan bulgular (önceki paketlerde yoktu)

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **R-1** | **Dev DB'deki tek `ROOT` tenant'ın registry satırı ve customer schema'sı yok** (`customer_schema_registry` **0 satır**, `cust_*` **0 schema**); `tenant_closure` self-row'ları var. **Kod nedeni:** `TenantService.create` (admin tenant API'si), `parentId` yoksa `type='ROOT'` tenant açar (`tenant.service.ts`: `type = 'ROOT'`) ama **`CustomerSchemaRegistryService` enjekte etmez ve provizyon çağırmaz**; `ensureSchemaProvisioned`'ın tek çağıranı `SaasService.createCustomerTenant`'tır. ROOT'un hangi yolla oluşturulduğu `[DOĞRULANAMADI]` (çıkarım: registry yok ⇒ provizyon yolu çalışmadı) | SQL sayımları + `grep`/kod okuma | **Bu yolla açılan her ROOT tenant data-plane'e sessizce fail-closed kalır** (`resolve()` 403) ve kendiliğinden iyileşmez; Q-V20/D8 ve Q-DP04 (retry sahibi) ile ilişkili; **yeni Q-DP15** |
| **R-2** | **Uygulama kimliği = tek rol = superuser + `BYPASSRLS`**: RLS tasarımı (H2/H3) bu rolle **etkisiz**; rol ayrımı (I2/I3) için **yeni roller** gerekir (dev'de hiç yok); `membership`/`default ACL` satırı 0 | `pg_roles`, `pg_auth_members`, `pg_default_acl` | Q-DP05 için önkoşul: düşük yetkili uygulama rolü olmadan hiçbir RLS/yetki kanıtlanamaz |
| **R-3** | **`lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout` = 0 (sınırsız)**; `max_connections = 100` | `pg_settings` | Runner/executor zaman aşımlarını **kendisi** ayarlamak zorunda (sayılar PO kararı — uydurulmadı) |
| **R-4** | **`infra/docker/docker-compose.infra.yml` (sunucu altyapı compose'u) aynı `init-db.sql`'i `docker-entrypoint-initdb.d`'ye bağlar** ve yorum satırı üç eski schema'yı açıkça sayar → prod benzeri DB'lerde de **ilk başlatmada** bu schema'lar oluşmuş olmalı (prod'da `[DOĞRULANAMADI]`) | compose dosyaları | Q-DP14/T3 probe: bu adlar `assertCustomerSchemaName` ile zaten reddedilir |
| **R-5** | `drizzle` schema'sı (`__drizzle_migrations`, **3 uygulanmış migration** = repodaki 3 dosya) **control-plane migration takibi olarak mevcut**; `assertCustomerSchemaName('drizzle')` reddeder | `drizzle.__drizzle_migrations` sayımı | Data-plane takip tablosu (T4) `drizzle` schema'sını **kullanmamalı** (control-plane'e ait) |

## 3. Konu 1 — PostgreSQL sürümü
- **Kanıt:** `SELECT version()`, `SHOW server_version_num` → `PostgreSQL 16.15`, `160015`. Static: `docker-compose.dev.yml:20` ve `docker-compose.infra.yml:29` `postgres:16-alpine`.
- **Sonuç:** `to_regnamespace()` **mevcut** (`to_regnamespace('public') IS NOT NULL` = true); `pg_try_advisory_lock`, `pg_namespace`, `pg_roles` beklenen biçimde.
- **Güven:** Yüksek (dev). **Prod'da doğrulanamayan:** gerçek sürüm/minor; tag `16-alpine` yüzen etikettir (minor zamanla değişir).
- **Karar etkisi:** T2 probe: `pg_namespace` parametreli sorgu **veya** `to_regnamespace` PG16'da kullanılabilir (prod ≥ 9.5 varsayımı static olarak makul ama `[DOĞRULANAMADI]`).
- **Sonraki task:** Prod salt-okuma kanıt çalıştırması (bu belgenin Ek A sorguları, DB sahibi tarafından).

## 4. Konu 2 — Bağlantı havuzlayıcı/proxy
- **Kanıt (dev):** (a) 20 ardışık autocommit `SELECT pg_backend_pid()` → **1 farklı backend PID** (transaction-pooling olsaydı çoğunlukla değişirdi); (b) `pg_stat_activity` tek oturum; (c) sunucu istemci adresini **özel (Docker köprüsü)** sınıfında görüyor ve URL portu sunucu portundan farklı (host port yayınlama/NAT) — **proxy değil, port eşlemesi**; (d) repoda/compose dosyalarında `pgbouncer|pgpool|odyssey|supavisor` **hiç yok** (grep).
- **Sonuç:** Dev'de **doğrudan PostgreSQL bağlantısı**; havuzlama yok. (Uygulama tarafında yalnızca `pg` `Pool` var.)
- **Güven:** Yüksek (dev). **Prod'da doğrulanamayan:** production DB önüne proxy/pooler konup konmadığı (sunucu altyapısı repo dışı).
- **Karar etkisi (Q-DP11/T3, T6):** dev'de oturum düzeyi advisory lock ve `SET LOCAL` **çalışabilir**; prod için **aynı varsayım kanıtsız**. Öneri: runner başlangıcında **oturum bütünlüğü öz-testi** (aynı backend PID ardışık ifadelerde sabit mi) — pooler tespit edilirse runner başlamaz (karar AI1).
- **Sonraki task:** Prod salt-okuma kanıtı (aynı öz-test), Q-DP14 prod kısmı.

## 5. Konu 3 — `pg_namespace` ve schema görünürlüğü
- **Kanıt:** `SELECT … FROM pg_namespace`, `information_schema.schemata` sayımı, `pg_get_viewdef('information_schema.schemata')`, `pg_class.relacl` (katalog ACL'leri).
- **Sonuç:** 8 namespace (sistem: `pg_catalog`, `information_schema`, `pg_toast`; non-system: `customer_root`, `drizzle`, `platform`, `public`, `shared`). `pg_namespace` ve `pg_roles` ACL'i **`=r/…` (PUBLIC SELECT)**. `information_schema.schemata` görünümünün tanımı `pg_has_role`/`has_schema_privilege` süzgeci içerir → **düşük yetkili rolde sahibi olmadığı/yetkisiz olduğu schema'ları göstermez** (yanlış "schema yok" riski). Dev'de sayılar eşit (8=8) çünkü rol **superuser**.
- **Güven:** Yüksek (tanım/ACL), düşük (ampirik süzme — superuser ile gösterilemez; rol oluşturmak yasak).
- **Prod'da doğrulanamayan:** prod rolünün süzgeç etkisi.
- **Karar etkisi (Q-DP11/T2):** probe **`pg_namespace`** (veya `to_regnamespace`) kullanmalı, `information_schema.schemata` **kullanmamalı** — AI2 T2 önerisi (A) kanıtla desteklendi (karar AI1'de).
- **Sonraki task:** Geçici DB harness'inde düşük yetkili rolle ampirik doğrulama.

## 6. Konu 4 — Eski schema'lar (`platform`, `shared`, `customer_root`)
- **Kanıt:** `pg_class`/`pg_proc`/`pg_stat_user_tables` sayımları; kod ve script `grep`; compose mount.
- **Sonuç (dev):** üçü de **var, `metnex` sahipli, ACL varsayılan, içinde 0 ilişki (tablo/view/sequence/index) ve 0 fonksiyon** → **tamamen boş**. Kod tabanında (`apps/api/src`, `apps/web/src`, `infra`, `dev.sh`, `docs/domain|runbooks|security`) bu schema'lara **çalışma zamanı referansı yok**; Drizzle şeması yalnızca `public`. **Tek referans:** `scripts/db/recreate-db-with-icu.sh` `platform._migration_log` okur — bu tablo **dev'de yok** (script "okunamadı" uyarısı verir; Prisma öncesi eski düzen). Schema'lar `init-db.sql` (`docker-entrypoint-initdb.d`) ile oluşturuluyor (dev + infra compose).
- **Güven:** Yüksek (dev). **Prod'da doğrulanamayan:** içerik (prod'da bir dönem eski özel migration çalıştırıcı kullanıldıysa dolu olabilir — `dist/migrate.js` provenance bulgusuyla tutarlı olası senaryo, kanıt yok).
- **Karar etkisi (Q-DP14 alt kararı; kapatılmadı):** dev'de bunlar **ölü, zararsız**; data-plane adlandırması (`cust_…`) ile çakışmaz, `assertCustomerSchemaName` bunları reddeder. Kaldırılıp kaldırılmayacağı/`init-db.sql`'in güncellenmesi AI1 kararıdır (**yeni Q-DP16**).
- **Sonraki task:** (i) prod'da aynı sayım; (ii) karar sonrası `init-db.sql`/script temizliği.

## 7. Konu 5 — Customer schema adları
- **Kanıt:** `pg_namespace` (`cust_%`), `customer_schema_registry` satırları; ayrıca gerçek ROOT id'si üzerinden **yalnızca hesaplama** (yazma yok).
- **Sonuç:** **`cust_*` schema = 0, registry satırı = 0** → mevcut schema adlarının sözleşmeye uyumu **gerçek veride sınanamaz**. Registry↔fiziksel karşılaştırma (yok/yetim) **boş küme**. Üretici (`generateCustomerSchemaName`) gerçek ROOT tenant id'si + slug'ı için **uyumlu bir ad üretiyor** (`isCustomerSchemaName = true`, `schemaNameMatchesCustomerRoot = true`, uzunluk 18 ≤ 63, slug parçası yedek değil).
- **Güven:** Orta (üretici gerçek girdiyle çalışıyor; gerçek fiziksel schema'lar yok).
- **Prod'da doğrulanamayan:** prod'da mevcut customer schema'lar (varsa) adları/parmak izleri/registry eşleşmesi.
- **Karar etkisi (Q-DP12, Q-DP13):** biçim sözleşmesi bu ortamda **çelişkisiz**; fiziksel doğrulama yapılacak ilk gerçek schema'ya kadar ertelenir.
- **Sonraki task:** R-1 çözülünce (ROOT provizyonu) ilk gerçek schema üzerinde salt-okuma doğrulama.

## 8. Konu 6 — Tenant ID biçimi
- **Kanıt:** `tenants` üzerinde regex sayımı (`id`, `parentId`, `customerRootId`).
- **Sonuç:** toplam **2** (1 `PLATFORM_ROOT`, 1 `ROOT`); **2/2 UUID**, UUID dışı **0**; `parentId`/`customerRootId` UUID dışı **0**; `registry.customerRootTenantId` satırı yok.
- **Güven:** Orta — **örneklem çok küçük (n=2)**.
- **Prod'da doğrulanamayan:** prod tenant'larının id biçimi (elle eklenmiş/eski id'ler).
- **Karar etkisi (Q-DP12-c):** katı UUID kuralı (U1) **dev'de hiçbir tenant'ı dışlamaz**; kod tarafında da id'ler `generateId()` UUID (T10/E7). Prod preflight'ı kuralın tek kalan belirsizliği.
- **Sonraki task:** Prod salt-okuma UUID preflight'ı (yalnızca sayım, id yazdırmadan).

## 9. Konu 7 — Customer schema sahipliği ve owner rolü
- **Kanıt:** `pg_namespace.nspowner::regrole`, `pg_tables.tableowner`, `pg_database` sahibi, `pg_roles`.
- **Sonuç:** non-system schema'lar (`customer_root`, `drizzle`, `platform`, `shared`) **`metnex`** sahipli; `public` **`pg_database_owner`** (PG ≥ 15 varsayılanı); `public` içindeki 29 tablonun **29'u `metnex`** sahipli; DB sahibi `metnex`; **customer schema olmadığı için "customer schema sahibi" doğrudan gözlenemedi**.
- **Çıkarım (kanıt: kod + tek rol):** provizyon `CREATE SCHEMA`'yı uygulama havuzuyla çalıştırır ve dev'de tek rol var → yeni customer schema'ların sahibi **`metnex` (superuser)** olurdu (`[DOĞRULANAMADI]` gerçek schema ile).
- **Güven:** Yüksek (mevcut sahiplik), düşük (customer schema sahipliği).
- **Prod'da doğrulanamayan:** prod'da uygulama rolünün süper kullanıcı olup olmadığı, sahiplik.
- **Karar etkisi (Q-DP13):** ayrı migration kimliği için schema'ları **kimin oluşturacağı/sahipleneceği** kararı gerekir; superuser sahipliği ayrımı anlamsız kılar. **Bu task'ta sahiplik değiştirilmedi.**
- **Sonraki task:** Q-DP13 kararı → provizyon akışı/`ALTER … OWNER`/GRANT tasarımı (kodsuz karar önce).

## 10. Konu 8–9 — Kimlikler ve minimum salt-okuma yetkiler

### 10.1 Mevcut kimlikler (yalnızca metadata)
| Kimlik | Durum |
|---|---|
| Uygulama | `metnex` — **superuser, createdb, createrole, `BYPASSRLS`, login**; DB sahibi; `public` tablolarının sahibi |
| Control-plane migration | **Ayrı kimlik yok** (aynı `metnex`) |
| Data-plane migration / fan-out | **Yok** |
| Başka roller | **Yok** (`pg_roles`'ta `pg_*` dışında tek satır); üyelik 0; varsayılan ACL 0; `pg_stat_activity`'de tek oturum |
- **Güven:** Yüksek (dev). **Prod'da doğrulanamayan:** prod rol yapısı.
- **Karar etkisi (Q-DP05):** yukarıdaki R-2; **kimlik ayrımı (I2/I3) ve RLS için rol oluşturma gerekli** — bu task'ta **oluşturulmadı**.

### 10.2 Minimum salt-okuma yetkiler (kanıtlı / tasarım)
| İhtiyaç | Gerekli yetki | Kanıt | Durum |
|---|---|---|---|
| Fiziksel schema varlığı (`pg_namespace` / `to_regnamespace`) | Katalog okuma | `pg_namespace.relacl` = `{…,=r/…}` → **PUBLIC SELECT**; `to_regnamespace` mevcut | **Ek yetki gerekmez** (kanıtlı) |
| Sahip bilgisi | `pg_namespace.nspowner`, `pg_roles` | `pg_roles.relacl` PUBLIC SELECT | **Ek yetki gerekmez** (kanıtlı) |
| Advisory lock | Fonksiyon `EXECUTE` | `pg_try_advisory_lock` `proacl` = NULL (varsayılan PUBLIC EXECUTE) | **Ek yetki gerekmez** (kanıtlı) |
| Registry okuma | `SELECT` on `public.customer_schema_registry` | Tasarım | Migration kimliğine **GRANT gerekir** (henüz kimlik yok) |
| Registry sürüm CAS | Yalnızca `migrationVersion`/`updatedAt` sütunlarına `UPDATE` | Tasarım (sütun-düzeyi GRANT mümkün — `[DOĞRULANAMADI]` bu ortamda denenmedi) | GRANT gerekir |
| Customer schema DDL/takip tablosu | Schema üzerinde `USAGE`+`CREATE` (veya sahiplik) | Tasarım | Q-DP13'e bağlı |
| **Düşük yetkili rolde ampirik doğrulama** | — | Rol oluşturmak yasak | **`[DOĞRULANAMADI]`** — geçici DB harness'inde yapılmalı |

## 11. Konu 10 — Dev ↔ production doğrulanamayan farklar
| Alan | Dev (kanıtlı) | Prod (`[DOĞRULANAMADI]`) |
|---|---|---|
| PG sürümü | 16.15 | Etiket `16-alpine` (minor bilinmiyor) ya da yönetilen servis |
| Pooler/proxy | Yok (doğrudan) | Bilinmiyor |
| Roller | Tek superuser+BYPASSRLS | Bilinmiyor |
| Schema'lar | 3 eski boş + `drizzle` + `public` | `init-db.sql` ne zaman çalıştı/içerik? |
| Registry / customer schema | 0 / 0 | Bilinmiyor |
| Tenant sayısı/id biçimi | 2 / UUID | Bilinmiyor |
| Zaman aşımları | 0 (sınırsız) | Bilinmiyor (`ALTER ROLE/DATABASE SET` olabilir) |
| Locale/collation (DEC-0007) | Bu task'ta doğrulanmadı | Bilinmiyor |
| Ağ/`pg_hba`, TLS | Yerel Docker | Bilinmiyor |
| Uygulanmış migration | 3 (repo ile eşit) | Prod'da `dist/migrate.js` bulgusuyla (D9) belirsiz |

## 12. İlgili soruların durumu (hiçbiri kapatılmadı)
| Soru | Bu task'ın katkısı | Durum |
|---|---|---|
| **Q-DP14** | Dev: sürüm 16.15, doğrudan bağlantı, eski schema'lar boş ve kullanılmıyor. **Prod kısmı hâlâ doğrulanamıyor** | **Kısmen kanıtlandı, AÇIK (prod)** |
| **Q-DP13** | Mevcut sahiplik = tek superuser rol; customer schema yok; sahiplik değiştirilmedi | **AÇIK** |
| **Q-DP12** | Tenant id'leri dev'de UUID (n=2); üretici gerçek id ile uyumlu ad üretiyor | **AÇIK** (prod preflight) |
| **Q-DP11** | Probe için `pg_namespace` yeterli (PUBLIC SELECT); `information_schema` süzgeçli; lock için ek yetki gerekmez; dev'de oturum kilidi güvenli | **AÇIK** (prod pooler, düşük yetkili rol) |
| **Q-DP05** | Tek rol superuser+BYPASSRLS → RLS/kimlik ayrımı için rol oluşturma gerekli | **AÇIK** |
| **Q-ID01** | Bu task ledger/staging yerleşimini etkilemedi; `drizzle` schema'sı control-plane takibine ait (data-plane takibi orada tutulmamalı) | **AÇIK** |
**Yeni:** **Q-DP15** (ROOT tenant oluşturma yollarından yalnızca biri provizyon ediyor: `TenantService.create` etmiyor → registry/schema'sız ROOT), **Q-DP16** (eski `init-db.sql` schema'ları ve `platform._migration_log` script referansının akıbeti).

## 13. Önerilen sonraki task'lar (öneri; karar AI1'de)
1. **Karar:** Q-DP15 — ROOT oluşturma yollarında provizyon tutarlılığı (kodsuz karar → sonra küçük düzeltme task'ı).
2. **Salt-okuma prod kanıtı:** Ek A sorguları DB sahibi tarafından prod'da çalıştırılır (yalnızca sayım/biçim; kimlik yazdırmadan) → Q-DP14 prod kısmı, Q-DP12 preflight.
3. **Geçici DB harness (ephemeral):** düşük yetkili rol, `information_schema` süzme, sütun-düzeyi GRANT, pooler öz-testi — Q-DP05/Q-DP11 ampirik doğrulaması.
4. Q-DP13/Q-DP05 kararı → kimlik/sahiplik tasarımı.
5. Q-DP16 kararı → `init-db.sql`/script temizliği.

## 14. Teyit
Salt-okuma sorgular dışında hiçbir işlem yapılmadı; veri/schema/rol/yetki/owner/migration/seed değişmedi; production'a bağlanılmadı; secret/bağlantı dizesi/tenant adı-slug'ı rapora veya repoya yazılmadı; Docker'da yalnızca mevcut dev Postgres container'ı başlatılıp durduruldu;
silme/prune/`down -v`/reset yok; port/probe/ledger/executor/fan-out/Vardiya/RLS/rol/tenant seed yapılmadı; Wave 2/3 ve Git commit/push yok.

---

## Ek A — Kullanılan salt-okuma sorgu türleri (gizli değer içermez)
`SELECT version()`; `SHOW server_version_num|port|transaction_read_only`; `SELECT pg_backend_pid()` (×20, autocommit); `SELECT inet_client_addr()`; `SELECT … FROM pg_stat_activity GROUP BY usename, application_name`;
`SELECT nspname, nspowner::regrole, nspacl IS NULL FROM pg_namespace`; `SELECT count(*) FROM information_schema.schemata`; `SELECT pg_get_viewdef('information_schema.schemata'::regclass)`;
`SELECT relkind, count(*) FROM pg_class JOIN pg_namespace … WHERE nspname = $1 GROUP BY 1`; `SELECT … FROM pg_proc JOIN pg_namespace … WHERE nspname = $1`; `SELECT … FROM pg_stat_user_tables`; `SELECT tableowner, count(*) FROM pg_tables WHERE schemaname='public' GROUP BY 1`;
`SELECT … FROM customer_schema_registry`; `SELECT count(*) [FILTER (WHERE id ~* '<uuid-regex>')] FROM tenants`; `SELECT type, count(*) FROM tenants GROUP BY 1`; `SELECT count(*) FROM tenant_closure`;
`SELECT … FROM pg_roles WHERE rolname !~ '^pg_'`; `SELECT count(*) FROM pg_auth_members …`; `SELECT count(*) FROM pg_default_acl`; `SELECT pg_get_userbyid(datdba) = current_user FROM pg_database …`;
`SELECT relacl::text FROM pg_class WHERE oid = 'pg_catalog.pg_namespace'::regclass` (ve `pg_roles`); `SELECT has_table_privilege('pg_catalog.pg_namespace','SELECT')`; `SELECT proacl::text FROM pg_proc WHERE proname = 'pg_try_advisory_lock' AND pronargs = 1`;
`SELECT to_regnamespace('public') IS NOT NULL`; `SELECT name, setting FROM pg_settings WHERE name IN (…timeout/max_connections/isolation…)`; `SELECT count(*) FROM drizzle.__drizzle_migrations`; `SELECT tablename FROM pg_tables WHERE schemaname='public'`;
`SELECT type, status, "canEnterData", "canAggregateChildren", ("customerRootId" = id), "createdAt"::date FROM tenants` (ad/slug **seçilmedi**). Üretici doğrulaması: `dist/tenant-scope/schema-name.util.js` fonksiyonları gerçek ROOT id'sine **yerelde hesaplandı** (DB'ye yazılmadı).
