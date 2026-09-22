# Migration Bağlantı Güvenliği Sınırı (Q-DP07 / TASK-027.28)

> **Güncel durum (TASK-027.29):** Bu belgenin §1–§7'si TASK-027.28 anındaki analiz/öneri kaydıdır (tarihsel; aşağıdaki "DEĞİŞTİRİLMEDİ" ifadesi o task için geçerliydi). AI1'in güvenlik kararı **uygulanmıştır**; güncel durum, kalanlar ve kimlik sınırı **§8–§9**'dadır.
> **Durum (TASK-027.28 anı): Karar/politika taslağı. Kod, `drizzle.config.ts`, `scripts/check-db.js`, `db.service.ts`, pipeline, Dockerfile DEĞİŞTİRİLMEDİ.**
> **Hiçbir gerçek bağlantı değeri (kullanıcı, parola, host, port, DB adı) bu belgeye veya teslim raporuna yazılmamıştır**; yalnızca "sabit bir geliştirme bağlantı dizesi vardır" olgusu kaydedilir.
> Gerçek DB'ye bağlanılmadı. AI2 öneri sunar; karar AI1/PO'dadır (§7 form boş). **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

---

## 1. Bağlantı kaynağı envanteri (kanıt: dosyalar)

| # | Yer | Davranış | Fallback | Not |
|---|---|---|---|---|
| **C1** | `apps/api/drizzle.config.ts` | `process.env.DATABASE_URL \|\| <sabit dev dizesi>` (`dbCredentials.url`) | **Var** (kod içi sabit dize, kimlik bilgisi içeriyor) | `drizzle-kit generate/migrate` bunu kullanır; env yoksa **sessizce** sabit hedefe bağlanır |
| **C2** | `apps/api/scripts/check-db.js` | Aynı `\|\|` fallback; hata çıktısında URL'i `replace(/:[^:@]+@/, ':****@')` ile maskeler | **Var** (C1 ile aynı sabit dize kopyası) | `db:migrate` öncesi bağlantı ön kontrolü; maskeleme **yalnızca çıktıda**, kaynakta sabit dize duruyor |
| **C3** | `apps/api/src/db/db.service.ts` | `new Pool({ connectionString: process.env.DATABASE_URL })` | **Kod fallback'i yok**; ancak `DATABASE_URL` tanımsızsa `pg` kütüphanesi `PG*` ortam değişkenleri/libpq varsayılanlarına düşer (yerel varsayılan hedef) → **sessiz yanlış hedef** ihtimali **[DOĞRULANAMADI]** (çalıştırma yok; `pg` davranışı bilinen kütüphane semantiğidir) | Uygulama çalışma zamanı |
| **C4** | Pipeline deploy adımı | `set -a; source "/opt/metnex/${ENV_NAME}/.env"; set +a` sonra `docker run --rm … -e DATABASE_URL="$DATABASE_URL" …` | Yok | (a) `source` **tüm** `.env` değişkenlerini runner kabuğuna aktarır (gereğinden geniş); (b) `-e DATABASE_URL="$DATABASE_URL"` biçimi değeri **komut satırı argümanı** olarak genişletir → runner host'unda süreç listesinde/`docker inspect`'te görünür olabilir; `-e DATABASE_URL` (değersiz, geçişli) biçimi değeri argv'ye koymaz (runbook §7 bu biçimi gösteriyor, pipeline farklı) |
| **C5** | `infra/docker/docker-compose.{dev-stack,swarm,test}.yml` | Uygulama servisine `DATABASE_URL: ${DATABASE_URL}` | Yok | Ortam değişkeni enjeksiyonu (compose değişken çözümlemesi) |
| **C6** | `dev.sh` | Geliştirme akışı: `pnpm --filter api db:migrate` | C1/C2'nin fallback'ine güvenebilir | Yerel; loopback hedef |
| **C7** | `apps/api/.env`, `infra/docker/.env` (yerel, `.gitignore`'da) | Yerel yapılandırma | — | Değerler **okunmadı**; commit'lenmez (gitignore) — ama **`.dockerignore` yok** (aşağıda S3) |

## 2. Bulgular (güvenlik hijyeni)

| # | Bulgu | Etki | Kanıt |
|---|---|---|---|
| **S1** | **Kaynak kodda sabit bağlantı dizesi (kimlik bilgisi dahil) iki dosyada** (C1, C2). Gitleaks adımı `--redact` çalışır ve **allowlist/özel yapılandırma yok**; varsayılan kuralların bu bağlantı dizesi biçimini yakalayıp yakalamadığı **[DOĞRULANAMADI]** | Kimlik bilgisi sürüm kontrolüne girebilir; yanlış ortamda sessiz varsayılana bağlanma (DDL) | `drizzle.config.ts`, `check-db.js`, `pipeline.yml:37` |
| **S2** | **Fallback yalnızca geliştirme amaçlı ama üretim guard'ı yok:** `NODE_ENV`/host kontrolü yok; `db:migrate` yolu image'da çalışmasa da (M1) `drizzle.config.ts` image'a kopyalanıyor → M2 kullanılırsa `DATABASE_URL` eksikliğinde **sabit dev hedefe** bağlanmayı deneyecek | Üretimde `DATABASE_URL` yanlış/eksik enjekte edilirse fail-fast yerine sessiz varsayılan | `Dockerfile:26`, `drizzle.config.ts` |
| **S3** | **`.dockerignore` yok** ve build stage `COPY . .` yapıyor; yerel `apps/api/.env` ve `infra/docker/.env` diskte mevcut. CI checkout'ta bu dosyalar bulunmaz (untracked), ancak **yerel/self-hosted `docker build` bağlamı** onları build katmanına alabilir (final stage yalnızca seçili yolları kopyaladığından **yayınlanan image'a girmez**, build cache katmanına girebilir) | Düşük-orta (yerel build) | `Dockerfile:14-16`, dizin listesi |
| **S4** | **Pipeline'da secret geniş kapsamlı `source` + argv genişletmesi** (C4) | Runner host'unda ek sızıntı yüzeyi; hedef: migration'a özel, yalnızca gerekli değişken | `pipeline.yml:246-263` |
| **S5** | **Docker/build loglarında kimlik bilgisi sızıntısı:** Dockerfile'da `ARG`/`ENV` ile secret **yok** (iyi); `set -x` **yok** (iyi, `grep`); Trivy taraması image'ı tarar. Migration kodu (yazılırsa) DB URL'i **loglamamalı**; `check-db.js` maskeleme deseni (`:****@`) yalnızca parola-biçimli URL'lerde çalışır, kullanıcı/host'u maskelemez | Log hijyeni kuralı gerekir | `Dockerfile`, `pipeline.yml`, `check-db.js` |
| **S6** | **Migration ve uygulama aynı DB kimliğini kullanıyor olabilir** (pipeline aynı `DATABASE_URL`'i geçirir; ayrı migration kimliği tanımı yok) → uygulama kimliği DDL yetkili | DDL yetkisi uygulama çalışma zamanında gereksiz açık (Q-DP05 hijyeni ile ilişkili) | `pipeline.yml`, `db.service.ts` |

## 3. Politika önerisi (Q-DP07; karar değil)

| Kural | İçerik |
|---|---|
| **P-1 Production fallback yasağı** | `NODE_ENV=production` veya hedef **loopback dışı** ise varsayılan bağlantı **kullanılmaz**; `DATABASE_URL` yoksa **fail-fast** (çıkış kodu ≠ 0, açıklayıcı ama değersiz mesaj) |
| **P-2 Geliştirme istisnası** | Fallback yalnızca **`NODE_ENV≠production` VE hedef host loopback** iken; aksi halde P-1. İstisna **tek bir paylaşılan yardımcıda** (C1, C2 ve gelecekteki giriş noktaları aynı kuralı kullanır) — iki kopya kural kayması yaratır |
| **P-3 Kaynakta sabit kimlik bilgisi yok** | Geliştirme değeri kaynak dosyalardan **kaldırılır**, `.env.example` / `dev.sh` (yerel üretim) üzerinden sağlanır; **karar ve eski değerin rotasyonu** AI1/PO (dev ortamı olduğundan etkisi düşük ama geçmişte commit'lenmişse tarihçe temizliği ayrı konu; bu depoda commit geçmişi **yok**) |
| **P-4 Uygulama fail-fast** | `db.service.ts` `DATABASE_URL` eksikse **başlangıçta hata** verir (kütüphane varsayılanına düşmez) |
| **P-5 CI/CD** | Pipeline `DATABASE_URL`'i **secret** olarak alır; geçişli biçim (`-e DATABASE_URL`) veya `--env-file` (dosya izinleri kısıtlı, kısa ömürlü) tercih edilir — argv'de değer yok; `source` yerine **yalnızca gereken değişken** (S4) |
| **P-6 Ayrı kimlikler** | Migration için **DDL yetkili ayrı DB kimliği**, uygulama için **DML-only** (Q-DP05 hijyeni); ikisi ayrı secret |
| **P-7 Log hijyeni** | Hiçbir giriş noktası URL'i/parolayı loglamaz; hata mesajlarında **host/DB adı da** yazılmaz (yalnızca "bağlantı başarısız" + hata sınıfı); mevcut maskeleme yeterli kabul edilmez |
| **P-8 `.dockerignore`** | `.env*`, `node_modules`, `.git`, build artefaktları hariç tutulur (S3); build bağlamında `.env` bulunmaz |
| **P-9 Tarama** | Gitleaks yapılandırması (bağlantı dizesi kuralı) doğrulanır; C1/C2 kaldırıldıktan sonra tarama temiz olmalı |
| **P-10 Rapor kuralı** | Hiçbir belge/log/rapor gerçek bağlantı değeri içermez; yalnızca "var/yok", dosya yolu ve satır aralığı |

**Riskler:** P-1/P-2 yerel akışları (dev.sh, `create-project.sh`) kırabilir (`.env` üretimi gerekir); P-3 kimlik bilgisi rotasyonu koordinasyon ister; P-6 ek secret yönetimi.
**Geri dönüş maliyeti:** düşük (yapılandırma/kod, veri etkisi yok); P-6 orta (DB rol yönetimi).
**Uygulanacak dosyalar (onay sonrası; şimdi uygulanmadı):** `apps/api/drizzle.config.ts`, `apps/api/scripts/check-db.js`, `apps/api/src/db/db.service.ts`, paylaşılan bağlantı çözümleyici (yeni), `dev.sh`, `.env.example`, `.dockerignore` (yeni), `.github/workflows/pipeline.yml`, `docs/runbooks/deployment.md`, `.gitleaks` yapılandırması (varsa yeni).

## 4. Ortam matrisi (öneri)

| Ortam | `DATABASE_URL` | Fallback | Hedef doğrulaması |
|---|---|---|---|
| Yerel geliştirme | Önerilir (`.env`) | **Yalnızca loopback + non-production** | Loopback |
| CI (test/build) | Gerekmiyor (bugün DB'ye bağlanan CI işi yok) | Yasak | — |
| CI migration artifact doğrulaması (öneri) | Geçici DB'ye özel secret | Yasak | Geçici/ephemeral host beklentisi |
| dev/test/prod deploy | **Zorunlu** (Environment secret) | **Yasak** | Ortam adı ↔ host uyumu (öneri) |
| Production | **Zorunlu**, migration kimliği ≠ uygulama kimliği | **Yasak** | Fail-fast |

## 5. Açık noktalar
- Kaynakta sabit değerin geçmişte başka yere kopyalanıp kopyalanmadığı: kanıt yok (git geçmişi yok) — **[DOĞRULANAMADI]**.
- Gitleaks'in bu biçimi yakalayıp yakalamadığı — **[DOĞRULANAMADI]** (tarama çalıştırılmadı).
- `pg` varsayılan davranışı (C3) yalnızca kütüphane semantiğine dayanır; çalıştırılarak doğrulanmadı.

## 6. Teyit
Bu belgede gerçek bağlantı değeri, parola, secret veya connection string **yoktur**; hiçbir dosya değiştirilmedi; gerçek DB'ye bağlanılmadı; migration çalıştırılmadı.

## 7. Karar Formu (AI1/PO doldurur — AI2 doldurmaz)

| Konu | AI2 önerisi | **AI1/PO KARARI** |
|---|---|---|
| Production fallback | Tamamen yasak, fail-fast (P-1) | ☐ bekliyor |
| Geliştirme istisnası | `NODE_ENV≠production` + loopback, tek paylaşılan yardımcı (P-2) | ☐ bekliyor |
| Kaynaktaki sabit dize | Kaldır; `.env.example`/`dev.sh` (P-3); rotasyon kararı AI1/PO | ☐ bekliyor |
| Uygulama fail-fast | Evet (P-4) | ☐ bekliyor |
| Pipeline secret enjeksiyonu | Geçişli/`--env-file`, dar kapsam (P-5) | ☐ bekliyor |
| Ayrı migration/uygulama DB kimliği | Evet (P-6; Q-DP05 ile birlikte) | ☐ bekliyor |
| `.dockerignore` | Ekle (P-8) | ☐ bekliyor |

---

## 8. TASK-027.29 Uygulama Durumu (2026-09-21)

AI1 güvenlik kararı (TASK-027.29 talimatı): **her ortamda `DATABASE_URL` zorunludur; sabit fallback yoktur; eksikse süreç fail-fast sonlanır; gerçek değer loglanmaz/raporlanmaz;
migration ve runtime için mümkünse ayrı DB kimliği.** Aşağıdaki maddeler bu karara göre uygulanmıştır. Bölüm 1–7 (analiz/öneri) tarihsel kayıt olarak korunmuştur; bu bölüm güncel durumu verir.

| Bulgu / Kural | Durum | Uygulama |
|---|---|---|
| **C1/S1** `drizzle.config.ts` sabit fallback | **Giderildi** | Fallback kaldırıldı; `requireDatabaseUrl()` (yeni `apps/api/src/db/database-url.ts`): boş → `DATABASE_URL is required`, biçim/protokol hatalı → `DATABASE_URL is invalid` (değer yankılanmaz). `drizzle-kit check` ile yükleme doğrulandı (DB'ye bağlanmadan) |
| **C2/S1** `check-db.js` sabit fallback | **Giderildi** | Fallback kaldırıldı; eksik/hatalı → `exit 1` + güvenli mesaj; `maskUrl` korundu (`:****@`); modül `require` edildiğinde yan etki yok (`dotenv` yalnızca çalıştırma yolunda) |
| **C3** `db.service.ts` `pg`/libpq varsayılanına düşme | **Giderildi** | `new Pool({ connectionString: requireDatabaseUrl() })`; `DATABASE_URL` yoksa **Pool oluşturulmadan** hata (uygulama açılışında fail-fast) |
| **C4/S4** pipeline geniş `source` | **Giderildi** (statik + yerel kabuk testi; runner'da çalıştırılamadı) | `source /opt/metnex/<env>/.env` ve `set -a` kaldırıldı; `scripts/ci/env-allowlist.sh` yalnızca **adı verilen** değişkenleri dosyayı çalıştırmadan okur; migration için yalnızca `DATABASE_URL`; `docker stack deploy` için compose dosyalarının interpolasyon değişkenlerinden türeyen açık allowlist (test bu senkronu doğrular) |
| **C4** `-e DATABASE_URL="$DATABASE_URL"` argv genişletmesi | **Giderildi** | `umask 077` ile özel geçici env-file (`--env-file`), `trap` + açık `rm -f` ile silinir; değer hiçbir komut satırına/echo'ya girmez |
| **S3/P-8** `.dockerignore` yok | **Giderildi** | Kök `.dockerignore`: `.env`, `.env.*`, `*.pem`, `*.key`, `*.crt`, `backup/`, `node_modules/`, `.git/`, `coverage/`, `dist/` (+ `**/` biçimleri, `.next/`, `.turbo/`); Dockerfile girdileri (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `apps/*`, `drizzle/`, `services/jasper-renderer/{pom.xml,src}`) dışlanmadığı testle doğrulandı; jasper Dockerfile yalnızca `pom.xml` ve `src` kopyalıyor |
| **P-4** uygulama fail-fast | **Giderildi** | Yukarıda (C3) |
| **S5/P-7** log hijyeni | **Kısmen** | Yeni kod değeri yazmaz (test kanıtlı); `check-db.js` bağlantı hatasında maskeli URL yazmaya devam eder (AI1: mevcut maskeleme korunur) |
| **S6/P-6** ayrı migration/runtime DB kimliği | **Belgelendi, uygulanmadı** | Bkz. §9 |
| **P-2** geliştirme loopback istisnası | **AI1 kararıyla geçersiz** | AI1: geliştirmede de `DATABASE_URL` zorunlu; sessiz localhost/default yok. Sağlayıcı: `./dev.sh` `apps/api/.env`'i (DATABASE_URL dahil) migration'dan önce yazar; `apps/api/.env.example` `DATABASE_URL` anahtarını içerir; `create-project.sh` `.env.example`'ı `.env`'e kopyalar |

### 8.1 Bilinen kalanlar (kabul edilmiş/rapora bağlı)
1. **`docker inspect` görünürlüğü:** `--env-file` değeri argv/süreç listesi/workflow loglarından çıkarır, ama migration container'ının `Config.Env`'i container ömrü boyunca `docker inspect` ile görünür (kısa ömürlü, `--rm`). Tam gizleme yalnızca dosya-bağlama (`*_FILE`) desenidir ve uygulama desteği gerektirir → **Q-DP09** (uygulanmadı).
2. **`docker stack deploy` interpolasyonu:** compose `${VAR}` değerleri servis tanımına (env) yazılır → `docker service inspect`'te görünür; bu mevcut tasarımdır ve bu task'ta değişmedi (yalnızca runner kabuğuna aktarılan secret kümesi allowlist'e daraltıldı).
3. **`.env` biçim varsayımı `[DOĞRULANAMADI]`:** sunucudaki `/opt/metnex/<env>/.env` docker-compose tarzı düz `KEY=VALUE` kabul edildi (tek çift tırnak soyulur; `$` genişletmesi, çok satırlı değer, satır-içi yorum **yok**). Eski `source` kabuk genişletmesine bağlı bir değer varsa literal aktarılır → **ilk dev deploy'unda doğrulanmalı**.
4. **Pipeline runner'da çalıştırılmadı** (Docker/runner/DB yok): statik testler + `env-allowlist.sh` yerel bash testleri kanıttır.
5. **`db:generate` da artık `DATABASE_URL` ister** (drizzle config yüklenirken); dev akışları `.env` sağlıyor. `[DOĞRULANAMADI]`: üçüncü taraf/CI'da `db:generate` kullanan başka akış olup olmadığı (bu depoda bulunamadı).

## 9. Kimlik sınırı (belgelendi; **hiçbir kimlik/parola oluşturulmadı**)

| Kimlik | Amaç | DDL yetkisi | Bu task'ta durum | Env adı (entegrasyon sınırı) |
|---|---|---|---|---|
| **Runtime uygulama DB kimliği** | API'nin çalışma zamanı sorguları | **Olmamalı** (yalnızca DML) — hedef | **Bugün tek kimlik**: uygulama ve migration aynı `DATABASE_URL`'i kullanıyor (pipeline aynı değeri geçiriyor); ayrım **yapılmadı** | `DATABASE_URL` (mevcut, uygulama) |
| **Control-plane migration DB kimliği** | `public` şema migration'ı | **Evet** (yalnızca bu kimlik) — hedef | **Oluşturulmadı**; migration entrypoint'i (Q-DP08) belirsiz | Öneri: `MIGRATION_DATABASE_URL` (ad **önerisidir**, henüz hiçbir kod/pipeline tarafından okunmuyor) |
| **Data-plane fan-out runner kimliği** | Müşteri-root schema migration'ı | **Evet**, yalnızca hedef schema'lar üzerinde (rol/GRANT tasarımı Q-DP05) — hedef | **Oluşturulmadı**; runner yok | Ayrı env adı (öneri; karar bekliyor) |
| **`isSystemAdmin` / `PLATFORM_ROOT` / `TENANT_ADMIN` kullanıcıları** | Uygulama-içi roller | **Hayır** — DB migration yetkisi **değildir**; hiçbir uygulama yolu migration/DDL çalıştırmaz | Değişmedi; bu roller runner yetkisi sayılmaz | — |

Geçiş notu: ayrı kimlik uygulanınca pipeline migration adımı `MIGRATION_DATABASE_URL`'i (yalnızca o) env-file'a yazar, uygulama servisi yalnızca `DATABASE_URL`'i alır; bu, Q-DP02/Q-DP05/Q-DP08 kararlarına bağlıdır ve bu task'ta **uygulanmadı**.
