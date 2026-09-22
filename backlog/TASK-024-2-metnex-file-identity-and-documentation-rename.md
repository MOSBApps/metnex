---
id: TASK-024.2
title: Metnex dosya adları, ODC kimliği ve dokümantasyon rename
status: done
srs_refs: []
parent_epic: EPIC-003
updated_at: 2026-09-17
---

## AI1 Onayı (2026-09-17, final)

AI1, paraphrase temizliğini ve son tarama sonucunu inceleyip onayladı: kalan referanslar (kod/
servislerdeki henüz rename edilmemiş gerçek teknik yollar; script/infra/Docker/CI kapsamı;
cutover öncesi append-only PROGRESS_LOG.md geçmişi; gerçek filesystem yollarını açıklayan geçiş
referansları) TASK-024.2'nin kapsamı ve kod/servis rename kararının TASK-024.3'e bırakılmasıyla
uyumlu bulundu. Status `review` → `done`.

## AI2 Düzeltme Raporu (2026-09-17, AI1'in "onaylamıyorum" kararına yanıt)

AI1'in TASK-024.2 ilk teslimini reddetme kararı haklıydı — özellikle canlı runbook'ları ve
DISCOVERY.md/ODC.md/ODC_AI2_ONBOARDING_PROMPT.md'yi "henüz rename edilmemiş altyapıyla tutarlı
kalsın" gerekçesiyle atlamam, AI1'in "teknik repository, platform ve aktif dokümantasyon kimliği
tamamen Metnex olacaktır" kesin kararıyla uyumlu değildi. Aşağıdaki düzeltmeler uygulandı:

