# Migration Entrypoint Envanteri ve `dist/migrate.js` Provenance Analizi (TASK-027.28)

> **Durum: Salt-okuma kanıt analizi. Hiçbir migration çalıştırılmadı, gerçek DB'ye bağlanılmadı, `dist/migrate.js` oluşturulmadı,
> pipeline/Dockerfile/production kodu değiştirilmedi.** Kanıt bulunamayan yerde `[DOĞRULANAMADI]` yazılmıştır. AI2 hiçbir soruyu
> kapatmaz (Q-DP02/Q-DP07/Q-DP08 açık). **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

**İncelenen dosyalar:** `.github/workflows/pipeline.yml`, `apps/api/{Dockerfile,package.json,nest-cli.json,tsconfig.build.json,drizzle.config.ts,scripts/check-db.js}`,
`apps/api/src` (tam ağaç taraması), `apps/api/dist` (yerel derleme çıktısı), `apps/api/drizzle/`, `apps/api/node_modules/drizzle-orm` (migrator kaynağı), `package.json` (kök), `dev.sh`,
`scripts/{create-project.sh,extract-db-meta.sh,db/recreate-db-with-icu.sh}`, `infra/docker/*.yml`, `docs/runbooks/deployment.md`, `docs/decisions/DEC-0010/0011`, `docs/domain/DB-METADATA-TEMPLATE.md`.
**Git geçmişi kullanılamadı:** depo `master` üzerinde **hiç commit içermiyor** (`git log` boş) → dosya soyağacı/blame **[DOĞRULANAMADI]**.

---

## 1. Migration mekanizması envanteri

