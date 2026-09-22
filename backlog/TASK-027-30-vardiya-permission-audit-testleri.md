---
id: TASK-027.30
title: Control-Plane Migration Entrypoint ve Pipeline Migration Job
status: done
srs_refs: [FEAT-008, FEAT-022]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Vardiya permission audit testleri" placeholder'ıydı. AI1'in talimatıyla kapsam **control-plane migration entrypoint ve pipeline migration job**
> olarak yeniden tanımlandı; **Vardiya permission/audit testleri bu task'ta yapılmadı** (isSystemAdmin/PLATFORM_ROOT/fail-open testleri o task'a ait girdi olarak duruyor). Orijinal placeholder en altta tarihi kayıt olarak korunmuştur.
> Talimat dosya adı `TASK-027-30-control-plane-migration-entrypoint.md` idi; aynı ID için ikinci dosya açılmadı, mevcut dosya güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Uygulama task'ı — gerçek migration çalıştırılmadı, gerçek PostgreSQL bağlantısı açılmadı, Docker build/run yapılmadı.**

### Değişen dosyalar
| Dosya | Değişiklik |
|---|---|
| `apps/api/src/migrate.ts` (yeni) | Control-plane migration entrypoint: `requireDatabaseUrl()` fail-fast (eksik/hatalı → exit 1, bağlantısız); programatik `drizzle-orm/node-postgres/migrator`, `migrationsFolder = apps/api/drizzle/migrations`; başarı exit 0, migration/bağlantı/beklenmeyen hata exit 1; hata metninden URL/kullanıcı/parola/host temizlenir; oturum düzeyi `pg_try_advisory_lock` (alınamazsa exit 1); parametresiz (`process.argv` yok); HTTP/Nest yok; işlem sonunda `process.exit`; import'ta hiçbir şey çalışmaz (yalnızca `require.main === module`) |
| `apps/api/Dockerfile` | Build aşamasında `RUN test -f apps/api/dist/migrate.js` (artifact yoksa image build başarısız); CMD/startup değişmedi |
| `.github/workflows/pipeline.yml` | Yeni ayrı `migrate` işi; `deploy` `needs: [docker-build, scan, migrate]`; iş düzeyinde `concurrency: metnex-migration-<env>, cancel-in-progress: false`; `migrate` artifact'i veritabanına dokunmadan önce doğrular (`docker run --entrypoint test … -f apps/api/dist/migrate.js`, yoksa `::error::` + `exit 1`); secret allowlist + özel `--env-file` (TASK-027.29 yöntemi) `migrate` işine taşındı; deploy işinden migration kaldırıldı; workflow düzeyi `cancel-in-progress` yalnızca PR'larda `true` |
| `apps/api/src/migrate.spec.ts` (yeni) | 30 test |
| `docs/migration/METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md` | §7 (M4 çözüldü) |
| `docs/migration/METNEX_PIPELINE_MIGRATION_TRIGGER_DECISION_PACKAGE.md` | Başlık notu + §7 (AI1 kararları → uygulama karşılığı) |
| `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` | Append-only (Q-DP08, Q-DP02, Q-DP09) |

Migration dosyalarının içeriği değiştirilmedi; build sistemi/framework eklenmedi (mevcut `nest build`).

### Testler (30 yeni; gerçek DB yok)
Kaynak mevcut ve yalnızca izinli import'lar (migrator, `pg`, `node:path`, `database-url`); drizzle-kit yok; HTTP/Nest/listen yok; fan-out/`pgSchema`/data-plane/Vardiya/archive/identity/seed/provisioning/registry/tenant referansı yok; `process.argv` yok; `main.ts`/`app.module.ts` migrate'e referans vermez, CMD `main.js`;
migrator mock ile doğru klasörle çağrılır ve klasör+journal+SQL mevcut; `DATABASE_URL` yok/boş/hatalı/yanlış protokol → exit 1 ve Pool/migrator hiç çağrılmaz; migration hatası → exit 1, URL/kullanıcı/parola/host log'da yok; bağlantı hatası → exit 1; kilit alınamazsa exit 1; import'ta yan etki yok;
**gerçek derleme çıktısı** (`tsc -p tsconfig.build.json` geçici dizine): `migrate.js` beklenen yolda, yalnızca izinli `require`'lar, `DATABASE_URL` eksik/hatalı iken derlenmiş artifact exit 1 ve secret basmaz; Dockerfile build-stage guard'ı ve değişmeyen CMD;
pipeline: migration yalnızca `migrate` işinde ve parametresiz, `deploy` işinde yok; `migrate` `cancel-in-progress: false` env-bazlı grup, workflow düzeyinde push için iptal yok; artifact kontrolü DB adımından önce ve eksikse `exit 1`; `source .env`/`set -a`/`set -x`/argv secret/data-plane/kullanıcı-token terimleri yok;
`deploy` `needs` içinde `migrate`, `continue-on-error`/`always()`/`failure()` yok. `./scripts/check.sh --skip-docker` içindeki gerçek `nest build` `apps/api/dist/migrate.js`'i üretti.