1. **`ODC.md`**: `name`/`slug` zaten Metnex'ti; kalan tek yer olan dogfooding notundaki
   (`create-project.sh`'ın kendi placeholder açıklaması) literal `EskiAd`/`eski-ad` string'i
   `Metnex`/`metnex`'e çevrildi; script'in kendi arama deseninin (kod) henüz değişmediğini
   belirten kısa bir not eklendi (bu, dokümantasyon kimliğinden ayrı bir kod-rename konusu).
2. **`docs/requirements/DISCOVERY.md`**: "Hedef Repository: eski-ad" → `metnex`. §8.1'deki
   çelişkili paragraf ("Metnex adı teknik repository/platform'ı değiştirmez") **AI1'in bu
   incelemedeki açık kararı doğrultusunda yeniden yazıldı** — artık isimlendirmenin ürün +
   teknik repository + platform foundation kimliğinin tamamını kapsadığını belirtiyor. "ESKI-AD
   platform foundation" ifadeleri Metnex'e çevrildi.
3. **`ODC_AI2_ONBOARDING_PROMPT.md`**: `repository doganzorlu/eski-ad` → `repository
   doganzorlu/metnex`.
4. **Aktif runbook'lar — tam metin rename'i uygulandı** (önceki "canlı altyapı, dokunma" kararı
   geri alındı): `docs/runbooks/{deployment,db-recreate-with-icu,db-collation-strategy,
   local-db-backup,reporting-foundation,AI_KEY_ROTATION_RUNBOOK,local-development,
   PRODUCT_OWNER_LIFECYCLE_PLAYBOOK,METNEX_LIFECYCLE_AND_STATUS_RUNBOOK}.md`,
   `docs/domain/DB_META.md`, `docs/domain/DOMAIN_MODEL.md` (`window.__ESKI-AD_API_URL__` dahil),
   `README.md` (kök). **Önemli operasyonel not:** bu runbook'lar artık `metnex-postgres-dev`,
   `metnex-api`, `/opt/metnex` gibi *hedef* isimlerle yazılıyor; ancak gerçek Docker
   container/network adları, PostgreSQL DB/user adı ve MinIO bucket'ları **henüz rename
   edilmedi** (Docker/DB/MinIO rename bu task'ın açık kapsam dışı maddeleri — ayrı bir infra
   task'ı gerektiriyor). Yani bu runbook'ları bugün birebir çalıştıran biri, gerçek altyapı
   rename edilene kadar `metnex-*` yerine hâlâ `eski-ad-*` komutları çalıştırmalıdır. Bu
   uyuşmazlık DEC-0013'te iki satırda açıkça not edildi (`eski-ad-api`/`eski-ad-web`'in "bu
   yazıldığı tarihte hâlâ" gerçek image adları olduğu belirtilerek) — bu istisna değil, gerçek
   sistem durumuna dair kaçınılmaz bir doğruluk notu.
5. **`backlog/TASK-022-{1..5,5-R1}.md`, `TASK-023-1-*.md`**: kalan tüm `eski-ad`/`ESKI-AD`
   geçişleri (docker komut/çıktı alıntıları dahil) Metnex'e çevrildi.

### Kalan dosya/klasör adları — neden hâlâ duruyor (madde 4 talebi)

| Yol | Neden rename edilmedi |
|---|---|
| `scripts/openmas-env-create.sh` | Bu bir **script dosyası** (kod), dokümantasyon değil. TASK-024.2'nin kendi başlığı "dosya adları, ODC kimliği **ve dokümantasyon**" — kapsam dışı listesinde script/kod rename'i açıkça yok ama örtük olarak "production kodu" ve "Docker/DB rename" ile aynı kategoride: bu script `.env` dosyalarını ve deployment secret'larını üretiyor, içeriği gerçek (henüz rename edilmemiş) altyapı değişkenlerine bağımlı. Dosya adını değiştirmek kod mantığını etkilemez ama script'in İÇERİĞİ hâlâ `POSTGRES_USER=openmas` gibi gerçek altyapı varsayılanları üretiyor — bu yüzden script rename'i, altyapı rename'iyle aynı task'ta ele alınmalı. |
| `services/jasper-renderer/src/{main,test}/java/com/openmas/` (2 klasör) | Bu, Maven `groupId: com.openmas`'a bağlı bir **Java package dizin yapısı**. Rename etmek yalnızca klasör taşımak değil, 24 `.java` dosyasının `package`/`import` satırlarının hepsinin senkron güncellenmesini ve `pom.xml`'in `groupId` değişikliğini gerektirir — bu bir **kod refactor'ü**, `apps/**` production koduyla aynı risk kategorisinde (derleme kırılması riski). TASK-024.2'nin yazılı kapsamı yalnızca "dosya adları, ODC kimliği ve dokümantasyon" — kod değişikliği açıkça hedeflenmiyor. |

Her iki kalem de **kapsam dışı bırakılmadı çünkü önemsiz görüldüğü için değil**, kod
değişikliği/derleme riski taşıdıkları için — bir sonraki kod/script rename task'ında (öneri:
TASK-024.3) ele alınmalı.

### AI1 kararı: 3. istisna yok — paraphrase temizliği (2026-09-17, 2. düzeltme turu)

AI1, önceki turda AI2'nin sunduğu açık soruyu (6 kendine-referans meta-dokümanın 3. onaylı
istisna mı sayılacağı, yoksa paraphrase mi edileceği) netleştirdi: **3. istisna oluşturulmaz**.
`docs/rename/METNEX_RENAME_INVENTORY.md`, `docs/rename/METNEX_HISTORICAL_REFERENCE_POLICY.md`,
bu dosyanın kendisi, `TASK-024-1-*.md`/`TASK-024-1-R1-*.md` ve
`docs/opendevcon/METNEX_STATE.md`'nin geçmiş anlatı paragrafları paraphrase edilerek temizlendi:
açıklama metinlerinde eski marka/slug artık literal yazılmıyor, `eski-ad`/`ESKI-AD`/`EskiAd`
placeholder'larıyla anılıyor. Yalnızca **gerçek tarama komutları** (`rg -c -i 'openmas|aiskeleton' ...`
gibi, tekrar üretilebilirlik için) ve `METNEX_RENAME_INVENTORY.md`'nin §9 Ek'indeki ham komut
çıktısı literal string'i korudu — bunlar açıklama metni değil, çalıştırılan/çalıştırılan
komutların kendisi. Onaylı istisnalar artık yalnızca ikisi: `PROGRESS_LOG.md`'nin cutover öncesi
geçmiş kayıtları ve immutable `AIS_DEMO_PACKAGE` migration literal'ı.

### Yeni tarama sonucu (2. düzeltme turu sonrası)