| # | Mekanizma | Kaynak | Build çıktısı | Runtime image'da? | Çalıştırdığı migration | Düzlem | Gerçekten çalıştırılabilir mi | Secret/bağlantı kaynağı | Dry-run / rollback |
|---|---|---|---|---|---|---|---|---|---|
| **M1** | `pnpm --filter api db:migrate` (`node scripts/check-db.js && drizzle-kit migrate`) | `package.json:15`, `scripts/check-db.js` | — (script) | **Hayır:** final stage'de `pnpm` yok (corepack yalnızca build stage'lerde), `apps/api/scripts/` kopyalanmıyor | `apps/api/drizzle/migrations/*.sql` (3 dosya + journal) | Control-plane (`public`) | **Geliştirme host'unda evet** (dev.sh kullanır); **image içinde hayır** | `DATABASE_URL` ya da **kod içi sabit dev fallback** (`check-db.js`, `drizzle.config.ts`) | Dry-run yok; rollback yok (forward-only, down-migration yok) |
| **M2** | `drizzle-kit migrate` doğrudan | `drizzle.config.ts` | — | Config + `drizzle/` kopyalanıyor; `drizzle-kit` ikilisinin image'da bulunması **[DOĞRULANAMADI]** (`deps` aşaması `--prod` kullanmıyor ve `node_modules` olduğu gibi kopyalanıyor → devDependency'nin gelmesi olası ama image build edilmedi) | M1 ile aynı | Control-plane | **Doğrulanamadı** (image build/çalıştırma yasak) | `drizzle.config.ts`: `DATABASE_URL` **veya sabit fallback** | Dry-run yok; rollback yok |
| **M3** | Programatik Drizzle migrator (`drizzle-orm/node-postgres/migrator`) | **Uygulamada yok** (kütüphane `drizzle-orm`, runtime dependency olarak mevcut) | — | Kütüphane image'da (dependency) | (uygulanmadı) | — | **Uygulama yok** | — | Migrator tüm bekleyenleri **tek transaction** içinde uygular (kaynak: `pg-core/dialect.js` `session.transaction`); takip tablosu varsayılan `drizzle.__drizzle_migrations` — **M1/M2 ile aynı tablo** (uyumlu) |
| **M4** | `node apps/api/dist/migrate.js` | **Kaynak yok** (`apps/api/src` taranmış: `migrate.*` yok) | **Yok** (`apps/api/dist` içinde `migrate*` yok) | **Hayır** (`Dockerfile` yalnızca `dist/`, `drizzle/`, `drizzle.config.ts`, `package.json` kopyalar; `dist` derlemede oluşmaz) | Runbook'a göre `packages/db/migrations/*.sql` + `platform._migration_log` (**mevcut değil**) | Bilinmiyor | **Hayır** (Node "Cannot find module" beklenir; çalıştırılmadı **[DOĞRULANAMADI]**) | Pipeline: `source /opt/metnex/<env>/.env` → `docker run -e DATABASE_URL="$DATABASE_URL"` | Tanımsız |
| **M5** | Data-plane fan-out runner | **Yok** (yalnızca tasarım belgeleri) | Yok | Yok | — | Data-plane | **Hayır** | — | Standart belgede (uygulanmadı) |
| **M6** | Identity migration CLI (`migrate:identity:dry-run`, `migrate:identity:reconcile`) | `src/migration/botc-identity/cli/*` | `dist/migration/botc-identity/cli/*.js` (yerel dist'te mevcut) | **Evet** (`dist/` kopyalanıyor) | **Şema migration'ı DEĞİL:** in-memory kimlik dry-run/uzlaştırma; DB'ye bağlanmaz, `--apply` yok | Identity (Wave 1), veri düzlemiyle ilgisiz | Evet (girdi dosyasıyla) | Yok (bağlantı kullanmaz) | Dry-run doğası gereği; rollback yok (kalıcı state üretmez) |
| **M7** | Pipeline deploy adımı | `pipeline.yml:217-` | — | — | M4'ü çağırır, sonra `docker stack deploy` | Control-plane | **Bugün migration satırı başarısız olmalı** (§2.1) | `/opt/metnex/<env>/.env` (self-hosted runner) | Yok; `set -euo pipefail` (hata → deploy durur) |
| **M8** | Docker image build/runtime | `apps/api/Dockerfile` | `nest build` → `dist/` | — | **Startup'ta migration YOK** (`main.js` başlar; `src/main.ts`'te migrate referansı yok) | — | Evet (uygulama) | Uygulama `DATABASE_URL` (fallback'siz, `db.service.ts`) | — |
| **M9** | `dev.sh` | `dev.sh:495-508` | — | — | **Her çalıştırmada** `db:generate` **sonra** `db:migrate` | Control-plane (dev) | Evet (dev host) | M1 | `db:generate` şema farkı varsa **yeni migration dosyası üretir** (sessiz artifact üretimi) |
| **M10** | Yardımcı script'ler | `scripts/db/recreate-db-with-icu.sh`, `scripts/extract-db-meta.sh`, `scripts/create-project.sh:271` (`pnpm db:migrate`) | — | — | `recreate-db…` `platform._migration_log` okur; `extract-db-meta` `packages/db/…` yollarını tarar | — | Bu tablo/dizin mevcut olmadığından **eski mimariye referans** | — | — |

**CI kapsamı:** `pipeline.yml` işleri: gizli-tarama (gitleaks), SCA, typecheck+lint, unit test, build, Docker build&push (Trivy), deploy. **Hiçbir CI işi migration'ı bir DB'ye karşı çalıştırmaz veya migration artifact'ini (journal ↔ klasör tutarlılığı) doğrulamaz.**

---

## 2. `dist/migrate.js` provenance analizi

| Soru | Kanıt | Sonuç |
|---|---|---|
| Tarihsel **Prisma** kalıntısı mı? | Prisma'nın migration komutu `prisma migrate deploy`'dur (DEC-0010 §9: "`prisma migrate deploy` against `public`, as today"); `migrate.js` Prisma ile üretilmez. Runbook §7 `migrate.js`'i **Prisma değil** özel bir SQL çalıştırıcı olarak tarif eder: "`platform._migration_log` tablosuyla … `packages/db/migrations/*.sql` alfabetik sırayla … idempotent (`IF NOT EXISTS`)" | **Prisma kalıntısı olduğuna dair kanıt yok.** En tutarlı okuma: **Prisma'dan da önceki, `packages/db` düzenine ait özel SQL migration çalıştırıcısı** kalıntısı. `packages/` dizini **yok**; ancak `scripts/extract-db-meta.sh` (`packages/db/migrations`, `packages/db/src/schema`), `scripts/db/recreate-db-with-icu.sh` (`platform._migration_log`) ve `DB-METADATA-TEMPLATE.md` aynı eski düzene atıf yapar. Hangi dönemden kaldığı **[DOĞRULANAMADI]** (git geçmişi yok) |
| Güncel kaynak karşılığı var mı? | `apps/api/src` tam taraması; kök `package.json`; repo genel `grep` | **Yok.** Runbook §7 anlatımının karşılığı (`platform._migration_log` tablosu) Drizzle şemasında da yok |
| Dockerfile neden üretmiyor? | Dockerfile yalnızca `pnpm --filter api build` (`nest build`, `sourceRoot: src`) çalıştırır; `migrate` için `src` girdisi yok. **Dikkat çekici:** final stage `drizzle/` klasörünü ve `drizzle.config.ts`'i kopyalar → DEC-0011 sonrası **drizzle-kit odaklı** bir uyarlama başlatılmış, ama pipeline/runbook güncellenmemiş görünüyor (**çıkarım**, kanıt: DEC-0011 "Removal" listesi pipeline/Dockerfile/runbook'tan söz etmez) | Üretilmiyor çünkü kaynak yok; Dockerfile'ın kısmi Drizzle uyarlaması pipeline'ı kapsamamış |
| Pipeline gerçekten buna ihtiyaç duyuyor mu? | Pipeline **bir** control-plane migration adımına ihtiyaç duyar (runbook: "Hata → `exit 1` → CD durur, stack güncellenmez"); **bu dosyaya** özgü bir gereksinim yok | Gereken şey **bir migration giriş noktasıdır**, `migrate.js` adı/formatı değil |
| Çağrı kaldırılırsa hangi yol? | Aday A: image içinde `drizzle-kit migrate` (M2 — ikili ve TS-config yükleme **[DOĞRULANAMADI]**, `pnpm`/`scripts/` image'da yok → `db:migrate` script'i **kullanılamaz**). Aday B: uygulama içi programatik migrator (M3) | Bkz. §4 (Sonuç) |
| Yeniden oluşturulacaksa framework/entrypoint? | Pipeline zaten `dist/migrate.js` yolunu bekliyor; `nest build` `src/migrate.ts`'i **aynı yola** derler (ek Dockerfile değişikliği gerekmez). Migrator `drizzle-orm` runtime dependency'sinde mevcut; takip tablosu M1/M2 ile **aynı** (`drizzle.__drizzle_migrations`) → dev'de `drizzle-kit` ile oluşturulan DB'lerle uyumlu | **AI2 önerisi (karar değil): M3** — Nest bootstrap'sız düz script (`drizzle-orm/node-postgres/migrator`), fail-fast `DATABASE_URL`. **Oluşturulmadı** |