### Q-DP02 / Q-DP08 / Q-DP09 durumu (ayrı rapor)
- **Q-DP08:** uygulandı (kaynak + build çıktısı + Dockerfile guard + pipeline eşlemesi); **kapanış AI1 onayına bağlı**.
- **Q-DP02:** **control-plane kısmı uygulandı**; **açık kalan:** data-plane fan-out tetikleyicisi/yetkisi, sayısal parametreler (PO), ayrı migration DB kimliği (`MIGRATION_DATABASE_URL` hiçbir kod tarafından okunmuyor). AI2 önerisi: control-plane kapsamı kapatılsın, kalanlar ayrı soru(lar)a devredilsin; karar AI1'de.
- **Q-DP09: AÇIK** (değişmedi): `--env-file` değeri `docker inspect`'te (`Config.Env`) görünür; stack deploy interpolasyonu değerleri servis tanımına yazar; `*_FILE` uygulanmadı.

### AI1'in bilmesi gereken yan etkiler ve doğrulanamayanlar
1. **Workflow düzeyi `cancel-in-progress` yalnızca PR'larda `true`** (aksi halde push'ta yeni run, çalışan migration'ı iptal ederdi); push'lar artık kuyruğa girer (ara run'lar atlanabilir).
2. **`migrate` ve `deploy` aynı Environment'ı kullanır → prod'da onay iki kez istenir.** "Onay korunur" kararı gereği ikisi bırakıldı; tek onay için `deploy`'dan `environment` kaldırılabilir (AI1 kararı).
3. Migration artık GHCR image'ıyla çalışır (önceden yerel registry'ye push sonrası); içerik aynı.
4. Ek savunma olarak DB advisory lock ve varsayılanlar (`max: 2`, 10 sn bağlantı zaman aşımı) eklendi — AI1 listesinde yoktu; "eşzamanlı çalışmama" kararına hizmet ediyor.
5. **Doğrulanamadı:** pipeline runner'da çalıştırılmadı; Docker image build/run yapılmadı (gerekçe: bu task'ta Docker/RAM kısıtı ve "gerçek migration çalıştırılmayacak"; kanıt statik Dockerfile testi + `nest build` çıktısı + derlenmiş artifact'in yerel çalıştırması); migrator'un gerçek DB'de uygulanması test edilmedi (mock);
   `.env` biçim varsayımı (TASK-027.29'dan) ilk dev deploy'unda doğrulanmalı; job düzeyi `concurrency` ifadesinin `needs` bağlamıyla GitHub'da kabulü statik olarak (dokümana göre) beklenen ama çalıştırılarak doğrulanmadı.
6. Doküman/artefakt borcu: `drizzle.config.ts` final image'da kalıyor (runtime'da kullanılmıyor); runbook `deployment.md` §6-7 ve `DB-METADATA-TEMPLATE.md` eski çalıştırıcıyı anlatıyor.

**Yapılmayanlar:** gerçek migration/PostgreSQL bağlantısı, Docker build/run, data-plane/fan-out/`pgSchema()`, tenant/schema provisioning, registry hardening (D1/D2/D10), Vardiya schema/repository/API, archive, identity apply, seed/mapping, DB role/RLS, `*_FILE` desteği, Vardiya permission/audit testleri, Wave 2/3, git commit/push.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (**38 suite / 401 test**; önceki 37/371 → +1 suite, +30 test), typecheck/lint/build temiz.

### Durum
`status: done` — control-plane migration entrypoint ve pipeline job implementation'ı AI1
tarafından onaylanmıştır. Data-plane/fan-out kararları bu task ile kapanmamıştır.

## AI1 Onay — 2026-09-21

TASK-027.30 teslimatı kapsamına uygun bulunarak onaylandı ve `done` olarak kapatıldı.
`apps/api/src/migrate.ts` programatik control-plane migrator olarak kabul edildi; fail-fast
DATABASE_URL kontrolü, URL redaction, advisory lock, import yan etkisizliği, Docker build
artifact guard'ı, ayrı migration job'ı, `deploy needs: migrate`, env-başına
`cancel-in-progress: false` ve 30 yeni test kabul edildi.

Q-DP08 **kapatıldı**: gerçek `src/migrate.ts` kaynağı, `dist/migrate.js` build çıktısı,
Docker guard'ı ve pipeline artifact eşlemesi mevcut. Q-DP02'nin yalnızca control-plane
kısmı kapatıldı; data-plane fan-out tetikleyicisi/yetkisi, sayısal parametreleri ve ayrı
migration DB kimliği açık kaldı. Q-DP09 açık risk olarak korunmuştur.

Gerçek migration, PostgreSQL bağlantısı ve Docker build/run yapılmadı. Data-plane/fan-out,
registry hardening, Vardiya işleri, archive read API, permission/audit testleri ve UI
oluşturulmadı.

---

# TASK-027.30: Vardiya permission audit testleri

## Amaç

Vardiya authorization, audit, isolation ve workflow testlerini oluştur.

## Wave ve bağımlılık

TASK-027.24; TASK-027.25; TASK-027.29

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