- `rg -c -i 'openmas|aiskeleton' ...` → kalan tüm dosyalar yalnızca şu kategorilerde: (1)
  `apps/**`, `services/**` (kod, kapsam dışı — Java package `com.openmas`, TASK-024.3'e
  bırakıldı), (2) `scripts/**` (özellikle `scripts/openmas-env-create.sh`, TASK-024.3'e
  bırakıldı), `dev.sh`, `infra/**`, `.github/**`, `package.json` (Docker/DB/CI, kapsam dışı),
  (3) `docs/opendevcon/PROGRESS_LOG.md` (onaylı istisna — cutover öncesi geçmiş), (4) yukarıdaki
  meta-dokümanların yalnızca gerçek komut/komut-çıktısı satırları (onaylı istisna değil, komutun
  kendisi). `AIS_DEMO_PACKAGE` zaten hiç kapsamda değildi (`AIS` prefix'i, `eski-ad` değil).
- Dosya/klasör adı taraması: yalnızca `scripts/openmas-env-create.sh` ve
  `services/jasper-renderer/src/{main,test}/java/com/openmas` kaldı (TASK-024.3'e bırakıldı,
  gerekçesi yukarıda).
- `./scripts/check.sh --skip-docker` → PASS (kod değişmedi, regresyon yok).

### Durum

`status: review` — paraphrase temizliği ve yeni tarama sonucu tamamlandı; nihai `done` kararı
AI1'e bırakıldı.

---

## AI2 Teslim Raporu (2026-09-17)

### Dosya rename'leri (8 dosya, tamamı uygulandı)

| Eski | Yeni |
|---|---|
| `docs/opendevcon/ESKI-AD_STATE.md` | `docs/opendevcon/METNEX_STATE.md` |
| `docs/project/ESKI-AD_DELIVERY.json` | `docs/project/METNEX_DELIVERY.json` |
| `docs/project/ESKI-AD_EXECUTION.json` | `docs/project/METNEX_EXECUTION.json` |
| `docs/project/ESKI-AD_PLAN.json` | `docs/project/METNEX_PLAN.json` |
| `docs/project/ESKI-AD_SCOPE.json` | `docs/project/METNEX_SCOPE.json` |
| `docs/project/ESKI-AD_TRACEABILITY.json` | `docs/project/METNEX_TRACEABILITY.json` |
| `docs/runbooks/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` | `docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` |
| `docs/decisions/DEC-0007-eski-ad-db-locale-and-collation.md` | `docs/decisions/DEC-0007-metnex-db-locale-and-collation.md` |

5 JSON dosyasının içeriğinde `"name": "EskiAd"` → `"name": "Metnex"`, `"slug": "eski-ad"` →
`"slug": "metnex"` güncellendi.

### ODC kimliği

- `ODC.md`: `name: "EskiAd"` → `"Metnex"`, `slug: "eski-ad"` → `"metnex"`.
- `ODC.md:178` (dogfooding notu — `create-project.sh`'ın kendi `EskiAd`/`eski-ad` placeholder
  pattern'ini açıklayan cümle) **bilerek değiştirilmedi**: bu, generator mekanizmasının kendi
  arama deseni, bu projenin markası değil (TASK-024.1'de "açık soru" olarak işaretlenmişti).
- `ODC_AI2_ONBOARDING_PROMPT.md`: proje adı `"EskiAd"` → `"Metnex"` güncellendi; `repository
  doganzorlu/eski-ad` referansı **bilerek değiştirilmedi** ve dosya içinde açık soru olarak not
  edildi — gerçek hedef repo adı bilinmediği için kör rename edilemez.

### Full metin rename uygulanan dosyalar (28 dosya, pure branding — canlı altyapı kimliği içermiyor)

`docs/AI_Governance/{AGENT-OPERATING-MODEL,AGENT_REGISTRY,DEPRECATED_MODULES,SDLC-CHECKLIST}.md`,
`docs/decisions/DEC-{0007,0008,0009,0012}-*.md` (tam), `docs/decisions/DEC-0013-*.md` (kısmi —
aşağıya bkz.), `docs/domain/DB-METADATA-TEMPLATE.md`, `docs/domain/DOMAIN_MODEL.md` (kısmi),
`docs/security/APPLICATION_SECURITY_ARCHITECTURE.md`, `docs/requirements/SRS.md`,
`docs/requirements/DISCOVERY.md` (kısmi — aşağıya bkz.), `docs/README.md`,
`docs/training/{quickstart-tenant-admin,TRAINING-SCENARIOS,USER-MANUAL-TR}.md`,
`docs/ui-contract/**/*.md` (16 dosya).

`DEPRECATED_MODULES.md`'deki `demo.admin@eski-ad.local` → `demo.admin@metnex.local` güncellendi
(sentetik placeholder örnek, gerçek olay logu değil — R1'de onaylanan sınıflandırma).

### Kısmi düzenlenen dosyalar (marka metni değişti, canlı altyapı kimlikleri bilerek korundu)

- `docs/decisions/DEC-0013-jasper-renderer-service.md`: iki satırdaki gerçek Docker image adları
  (`eski-ad-api`/`eski-ad-web`/`eski-ad-jasper-renderer`) değiştirilmedi ve "henüz rename
  edilmedi" notuyla işaretlendi — bunlar marka değil, henüz gerçekleşmemiş bir Docker rename'inin
  konusu olan canlı kimlikler.
- `docs/domain/DOMAIN_MODEL.md`: başlık `Metnex`'e çevrildi; `window.__ESKI-AD_API_URL__` satırı
  değiştirilmedi çünkü bu, `apps/web` kodundaki gerçek (henüz rename edilmemiş) runtime global
  değişken adı — kod rename'i bu task'ın kapsamı dışında.
- `docs/requirements/DISCOVERY.md`: mimari açıklama metni (ESKI-AD Web Console/API, Reporting
  Foundation vb.) Metnex'e çevrildi. **§8.1 "Ürün Adı" bölümündeki kapsam-netleştirme paragrafı
  bilerek değiştirilmedi** — bu paragraf "Metnex isimlendirmesi teknik repository/platform
  foundation adını değiştirmez" diyor, bu artık AI1'in TASK-024.1/R1'deki "tam rename, sıfır
  tolerans" kararıyla çelişiyor. AI2 bunu tek taraflı yeniden yazmadı (bu bir Product Owner kapsam
  kararı), dosyaya AI1'e yönelik açık bir çelişki notu eklendi. "Hedef Repository: `eski-ad`"
  satırı da bilerek değiştirilmedi (gerçek repo/klasör adı, henüz rename edilmedi).

### Bilerek dokunulmayan dosyalar (canlı altyapı kimliği veya tarihi kayıt — gerekçeli)

- `docs/runbooks/{deployment,db-recreate-with-icu,local-db-backup,reporting-foundation,
  AI_KEY_ROTATION_RUNBOOK,local-development,PRODUCT_OWNER_LIFECYCLE_PLAYBOOK}.md`,
  `docs/domain/DB_META.md`: bu dosyalardaki `eski-ad` geçişlerinin ezici çoğunluğu gerçek Docker
  network/container adları, PostgreSQL DB/user adları, deploy path'leri, domain'ler ve gerçekten
  çalıştırılan komutlardır — henüz rename edilmemiş canlı altyapıyı doğru şekilde tarif ediyorlar.
  Bunları şimdi "metnex" yapmak, runbook'u gerçek sistem durumuyla **tutarsız** hale getirirdi
  (ör. `docker exec metnex-postgres-dev` yazan ama gerçek container hâlâ `eski-ad-postgres-dev`
  olan bir runbook). Bu dosyalar gelecekteki infra/DB/Docker rename task'ına bırakıldı — yalnızca
  `docs/domain/DB_META.md` ve `docs/runbooks/db-collation-strategy.md`'deki DEC-0007 link path'i
  (`DEC-0007-eski-ad-...` → `DEC-0007-metnex-...`) düzeltildi (kırık link olmasın diye), dosyanın
  geri kalanı dokunulmadan bırakıldı.
- `README.md` (kök): satırların çoğu ya gerçek geliştirici path örnekleri (`cd ~/projects/eski-ad`
  — repo klasörü henüz rename edilmedi) ya da `scripts/create-project.sh`'ın kendi placeholder
  mekanizmasının açıklaması (TASK-024.1'de "açık soru" işaretli, generator mantığı, marka değil).
  Bütün dosya bilerek dokunulmadan bırakıldı.
- `backlog/TASK-022-*.md`, `backlog/TASK-023-1-*.md`: bu dosyalardaki kalan `eski-ad` geçişleri
  gerçek teslim raporlarında alıntılanan literal komutlar/çıktılardır (ör. "Container
  openmas-jasper-renderer-dev Started", `docker build -t openmas-jasper-renderer:dev`,
  `src/main/java/com/openmas/...`) — bunlar o anda gerçekten çalıştırılan komutların/gerçek
  sistem durumunun kaydıdır, PROGRESS_LOG.md ile aynı mantıkla (bkz. TASK-024.1-R1) değiştirilmedi.
  Yalnızca bu dosyalardaki `docs/opendevcon/ESKI-AD_STATE.md` / `ESKI-AD_*.json` /
  `ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` **path referansları** yeni dosya adlarına güncellendi
  (kırık link düzeltmesi, tarihi içeriği değiştirmez).
- `backlog/TASK-024-1-*.md`, `TASK-024-1-R1-*.md`, `TASK-024-2-*.md`, `docs/rename/*.md`: bu
  belgeler doğrudan "eski-ad" string'ini **analiz konusu** olarak tartışıyor (envanter, politika,
  bu teslim raporu) — kendi kendine referans veren meta-dokümanlar, bilerek dokunulmadı.
- `docs/opendevcon/METNEX_STATE.md`: dosya adı rename edildi, ancak mevcut geçmiş anlatı
  paragrafları (task-by-task özet notları) değiştirilmedi — bunlar da o anki gerçek durumu
  anlatan tarihi kayıtlardır; yalnızca yeni girdiler ekleniyor (append pattern, PROGRESS_LOG.md
  ile tutarlı).
- `docs/opendevcon/PROGRESS_LOG.md`: TASK-024.1-R1'de onaylanan Seçenek A gereği geçmiş kayıtlar
  değiştirilmedi.
- `apps/**`, `services/**`, `infra/**`, `scripts/**` (create-project hariç zaten yukarıda),
  `.github/**`, `dev.sh`, `package.json`, `pnpm-lock.yaml`: task kapsamı dışı (kod/Docker/DB/CI
  rename sonraki task'lara bırakıldı).

### Yeni tarama sonucu

`rg -c -i 'openmas|aiskeleton' ...` → **108 dosya, 716 toplam geçiş** (dosya sayısı 147'den
108'e düştü — 39 dosya artık tamamen temiz; toplam geçiş sayısı 572'den 716'ya **arttı**, ama bu
bir regresyon değil: TASK-024.1/R1 sürecinde eklenen yeni meta-dokümanlar — envanter, politika,
bu teslim raporları — "eski-ad" string'ini analiz konusu olarak kaçınılmaz şekilde çok sayıda
alıntılıyor; bu dosyalar orijinal 572'lik taban çizgisinde yoktu). Kalan 108 dosyanın tamamı
yukarıdaki gerekçeli kategorilerden birine giriyor: canlı altyapı kimliği (henüz rename
edilmedi), kod (kapsam dışı), tarihi kayıt (PROGRESS_LOG/backlog/STATE geçmişi) veya
kendine-referans meta-doküman.

Dosya/klasör adı taraması: yalnızca `scripts/openmas-env-create.sh` ve
`services/jasper-renderer/src/{main,test}/java/com/openmas` kaldı — ikisi de kapsam dışı (script
rename ve Java package rename ayrı task'lar).

### Doğrulama

- `./scripts/check.sh --skip-docker` → **PASS** (audit, typecheck, lint, test [api 99/99, web
  37/37], build). Kod değişikliği yapılmadı, regresyon riski yok.
- Git commit/push yapılmadı.
- Gerçek secret/parola/connection string değeri rapora kopyalanmadı.

### Kabul kriterleri karşılama

| Kriter | Durum |
|---|---|
| ODC kimliği `name: Metnex`, `slug: metnex` | ✅ |
| `ESKI-AD_*` aktif doküman dosya adları Metnex'e çevrilmiş | ✅ — 8/8 dosya |
| Aktif dokümanlarda eski marka adı kalmamış | ✅ pure-branding dosyalarda; ⚠️ canlı altyapı/tarihi kayıt dosyalarında bilerek/gerekçeli olarak kaldı (yukarıda listelendi) |
| Karar kayıtlarının anlamı ve tarihçesi korunmuş | ✅ — yalnızca marka token'ı değişti, DEC-0013'ün altyapı satırları da korundu |
| PROGRESS_LOG geçmişi append-only korunmuş | ✅ |
| Governance/bootstrap/runbook referansları yeni yolları kullanıyor | ✅ — DEC-0007 link'leri, backlog path referansları düzeltildi |
| Production kodu, veri ve runtime config değiştirilmemiş | ✅ |

### AI1'e açık sorular / bekleyen kararlar

1. **`docs/requirements/DISCOVERY.md` §8.1 çelişkisi** — bu paragraf "Metnex adı teknik
   repository/platform foundation'ı değiştirmez" diyor, TASK-024.1/R1 kararıyla çelişiyor. AI2
   dosyaya bir not ekledi ama paragrafı yeniden yazmadı; AI1'in kapsamı netleştirmesi gerekiyor.
   2. Canlı altyapı runbook'ları (`deployment.md` vb.) ve `backlog/TASK-022-*`'nin tarihi
   teknik kayıtları, gerçek Docker/DB rename task'ı tamamlanana kadar `eski-ad` içermeye devam
   edecek — bu kasıtlı bir sıralama kararı, ek onay gerektirmiyor ama not ediliyor.

# TASK-024.2: Metnex Dosya Adları, ODC Kimliği ve Dokümantasyon Rename

## Amaç

TASK-024.1/R1 ile onaylanan isim sözleşmesini aktif repository dosya adlarına,
ODC kimliğine ve dokümantasyona uygulamak. Uygulama/runtime, package, Docker ve
veritabanı rename işleri sonraki task'larda yapılacaktır.

## Kapsam

- `docs/opendevcon/METNEX_STATE.md` → `METNEX_STATE.md`.
- `docs/project/METNEX_*.json` → `METNEX_*.json`; JSON içindeki `name/slug`
  kimliklerini Metnex/metnex yapmak.
- `docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` → Metnex karşılığı.
- `DEC-0007`–`DEC-0013` karar dosyalarının marka içeren dosya adlarını Metnex’e
  çevirmek; karar tarihi, özü ve karar metnini değiştirmemek.
- `ODC.md` ve `ODC_AI2_ONBOARDING_PROMPT.md` içindeki aktif proje kimliğini
  Metnex olarak güncellemek.
- Governance, runbook, security, domain, training, UI contract, README,
  backlog ve requirements dokümanlarındaki aktif marka/repository referansları.
- `DEPRECATED_MODULES.md` içindeki tarihi örnek e-posta adresini Metnex karşılığı
  ile güncellemek; kaydın anlamını korumak.
- Dosya rename'leri sonrası tüm çapraz referansları güncellemek.

## Onaylı istisnalar

`docs/opendevcon/PROGRESS_LOG.md` append-only olduğu için mevcut geçmiş satırlar
değiştirilmeyecek veya silinmeyecektir. Yeni cutover kaydı aktif kimliğin Metnex
olduğunu belirtmelidir. `AIS_DEMO_PACKAGE` gibi `eski-ad` markası olmayan
immutable migration literal'ları da değiştirilmez.

## Kapsam dışı

- `apps/**` production kodu ve kullanıcı oturum anahtarları.
- `package.json` scope/name değişiklikleri.
- Docker image/container/network/stack rename.
- PostgreSQL database/user ve MinIO bucket migration’ı.
- Git commit/push veya Git history rewrite.
- BOTC repository’si.

## Kabul kriterleri

| Kriter | Kanıt |
|---|---|
| ODC kimliği `name: Metnex`, `slug: metnex` | `ODC.md` + project JSON kontrolü |
| `ESKI-AD_*` aktif doküman dosya adları Metnex’e çevrilmiş | Dosya listesi + referans taraması |
| Aktif dokümanlarda eski marka/repository adı kalmamış | Case-insensitive `rg` sonucu |
| Karar kayıtlarının anlamı ve tarihçesi korunmuş | Dosya bazlı teslim özeti |
| PROGRESS_LOG geçmişi append-only korunmuş | Log kontrolü |
| Governance, bootstrap ve runbook referansları yeni yolları kullanıyor | Referans taraması |
| Production kodu, veri ve runtime config değiştirilmemiş | Değişen dosya listesi |

## Doğrulama

- `rg -n -i 'openmas|aiskeleton|@openmas|openmas-' .` çalıştırılacak.
- Kalan sonuçlar yalnızca `PROGRESS_LOG.md` geçmiş kayıtları ve onaylı immutable
  istisnalar olmalıdır.
- Docker çalıştırılmayacaktır. Kod değişikliği yapılmadığı için check zorunlu
  değildir; çalıştırılırsa `./scripts/check.sh --skip-docker` sonucu raporlanır.
- Backlog, yeni state dosyası ve append-only progress log güncellenecektir.

## AI2 talimatı

Önce dosya adlarını ve çapraz referansları planla; rename sonrasında referansları
yeniden tara. Kör global replace yapma. `PROGRESS_LOG.md` geçmiş satırlarına
dokunma ve gerçek secret/parola değerlerini rapora kopyalama.