### 2.1 Pipeline bugün çalıştırılabilir mi? (net ayrım)
- **Kodun gösterdiği:** Deploy adımı `set -euo pipefail` altında; image'da `dist/migrate.js` bulunmadığından `node …/migrate.js` **exit≠0** ile dönmeli ve **`docker stack deploy` çalışmadan iş başarısız olmalı**. Yani deploy yolu **sessizce ilerlemez, durur**.
- **Doğrulanamayanlar:** pipeline'ın hiç çalıştırılıp çalıştırılmadığı, hangi image'ın deploy edildiği, self-hosted runner'daki `/opt/metnex/<env>` durumu — **[DOĞRULANAMADI]** (çalıştırma/erişim yok; run geçmişi görülemez).
- **TASK-027.27 düzeltmesi (şeffaflık):** Hardening planı R8'de "kötü" senaryo olarak "üretim şeması geride kalır" da sayılmıştı. `set -euo pipefail` nedeniyle **pipeline yolunda** sessiz gerilik oluşmaz (deploy durur); sessiz gerilik riski yalnızca **pipeline dışı elle deploy** yollarında geçerlidir. Bu, R8'in önemini "deploy tıkanıklığı" yönünde yeniden çerçeveler (önem düzeyi Yüksek kalır: **deploy edilemiyor olabilir**).

## 3. Diğer provenance bulguları
- **P1** Runbook `deployment.md` §7 (satır ~95 ve ~424) ve `DB-METADATA-TEMPLATE.md` eski çalıştırıcıyı **hâlâ anlatıyor** → dokümantasyon eskimiş (DEC-0011 sonrası güncellenmemiş).
- **P2** `scripts/db/recreate-db-with-icu.sh` `platform._migration_log` okur; bu tablo Drizzle kurulumunda **yok** → script "okunamadı" uyarısı verir (yanlış negatif sağlık sinyali).
- **P3** `dev.sh` her çalıştırmada `db:generate` çağırıyor → istem dışı migration dosyası üretme riski (M9); bu task'ın kapsamı dışı, envanter notu.
- **P4** CI'da migration artifact doğrulaması yok (journal/klasör tutarlılığı, boş DB'ye uygulanabilirlik).
- **P5** Migration takibi: `drizzle.__drizzle_migrations` (kaynak: migrator kodu). Eski `platform._migration_log` **ile ilişkisi yok**; iki sistemin bir arada varlığı için kanıt bulunamadı.

## 4. Sonuç ve açık noktalar
- `dist/migrate.js`: **kaynaksız, üretilemez, image'da yok, çalıştırılamaz**; provenance = eski `packages/db` SQL-çalıştırıcı düzeninin pipeline/runbook'ta kalan referansı (Prisma değil, Drizzle değil); tam dönem **[DOĞRULANAMADI]**.
- Bugün doğrulanmış, çalışan tek control-plane yolu: **geliştirme host'unda M1** (DEC-0011 "live disposable Postgres run" doğrulaması yalnızca `drizzle-kit migrate` içindi).
- Karar gerektirenler: hedef giriş noktası (M2 vs M3), tetikleme modeli (Q-DP02 → `METNEX_PIPELINE_MIGRATION_TRIGGER_DECISION_PACKAGE.md`), bağlantı politikası (Q-DP07 → `METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md`), runbook güncellemesi.
- Bu belge **kod, pipeline, Dockerfile, runbook veya DEC değiştirmedi.**

## 5. Ek bulgu P6 (pipeline eşzamanlılık politikası)
`pipeline.yml` workflow düzeyinde `concurrency: { group: workflow-ref, cancel-in-progress: true }` tanımlar. Deploy işi (migration adımı dahil) aynı ref'e gelen **yeni bir push ile iptal edilebilir**.
Tek transaction'lı control-plane migrator'da bağlantı düşerse transaction geri alınır (kaynak: `session.transaction`), ancak `docker run --rm` container'ının ve ileride uzun/çok-schema fan-out'un yarıda kesilmesi **kontrolsüz kısmi durum** riskidir.
Öneri (karar değil): migration işi için ayrı, **env başına ve `cancel-in-progress: false`** bir `concurrency` grubu; fan-out'ta ayrıca DB advisory lock. `[DOĞRULANAMADI]`: iptalin çalışan container'a gerçek etkisi (çalıştırma yok).

## 6. TASK-027.29 Sonrası Güncel Durum (2026-09-21)

Yukarıdaki envanter tarihsel kayıttır; TASK-027.29 ile şu satırlar değişti (migration **giriş noktası** değişmedi):
- **M1/M2 (`db:migrate`, `drizzle-kit migrate`):** sabit fallback **kaldırıldı**; `DATABASE_URL` yoksa/hatalıysa `check-db.js` `exit 1`, `drizzle.config.ts` `DATABASE_URL is required|invalid` ile durur.
- **M7 (pipeline deploy adımı):** `source` + `-e DATABASE_URL="$DATABASE_URL"` kaldırıldı; `scripts/ci/env-allowlist.sh` + özel `--env-file`. **`node apps/api/dist/migrate.js` çağrısı BİLİNÇLİ OLARAK değişmedi** (Q-DP08 açık); `dist/migrate.js` oluşturulmadı.
- **M8/M-runtime:** `db.service.ts` `DATABASE_URL` yoksa Pool oluşturmadan fail-fast.
- Değişmeyenler: M4 kaynaksız/çalıştırılamaz, M5 yok, P6 (`cancel-in-progress: true`), P1–P5 (runbook/`_migration_log` kalıntıları, `dev.sh` `db:generate`, CI artifact doğrulaması yok).
- **Blocker (yeni entrypoint üretilmedi):** Pipeline migration adımı, hedef dosya olmadığı sürece hâlâ başarısız olacaktır; env-file geçişi bundan bağımsız hazırdır ve entrypoint kararı (Q-DP08) sonrası aynen kullanılabilir.

## 7. TASK-027.30 Sonrası Güncel Durum (2026-09-21) — M4 çözüldü

AI1 kararlarıyla **`dist/migrate.js` gerçek kaynaktan üretiliyor**: `apps/api/src/migrate.ts` → mevcut `nest build`/`tsc` → `apps/api/dist/migrate.js` (yeni araç/framework yok). Envanter satırlarının güncel durumu:

| # | Mekanizma | Önceki | Şimdi |
|---|---|---|---|
| **M4** | `node apps/api/dist/migrate.js` | Kaynaksız, dist'te yok, image'da yok, çalıştırılamaz | **Kaynak var** (`src/migrate.ts`), `nest build` çıktısında var (`check.sh` çalıştırmasında `apps/api/dist/migrate.js` doğrulandı), Dockerfile build aşamasında `RUN test -f apps/api/dist/migrate.js` ile zorunlu, final image `dist/`'i kopyaladığından içinde. **Gerçek migration ve Docker build/run çalıştırılmadı** |
| **M3** | Programatik Drizzle migrator | Uygulama yok | **Uygulandı** (`drizzle-orm/node-postgres/migrator`, `migrationsFolder = apps/api/drizzle/migrations`); takip tablosu drizzle-kit ile aynı (`drizzle.__drizzle_migrations`) |
| **M7** | Pipeline deploy adımı | Migration deploy adımının içinde, hedef yok | **Ayrı `migrate` işi**; `deploy` işi `needs: [docker-build, scan, migrate]` — migration başarısızsa deploy çalışmaz |
| **M8** | Runtime | Startup'ta migration yok | Değişmedi (CMD `main.js`; `main.ts`/`app.module.ts` migrate'e referans vermez — test kanıtlı) |
| **M1/M2** | `db:migrate`/`drizzle-kit migrate` | Dev host | Değişmedi (yalnızca geliştirme; runtime entrypoint değil) |

**Entrypoint davranışı:** parametresiz (`process.argv` okumaz), yalnızca control-plane; `DATABASE_URL` eksik/hatalı → exit 1, bağlantı denemeden; başarı → exit 0; migration/bağlantı/beklenmeyen hata → exit 1 (URL, kullanıcı, parola, host log'dan temizlenir); HTTP/Nest bootstrap yok; işlem bitince `process.exit`.
Ek savunma (AI1 listesinde yok, "eşzamanlı çalışmama" kararına hizmet eder): oturum düzeyi `pg_try_advisory_lock` — kilit alınamazsa exit 1 (bekleme yok). Ek uygulama varsayılanları: `max: 2` bağlantı (kilit + migrator), 10 sn bağlantı zaman aşımı (`check-db.js`'in 3 sn'sinden geniş; PO parametresi değil, kod sabiti).
Kalanlar: `drizzle.config.ts` hâlâ final image'a kopyalanıyor (artık runtime'da kullanılmıyor; kaldırma ayrı karar); runbook `deployment.md` §6-7 ve `DB-METADATA-TEMPLATE.md` hâlâ eski çalıştırıcıyı anlatıyor (bu task'ın teslim listesinde değildi → doküman borcu); P2–P5 açık.
