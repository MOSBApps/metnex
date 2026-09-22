---
stage: development
updated_at: 2026-09-17
updated_by: Product Governance Agent (AI1)
active_epics: [EPIC-001, EPIC-002, EPIC-003]
blocked_epics: []
last_release: v1.0.0
notes: >
  Discovery v1.3 ve SRS v1.2, birleştirilmiş migration wave planına göre güncellendi:
  Wave 0 hazırlık, Wave 1 kimlik/kullanıcı migration’ı, Wave 4 vardiya/arşiv ve
  Wave 5 Reporting/SCADA/DMS aktif plan olarak tanımlandı; Wave 2 Bakım/Arıza ve
  Wave 3 DÖF mevcut implementation kapsamı dışında bırakıldı.
  EPIC-004 ve 53 adet TASK-027 migration kaydı oluşturuldu. Yalnızca
  TASK-027.1 ready, diğer task'lar planned durumundadır; AI2 yalnızca bağımlılığı
  tamamlanmış ready task'ı uygulayacaktır.
  TASK-027.1 AI1 tarafından done olarak onaylandı. BOTC mapping, architecture
  decision ve açık sorular belgeleri hazırlandı; implementation kararları açık
  sorular çözülmeden kesinleştirilmeyecek.
  EskiAd projesinin Discovery.md, SRS.md (v1.0 Onaylı), ODC.md projesi açıklaması, 
  makine tarafından okunabilir proje kayıtları (PROJECT_PLAN, PROJECT_SCOPE, PROJECT_DELIVERY, 
  PROJECT_TRACEABILITY, PROJECT_EXECUTION), backlog epikleri ve AGENT_REGISTRY güncellenerek 
  OpenDevConnect (ODC) onboarding süreci tamamlanmıştır. TASK-022.1 (bkz.
  backlog/TASK-022-1-jasper-render-service.md, status: done, parent_epic:
  EPIC-002) kapsamında EPIC-002'nin raporlama temeli içindeki Jasper HTTP
  çağrısı ReportingService'ten bağımsız bir ReportRenderService adapter'ına
  ayrıştırıldı. TASK-022.2 (bkz.
  backlog/TASK-022-2-reporting-dataset-provider-abstraction.md, status: done,
  parent_epic: EPIC-002) kapsamında ReportingService, Demo Operations'a
  doğrudan bağımlılıktan çıkarılıp ReportDatasetProvider/ReportDatasetResolver
  soyutlaması arkasına alındı. TASK-022.3 (bkz.
  backlog/TASK-022-3-demo-operations-removal.md, status: done, parent_epic:
  EPIC-002; karar kaydı: docs/decisions/DEC-0012-demo-operations-removal.md)
  kapsamında Demo Operations modülü backend/frontend/seed/entitlement/schema/
  artifact/dokümantasyon bağımlılıklarıyla birlikte tamamen kaldırıldı; forward
  migration 0002_thick_earthquake demo tablolarını ve demo artifact/paket
  kayıtlarını temizledi. Reporting Foundation (ReportRenderService,
  ReportDatasetProvider/Resolver, genel ReportArtifact API'si) korunuyor ve
  varsayılan olarak provider'sız çalışıyor. TASK-022.3-R1 (bkz.
  backlog/TASK-022-3-R1-demo-specific-filter-cleanup.md, status: done,
  parent_epic: EPIC-002) kapsamında ReportFilters sözleşmesinde kalan son
  demo-specific alan (definitionId) reporting API/service/controller
  katmanlarından tamamen kaldırıldı; kod tabanında definitionId,
  DemoReportFilters, DEMO_SAMPLE veya DemoOperations referansı kalmadığı
  doğrulandı. TASK-022.4 (bkz.
  backlog/TASK-022-4-jasper-render-service-deployment-contract.md, status:
  BLOCKED, parent_epic: EPIC-002) kapsamında repository'de gerçek bir Jasper
  renderer image/source/compose service bulunmadığı tespit edilip raporlandı
  (yeni bir render motoru/teknoloji eklenmedi). ReportRenderService yeni bir
  templateId sözleşmesine geçirildi (host filesystem path'i artık hiçbir
  zaman renderer'a gönderilmiyor), allowlist tabanlı TemplateRegistryService
  eklendi (path traversal koruması + gerçek JRXML sandbox kontrolü),
  REPORT_RENDER_INTERNAL_TOKEN zorunlu deployment secret'ı hâline getirildi
  (token yoksa fail-closed), render payload'ına satır sayısı/boyut sınırı
  eklendi, export format'ı için runtime doğrulama eklendi. Renderer HTTP
  contract'ı ve deployment wiring checklist'i (port publish yasağı, internal
  network, secret injection, non-root, resource limitleri) reporting-foundation.md
  ve deployment.md'ye belgelendi — gerçek bir compose service eklenmedi
  (AI1 onayı gerektirir). AI1 incelemesinde API adapter/dokümantasyon/test
  kısmı onaylandı, ancak gerçek bir Jasper renderer artefact'ı (image/source/
  Dockerfile/compose) olmadan gerçek /render ve /health endpoint'leri,
  internal network izolasyonu, uçtan uca token doğrulaması, non-root çalışma,
  CPU/memory limitleri ve gerçek PDF/XLSX render çıktısı kanıtlanamadığı için
  status `done`'dan `blocked`'a düzeltildi. TASK-022.5 (bkz.
  backlog/TASK-022-5-jasper-renderer-service.md, status: done, parent_epic:
  EPIC-002; karar kaydı: docs/decisions/DEC-0013-jasper-renderer-service.md)
  kapsamında bu blokaj çözüldü: services/jasper-renderer/ altında bağımsız bir
  Maven/Spring Boot 3 (Java 21, JasperReports 6.20.6, sürümleri pinlenmiş)
  servisi eklendi; gerçek POST /render ve GET /health endpoint'leri, template
  allowlist + JRXML sandbox (renderer tarafı), zorunlu Bearer token (constant-
  time karşılaştırma), payload/satır/timeout sınırları uygulandı. Multi-stage
  non-root Dockerfile ile infra/docker/docker-compose.dev.yml'e (loopback-only
  publish, ./dev.sh ile otomatik build+start+healthcheck) ve dev-stack/test/
  swarm stack'lerine (internal-network-only, port publish yok, resource
  limitleri) wire edildi. Bu ortamda Docker gerçekten kullanılabilir olduğu
  için image gerçekten build edilip container olarak çalıştırıldı; curl ile
  health/render/PDF/XLSX/token/allowlist/path-traversal senaryoları gerçek
  container'a karşı doğrulandı, non-root docker exec ile doğrulandı, ./dev.sh
  iki kez çalıştırılarak idempotency kanıtlandı. TASK-022.4'ün status'u bu
  kanıtlarla `blocked` → `review` olarak güncellendi; nihai `done` kararı
  AI1'e bırakıldı.
  BOTC reverse-engineering Discovery'si AI1 tarafından değerlendirilerek
  docs/requirements/DISCOVERY.md içine MİP root tenant, MOSB/MOSEDAŞ/MOSBİO
  child tenant yapısı, PostgreSQL hedefi, SQL Server SCADA/DMS read-only adapter
  modeli ve migration kapsamı işlendi; Bakım/Arıza ile DÖF migration'ı mevcut
  kapsamdan çıkarıldı. TASK-022.5-R1 (bkz.
  backlog/TASK-022-5-R1-api-renderer-template-registry-alignment.md, status:
  done, parent_epic: EPIC-002) kapsamında API ve renderer'ın template
  allowlist'leri arasındaki eşleştirme eksikliği düzeltildi: API'nin
  TemplateRegistryService'i önceden boştu (renderer'ın 'sample-report'
  girdisi API tarafında hiç tanınmıyordu), şimdi apps/api/.../templates/
  sample-report.jrxml (renderer'daki dosyanın kopyası) + TEMPLATE_ALLOWLIST
  girdisiyle iki taraf senkronize edildi. Yeni bir gerçek entegrasyon testi
  (reporting.jasper-integration.spec.ts) eklendi — doğrudan renderer'a curl
  atmak yerine gerçek ReportingController/ReportingService/ReportRenderService
  çağrı zincirini, o an çalışan gerçek renderer container'ına karşı
  çalıştırıyor: gerçek PDF/XLSX export, templatePath'in hiç gönderilmediğinin
  ve templateId='sample-report'in gönderildiğinin doğrulanması, bilinmeyen
  template için kontrollü 404, yanlış token için gerçek ağ üzerinden 502.
  Yeni bir demo domain/modül eklenmedi — test fixture'ları spec dosyasına
  özel. api testleri 92→99'a çıktı (15 suite), Maven testleri 36/36 korundu,
  ./scripts/check.sh --skip-docker geçti. AI1, TASK-022.5-R1'i inceleyip
  onayladı ve TASK-022.4'ün orijinal blocked kriterlerinin (gerçek /render,
  gerçek /health, internal network wiring, token doğrulaması, non-root
  container, resource limitleri, gerçek PDF/XLSX çıktısı) TASK-022.5 ve
  TASK-022.5-R1 ile tam olarak karşılandığına karar verdi. Bu doğrultuda
  backlog/TASK-022-4-jasper-render-service-deployment-contract.md status'u
  `review` → `done` olarak güncellendi (2026-09-17).
  Metnex tam rename programı başlatıldı. İlk analiz task'ı
  backlog/TASK-024-1-metnex-rename-inventory-and-naming-contract.md
  (status: ready, parent_epic: EPIC-003) olarak açıldı. Bu task yalnızca
  rename envanteri ve hedef isim sözleşmesini üretir; production kodu ve veri
  değişikliği içermez.
  TASK-022.4 AI1 tarafından tamamlandı olarak onaylandı. Discovery doğrultusunda
  sıradaki analiz task'ı backlog/TASK-023-1-botc-source-schema-and-migration-inventory.md
  (status: ready, parent_epic: EPIC-002) olarak açıldı; bu task production kodu
  veya veritabanı değişikliği içermeden BOTC kaynak şema envanteri ve PostgreSQL
  migration mapping üretir.
  TASK-024.1 (bkz. backlog/TASK-024-1-metnex-rename-inventory-and-naming-contract.md,
  status: review, parent_epic: EPIC-003) kapsamında repository genelinde eski-ad/
  ESKI-AD/EskiAd taraması tamamlandı: 147 dosya, 572 geçiş (node_modules/.git/
  .next/dist/coverage/target dışlanarak); dosya/klasör adında eski-ad geçen 9 dosya
  + 2 klasör (services/jasper-renderer'ın com.eski-ad Java package dizinleri) ayrıca
  tespit edildi. Teslimat docs/rename/METNEX_RENAME_INVENTORY.md olarak yazıldı: tam
  dosya/klasör envanteri, 41 satırlık somut hedef-isim mapping tablosu (httpOnly auth
  cookie, localStorage anahtarları, window global, PostgreSQL/MinIO kimlikleri, Docker
  image/container/network/stack adları, Maven groupId/Java package, npm scope, ODC
  dosya adları dahil), runtime/deployment/database etki analizi, 12 adımlık önerilen
  rename sırası, risk analizi ve rename-sonrası doğrulama komut seti. En yüksek risk
  olarak eski-ad_refresh_token httpOnly cookie'sinin rename'inin tüm aktif kullanıcı
  oturumlarını deploy anında geçersiz kılacağı, apps/web/package.json ile Dockerfile'
  daki @eski-ad/web filter referanslarının atomik değişmesi zorunluluğu ve
  scripts/create-project.sh/.ps1'in kendi eski-ad/ESKI-AD literal pattern'lerinin bu
  projenin markası değil genel fork-generator mekanizması olduğu (körü körüne rename
  edilmemesi gerektiği) işaretlendi. Tarihi/immutable kayıtlar (DEC-0007/8/9/12/13,
  PROGRESS_LOG geçmiş girdileri, DEPRECATED_MODULES.md, migration SQL) rename
  kapsamı dışında bırakıldı. Bu task'ta hiçbir dosya/klasör/package/database/
  deployment adı değiştirilmedi, hiçbir veri taşınmadı/silinmedi, Git işlemi
  yapılmadı (repository zaten git kontrolünde değil), BOTC repository'sine
  dokunulmadı. Nihai `done` kararı AI1'e bırakılmıştır.
  AI1, TASK-024.1'i inceledi ve `status: review`'da tuttu (henüz `done` değil):
  envanterdeki "DEĞİŞTİRİLMEYECEK" işaretli 9 kalemin (DEC-0007/8/9/12/13,
  DEPRECATED_MODULES.md, ODC_AI2_ONBOARDING_PROMPT.md, PROGRESS_LOG.md geçmiş
  kayıtları) kendi son kararı olan "aktif içerikte eski-ad/ESKI-AD/EskiAd
  kalmayacak" hedefiyle uyumsuz olduğu tespit edildi; ayrıca ESKI-AD_STATE.md/
  docs/project/ESKI-AD_*.json/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md dosya
  adlarının da rename kapsamına girmesi ve tüm governance referanslarının aynı
  değişiklik setinde güncellenmesi istendi. TASK-024.1-R1 (bkz.
  backlog/TASK-024-1-R1-metnex-historical-reference-policy.md, status: review,
  parent_epic: EPIC-003) ile düzeltme yapıldı:
  docs/rename/METNEX_HISTORICAL_REFERENCE_POLICY.md oluşturuldu, 9 kalemden 8'i
  "ürün adı/marka riski" (rename'e engel değil) ile "kayıt bütünlüğü riski"
  ayrıştırması yapılarak kapsama alındı (DEC-* kararların içeriği/tarih/ID
  değişmeden yalnızca ürün adı metni güncellenir; DEPRECATED_MODULES.md'deki
  örnek e-posta sentetik placeholder olduğu için kapsama alındı;
  ODC_AI2_ONBOARDING_PROMPT.md'nin tarihi kayıt değil canlı onboarding talimatı
  olduğu tespit edilip kapsama alındı, yalnızca harici doganzorlu/eski-ad repo
  referansı ayrı açık soru olarak kaldı). Gerçek istisna olarak yalnızca migration
  SQL dosyasındaki AIS_DEMO_PACKAGE kaldı (marka değil migration immutability
  gerekçesiyle). PROGRESS_LOG.md'nin geçmiş girdileri için append-only bütünlük
  kuralı ile zero-tolerance hedefinin gerçek bir governance çakışması olduğu
  belirlenip iki somut seçenek sunuldu (A: geçmiş girdiler korunur + Rename
  Cutover girdisi eklenir — önerilen; B: dosya arşivlenip sıfırdan başlanır) —
  nihai karar AI1'e bırakıldı. Yeni tarama sonucu TASK-024.1 ile birebir aynı
  (147 dosya, 572 geçiş) çünkü hiçbir dosya/içerik henüz değiştirilmedi, yalnızca
  sınıflandırma güncellendi. Bu task'ta da hiçbir gerçek rename işlemi
  yapılmadı — TASK-024.2 ve sonrası, PROGRESS_LOG.md kararı netleşmeden
  başlatılmayacak.
  AI1, docs/rename/METNEX_HISTORICAL_REFERENCE_POLICY.md'yi inceleyip onayladı.
  PROGRESS_LOG.md kararı: Seçenek A — geçmiş kayıtlar append-only kuralı
  nedeniyle korunacak, dosyanın sonuna bir "Metnex Rename Cutover" kaydı
  eklenecek; cutover sonrasında aktif dosya adlarında, runtime'da,
  deployment'ta, kullanıcıya görünen metinlerde ve yeni kayıtlarda
  eski-ad/ESKI-AD/EskiAd kullanılmayacak. AIS_DEMO_PACKAGE migration
  immutability gerekçesiyle istisna olarak onaylandı (eski-ad marka referansı
  değil). backlog/TASK-024-1-R1-metnex-historical-reference-policy.md status'u
  `review` → `done` olarak güncellendi. PROGRESS_LOG.md'ye Seçenek A kararı ve
  "Metnex Rename Cutover" kaydı işlendi — bu kayıttan sonraki tüm yeni
  PROGRESS_LOG girdileri, dosya adları, runtime ve deployment referansları
  yalnızca Metnex adını kullanacak; cutover'dan önceki geçmiş girdiler
  append-only bütünlüğü gereği değiştirilmedi. Sıradaki task
  TASK-024.2 — Metnex dosya adları, ODC kimliği ve dokümantasyon rename —
  bu cutover noktasından hemen sonra başlayacak: ESKI-AD_STATE.md,
  docs/project/ESKI-AD_*.json, runbook dosya adları, ODC.md kimliği ve tüm
  aktif dokümantasyon Metnex'e geçirilecek.
  TASK-024.2 backlog/TASK-024-2-metnex-file-identity-and-documentation-rename.md
  (status: ready, parent_epic: EPIC-003) olarak açıldı.
  TASK-024.2 (bkz. backlog/TASK-024-2-metnex-file-identity-and-documentation-rename.md,
  status: review, parent_epic: EPIC-003) uygulandı: 8 dosya rename edildi
  (bu dosya dahil — eski adı ESKI-AD_STATE.md; docs/project/ESKI-AD_*.json →
  METNEX_*.json, docs/runbooks/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md →
  METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md, DEC-0007-eski-ad-... →
  DEC-0007-metnex-...); JSON içeriklerindeki name/slug alanları Metnex/metnex
  yapıldı. ODC.md kimliği name: Metnex, slug: metnex olarak güncellendi
  (yalnızca ODC.md'nin kendi create-project.sh placeholder-mekanizması
  açıklama satırı bilerek dokunulmadı — generator mantığı, marka değil).
  ODC_AI2_ONBOARDING_PROMPT.md proje adı Metnex yapıldı, doganzorlu/eski-ad
  repo referansı açık soru olarak işaretlendi (gerçek hedef repo adı
  bilinmiyor). 28 pure-branding doküman (AI_Governance, DEC-0007/8/9/12 tam +
  DEC-0013 kısmi, domain template, security, SRS, docs/README, training x3,
  ui-contract x16) tam marka metni rename'i aldı. DEPRECATED_MODULES.md'deki
  örnek e-posta metnex.local'a güncellendi. DOMAIN_MODEL.md ve DISCOVERY.md
  kısmi güncellendi: gerçek kod runtime global'i
  (window.__ESKI-AD_API_URL__) ve gerçek repo/klasör adı bilerek
  değiştirilmedi (henüz rename edilmedi). DISCOVERY.md §8.1'de AI1'in
  TASK-024.1/R1 kararıyla çelişen bir önceki kapsam-netleştirme paragrafı
  tespit edildi ve AI2 tarafından tek taraflı yeniden yazılmadı — AI1'e
  yönelik açık soru olarak dosyaya not eklendi. Canlı altyapı kimliği içeren
  runbook'lar (deployment.md, db-recreate-with-icu.md, local-db-backup.md,
  reporting-foundation.md, AI_KEY_ROTATION_RUNBOOK.md, local-development.md,
  PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md, DB_META.md) ve backlog/TASK-022-*/
  TASK-023-1'in tarihi teknik kayıtları (gerçek docker komutları/çıktıları)
  bilerek dokunulmadan bırakıldı — bunlar henüz rename edilmemiş gerçek
  sistem durumunu doğru yansıtıyor; yalnızca DEC-0007 link path'leri ve
  ESKI-AD_STATE.md/ESKI-AD_*.json/ESKI-AD_LIFECYCLE... path referansları
  kırık link olmasın diye güncellendi. README.md (kök), docs/rename/*.md ve
  PROGRESS_LOG.md geçmişi bilerek dokunulmadı (gerçek repo yolu, kendine-
  referans meta-doküman, append-only sırasıyla). Yeni tarama: 108 dosya, 716
  toplam geçiş (dosya sayısı 147'den düştü; toplam geçiş, bu sürecin kendi
  yeni meta-dokümanlarının "eski-ad"ı analiz konusu olarak alıntılaması
  yüzünden arttı — regresyon değil). `./scripts/check.sh --skip-docker`
  PASS (kod değişmedi). Nihai `done` kararı ve DISCOVERY.md §8.1 çelişkisinin
  çözümü AI1'e bırakıldı.
  AI1, TASK-024.2 ilk teslimini onaylamadı: ODC.md, DISCOVERY.md,
  ODC_AI2_ONBOARDING_PROMPT.md ve canlı deployment/development runbook'larında
  eski isimlerin kaldığını, "kasıtlı dokunulmayan runbook" kararının kabul
  kriterleriyle uyumsuz olduğunu belirtti; kullanıcı kararı kesin: teknik
  repository, platform ve aktif dokümantasyon kimliği tamamen Metnex olacak.
  AI2 düzeltme turu uyguladı: ODC.md dogfooding notu, DISCOVERY.md (Hedef
  Repository + §8.1 çelişkili paragrafı AI1'in kararı doğrultusunda yeniden
  yazıldı — artık isimlendirme teknik repository/platform kimliğini de
  kapsıyor), ODC_AI2_ONBOARDING_PROMPT.md repo referansı (doganzorlu/metnex),
  tüm aktif runbook'lar (deployment, db-recreate-with-icu,
  db-collation-strategy, local-db-backup, reporting-foundation,
  AI_KEY_ROTATION_RUNBOOK, local-development, PRODUCT_OWNER_LIFECYCLE_PLAYBOOK,
  METNEX_LIFECYCLE_AND_STATUS_RUNBOOK), DB_META.md, DOMAIN_MODEL.md (window
  global dahil), README.md (kök) ve backlog/TASK-022-*/TASK-023-1'in kalan
  geçişleri Metnex'e çevrildi. Not: bu runbook'lar artık metnex-* hedef
  isimleriyle yazılıyor ama gerçek Docker/DB/MinIO altyapısı henüz rename
  edilmedi (ayrı infra task'ı) — DEC-0013'e bu fark açıkça not edildi.
  Kalan dosya/klasör adları (scripts/eski-ad-env-create.sh,
  services/jasper-renderer'ın com.eski-ad Java package'ı) kod/derleme riski
  taşıdığı için kapsam dışı bırakıldı ve gerekçesi backlog raporuna işlendi
  (öneri: TASK-024.3). Tek çözülmemiş kategori: docs/rename/*.md (196
  geçiş), bu task'ın kendi backlog kayıtları (TASK-024-1/R1/2) ve bu dosyanın
  kendi geçmiş anlatı paragrafları — bunlar eski proje kimliğini analiz
  konusu olarak tartışıyor. AI1, 3. bir onaylı istisna oluşturulmamasına
  karar verdi: bu 6 dosyanın açıklama metinleri paraphrase edilerek
  temizlendi (eski slug/marka artık yalnızca placeholder terimlerle —
  `eski-ad`/`ESKI-AD`/`EskiAd` — anılıyor; yalnızca gerçek tarama komutları
  ve ham komut çıktıları literal string'i korur, tekrar üretilebilirlik
  için). Onaylı istisnalar artık yalnızca ikisi: PROGRESS_LOG.md'nin cutover
  öncesi geçmiş kayıtları ve immutable AIS_DEMO_PACKAGE migration literal'ı.
  `status: review`.
  AI1, TASK-024.2'nin 2. düzeltme turunu da onaylamadı: ODC.md, DISCOVERY.md,
  ODC_AI2_ONBOARDING_PROMPT.md ve deployment/development runbook'larındaki
  kalan eski isim referanslarının temizlenmesini istedi; kullanıcı kararı
  kesin olarak yinelendi (teknik repository/platform/dokümantasyon kimliği
  tamamen Metnex). AI2 ODC.md'nin dogfooding notunu, DISCOVERY.md'nin Hedef
  Repository satırını ve §8.1 çelişkili paragrafını (AI1'in kararı
  doğrultusunda yeniden yazarak), ODC_AI2_ONBOARDING_PROMPT.md repo
  referansını, tüm aktif runbook'ları (deployment, db-recreate-with-icu,
  db-collation-strategy, local-db-backup, reporting-foundation,
  AI_KEY_ROTATION_RUNBOOK, local-development, PRODUCT_OWNER_LIFECYCLE_PLAYBOOK,
  lifecycle runbook), DB_META.md, DOMAIN_MODEL.md, README.md ve backlog'un
  kalan geçişlerini güncelledi; gerçek Docker/DB altyapısı henüz rename
  edilmediği için DEC-0013'e açık bir doğruluk notu eklendi.
  AI1 sonra ~196 kalan geçiş için karar verdi: 3. bir onaylı istisna
  oluşturulmayacak, docs/rename/METNEX_RENAME_INVENTORY.md,
  METNEX_HISTORICAL_REFERENCE_POLICY.md, bu dosya ve TASK-024-1/R1/2 backlog
  kayıtlarının açıklama metinleri paraphrase edilecek (eski marka/slug
  literal yazılmayacak, yalnızca gerçek tarama komutları/çıktıları literal
  kalabilir). AI2 bu paraphrase temizliğini uyguladı: bu 5+1 dosyanın
  narrative metinlerinde eski ad artık yalnızca eski-ad/ESKI-AD/EskiAd
  placeholder'larıyla anılıyor; scripts/openmas-env-create.sh ve
  services/jasper-renderer'ın com.openmas Java package'ına yapılan
  referanslar (gerçek, hâlâ mevcut dosya/klasör yolları oldukları için)
  bilerek literal bırakıldı. Yeni tarama: kalan tüm geçişler yalnızca
  kod (apps/**, services/**, TASK-024.3'e bırakıldı), Docker/DB/CI/script
  (kapsam dışı), PROGRESS_LOG.md'nin cutover öncesi geçmişi (onaylı istisna)
  ve meta-dokümanların gerçek komut/komut-çıktısı satırlarında (istisna
  değil, komutun kendisi). find taraması: yalnızca
  scripts/openmas-env-create.sh ve com/openmas Java package dizinleri kaldı
  (TASK-024.3'e bırakıldı). `./scripts/check.sh --skip-docker` PASS. Nihai
  `done` kararı AI1'e bırakıldı.
  AI1, TASK-024.2'nin paraphrase temizliğini ve son tarama sonucunu
  onayladı: kalan referanslar (kod/servislerdeki henüz rename edilmemiş
  gerçek teknik yollar; script/infra/Docker/CI kapsamı; cutover öncesi
  append-only PROGRESS_LOG.md geçmişi; gerçek filesystem yollarını açıklayan
  geçiş referansları) task kapsamı ve TASK-024.3'e bırakılan kod/servis
  rename kararıyla uyumlu bulundu.
  backlog/TASK-024-2-metnex-file-identity-and-documentation-rename.md
  status'u `review` → `done` olarak güncellendi (2026-09-17). TASK-024.2 bu
  doğrultuda tamamlanmış kabul edilir: ODC kimliği (name: Metnex, slug:
  metnex), 8 dosya rename'i, DISCOVERY.md/ODC.md/ODC_AI2_ONBOARDING_PROMPT.md
  ve tüm aktif runbook/domain/governance/training/ui-contract dokümanları
  Metnex hedef isimlendirmesine taşındı; 6 kendine-referans meta-doküman
  paraphrase ile temizlendi. Metnex rename programının sıradaki adımı
  TASK-024.3 — kod/servis rename'i (scripts/openmas-env-create.sh,
  services/jasper-renderer'ın com.openmas Java package'ı) — ve ardından
  Docker/DB/MinIO/CI altyapı rename task'larıdır; bunlar henüz açılmadı.
  TASK-024.3 backlog/TASK-024-3-metnex-application-and-renderer-code-rename.md
  (status: ready, parent_epic: EPIC-003) olarak açıldı.
  TASK-024.3 (bkz. backlog/TASK-024-3-metnex-application-and-renderer-code-rename.md,
  status: review, parent_epic: EPIC-003) uygulandı: apps/api ve apps/web'deki
  tüm runtime/branding referansları Metnex'e taşındı. 7 auth/tenant/impersonation
  cookie'si (metnex_refresh_token dahil) API ve Web tarafında birlikte, atomik
  olarak yeniden adlandırıldı — güvensiz eski→yeni otomatik geçiş yapılmadı,
  deploy anında aktif oturumların re-login gerektireceği açıkça not edildi.
  5 localStorage anahtarı/namespace'i (metnex_access_token, metnex.nav.v1 dahil),
  window.__METNEX_API_URL__ runtime global'i (writer+reader birlikte) ve
  metnex:tenantchange custom event'i güncellendi. TOTP issuer etiketi ve
  platform display name varsayılanı Metnex yapıldı. @openmas/web → @metnex/web
  npm scope'u apps/web/package.json ve Dockerfile'daki iki --filter satırında
  atomik değişti. services/jasper-renderer'da com.openmas → com.metnex Java
  package'ı (24 dosya + 2 klasör), Maven groupId ve <name> etiketi güncellendi;
  gerçek Docker container içinde mvn test ile 36/36 test PASS doğrulandı (kod
  regresyonu yok). scripts/openmas-env-create.sh → scripts/metnex-env-create.sh
  rename edildi; script'in ürettiği POSTGRES_DB/DATABASE_URL/BASE deployment
  path/domain değerleri kasıtlı olarak değiştirilmedi (gerçek, henüz rename
  edilmemiş Postgres/deployment altyapısını üretiyorlar — task'ın kapsam dışı
  maddeleriyle örtüşüyor). apps/api/drizzle.config.ts, apps/api/scripts/check-db.js
  (DATABASE_URL) ve storage-usage.service.ts (MINIO_BUCKET fallback) aynı
  gerekçeyle bilinçli olarak dokunulmadı. pnpm --filter api/web tsc --noEmit
  (0 hata), pnpm --filter api jest (15 suite/99 test), pnpm --filter web vitest
  (5 dosya/37 test), ./scripts/check.sh --skip-docker tümü PASS. Yeni tarama:
  35 dosya, 313 geçiş (91/420'den düştü); apps/** içinde 3 dosyada 3 satırda
  Postgres/MinIO referansı kaldı, services/** içinde sıfır geçiş. find taraması
  artık repository genelinde hiçbir dosya/klasör adında openmas/aiskeleton
  göstermiyor — sıfır sonuç. Kök package.json'daki "name": "openmas" alanı
  task kapsamında açıkça anılmadığı için değiştirilmedi, AI1'e küçük bir açık
  soru olarak flag edildi. Nihai `done` kararı AI1'e bırakıldı.
  AI1, TASK-024.3'ü henüz done olarak onaylamadı: kök package.json'ın
  "openmas" değerinde kalmasının Metnex rename sözleşmesine aykırı olduğunu
  ve AI2'nin "apps/** içinde sıfır geçiş" ifadesinin gerçek durumla
  (drizzle.config.ts, check-db.js, storage-usage.service.ts'teki 3 kalan
  referans) uyuşmadığını belirtti. AI1 kararı: bu 3 dosyanın DB/MinIO runtime
  rename task'ına (TASK-024.5) bırakılması mimari olarak kabul edilebilir,
  ancak rapor bunu "sıfır geçiş" değil açıkça "TASK-024.5'e devredildi" diye
  belirtmeli; metnex-env-create.sh içindeki /opt/openmas, POSTGRES_DB=openmas
  ve domain değerlerinin TASK-024.4/TASK-024.5'e bırakılması da onaylandı.
  AI2 düzeltti: kök package.json "name": "metnex" yapıldı (check.sh çıktısında
  artık metnex@0.0.1 / @metnex/web görünüyor); apps/** tarama sonucu doğru
  raporlandı (3 dosya/3 satır, TASK-024.5'e açıkça devredildi); tsc (api+web),
  jest (15/99), vitest (5/37) ve ./scripts/check.sh --skip-docker kök
  package.json rename'i sonrası yeniden çalıştırılıp PASS doğrulandı.
  backlog/TASK-024-3-metnex-application-and-renderer-code-rename.md
  güncellendi (status: review, henüz done değil — AI1'in final onayı
  bekleniyor).
  AI1 TASK-024.3 düzeltmelerini onayladı ve status'u done olarak kabul etti.
  Kök package adı metnex yapıldı; DB/MinIO runtime referansları TASK-024.5'e
  devredildi.
  Metnex rename programının sıradaki adımı TASK-024.4 — Docker, deployment
  path, CI/CD ve runtime rename olarak açıldı (bkz.
  backlog/TASK-024-4-metnex-docker-deployment-and-cicd-rename.md, status:
  ready, parent_epic: EPIC-003). Bu task'ta openmas-* Docker image/container/
  network/stack adları, /opt/openmas deployment path'i, registry ve CI/CD
  (.github/workflows/pipeline.yml) referansları Metnex'e taşınacaktır.
  PostgreSQL ve MinIO veri kimlikleri bu task'ın kapsamı dışındadır ve
  TASK-024.5'te ele alınacaktır.
  TASK-024.4 (bkz. backlog/TASK-024-4-metnex-docker-deployment-and-cicd-rename.md,
  status: review, parent_epic: EPIC-003) uygulandı: tüm Docker compose
  dosyalarında (dev/dev-stack/test/swarm/infra/registry) container/servis/
  network/stack/image adları metnex-*'e taşındı; docker-compose.dev.yml'in
  compose project adı (name: openmas → metnex) güncellendi.
  .github/workflows/pipeline.yml tamamen temizlendi (GHCR/local registry image
  adları, stack_name, network, /opt/metnex/${ENV_NAME} deploy path, SERVICES
  dizisi). dev.sh, scripts/check.sh, scripts/db/*.sh, backup-db.sh,
  restore-db.sh, hooks/pre-commit, setup-hooks.sh, metnex-env-create.sh'teki
  container adı/stack adı/deployment path/domain referansları güncellendi.
  DEC-0013'teki "henüz rename edilmedi" caveat'ları kaldırıldı (artık gerçek
  durumu yansıtıyor). PostgreSQL/MinIO veri kimlikleri (POSTGRES_USER/PASSWORD/
  DB, MINIO_ROOT_USER/PASSWORD/BUCKET) hiçbir dosyada değiştirilmedi —
  TASK-024.5'e devredildi. scripts/create-project.sh/.ps1'in kendi generator
  pattern'i açık soru olarak korundu. Tüm docker-compose dosyaları `docker
  compose config --quiet` ile sözdizimsel olarak doğrulandı (hepsi PASS).
  ./scripts/check.sh --skip-docker PASS. Yeni tarama: 29 dosya, 256 geçiş
  (35/313'ten düştü); .github/workflows/pipeline.yml tamamen temiz.
  **Operasyonel risk (kullanıcı kararı bekleniyor):** bu ortamda gerçekten
  çalışan openmas-postgres-dev/redis-dev/minio-dev/jasper-renderer-dev
  container'ları var; compose project adı değişikliği bir sonraki ./dev.sh
  çalıştırmasında yeni boş metnex_* volume'leri oluşturacak, eski
  openmas_* volume'leri (veri kaybolmadan) orphan kalacak. AI2 container/
  volume'lere dokunmadı (yıkıcı işlem), 3 seçenek sundu (veri taşı / sıfırdan
  başla / TASK-024.5 ile birlikte planla), AI1'in kararını bekliyor. Nihai
  `done` kararı da AI1'e bırakıldı.
  AI1 C seçeneğini onayladı: mevcut volume/container kaynaklarına dokunulmayacak.
  TASK-024.4 done olarak onaylandı; TASK-024.5
  (backlog/TASK-024-5-metnex-postgresql-minio-identity-migration.md, status: ready)
  PostgreSQL/MinIO kimlik geçiş planı için açıldı.
  AI2 read-only envanter çıkardı (Postgres: openmas database'i 9527 kB, 5 şema,
  29+1 tablo; MinIO: hiçbir bucket henüz oluşturulmamış, taşınacak nesne yok)
  ve bir geçiş planı sundu (pg_dump+doğrula → ALTER DATABASE/ROLE RENAME →
  config güncelle → doğrula). AI1 planı 10 adımlık kesin bir sırayla onayladı
  ve TASK-024.5'in uygulanmasına izin verdi.
  TASK-024.5 (bkz. backlog/TASK-024-5-metnex-postgresql-minio-identity-migration.md,
  status: review, parent_epic: EPIC-003) uygulandı: AI1'in onayladığı 10 adım
  birebir izlendi. pg_dump ile yedek alındı (backup/openmas-pre-metnex-
  migration-20260917_072650.dump, 75847 byte), pg_restore --list ile
  doğrulandı (180 TOC girdisi, exit 0), SHA-256 checksum kaydedildi. Aktif
  bağlantı olmadığı doğrulandıktan sonra ALTER DATABASE openmas RENAME TO
  metnex ve ALTER ROLE openmas RENAME TO metnex çalıştırıldı (rol rename'i
  "session user cannot be renamed" hatası nedeniyle parolasız geçici bir
  superuser rol üzerinden yapıldı, sonra temizlendi — gerçek secret hiç
  kullanılmadı). Eski isimle bağlantı denemesi (psql -U openmas -d openmas)
  beklendiği gibi "role openmas does not exist" ile başarısız oldu — doğrulandı.
  Tüm DATABASE_URL/POSTGRES_USER/POSTGRES_DB/healthcheck/script varsayılanları
  (canlı infra/docker/.env ve apps/api/.env dahil) metnex'e güncellendi.
  MinIO tarafında gerçek bucket olmadığı için yalnızca MINIO_BUCKET fallback'i
  metnex-dev/test/prod yapıldı; MinIO admin kullanıcısı (MINIO_ROOT_USER)
  canlı dosyada bilerek openmas olarak bırakıldı (admin kimliği rename'i bu
  planın kapsamında değildi). Doğrulama: verify-db-locale.sh PASS (5/5),
  tsc 0 hata, jest 15 suite/99 test PASS, gerçek pg client ile metnex
  database'ine bağlanıp gerçek tenant verisi okundu, derlenmiş API kısa
  süreliğine ayağa kaldırılıp GET /health → {"status":"ok"} ve MinIO client
  "metnex-dev" bucket'ıyla başlatıldığı doğrulandı, jasper-renderer ve MinIO
  health endpoint'leri ayrıca kontrol edildi, ./scripts/check.sh --skip-docker
  PASS. docker compose down -v çalıştırılmadı, hiçbir volume silinmedi, dump
  doğrulanmadan hiçbir ALTER komutu çalıştırılmadı. Yeni tarama: yalnızca 13
  dosya kaldı (PROGRESS_LOG.md geçmişi, kendine-referans meta-dokümanlar,
  create-project.sh/.ps1 açık sorusu, ODC.md notu) — apps/**, services/**,
  infra/**, dev.sh ve tüm DB script'leri artık tamamen temiz. Nihai `done`
  kararı AI1'e bırakıldı.
  AI1, TASK-024.5'i henüz done olarak onaylamadı: canlı infra/docker/.env
  içindeki MINIO_ROOT_USER=openmas değerinin bir tarihsel kayıt değil aktif
  runtime kimliği olduğunu ve zero-tolerance kararına aykırı olduğunu
  belirtti. Düzeltme istendi: MINIO_ROOT_USER'ı metnex yapmak, MinIO
  container'ını volume silmeden yeniden başlatmak, health/API storage
  bağlantısını tekrar doğrulamak, değişikliği rapora eklemek. MinIO
  healthcheck'teki wget eksikliğinin rename'den bağımsız olduğu ama teknik
  borç olarak backlog'a yazılması gerektiği de belirtildi.
  AI2 düzeltti: infra/docker/.env'de MINIO_ROOT_USER metnex yapıldı;
  openmas-minio-dev container'ı durduruldu (silinmedi), aynı volume
  (openmas_minio_data) ve portlarla metnex-minio-dev adında yeni container
  başlatıldı, volume içeriğinin korunduğu doğrulandı. apps/api/.env'de ayrıca
  bağımsız bir alan olan MINIO_ACCESS_KEY=openmas de metnex yapıldı (ilk
  teslimde gözden kaçmıştı) ve bir marka yorumu düzeltildi. Gerçek MinIO SDK
  ile yeni metnex kimliğiyle authOK doğrulandı (listBuckets → 0 bucket),
  eski openmas kimliğiyle bağlantı denemesi beklendiği gibi
  "Access Key Id does not exist" ile başarısız oldu. API yeniden ayağa
  kaldırılıp MinIO client'ın metnex kimliğiyle ve metnex-dev bucket'ıyla
  başarıyla başlatıldığı, health endpoint'in ok döndüğü doğrulandı. MinIO
  healthcheck wget eksikliği backlog/TASK-025-1-minio-healthcheck-missing-wget.md
  olarak ayrı bir teknik borç kaydına alındı (status: backlog, parent_epic:
  null, rename'den bağımsız). Nihai `done` kararı AI1'e bırakıldı.
  AI1 TASK-024.5'i done olarak onayladı. PostgreSQL database/role, MinIO root
  identity/API access key ve bucket fallback Metnex'e geçirildi; volume korunarak
  gerçek SDK auth ve API health doğrulandı. Healthcheck wget eksikliği TASK-025.1'e
  devredildi. TASK-025.1 AI1 tarafından done olarak onaylandı: MinIO healthcheck
  curl ile düzeltildi, gerçek container healthy ve SDK storage auth doğrulandı.
  TASK-025.1 (bkz. backlog/TASK-025-1-minio-healthcheck-missing-wget.md, status:
  review, parent_epic: null) uygulandı: minio/minio:latest image'ı içinde wget
  bulunmadığı, ama mc ve curl'ün gerçekten mevcut olduğu docker exec ile
  doğrulandı (varsayım yapılmadı). infra/docker/docker-compose.{dev,infra}.yml'deki
  minio servisi healthcheck'i wget'ten curl'e çevrildi (başka hiçbir minio
  servisi tanımlayan compose dosyası yok). Bucket/credential/volume/network/image
  sürümüne dokunulmadı. Gerçek healthy durumunu göstermek için metnex-minio-dev
  container'ı aynı volume (openmas_minio_data), aynı portlar ve kimlik
  bilgileriyle, yalnızca --health-cmd eklenerek yeniden oluşturuldu; docker
  inspect ile healthy durumuna geçtiği poll edilerek doğrulandı, kanonik isme
  geri döndürüldü. Volume içeriğinin korunduğu ayrıca teyit edildi. MinIO health
  endpoint'i (curl, exit 0) ve API storage bağlantısı (gerçek minio SDK,
  AUTH_OK) tekrar doğrulandı. ./scripts/check.sh --skip-docker PASS. Nihai
  `done` kararı AI1'e bırakıldı.
  Kullanıcı fiziksel proje klasörünü `metnex` olarak rename etti. Docker runtime
  cutover ve eski kaynak envanteri için TASK-026.2
  (backlog/TASK-026-2-metnex-docker-runtime-cutover-and-orphan-cleanup.md,
  status: ready) açıldı. Volume/image silme kullanıcı onayı olmadan yapılamaz.
  TASK-026.2 (bkz. backlog/TASK-026-2-metnex-docker-runtime-cutover-and-orphan-cleanup.md,
  status: review, parent_epic: EPIC-003) uygulandı: pwd/realpath ile metnex
  klasörü doğrulandı. Postgres, Redis ve Jasper-renderer container'ları (TASK-024.5'te
  yalnızca MinIO cutover edilmişti) aynı volume'lere bağlı kalarak metnex-*
  adlarıyla yeniden oluşturuldu, healthy doğrulandı, veri korundu (tenants
  tablosu 2 kayıt). Jasper-renderer image'ı yeniden build edilmedi, aynı image
  ID'ye ikinci tag eklendi (metnex-jasper-renderer:dev). İlk docker run tabanlı
  cutover'ın dev.sh --stop ile uyumlu olmadığı (compose etiketi yok) tespit
  edilip düzeltildi: docker-compose.dev.yml'in volume'leri external:true +
  name: openmas_* olarak tanımlandı (volume'lerin kendisi rename edilmedi,
  yalnızca compose'a var olan volume'lere bağlanması söylendi), container'lar
  gerçek docker compose up ile yeniden oluşturuldu. Port senkronizasyon
  sorunu (compose varsayılan portları kullandı) ./dev.sh tekrar çalıştırılarak
  düzeltildi. ./dev.sh --status, ./dev.sh (idempotent) ve ./dev.sh --stop
  (artık gerçekten durduruyor) sırayla doğrulandı, her adımda veri korundu.
  Eski openmas-* container'ları (4 adet, durmuş) ve openmas-jasper-renderer:dev
  image tag'i orphan olarak sınıflandırılıp temizlik önerisi sunuldu ama
  uygulanmadı (kullanıcı onayı bekleniyor). openmas_* volume'lerinin aktif
  kullanımda olduğu, openmas-jasper-m2-cache'in faydalı bir build cache
  olduğu ve demo-*/finflow-* kaynaklarının bu projeyle ilgisiz olduğu ayrıca
  belgelendi — hiçbiri değiştirilmedi. ./scripts/check.sh --skip-docker PASS.
  Nihai `done` kararı AI1'e bırakıldı.
  AI1, TASK-026.2'yi onayladı ve eski kaynak temizliği için sınırlı onay verdi:
  yalnızca 4 durmuş openmas-* container'ı ve openmas-jasper-renderer:dev image
  tag'i silinebilir; openmas_* volume'ler, openmas-jasper-m2-cache,
  demo-*/finflow-* kaynakları ve down -v/volume silme/system prune yasak.
  AI2 image ID eşleşmesini (openmas-jasper-renderer:dev ve
  metnex-jasper-renderer:dev → aynı sha256:f25a6d4c5ff4...) tekrar doğrulayıp
  4 container'ı sildi, yalnızca eski image tag'ini kaldırdı (image ID
  metnex-jasper-renderer:dev etiketiyle sağlam kaldı). Doğrulama: openmas-*
  container listesi boş, 4 metnex-* container hâlâ healthy, openmas_* volume'ler
  ve m2-cache dokunulmadan duruyor, tenant verisi (2 kayıt) korundu,
  ./scripts/check.sh --skip-docker PASS. TASK-026.2 done olarak kapatıldı.
  TASK-027.1 (bkz. backlog/TASK-027-1-botc-migration-mapping-ve-architecture-decision.md,
  status: review, parent_epic: EPIC-004) uygulandı: ../BOTC kaynak kodu (4
  DbContext, 27 domain entity dosyası, AuthService/UserAuthorizationService/
  QueryService/DataSourceService) doğrudan okunarak, varsayım üretilmeden BOTC
  → Metnex migration mapping ve mimari karar dokümanları hazırlandı.
  docs/migration/BOTC_TO_METNEX_MAPPING.md: 9 veritabanı sınıflandırıldı
  (BOT_APP kimlik/Wave1, DOF_APP/Ticket Wave2-3 kapsam dışı, Vardiya/Arşiv
  Wave4 aday, SCADA/işletme DB'leri Wave5 read-only öncelikli); entity/table
  mapping, permission eşleme önerisi, tenant/scope mapping, ID/FK mapping
  ilkeleri işlendi. docs/migration/BOTC_MIGRATION_ARCHITECTURE_DECISION.md:
  hedef mimari, taşınmayacak katmanlar, PostgreSQL/SQL Server sınırları,
  BOTC'nin gerçek güvenlik açıklarının (düz metin parola fallback, global
  salt, gömülü AES anahtarı, QUOTENAME'siz SQL injection riski — hepsi
  koddan doğrulandı) hiçbirinin taşınmayacağı kararı, idempotency/dry-run/
  rollback ilkeleri, password/secret migration yasağı, Wave 1/4/5 ilişkisi
  ve Wave 2/3 kapsam dışı teyidi. docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md:
  9 yeni açık soru (6'sı PO onayı gerektiriyor — permission adı eşlemesi,
  rol-şablonu modeli, tek-oturum zorlaması taşınır mı, lokasyon-tenant
  eşlemesi, zorunlu parola sıfırlama akışı, SCADA canlı-sorgu/cache kararı)
  + zaten açık olan 11 soruyla çapraz referans. MOSEDAS ve MOSBIO_TELEGRAM
  için kod tabanında karşılık bulunamadığı açıkça belirtildi, varsayım
  üretilmedi. Gerçek secret/parola/connection string hiçbir dokümana
  yazılmadı (yalnızca appsettings.json anahtar adları incelendi, değerler
  görülmedi). pwd/realpath doğrulandı, rg --files ../BOTC (4078 dosya) ve
  rg -n "DbContext|Entity|..." ../BOTC (1783 eşleşme) ile kaynak kodun
  gerçekten tarandığı kanıtlandı. ./scripts/check.sh --skip-docker PASS
  (kod değişikliği yok). Hiçbir implementation kararı kesinleştirilmedi —
  Wave 1 task'ları açık sorular çözülmeden başlatılmamalı. Nihai `done`
  kararı ve açık soruların çözümü AI1/Product Owner'a bırakıldı.
  TASK-027.2 (bkz. backlog/TASK-027-2-botc-kaynak-database-schema-envanteri.md,
  status: review, parent_epic: EPIC-004) uygulandı: TASK-027.1'in ötesinde
  ../BOTC/BOT.Data/Migrations/*.cs (4 migration dosyası) ve
  BotDbContextModelSnapshot.cs okunup güncel BotDbContext.cs ile satır
  satır karşılaştırıldı. Kritik bulgu: migration geçmişi ile güncel kod
  arasında iki somut, koddan kanıtlanmış sapma tespit edildi — (1)
  Roles/Role tablo adı ve RoleId FK delete-behavior'ı (Restrict vs Cascade)
  migration ile kod arasında çelişiyor, (2) Permissions/UserPermissions/
  VisibilitySettings/SCADA endeks tabloları/MaintenanceRecords hiçbir
  migration'da CreateTable edilmemiş, MaintenanceRecords üstelik
  AddExtraNoteAudit migration'ında açıkça DropTable ile silinmiş ama
  güncel kod hâlâ bu tabloya map ediyor. Bu bulgular Discovery R-012/Q-007
  ile aynı yönde ve onları güçlendiriyor. Teslimat:
  docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md — 4 DbContext'in tamamı
  tablo/kolon/PK/FK/nullable/index detayıyla envanterlendi, her bilgi [KOD]
  veya [MIGRATION] etiketiyle kaynağına bağlandı, doğrulanamayan noktalar
  [DOĞRULANAMADI] işaretlendi. DynamicDataSources kaynakları (7 anahtar)
  ayrı listelendi. SCADA/DMS, Vardiya/Arşiv kaynakları ayrı sınıflandırıldı.
  Wave 2/3 yalnızca kapsam dışı envanter olarak kaydedildi, implementation
  önerisi üretilmedi. docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  4 yeni soru (Q-S01-Q-S04) append edildi (mevcut Q-M/Q-A serisi korunarak).
  Gerçek secret/parola/connection string hiçbir dokümana yazılmadı.
  ./scripts/check.sh --skip-docker PASS (kod değişikliği yok). Hiçbir
  implementation kararı kesinleştirilmedi. Nihai `done` kararı AI1/Product
  Owner'a bırakıldı.
  **TASK-027.2-R1 düzeltmesi (2026-09-17):** AI1, ilk teslimdeki "BotDbContext
  9 tablo" / "4 DbContext toplam 22 tablo" iddialarının envanter dokümanının
  kendi alt bölümleriyle tutarsız olduğunu tespit etti; done onayı bu nedenle
  ertelendi. Düzeltme: her tablo 4 ayrık kategoriye (Güncel DbSet + Migration'da
  da var / Migration-only / Kodda olup migration'da olmayan (SCADA hariç) /
  SCADA) atanarak yeniden sayıldı — BotDbContext 3+2+4+5=14, DofDbContext
  0+0+3+4=7, VardiyaDbContext 0+0+5+0=5, ArsivVardiyaDbContext 0+0+5+0=5;
  DbContext-tablo eşleşmesi toplamı 31 (context'ler arası SCADA DbSet
  tekrarları, Q-S04 doğrulanamadığı için tekilleştirilmemiştir — "31" distinct
  fiziksel tablo sayısı değildir). Bu tablo docs/migration/BOTC_SOURCE_SCHEMA_INVENTORY.md
  §1.1'e ve backlog/TASK-027-2-botc-kaynak-database-schema-envanteri.md'ye
  birebir aynı rakamlarla eklendi. Kod/production/PostgreSQL/Docker/Git
  değişikliği yok; ./scripts/check.sh --skip-docker yeniden PASS. AI1 düzeltmeyi
  onayladı ve TASK-027.2 status'u done olarak kapatıldı.
  TASK-027.3 (bkz. backlog/TASK-027-3-botc-entity-repository-domain-mapping.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.2 + TASK-027.2-R1
  done) uygulandı: BOTC entity/servis davranışları Metnex domain sahipleriyle
  eşleştirildi. BOTC'de repository katmanı olmadığı doğrulandı (BOT.Services
  DbContext'i doğrudan kullanıyor); "repository davranışı" servis metodu
  düzeyinde belgelendi. Teslimat: docs/migration/BOTC_ENTITY_DOMAIN_MAPPING.md
  — Wave 1 (User/Role/Permission/UserPermission → apps/api/src/platform,
  AuthService/UserService/UserAuthorizationService/SessionService davranış
  envanteri), Wave 4 aday (Vardiya/Arşiv, Metnex'te henüz domain sahibi yok,
  VardiyaService/ArsivVardiyaService davranış envanteri), Wave 5 aday (SCADA,
  reporting modülüyle kısmen örtüşebilir ama kesinleşmedi, QueryService/
  DataSourceService davranış envanteri — INFORMATION_SCHEMA canlı kontrolü ve
  SQL string interpolasyonu riskleri servis-davranışı kanıtıyla yeniden
  doğrulandı). Wave 2/3 için mapping üretilmedi, yalnızca Wave 1 verisine
  bağımlılıkları (TicketService/DofService → Users/UserPermissions) not
  edildi. 10 maddelik "taşınmaz/karşılığı yok" davranış listesi eklendi
  (repository pattern yokluğu, bellek-içi permission snapshot, düz-metin
  parola fallback, hardcoded Admin kısayolu, ConfigProtector sabit anahtar,
  INFORMATION_SCHEMA kontrolü, SQL injection riski, VisibilitySettings
  UI-toggle, UI-seviyesi yetkilendirme varsayımı, çapraz-DB elle
  senkronizasyon). docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye 4 yeni
  soru (Q-E01-Q-E04, hepsi PO onayı gerektiriyor) append edildi (mevcut
  Q-M/Q-A/Q-S serisi ve özet tablo korunarak). Gerçek secret/parola/connection
  string hiçbir dokümana yazılmadı. ./scripts/check.sh --skip-docker PASS
  (kod değişikliği yok). Hiçbir implementation kararı kesinleştirilmedi. Nihai
  `done` kararı AI1/Product Owner'a bırakıldı. AI1 teslimi onayladı ve
  TASK-027.3 status'u done olarak kapatıldı.
  TASK-027.4 (bkz. backlog/TASK-027-4-mip-tenant-isletme-lokasyon-mapping.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.3 done)
  uygulandı: MİP root/işletme tenant/lokasyon eşlemesi Metnex'in gerçek
  `tenant-scope` kod/şemasıyla (TenantType enum: PLATFORM_ROOT/ROOT/STANDARD,
  tenants.parentId/customerRootId/canAggregateChildren, tenant_closure kapanış
  tablosu, TenantScopeService.resolve()) ve BOTC'nin gerçek Sirket/lokasyon
  kaynak kodu kanıtıyla eşleştirildi. Kritik bulgular: (1) `Sirket` alanı
  hiçbir sorgu/yetkilendirme filtresinde kullanılmıyor (yalnızca admin
  formunda serbest metin) — tek başına güvenilir tenant eşleme kaynağı
  değildir. (2) Metnex'in var olan tenant-scope mekanizması D-006'nın
  ("permission + canAggregateChildren + data scope") birebir çalışan
  karşılığıdır, yeni mekanizma gerekmiyor. (3) 5 BOTC lokasyonundan yalnızca
  MOSBİO ve MOSB ENERJİ doğrudan işletme tenant'ına karşılık geliyor
  (Discovery §21.1 ile örtüşüyor); KÖMÜR KAZANI/MOSBİO KIRIM DEPO/SANTRAL için
  ilişki kesinleşmedi. Teslimat: docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md
  — MİP root/STANDARD tenant ataması, Sirket güvenilirlik değerlendirmesi,
  lokasyon-tenant seçenek tablosu, SCADA görünürlük modeli hazırlığı (Q-S03/
  Q-M06 ile ilişkilendirildi, implementation üretilmedi), tenant izolasyonu/
  root analiz yetkisi/erişim sınırları (SRS FR-015, SEC-DATA-001/002,
  ROLE-001/002 ile çapraz kontrol). docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  1 yeni soru (Q-T01, PO onayı gerekiyor) append edildi (mevcut Q-M/Q-A/Q-S/
  Q-E serisi ve özet tablo korunarak). Wave 2/3 kapsam dışı korundu, yeni
  production kodu/migration/seed yazılmadı. Gerçek secret/parola/connection
  string hiçbir dokümana yazılmadı. ./scripts/check.sh --skip-docker PASS
  (kod değişikliği yok). Hiçbir implementation kararı kesinleştirilmedi. Nihai
  `done` kararı AI1/Product Owner'a bırakıldı. AI1 teslimi onayladı ve
  TASK-027.4 status'u done olarak kapatıldı.
  TASK-027.5 (bkz. backlog/TASK-027-5-scada-dms-source-mapping.md, status:
  review, parent_epic: EPIC-004, bağımlılık: TASK-027.4 done) uygulandı: 7
  DynamicDataSources anahtarı eksiksiz listelendi, BOT/IsletmeRaporlariWindow.xaml.cs
  ilk kez taranarak kritik yeni bulgu elde edildi — BotDbContext'in kendi SQL
  Server bağlantısı üzerinden üç parçalı veritabanı adıyla (DATABASE.dbo.table)
  çapraz-veritabanı FromSqlRaw sorguları tespit edildi: GtEndeks/SgEndeks/
  KomurEndeks → MOSEDAS.dbo.{gt_endeksler,sg_endeksler,komur_endeksler}
  (önceki "MOSB ENERJİ DB varsayımı"nı [KOD] kanıtıyla düzeltir), MosbioEndeks
  → MOSBIO_RAPORLAR.dbo.endeksler (teyit), VardiyaPerformans →
  MOSBIO_TELEGRAM.dbo.VardiyaPerformans (yeni — MOSBIO_TELEGRAM'ın gerçek bir
  SQL Server DB'si olduğu ilk kez kanıtlandı, Q-M01 kısmen çözüldü). Bu bulgu
  ayrıca DynamicDataSources'tan tamamen ayrı, ikinci bir SCADA erişim yolunun
  var olduğunu ve BOT_APP login'inin çapraz-DB geniş yetkisi olduğunu ortaya
  çıkardı (mimari karar dokümanının güvenlik bulgularını güçlendirir). Teslimat:
  docs/migration/BOTC_SCADA_DMS_SOURCE_MAPPING.md — 7 anahtar listesi, çapraz-DB
  bulgusu, Discovery §21.1 iş sınıflandırması ile fiziksel DB kanıtı arasındaki
  gerilim (GT/SG/Kömür Kazanı: iş sahipliği MOSB, DB adı MOSEDAS — karar
  bekliyor), MosbioEndeks için yüksek güvenli MOSBİO ataması, tenant içi
  scope/read-only/permission/audit/root-aggregation etkileri (TenantScopeService/
  ReportDatasetProvider gerçek koduyla çapraz kontrol), PostgreSQL migration
  kararı kesinleştirilmedi (Q-M05 korundu). docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  3 yeni soru (Q-SC01-Q-SC03) append edildi (mevcut Q-M/Q-A/Q-S/Q-E/Q-T serisi
  ve özet tablo korunarak); Q-S03/Q-M06/Q-T01 değiştirilmedi, yalnızca somut
  kanıtlarla ilişkilendirildi. Wave 2/3 kapsam dışı korundu. Gerçek secret/
  parola/connection string hiçbir dokümana yazılmadı (yalnızca FromSqlRaw
  string literal'leri incelendi). ./scripts/check.sh --skip-docker PASS (kod
  değişikliği yok). Hiçbir implementation kararı kesinleştirilmedi. Nihai
  `done` kararı AI1/Product Owner'a bırakıldı. AI1 teslimi onayladı ve
  TASK-027.5 status'u done olarak kapatıldı.
  TASK-027.6 (bkz. backlog/TASK-027-6-bot-app-postgresql-target-mapping.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.3 done)
  uygulandı: BOTC User/Role/Permission/UserPermission/VisibilitySettings,
  Metnex'in gerçek PostgreSQL şemasıyla (apps/api/src/db/schema/platform.ts —
  users, tenants, tenantMemberships, tenantRoles/tenantRolePermissions/
  userTenantRoleAssignments, systemRoles/permissions/rolePermissions/
  userSystemRoleAssignments, authSessions, userMfaSettings,
  tenantSecuritySettings) alan-alan eşlendi. Kritik yapısal bulgu: Metnex'in
  iki ayrı rol modeli (tenant-kapsamlı tenantRoles vs. platform-kapsamlı
  systemRoles) olduğu, BOTC'nin tek düz Role/Permission modelinin bu
  ikisinden hangisine eşleneceğinin önceden hiç ele alınmamış olduğu tespit
  edildi (Q-P01). User alanları 4 kategoriye ayrıldı (taşınacak: Username/
  FullName/IsActive/CreatedDate; yeniden hash'lenecek: PasswordHash — BOTC
  düz-metin+global-salt vs. Metnex scrypt+per-user-salt uyumsuzluğu kod
  kanıtıyla teyit edildi; Wave 2/3'e özel taşınmayan: IsMaintenanceMember vb.;
  karar bekleyen: Sirket, Username/Email ayrımı, IsEmailVerified).
  UserPermission'ın rol-temelli mi birebir mi taşınacağı Q-M04'e bağlı
  kesinleştirilmedi. VisibilitySettings taşınma kararı karar bekliyor olarak
  işaretlendi (Q-P02). Legacy ID/UUID mapping ihtiyacı yalnızca belgelendi,
  implementation yapılmadı. Tenant ataması için Sirket güvenilir kaynak kabul
  edilmedi, Q-M06/TASK-027.4'e bağlandı. Düz-metin parola fallback/global
  salt/gömülü AES anahtarının taşınmadığı teyit edildi. docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  3 yeni soru (Q-P01-Q-P03) append edildi (mevcut seri ve özet tablo
  korunarak). Wave 2/3 kapsam dışı korundu. Gerçek secret/parola/hash/
  connection string hiçbir dokümana yazılmadı. ./scripts/check.sh
  --skip-docker PASS (kod değişikliği yok). Hiçbir implementation kararı
  kesinleştirilmedi. AI1 teslimi onayladı ve TASK-027.6 status'u done olarak
  kapatıldı. PO kararları gerektiren noktalar çözülmeden implementation
  yapılmayacaktır.
  TASK-027.7 (bkz. backlog/TASK-027-7-user-role-permission-migration-mapping.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.6 done)
  uygulandı: BOTC User/Role/Permission/UserPermission için Q-P01/Q-M03/Q-M04/
  Q-M06 karar seçenekleri karşılaştırıldı, hiçbiri implementation kararı
  olarak uygulanmadı. Kritik kod kanıtı: apps/api/src/platform/permission.guard.ts
  incelendiğinde, PLATFORM: prefiksli olmayan hiçbir izin kodunun systemRoles/
  rolePermissions üzerinden çözülmediği (yalnızca tenantRolePermissions veya
  TENANT_ADMIN hardcoded kısayolu) görüldü — bu, Q-P01 Seçenek B'yi (hepsi
  systemRoles) bugünkü guard koduyla teknik olarak çalışmaz kılıyor (kanıt,
  karar değil). Q-P01 için 3 seçenek (A: hepsi tenantRoles, B: hepsi
  systemRoles, C: Admin→systemRoles diğerleri→tenantRoles) tenant izolasyonu/
  root aggregation/permission guard uyumu/audit/operasyonel efor açısından
  karşılaştırıldı. Q-M04 için kullanıcı-başına-özel-rol vs. ortak-şablon
  seçenekleri eşit ağırlıkta sunuldu. Q-P03 için dönüşüm mekanizması
  sorumluluğu yalnızca öneri olarak belirtildi, atama yapılmadı. Tenant
  üyeliği/ataması üretilmedi (Q-M06/TASK-027.4'e bağlı kaldı). Teslimat:
  docs/migration/BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md. docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  1 yeni soru (Q-P04 — Admin rolü TENANT_ADMIN kısayolu mu, satır satır izin
  mi, Q-P01 "C" seçilirse devreye girer) append edildi (mevcut seri ve özet
  tablo korunarak). Wave 2/3 kapsam dışı korundu. Gerçek secret/parola/hash/
  connection string hiçbir dokümana yazılmadı. ./scripts/check.sh
  --skip-docker PASS (kod değişikliği yok). Hiçbir implementation kararı
  kesinleştirilmedi. AI1 teslimi onayladı ve TASK-027.7 status'u done olarak
  kapatıldı. PO kararları çözülmeden implementation yapılmayacaktır.
  TASK-027.8 (bkz. backlog/TASK-027-8-legacy-password-secret-migration-decision.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.7 done)
  uygulandı: BOTC parola/secret geçiş stratejisi karar matrisi üretildi,
  hiçbir strateji implementation kararı olarak seçilmedi. Kritik bulgular:
  (1) BOTC'de kullanıcı-başına-salt deseni (PasswordHasher.HashToBase64)
  kodlanmış ama hiç çağrılmıyor — üretimde hâlâ tek global salt
  (HashWithSaltBase64 + Auth:PasswordSalt) kullanılıyor, geliştiricilerin
  zayıflığın farkında olup düzeltmediğini gösteren kod içi yorum kanıtı var.
  (2) Metnex'te bugün self-servis parola sıfırlama/e-posta doğrulama akışı
  yok (grep ile tüm apps/api/src ve apps/web/src'de sıfır sonuç), yalnızca
  admin-driven setPassword/createUser var — yeni açık soru Q-PW01. (3) BOTC
  (PBKDF2-HMAC-SHA256, 100k iterasyon, global salt) ile Metnex (scrypt,
  per-user salt) formatları temelde uyumsuz, birebir taşınamaz (ikinci kez
  kod kanıtıyla teyit edildi). Teslimat:
  docs/migration/BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md — 3
  strateji karar matrisi (Zorunlu sıfırlama / İlk girişte kontrollü oluşturma
  / Geçici legacy doğrulama+yükseltme) güvenlik/UX/operasyon/rollback
  açısından karşılaştırıldı; Strateji 3'ün mimari karar dokümanının "auth
  zayıflıkları taşınmaz" ilkesiyle gerilim yarattığı gözlem olarak (karar
  değil) not edildi. Düz metin/eski hash/global salt/AES anahtarının
  hiçbirinin taşınamayacağı teyit edildi. Q-A03 ile 4 alt-boyut
  ilişkilendirildi. authSessions'a migration'da hiçbir satır yazılmayacağı,
  BOTC session snapshot modelinin taşınmadığı teyit edildi. Q-P01/Q-M04/
  Q-M06 çözülmeden implementation üretilmediği teyit edildi. docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  1 yeni soru (Q-PW01 — geçici parola/reset bilgisi hangi kanaldan
  iletilecek) append edildi (mevcut seri ve özet tablo korunarak). Wave 2/3
  kapsam dışı korundu. Gerçek secret/parola/hash/salt/token/connection
  string hiçbir dokümana yazılmadı. ./scripts/check.sh --skip-docker PASS
  (kod değişikliği yok). Hiçbir implementation kararı kesinleştirilmedi.
  AI1 teslimi onayladı ve TASK-027.8 status'u done olarak kapatıldı. PO
  kararı çözülmeden password migration implementation yapılmayacaktır.
  TASK-027.9 (bkz. backlog/TASK-027-9-sql-server-readonly-adapter-architecture.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.5 done)
  uygulandı: SCADA/DMS SQL Server kaynaklarına güvenli, read-only,
  tenant-scope'lu erişim mimarisi belgelendi. İki BOTC erişim yolu
  (DynamicDataSources+QueryService vs. IsletmeRaporlariWindow hardcoded
  FromSqlRaw) mimari uygunluk açısından karşılaştırıldı, hangisinin referans
  alınacağı (Q-SC02) kesinleştirilmedi. Admin-küratörlü allowlist modeli
  (database/schema/table/column/sorgu-filtre) somutlaştırıldı. Read-only
  erişim gereksinimleri (ayrı credential, bağlantı izolasyonu, çift-katman
  SELECT-only, timeout/cancellation, connection pool sınırları, satır/kolon/
  boyut limitleri, hata/empty-result sözleşmesi) Metnex'in var olan
  desenlerine (report-render.service.ts'nin AbortController timeout+iptal
  deseni ve MAX_PAYLOAD_BYTES boyut sınırı deseni) dayandırılarak
  tanımlandı — yeni bir desen icat edilmedi. Tenant scope entegrasyonu
  TenantScopeService.resolve()/canAggregateChildren ile eşlendi, MİP root
  aggregation davranışı (her tenant kaynağı izole sorgulanır) açıklandı.
  Audit sözleşmesi gerçek platform-audit.service.ts'nin PlatformAuditLogInput
  alanlarına eşlendi (actorId/actionCode/entityType/entityId/summary/
  metadata, scrubSecrets() ile korunur). QUOTENAME'siz BOTC yaklaşımının ve
  INFORMATION_SCHEMA canlı keşfinin taşınmayacağı teyit edildi. PostgreSQL
  cache/canlı-sorgu kararı (Q-M05/Q-SC03) kesinleştirilmedi. Teslimat:
  docs/migration/METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md.
  docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye 1 yeni soru (Q-AD01 —
  SCADA sorgu audit kayıtları genel log'a mı ayrı tabloya mı) append edildi
  (mevcut seri ve özet tablo korunarak). Wave 2/3 kapsam dışı korundu.
  Gerçek secret/parola/connection string/veri satırı hiçbir dokümana
  yazılmadı, canlı SQL Server'a bağlanılmadı. ./scripts/check.sh
  --skip-docker PASS (kod değişikliği yok). Hiçbir implementation kararı
  kesinleştirilmedi. AI1 teslimi onayladı ve TASK-027.9 status'u done olarak
  kapatıldı. Cache/canlı sorgu, dataset sözleşmesi ve audit hacmi kararları
  çözülmeden implementation yapılmayacaktır.
  TASK-027.10 (bkz. backlog/TASK-027-10-migration-dry-run-idempotency-rollback-standard.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.1 + TASK-027.6
  done) uygulandı: BOTC→Metnex migration işlemleri için ortak dry-run/
  idempotency/backup/rollback/audit standardı belgelendi. Metnex'in gerçek
  kod desenleri temel alındı: customer-schema-registry.service.ts (idempotent
  provisioning, durum makinesi, onConflictDoUpdate, FAILED'ten yeniden
  deneme), bootstrap.service.ts (db.transaction() sınırı örneği), gerçek
  backup/openmas-pre-metnex-migration-20260917_072650.dump + .sha256
  (TASK-024.5'te fiilen üretilmiş backup+checksum+isimlendirme deseni),
  platform-audit.service.ts (audit sözleşmesi, migration run metadata'sına
  genişletildi). Teslimat: docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md
  — 8 aşamalı yaşam döngüsü (preflight/backup/dry-run/approval gate/apply/
  verification/reconciliation/finalize-rollback), 8 alanlı dry-run çıktı
  standardı, 4 idempotency kuralı, backup standardı (gerçek dump/checksum
  deseni), 4 rollback stratejisi karşılaştırması (hiçbiri seçilmedi, hiçbir
  rollback komutu çalıştırılmadı), transaction sınırları hazırlığı, 5
  doğrulama kapısı (tenant/role/permission/user/legacy-ID, ilgili açık
  sorulara bağlandı), 4 hata kategorisi (fatal/recoverable/warning/skipped),
  audit/migration run metadata standardı, dry-run/apply karşılaştırılabilirliği.
  docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye 2 yeni soru (Q-MG01 —
  approval gate hangi arayüzden, Q-MG02 — migration run metadata konumu)
  append edildi (mevcut seri ve özet tablo korunarak). Wave 2/3 kapsam dışı
  korundu. Gerçek secret/parola/hash/connection string hiçbir dokümana
  yazılmadı. ./scripts/check.sh --skip-docker PASS (kod değişikliği yok).
  Hiçbir implementation kararı/script üretilmedi. AI1 teslimi onayladı ve
  TASK-027.10 status'u done olarak kapatıldı. Q-MG01/Q-MG02 çözülmeden
  migration implementation başlatılmayacaktır.
  TASK-027.11 (bkz. backlog/TASK-027-11-identity-hedef-modeli-ve-migration-schema.md,
  status: done, parent_epic: EPIC-004, bağımlılık: TASK-027.7 + TASK-027.10
  done) uygulandı: BOTC kimlik verilerinin Metnex'e aktarımı için hedef
  identity modeli ve kavramsal migration staging şeması tasarlandı — hiçbir
  Drizzle şeması/migration dosyası/seed üretilmedi. apps/api/src/db/schema/
  platform.ts yeniden okunarak 11 identity tablosu güncel kodla doğrulandı
  (TASK-027.6'dan bu yana değişiklik yok). CustomerSchemaStatus (PROVISIONING/
  ACTIVE/FAILED/ARCHIVED) gerçek enum deseni, staging status yaşam döngüsü
  tasarımına referans alındı. Teslimat: docs/migration/METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md
  — migration_staging_identity kavramsal tasarımı (10 alan: legacy kimlik,
  kaynak/hedef entity tipi, hedef ID, migration run ID, mapping status, hata
  kodu/açıklaması, checksum, zaman damgaları), 6 durumlu mappingStatus yaşam
  döngüsü, legacy ID→UUID mapping yaklaşımı (staging tablosunun kendisi
  mapping görevini üstlenir), idempotency/tekrar-çalıştırma davranışı,
  benzersizlik kısıtı tasarımı, transaction sınırları, tenant membership
  zorunluluğunun korunması, Sirket'in tenant kaynağı olarak kullanılmaması
  (Q-M06'ya bağlı), PasswordHash için gerçek değer taşımayan passwordStrategy
  durum modeli önerisi (RESET_REQUIRED/ADMIN_ASSIGNED/PENDING_DECISION),
  authSessions'a staging/session transferi üretilmediği teyidi, Role modeli
  (Q-P01) ve UserPermission dönüşümünün (Q-M04) kesinleştirilmediği teyidi,
  VisibilitySettings'in karar bekliyor olarak korunması (Q-P02). docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye
  1 yeni soru (Q-ID01 — staging tablosu hangi şemada, retention politikası
  ne) append edildi (mevcut seri ve özet tablo korunarak). Wave 2/3 kapsam
  dışı korundu. Gerçek secret/parola/hash/salt/connection string hiçbir
  dokümana yazılmadı. ./scripts/check.sh --skip-docker PASS (kod değişikliği
  yok). Hiçbir Drizzle şeması/migration dosyası/seed üretilmedi. Nihai `done`
  kararı AI1/Product Owner'a bırakıldı.
  TASK-027.11-R1 düzeltmesi (2026-09-17): AI1, §7 (transaction sınırları) ile
  §8 (tenant membership zorunluluğu) arasındaki iç tutarsızlığı ve §4.1'deki
  targetId'nin SKIPPED durumunda tanımsız kalmasını tespit etti. Düzeltme:
  üç-katmanlı tamamlanma modeli eklendi (identity user mapping tamamlandı /
  tenant membership mapping tamamlandı / kullanıcı runtime erişime hazır,
  yeni tenantMembershipStatus alanı ile), targetId'nin COMPLETED ve SKIPPED
  durumlarının ikisinde de dolu olduğu, diğer durumlarda boş/korunmuş olduğu
  açıkça tanımlandı. Q-P01/Q-M03/Q-M04/Q-M06/Q-A03/Q-PW01/Q-ID01 kararları
  değiştirilmedi. Hiçbir Drizzle şeması/migration/seed yazılmadı.
  ./scripts/check.sh --skip-docker PASS. AI1 R1 düzeltmesini onayladı ve
  TASK-027.11 status'u done olarak kapatıldı. Q-P01/Q-M03/Q-M04/Q-M06 çözülmeden
  identity migration implementation başlatılmayacaktır.
  TASK-027.12 (bkz. backlog/TASK-027-12-user-migration-mapping-implementation.md,
  status: review, parent_epic: EPIC-004, bağımlılık: TASK-027.11 done) ele
  alındı — görevin kendi başlatma koşulu gereği önce Q-P01/Q-M03/Q-M04/Q-M06/
  Q-A03/Q-PW01 karar kapıları kontrol edildi. docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md
  baştan sona taranarak 6 kapının **tamamının hâlâ açık** olduğu doğrulandı
  (hiçbirinde kapanış işareti bulunamadı; önceki AI1 onaylarının yalnızca
  dokümantasyon kalitesini onayladığı, soruların kendisini kapatmadığı
  PROGRESS_LOG.md kayıtlarından teyit edildi). Bu nedenle görev talimatının
  kendi kuralına uyularak **hiçbir implementation üretilmedi** — Drizzle
  şeması, migration/seed kodu, dry-run script'i veya SQL Server bağlantısı
  yok. Teslimat: docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md —
  blocker raporu: 6 kapının güncel durum tablosu, görev talimatının her
  kapsam maddesinin hangi kapı tarafından bloklandığının açık eşlemesi, PO'nun
  her kapıyı kapatmak için bakması gereken belge/bölüm haritası. Yeni açık
  soru üretilmedi — mevcut 6 sorunun durumu yalnızca doğrulandı. Wave 2/3
  kapsam dışı korundu. Gerçek secret/parola/hash/connection string hiçbir
  dokümana yazılmadı. ./scripts/check.sh --skip-docker PASS (kod değişikliği
  yok). Production kodu, PostgreSQL, SQL Server, Docker değişmedi. Nihai
  değerlendirme AI1/Product Owner'a bırakıldı.
  TASK-027.12-R1 (bkz. backlog/TASK-027-12-R1-wave1-identity-karar-kapilarinin-kapatilmasi.md,
  status: review, parent_epic: EPIC-004) uygulandı: AI1/Product Owner,
  TASK-027.12'nin bloke olduğu 6 karar kapısını (Q-P01, Q-M03, Q-M04, Q-M06,
  Q-A03, Q-PW01) kapattı. Kararlar: Q-P01 → BOTC rolleri tenantRoles'a
  taşınır (systemRoles yalnızca platform yönetimi için), Q-P04 artık moot;
  Q-M03 → mevcut MODULE:RESOURCE:ACTION taslağı kesinleşti; Q-M04 → ortak
  permission-set'lerinden tenant-kapsamlı rol şablonu (kullanıcı-başına-özel-
  rol yok); Q-M06 → Sirket kullanılmayacak, ayrı onaylı mapping tablosu,
  bilinen tenant'lar MOSB/MOSEDAŞ/MOSBİO, belirsiz lokasyonlar (Q-T01) karar
  bekleyen kayıt olarak kalır; Q-A03 → BOTC hash/global salt taşınmaz,
  zorunlu parola sıfırlama (passwordStrategy=RESET_REQUIRED); Q-PW01 →
  self-servis e-posta akışı yok, ilk aşamada admin-driven parola atama.
  Kararlar docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md'ye append-only
  "Karar Kapanışları" bölümüyle (her karar için gerekçe/etkilenen task/kalan
  risk/rollback ihtiyacı) ve BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md,
  BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md, BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md,
  METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md dosyalarına
  işlendi — orijinal karşılaştırma tabloları kanıt kaydı olarak korundu,
  yalnızca sonuç işaretlendi. backlog/TASK-027-12-...md'ye kapanış özeti
  eklendi. Hiçbir implementation, Drizzle şeması, migration/seed, SQL Server
  bağlantısı üretilmedi. Q-P02 ve Q-ID01 bu R1'in kapsamında değildir, açık
  kalmıştır. ./scripts/check.sh --skip-docker PASS (kod değişikliği yok).
  TASK-027.12'nin implementation'ı AI1'in bu R1'i onaylamasından sonra
  başlatılabilir.
---

Bu dosya tek kaynak özet durumdur. Detay/kanıt kaynağı `backlog/EPIC-*.md`
dosyalarıdır; çelişki halinde EPIC dosyaları esas alınır ve bu dosya
düzeltilir. Süreç: `../runbooks/PROJECT_LIFECYCLE_AND_STATUS_RUNBOOK.md`.

## 2026-09-17 — TASK-027.12-R1 AI1 Onayı

Wave 1 identity karar kapıları R1 kapsamında onaylandı ve R1 `done` oldu. Q-P01,
Q-M03, Q-M04, Q-M06, Q-A03 ve Q-PW01 kararları migration dokümanlarına işlendi.
TASK-027.12 User Migration Mapping Implementation `ready` durumuna geçti.

Q-P02, Q-ID01 ve Q-T01/Q-SC01'in lokasyon-özel kısımları açık kalır; bunlar bu
implementation'ın kapsamı dışındadır. Belirsiz lokasyonlu kayıtlar tenant üyeliği
çözümlenmeden runtime erişime hazır sayılmayacaktır. Canlı PostgreSQL apply, gerçek
SQL Server erişimi ve credential/veri kullanımı ayrıca AI1 onayı gerektirir.

## 2026-09-17 — TASK-027.12 AI1 Onayı

Wave 1 User Migration Implementation tamamlandı ve `done` olarak onaylandı. Migration
engine yalnızca in-memory staging/simulated target üzerinde çalışır; gerçek SQL Server
ve PostgreSQL bağlantısı veya apply yapılmadı. Onaylı beş permission kodu dışındaki
izinler uydurulmadan `unmapped` olarak raporlanır. `Sirket` okunmaz, belirsiz tenant
üyelikleri `UNRESOLVED`, parolalar `RESET_REQUIRED` olarak tutulur.

Q-ID01, Q-P02 ve Q-T01/Q-SC01 açık/kapsam dışı kalır. Wave 2 ve Wave 3 kapsam dışıdır.
`./scripts/check.sh --skip-docker` PASS; 21 suite / 124 test kabul edildi.

## 2026-09-17 — TASK-027.12 Wave 1 User Migration Implementation (AI2 teslimi, review)

`apps/api/src/migration/botc-identity/` altında BOTC kullanıcı/rol/permission/tenant-üyelik
verisini Metnex identity modeline dönüştüren bir migration/dry-run motoru eklendi (14 kaynak
dosya + 6 `*.spec.ts`, 25 test). Legacy ID→UUID mapping, Q-M03 permission kod eşlemesi (yalnızca
onaylı 5 kod), Q-M04 ortak rol şablonu kümeleme, Q-M06 onaylı tenant mapping tablosu (`Sirket`
hiç okunmuyor), duplicate/conflict deterministik çözümleme, `tenantMembershipStatus`/
`passwordStrategy`, 8+ alanlı dry-run raporu, idempotent re-run ve FAILED kayıt retry'i uygulandı.

Q-ID01 koruması tetiklenmedi: staging, fiziksel bir Drizzle şeması/migration yerine yalnızca
process ömrü boyunca yaşayan bir in-memory simülasyon (`InMemoryStagingStore`) olarak
uygulandı — Q-ID01 (şema yerleşimi/retention) hâlâ tamamen açık, bu implementasyon onu
bypass eder, kapatmaz. Aynı gerekçeyle Q-P02 (`VisibilitySettings`) hiç ele alınmadı. Gerçek
SQL Server adapter'ı, gerçek PostgreSQL apply ve `authSessions` yazımı **hiçbiri** üretilmedi —
apply yalnızca in-memory `SimulatedTargetState`'e yazar. `pnpm --filter api exec tsc --noEmit`
(0 hata), yeni 6 test suite/25 test dahil `./scripts/check.sh --skip-docker` (21 suite/124 test,
PASS). `backlog/TASK-027-12-user-migration-mapping-implementation.md` status `ready` → `review`.
Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-17 — TASK-027.13 Wave 1 Identity Migration Engine Integration Boundary (AI2 teslimi, review)

TASK-027.12'nin motoru (`migration-run.service.ts` ve TASK-027.12'nin 9 mevcut dosyası)
**hiç değiştirilmeden**, `apps/api/src/migration/botc-identity/` altına 4 yeni dosya eklendi:
`source-validation.ts` (preflight — boş/duplicate legacy ID, orphan role/permission/user
referansı, geçersiz tenant slug, çakışan tenant mapping, eksik zorunlu alan; 8 kural),
`tenant-mapping-adapter.ts` (`ApprovedTenantMappingAdapter` port'u, `BotcIdentitySourceAdapter`
ile aynı desende), `source-validation.spec.ts` (10 test) ve `integration-boundary.spec.ts`
(16 test — motoru kara kutu olarak ele alan entegrasyon sözleşmesi testleri: frozen
input/output contract, DRY_RUN/APPLY ayrımı, 9 zorunlu çıktı artefaktı, idempotency/retry,
permission/tenant/parola davranışı korunumu, gerçek bağlantı olmadığının statik doğrulaması).

Giriş/çıkış sözleşmesi, adapter sınırları, preflight kuralları ve gelecekteki gerçek adapter
bağlantısı planı `docs/migration/METNEX_IDENTITY_MIGRATION_ENGINE_INTEGRATION_BOUNDARY.md`'de
belgelendi. `pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh --skip-docker`
(23 suite/150 test, PASS — önceki 21/124'ten). `backlog/TASK-027-13-role-migration-
implementation.md` (id: TASK-027.13, AI1'in yeni talimatıyla yeniden görevlendirildi, orijinal
"Role migration implementation" hiç başlatılmamıştı) status `planned` → `review`. Q-ID01/Q-P02/
Q-T01/Q-SC01 hâlâ açık/kapsam dışı; gerçek SQL Server/PostgreSQL bağlantısı/apply yapılmadı.
Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.13 AI1 Onayı

Wave 1 Identity Migration Engine Integration Boundary teslimi onaylandı ve TASK-027.13
`done` olarak kapatıldı. TASK-027.12 motorunun değiştirilmediği; preflight validation,
adapter portları ve entegrasyon sözleşmesi testlerinin eklendiği doğrulandı.

Gerçek SQL Server/PostgreSQL bağlantısı, apply, Q-ID01 staging kararı, secret/parola
aktarımı veya Wave 2/Wave 3 kodu üretilmedi. Q-ID01, Q-P02 ve Q-T01/Q-SC01 açık/kapsam
dışı korunmuştur. `./scripts/check.sh --skip-docker` PASS; 23 suite / 150 test kabul edildi.

## 2026-09-18 — TASK-027.14 AI1 Onayı

Permission Mapping Coverage and Governance Boundary teslimi onaylandı ve TASK-027.14
`done` olarak kapatıldı. Coverage katmanı salt-okunur kaldı; onaylı 5 mapping değişmedi,
yeni permission kodu üretilmedi ve unmapped kayıtlar erişim üretmeden `BLOCKED` olarak
raporlandı.

`ASSIGNABLE_CATALOGUE` ile onaylı BOTC kodları arasındaki kesişimsizlik gerçek apply
ön koşulu olarak kayda alındı; production catalogue değiştirilmedi. Q-ID01, Q-P02,
Q-T01/Q-SC01 ve Wave 2/Wave 3 kapsam dışıdır. `./scripts/check.sh --skip-docker` PASS;
25 suite / 175 test kabul edildi.

## 2026-09-18 — TASK-027.15-R1 ve TASK-027.15 AI1 Onayı

Tenant Conflict Access Gate Correction onaylandı ve R1 `done` oldu. Çakışan tenant
mapping kullanıcısı `resolved` map'inden çıkarılarak `UNRESOLVED` akışına alındı; bu
kullanıcıya tenant membership veya runtime erişim üretilmiyor. Conflict düzeltilmiş
onaylı mapping ile sonraki çalıştırmada tek geçerli membership üretilebiliyor.

TASK-027.15 ana kaydı da `done` olarak kapatıldı. Q-T01, Q-S03, Q-ID01, Q-P02 ve
Wave 2/Wave 3 kapsam dışı kaldı. `./scripts/check.sh --skip-docker` PASS;
27 suite / 208 test kabul edildi.

## 2026-09-18 — TASK-027.14 Permission Mapping Coverage and Governance Boundary (AI2 teslimi, review)

TASK-027.12/13'ün motoru **hiç değiştirilmeden**, `apps/api/src/migration/botc-identity/`
altına `permission-coverage.ts` (unmapped permission rapor şekli sabitlendi: legacy ID/name,
errorCode, description, migrationRunId, retryable; + gerçek `permission-catalogue.ts` ile
karşılaştırmalı coverage raporu, salt-okunur import) eklendi. Onaylı 5 kod
(`permission-mapping.ts`) değişmedi; yeni kod icat edilmedi. Mapping coverage: 5 onaylı,
4 Wave 2 beklemede, 5 Wave 3 beklemede, 3 Wave 1/4 kapsamında kod ataması yok. Bulgu: gerçek
`ASSIGNABLE_CATALOGUE` (10 kod) ile 5 onaylı BOTC kodu arasında hiç kesişim yok, ve
`ASSIGNABLE_CATALOGUE` hiçbir production dosyasında kullanılmıyor — gerçek apply için ayrı bir
ön koşul olarak not edildi, karar alınmadı. 25 yeni/genişletilmiş test (permission staging
durumları COMPLETED/BLOCKED, UserPermission erişim-güvenliği, role template determinizm —
izin sırası/duplicate grant/unmapped grant imza etkisi yok) eklendi.
`docs/migration/BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` §3'teki Q-M03 için unutulmuş
"karar bekliyor" ibaresi, TASK-027.12-R1'in gerçek kapanışıyla tutarlı hâle getirildi (yeni bir
karar değil, tutarlılık düzeltmesi). `pnpm --filter api exec tsc --noEmit` (0 hata),
`./scripts/check.sh --skip-docker` (25 suite/175 test, PASS — önceki 23/150'den).
`backlog/TASK-027-14-permission-migration-implementation.md` status `planned` → `review`. Gerçek
SQL Server/PostgreSQL bağlantısı/apply yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.14 AI1 Onayı

Permission Mapping Coverage and Governance Boundary teslimi onaylandı ve TASK-027.14 `done`
olarak kapatıldı. Coverage katmanının yalnızca okuma yaptığı, onaylı 5 permission mapping'inin
değişmediği, yeni kod üretilmediği ve unmapped permission/UserPermission kayıtlarının erişim
üretmeden `BLOCKED` olarak raporlandığı doğrulandı.

`ASSIGNABLE_CATALOGUE` ile onaylı BOTC kodları arasındaki kesişimsizlik gerçek bir apply ön
koşulu olarak kayda alınmıştır; production catalogue/permission modeli değiştirilmemiştir.
Q-ID01, Q-P02, Q-T01/Q-SC01 ve Wave 2/Wave 3 kapsam dışıdır. `./scripts/check.sh --skip-docker`
PASS; 25 suite / 175 test kabul edildi.

## 2026-09-18 — TASK-027.15 Tenant Mapping Coverage and Assignment Governance Boundary (AI2 teslimi, review)

TASK-027.12–14'ün motoru (`tenant-mapping.ts`, `tenant-mapping-adapter.ts`,
`migration-run.service.ts` dahil) **hiç değiştirilmeden**, `apps/api/src/migration/botc-identity/`
altına `tenant-coverage.ts` (sabit 7 alanlı tenant mapping rapor şekli + toplam/ASSIGNED/
UNRESOLVED/conflict/orphan/tenant-bazlı coverage raporu, statik "bilinen belirsiz lokasyon"
referansı — `Sirket`'e hiç bakmaz) eklendi. `source-validation.ts`'e 3 yeni kural eklendi (mevcut
8 kural korundu): boş tenant slug, orphan tenant mapping kaydı, duplicate mapping satırı. 21 yeni
test (`tenant-coverage.spec.ts`, `tenant-governance.spec.ts`, `source-validation.spec.ts`
genişletmesi) eklendi — ASSIGNED/UNRESOLVED/conflict davranışı, `Sirket`'in motorun hiçbir yerinde
okunmadığı (davranışsal + statik dosya taraması), idempotency (duplicate yok, gecikmeli çözülen
mapping otomatik yeniden işlenir, checksum değişikliği güvenli), root tenant/aggregate'in
genişletilmediği (`TenantScopeService`/`canAggregateChildren`'a hiç referans yok) doğrulandı.
Yeni bir tenant, tenant slug'ı veya root-aggregate yetkisi icat edilmedi; Q-T01/Q-S03 **açık
kaldı, kapatılmadı**. `pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh
--skip-docker` (27 suite/201 test, PASS — önceki 25/175'ten).
`backlog/TASK-027-15-tenant-user-assignment-migration.md` status `planned` → `review`. Gerçek
SQL Server/PostgreSQL bağlantısı/apply yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.15-R1 Tenant Conflict Access Gate Correction (AI2 teslimi, review)

AI1, TASK-027.15'in ilk tesliminde kritik bir güvenlik tutarsızlığı tespit etti: çakışan tenant
mapping kayıtları `FATAL_CONFLICTING_TENANT_ASSIGNMENT` olarak raporlanmasına rağmen
`MigrationRunService` çakışan kullanıcıya yine de ilk mapping kaydına göre bir tenant membership
yazıyordu (kabul kriteriyle "conflict kayıtları erişim üretmeden raporlanmalı" doğrudan çelişen
bir açık). TASK-027.15 `done` olarak onaylanmadı, `status: review` kaldı.

Kök neden ve düzeltme tek bir paylaşılan fonksiyonda bulundu: `duplicate-detection.ts`'teki
`detectConflictingTenantAssignments()`, çakışma tespit ettiğinde ilk kaydı `resolved` map'inde
tutmaya devam ediyordu (deterministik *raporlama* amaçlı düşünülen bu seçim, yanlışlıkla gerçek
atama değeri olarak da kullanılıyordu). Düzeltme: çakışan kullanıcı artık `resolved`'dan
**tamamen çıkarılıyor** — `MigrationRunService`/`computeTenantMappingCoverage` **hiç
değiştirilmedi**, zaten var olan "mapping tablosunda yok → UNRESOLVED" yolunu otomatik olarak
doğru şekilde kullanmaya başladılar. `FATAL_CONFLICTING_TENANT_ASSIGNMENT` raporu korundu.

4 mevcut test (yanlış "ilk kayda çözülür" davranışını doğrulayan) düzeltildi, 7 yeni test eklendi
(iki kez çalıştırma erişim üretmiyor, düzeltilmiş mapping ile tek geçerli membership oluşuyor,
başka kullanıcıları etkilemiyor, rapor deterministik, DRY_RUN güvenlik davranışı korunuyor).
`pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh --skip-docker` (27 suite/208
test, PASS — önceki 27/201'den; TASK-027.12/13/14'ün testlerinin hiçbiri bozulmadı).
`docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md` §0-C'ye R1 düzeltme notu eklendi, yanlış
açıklamalar düzeltildi. `backlog/TASK-027-15-R1-tenant-conflict-access-gate-correction.md` (yeni,
status: review) oluşturuldu; ana `TASK-027-15` kaydı `review` durumunda kalır. Gerçek SQL Server/
PostgreSQL bağlantısı/apply yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.15-R1 AI1 Onayı

Tenant Conflict Access Gate Correction teslimi onaylandı; TASK-027.15-R1 ve ana TASK-027.15
kaydı `done` olarak kapatıldı. Conflict tespit edilen kullanıcıların `resolved` map'inden
çıkarıldığı, conflict durumunda hiçbir tenant membership veya runtime erişim üretilmediği ve
düzeltilmiş mapping tablosuyla sonraki çalıştırmada tek geçerli membership oluştuğu doğrulandı.

Q-T01, Q-S03, Q-ID01, Q-P02 ve Wave 2/Wave 3 kapsam dışı korunmuştur. `./scripts/check.sh
--skip-docker` PASS; 27 suite / 208 test kabul edildi.

## 2026-09-18 — TASK-027.16 Password Reset Import and Admin Assignment Boundary (AI2 teslimi, review)

Motorun mevcut parola sözleşmesi (`RESET_REQUIRED` zorunlu taban, `ADMIN_ASSIGNED` ek bayrak,
Q-A03/Q-PW01) **gereksiz yere değiştirilmeden** doğrulandı. `apps/api/src/migration/botc-identity/
password-boundary.ts` (yeni) eklendi: `validatePasswordStrategyInvariant` + genel amaçlı
`scanForCredentialFields`/`assertNoCredentialFields` credential-alan tarayıcısı. 31 yeni test
(`password-boundary.spec.ts`, `password-governance.spec.ts`) eklendi.

**Bulunan ve düzeltilen gerçek davranış hatası:** `migration-run.service.ts`, bir kullanıcının
güncellemesinde `passwordStrategies`'i sıfırdan yeniden hesaplıyordu, önceden kaydedilmiş
`ADMIN_ASSIGNED`'ı o çalıştırmanın `adminAssignedPasswordLegacyIds` kümesine yeniden dahil
edilmezse **sessizce kaybediyordu**. Minimal, tek noktadan düzeltme: `ADMIN_ASSIGNED` artık bir
kez kaydedildikten sonra korunur (targetId'nin korunma ilkesiyle aynı desen). Diğer hiçbir motor
dosyası değiştirilmedi.

Gerçek `DryRunReport`/audit-metadata/staging-record çıktıları üzerinde programatik credential
taraması sıfır ihlal buldu. `authSessions`/session/cookie/JWT'ye ve self-servis akış
kavramlarına (`resetPassword`/`verifyEmail`/SMS-provider) hiçbir referans olmadığı statik dosya
taramasıyla doğrulandı. `pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh
--skip-docker` (29 suite/234 test, PASS — önceki 27/208'den). `docs/migration/
BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §13 ve `METNEX_USER_MIGRATION_IMPLEMENTATION.md`
§0-D eklendi. `backlog/TASK-027-16-password-reset-import-flow.md` status `planned` → `review`.
Q-ID01/Q-P02/Q-T01/Q-SC01 kapsam dışı; gerçek SQL Server/PostgreSQL bağlantısı/apply yapılmadı.
Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.16 AI1 Onayı

Password Reset Import and Admin Assignment Boundary teslimi onaylandı ve TASK-027.16
`done` olarak kapatıldı. `RESET_REQUIRED` zorunlu tabanının ve `ADMIN_ASSIGNED` ek
durumunun korunduğu; admin assignment bilgisinin sonraki çalıştırmalarda kaybolmadığı
doğrulandı. Credential taramaları rapor/audit/staging çıktılarında ihlal bulmadı.

Self-servis reset/email verification/session üretimi, gerçek parola/hash/secret ve gerçek
DB apply kapsam dışı kaldı. Q-ID01, Q-P02, Q-T01/Q-SC01 ve Wave 2/Wave 3 kapsam dışıdır.
`./scripts/check.sh --skip-docker` PASS; 29 suite / 234 test kabul edildi.

## 2026-09-18 — TASK-027.17 Identity Session and Email Verification Boundary (AI2 teslimi, review)

Migration motorunun session/cookie/token/email-verification/self-servis parola akışlarına
**yanlışlıkla bağımlı hale gelmesini** engelleyen bir sınır kuruldu — motorun mevcut 6 işlevi
(user/role-template/permission/tenant mapping, password strategy, dry-run/apply)
**değiştirilmeden**. `apps/api/src/migration/botc-identity/session-boundary.ts` (yeni):
`scanForSessionOrTokenFields`/`assertNoSessionOrTokenFields` — herhangi bir nesnede session/
token/cookie/jwt/verificationCode/resetLink deseni arayan salt-okunur tarayıcı.

19 yeni test (`session-boundary.spec.ts`, `session-email-governance.spec.ts`): statik dosya
taraması `authSessions`/`refreshTokenHash`/JWT/cookie/`AuthService`/`EmailService`/`SmsProvider`'a
ve `apps/api/src/platform/{auth,jwt,mfa}*` import'una hiçbir referans olmadığını doğruladı; gerçek
bir `APPLY` çalıştırmasının tüm çıktılarında (rapor/staging/audit/simulated target) sıfır session/
token alanı bulundu; `RESET_REQUIRED` kullanıcıların session'sız/otomatik-login'siz kaldığı,
`UNRESOLVED` tenant kullanıcısının erişime hazır sayılmadığı, `ADMIN_ASSIGNED`'ın yalnızca bir
durum etiketi olduğu (session/email/token üretmediği) doğrulandı; motorun mevcut işlevlerinin tek
bir uçtan-uca senaryoda değişmeden çalıştığı ayrıca smoke-test edildi.

`docs/migration/METNEX_IDENTITY_SESSION_AND_EMAIL_VERIFICATION_BOUNDARY.md` (yeni) — tam
entegrasyon sınırı dokümanı. `pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh
--skip-docker` (31 suite/254 test, PASS — önceki 29/234'ten). `backlog/TASK-027-17-email-
verification-session-migration.md` status `planned` → `review`. Q-ID01/Q-P02/Q-T01/Q-SC01 kapsam
dışı; gerçek SQL Server/PostgreSQL bağlantısı/apply yapılmadı. Nihai `done` kararı AI1'e
bırakılmıştır.

## 2026-09-18 — TASK-027.17 AI1 Onayı

Identity Session and Email Verification Boundary teslimi onaylandı ve TASK-027.17
`done` olarak kapatıldı. Migration modülüne session, token, cookie, JWT, email verification
ve self-servis reset akışı eklenmediği; gerçek APPLY çıktılarında session/token alanı
bulunmadığı doğrulandı.

`RESET_REQUIRED`, `ADMIN_ASSIGNED` ve `UNRESOLVED` tenant güvenlik sınırları korundu.
Gerçek parola/secret, gerçek DB apply ve auth session işlemleri kapsam dışı kaldı.
`./scripts/check.sh --skip-docker` PASS; 31 suite / 254 test kabul edildi.

## 2026-09-18 — TASK-027.18 Identity Migration CLI Dry-Run (AI2 teslimi, review)

Motoru (TASK-027.12–027.17, hiçbiri değiştirilmeden) sentetik/in-memory fixture'larla çalıştıran
gerçek, çalıştırılabilir bir dry-run CLI'ı eklendi: `apps/api/src/migration/botc-identity/cli/`
(`dry-run-cli.ts` saf çekirdek + `dry-run-cli-entry.ts` argv/dosya-I/O giriş noktası — yeni bir
build aracı/bağımlılık eklenmeden `nest build` ile derlenip `node dist/...` ile çalıştırılır).
**`--apply` seçeneği kod yolunda hiç yoktur** — gerçek PostgreSQL/SQL Server apply'ı yapısal olarak
imkânsızdır. 8 aşamalı çalışma sırası (input hijyeni → source/tenant validation → permission/tenant
coverage → motor dry-run → rapor → exit code) ve 0/1/2 exit code sözleşmesi uygulandı.

**Gerçekten derlenip gerçek bir process olarak çalıştırıldı** (varsayım değil): başarılı/karma
fixture → exit 0; conflict-tenant+orphan-mapping fixture → exit 1 (motor hiç çalışmadı); argümansız
çağrı → exit 2. 2 sentetik fixture 8 senaryonun tamamını kapsıyor (başarılı, unresolved-tenant,
conflict-tenant, unmapped-permission, orphan-mapping, duplicate-kullanıcı, admin-assigned,
failed/retry). Determinism kanıtlandı (aynı girdi → aynı rapor, iç UUID üretimi rapora yansımıyor).
`password-boundary.ts`'e küçük bir allowlist eklendi (`adminAssignedPasswordLegacyIds` — kendi
girdi-hijyeni taramasının yanlış pozitifini önlemek için); motorun 5 çekirdek dosyası değişmedi.

`docs/migration/METNEX_IDENTITY_MIGRATION_CLI_DRY_RUN.md` (yeni) — tam kullanım dokümanı.
`pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh --skip-docker` (33 suite/276
test, PASS — önceki 31/254'ten). `backlog/TASK-027-18-identity-migration-cli-dry-run.md` status
`planned` → `review`. Q-ID01/Q-T01/Q-S03/Q-P02 kapsam dışı; gerçek SQL Server/PostgreSQL bağlantısı/
apply yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.18 AI1 Onayı

Identity Migration CLI Dry-Run teslimi onaylandı ve TASK-027.18 `done` olarak kapatıldı.
Derlenmiş CLI process'i ile exit code `0/1/2` doğrulandı; fatal preflight durumunda
engine'in çağrılmadığı ve CLI'da `--apply` yolunun bulunmadığı teyit edildi. Dry-run
kalıcı state üretmiyor ve rapor deterministik.

Gerçek SQL Server/PostgreSQL bağlantısı, apply, secret/parola ve gerçek BOTC verisi
kullanılmadı. Q-ID01, Q-T01, Q-S03, Q-P02 ve Wave 2/Wave 3 kapsam dışıdır.
`./scripts/check.sh --skip-docker` PASS; 33 suite / 276 test kabul edildi.

## 2026-09-18 — TASK-027.19 Identity Migration Execution Reconciliation (AI2 teslimi, review)

İki dry-run çıktısını karşılaştırıp `MATCHED`/`CHANGED`/`BLOCKED`/`UNRESOLVED`/`INVALID_INPUT`
olarak sınıflandıran saf bir reconciliation çekirdeği eklendi (`apps/api/src/migration/botc-identity/
reconciliation.ts`) — motorun/CLI'ın (TASK-027.12–027.18) mevcut hiçbir dosyası değiştirilmedi.
Reconciliation **yalnızca dry-run çıktıları ve in-memory state üzerinden** çalışır; gerçek
PostgreSQL apply, fiziksel staging tablosu veya SQL Server bağlantısı oluşturulmadı.

Bir `FATAL` issue (conflict dahil) varsa **hiçbir per-user diff denenmez** — motor bloklandığında
yanıltıcı bir "tüm kullanıcılar silindi" raporu üretmemek için (`scenario 8` testiyle kanıtlandı).
Session/credential-benzeri bir alan bulunursa sonuç zorla `BLOCKED` olur, gerçek değer hiçbir
zaman rapora yazılmaz (`JSON.stringify` ile doğrulandı). `ADMIN_ASSIGNED` kaybı
`passwordStrategyDiffs[].adminAssignedLost` ile açıkça işaretlenir, `RESET_REQUIRED` her zaman
korunur. 16 yeni test (`reconciliation.spec.ts`) görev kapsam madde 10'daki 11 senaryonun
tamamını kapsıyor.

**Bulunan/düzeltilen bir tuzak:** iki bağımsız dry-run'ın iç `targetId` (`randomUUID()`) değerleri
doğal olarak farklıdır — TASK-027.18'de öğrenilen dersle tutarlı olarak, karşılaştırma yalnızca
`targetId`'nin varlık/yokluğuna bakar, tam değerine değil.

Ayrı, additive bir CLI eklendi (`cli/reconcile-cli-entry.ts`, `--before`/`--after`/`--output`) —
burada da `--apply` yok. `pnpm build` → gerçek `node` process'i ile kendine-karşı (`UNRESOLVED`,
fixture'da kalıcı unresolved kullanıcı var), conflict-fixture'ına-karşı (`BLOCKED`, exit 1) ve
argümansız (exit 2) senaryoları fiilen doğrulandı.

`docs/migration/METNEX_IDENTITY_MIGRATION_RECONCILIATION.md` (yeni). `pnpm --filter api exec tsc
--noEmit` (0 hata), `./scripts/check.sh --skip-docker` (35 suite/300 test, PASS — önceki
33/276'dan). `backlog/TASK-027-19-identity-migration-execution-reconciliation.md` status `planned`
→ `review`. Q-ID01/Q-T01/Q-S03/Q-P02 kapsam dışı; gerçek SQL Server/PostgreSQL bağlantısı/apply
yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.19 AI1 Onayı

Identity Migration Execution Reconciliation teslimi onaylandı ve TASK-027.19 `done` olarak
kapandı. Reconciliation yalnızca dry-run çıktıları/in-memory state üzerinden çalışıyor;
bağımsız target UUID'leri değişiklik olarak yanlış işaretlenmiyor. Fatal/conflict durumlarında
per-user diff üretilmiyor; credential/session alanları `BLOCKED` sonucu veriyor.

Gerçek PostgreSQL/SQL Server bağlantısı, fiziksel staging veya apply yapılmadı. Q-ID01,
Q-T01, Q-S03, Q-P02 ve Wave 2/Wave 3 kapsam dışıdır. `./scripts/check.sh --skip-docker`
PASS; 35 suite / 300 test kabul edildi.

## 2026-09-18 — TASK-027.20 Identity Security and Tenant Isolation Tests (AI2 teslimi, review)

Motorun/CLI'ın/reconciliation'ın (TASK-027.12–027.19) mevcut hiçbir dosyası değiştirilmeden, 9
kategoriyi (tenant isolation, conflict security, permission isolation, root tenant/aggregate,
password security, session/email security, dry-run security, reconciliation security, statik
dependency boundary) tek dosyada konsolide eden 33 yeni test eklendi
(`security-tenant-isolation.spec.ts`).

**Kritik bulgu:** `cli/` alt dizini, önceki hiçbir statik bağımlılık taramasında (özyinelemesiz
`readdirSync`) **hiç taranmamıştı** — `dry-run-cli.ts`/`dry-run-cli-entry.ts`/
`reconcile-cli-entry.ts`'in gerçek SQL Server/PostgreSQL/session/email bağımlılığı içerip
içermediği doğrulanmamıştı. Özyinelemeli bir tarayıcı yazılıp `cli/`'nin gerçekten tarandığını
kanıtlayan bir sanity-check testiyle doğrulandı — **sonuç temiz**, ama artık kanıtlanmış.

MOSB/MOSEDAŞ/MOSBİO kullanıcılarının her birinin yalnızca kendi tenant'ını aldığı (tam eşitlik,
çapraz sızıntı yok), Wave 2/3 izinlerinin role template'e asla girmediği, `--apply`'ın hiçbir CLI
argv-parser'da tanınmadığı, `UNRESOLVED`'in asla `MATCHED` görünmediği doğrulandı.

`docs/migration/METNEX_IDENTITY_SECURITY_TEST_MATRIX.md` (yeni) — konsolide envanter.
`pnpm --filter api exec tsc --noEmit` (0 hata), `./scripts/check.sh --skip-docker` (36 suite/333
test, PASS — önceki 35/300'den). `backlog/TASK-027-20-identity-security-tenant-isolation-tests.md`
status `planned` → `review`. Q-ID01/Q-T01/Q-S03/Q-P02 kapsam dışı; gerçek SQL Server/PostgreSQL
bağlantısı/apply yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.20 AI1 Onayı

Identity Security and Tenant Isolation Tests teslimi onaylandı ve TASK-027.20 `done`
olarak kapatıldı. Tenant isolation, conflict, permission, root aggregate, password,
session/email, dry-run, reconciliation ve recursive dependency boundary testleri kabul
edildi. `cli/` dizininin gerçekten tarandığı sanity check ile doğrulandı.

Production migration davranışı, gerçek DB bağlantıları ve secret/veri kullanımı değişmedi.
Q-ID01, Q-T01, Q-S03, Q-P02 ve Wave 2/Wave 3 kapsam dışıdır. `./scripts/check.sh --skip-docker`
PASS; 36 suite / 333 test kabul edildi.

## 2026-09-18 — TASK-027.21 AI1 Onayı

Vardiya SRS ve Migration Mapping teslimi onaylandı ve TASK-027.21 `done` olarak kapatıldı.
BOTC Vardiya/Arşiv Vardiya kaynak envanteri, hedef mapping, lifecycle, tenant/location,
archive ve permission/audit etkileri kanıta dayalı olarak belgelendi. SRS ve Discovery
Wave 4 kapsamıyla güncellendi.

Q-V01–Q-V10, Q-T01, Q-S03, Q-ID01 ve Q-P02 karar gibi kapatılmadı. Gerçek schema/DB,
production kodu, migration/seed ve UI oluşturulmadı. Sıradaki görev TASK-027.22 domain
model tasarım/karar görevidir; Wave 2/Wave 3 kapsam dışıdır.

> **Terim notu (TASK-024.2 düzeltmesi, 2026-09-17):** AI1 kararı gereği bu dosyanın geçmiş
> anlatı metinlerinde eski marka/slug adı literal olarak yazılmaz; `eski-ad`/`ESKI-AD`/`EskiAd`
> placeholder'ları kullanılır. Bu tarihten sonraki yeni notlar yalnızca "Metnex" kullanır. İstisna:
> `scripts/openmas-env-create.sh` ve `com.openmas` Java package'ı gibi **hâlâ gerçekten o adla var
> olan dosya/klasör yolları**, gerçek tarama komutları ile aynı gerekçeyle literal kalır — bunlar
> marka anlatımı değil, filesystem'de o an gerçekten var olan yolların doğru referanslarıdır.

## 2026-09-18 — TASK-027.21 Vardiya SRS ve Migration Mapping (AI2 teslimi, review)

Pure Discovery/dokümantasyon task'ı: Vardiya ve Arşiv Vardiya modülleri için BOTC kaynak şema
envanteri, Metnex hedef mapping'i ve SRS güncellemesi hazırlandı. Hiçbir production kodu, Drizzle
schema, DB bağlantısı, API/UI veya email entegrasyonu eklenmedi.

**Kritik bulgu:** Vardiya/Arşiv Vardiya için (5 lokasyon × canlı+arşiv) **hiçbir EF Core migration
dosyası yok** — yalnızca `BotDbContext`'in migration'ları var. Gerçek şema doğrulanamadı
(`[DOĞRULANAMADI]`). BOTC'de "tamamlanmış rapor kilidi" yalnızca UI'da uygulanıyor,
`VardiyaService.SaveReportAsync`'te sunucu-taraflı kilit yok (güvenlik bulgusu, Q-V09).
`MOSEDAŞ` Vardiya modülünde hiç kod kanıtı yok — kapsama girmiyor; "GT/SG fiziksel kaynakları"
ayrı bir SCADA/Wave 5 kavramı, Vardiya değil. Bu iki bulgu, task talimatındaki lokasyon
listesine düzeltme olarak işlendi, sessizce yok sayılmadı.

Teslimat: `docs/migration/BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md` (yeni),
`docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md` (yeni), `docs/migration/
BOTC_MIGRATION_OPEN_QUESTIONS.md`'ye append-only Q-V01–Q-V10, `docs/requirements/SRS.md`'ye
MOD-007/FEAT-022 (FR-097–FR-106, BR-018–BR-021, AC-025–AC-027) ve Wave 4 durumu güncellemesi,
`docs/requirements/DISCOVERY.md` §11.5'e doğrulama notu. Tenant/location: yalnızca MOSBİO ve
MOSB ENERJİ yüksek kesinlikle eşlendi; KÖMÜR KAZANI/MOSBİO KIRIM DEPO/SANTRAL
PENDING_MAPPING/UNRESOLVED bırakıldı — Q-T01/Q-S03 kapatılmadı. `backlog/
TASK-027-21-vardiya-srs-ve-migration-mapping.md` status `planned` → `review`. Wave 2/Wave 3 kapsam
dışı kaldı; gerçek BOTC verisi/secret/connection string hiçbir dokümana yazılmadı; Docker/git
commit/push yapılmadı. Nihai `done` kararı AI1'e bırakılmıştır.

## 2026-09-18 — TASK-027.22 Vardiya PostgreSQL Domain Model ve Karar Paketi (AI2 teslimi, review)

Pure tasarım/karar paketi: `docs/migration/BOTC_VARDIYA_DOMAIN_MODEL_DECISION_PACKAGE.md` (yeni).
Hedef ShiftReport modeli, A/B/C tablo seçenekleri matrisi ve Q-V10 karar paketi (AI2 önerisi A —
yalnızca öneri, karar PO/AI1'de), tam kolon mapping, lifecycle (DRAFT/COMPLETED kaynak kanıtlı;
LOCKED/FAILED/ARCHIVED öneri), tenant/location (hiçbir lokasyon Q-T01 kapanmadan tenantId almaz,
unresolved fail-closed), timezone/duplicate/idempotency, permission/audit etkisi ve TASK-027.23–030
bağımlılıkları hazırlandı.

**Bulgular:** DEC-0010 data-plane şema geçişi (Phase 5-9) uygulanmadığından tablonun şema yerleşimi
belirsiz (Q-V11); talimattaki "performans alanları" kaynak kodda yok (Q-V13); `platform_audit_logs`
tenant kolonu taşımıyor (Q-V12). Yeni Q-V11–Q-V19 append-only eklendi; Q-V01–Q-V10, Q-T01/Q-S03/
Q-ID01/Q-P02 kapatılmadı. Drizzle schema/migration/seed, DB bağlantısı, gerçek veri, API/UI/email,
yeni permission kodu yok; `apps/` değişmedi. `./scripts/check.sh --skip-docker` PASS (36/333).
`backlog/TASK-027-22-vardiya-postgresql-domain-model.md` `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-18 — TASK-027.22 AI1 Onayı ve Q-V10 Kararı

TASK-027.22 teslimatı onaylandı ve `done` olarak kapatıldı. Vardiya domain model karar paketi
production kodu, Drizzle schema, migration, seed, DB bağlantısı, API veya UI üretmeden kabul edildi.

Q-V10, **A — tek `shift_reports` tablosu + `locationCode`** olarak karara bağlandı. Beş BOTC
tablosunun ortak şeması, tenant izolasyonunun tablo sayısından bağımsız olması, düşük migration/API/test
yüzeyi ve A→C additive evrim imkânı gerekçelerdir. Q-V01–Q-V09, Q-V11–Q-V19, Q-T01/Q-S03/Q-ID01/
Q-P02 açık kalmıştır; bu karar diğer kapıları kapatmaz. Wave 2 ve Wave 3 kapsam dışıdır.

## 2026-09-19 — TASK-027.23 Vardiya Lokasyon–Tenant Mapping ve Scope Karar Paketi (AI2 teslimi, review)

Karar/mapping hazırlık dokümanı: `docs/migration/BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE.md`.
5 Vardiya lokasyonu kaynak kodla yeniden doğrulandı (MOSEDAŞ/GT/SG/SCADA eklenmedi; `Sirket` tenant kaynağı
değil). Lokasyon başına kanıt seviyesi (E1–E4), tenant seçenekleri (S1–S4), mevcut `TenantScopeService`/
`canAggregateChildren`/`tenant_closure`/`canEnterData`/guard uyumu, fail-closed kuralları (K1–K12) ve
kavramsal mapping sözleşmesi (uygulanmadı) hazırlandı. Hiçbir lokasyon `RESOLVED` değil: MOSBİO/MOSB ENERJİ
(E2) dahil hepsi onay olmadan `PENDING_APPROVAL`/`UNRESOLVED` ve erişime kapalı; çakışmalı mapping erişim
üretmez; root aggregation genişletilmedi.

**Bulgular:** tenant kayıtları için `apps/` içinde seed yok (Q-V20); `isSystemAdmin` guard bypass'ı var
ama `resolve()` PLATFORM_ROOT'ta 403 verir (TASK-027.30 testi). Q-T01/Q-V01/Q-S03/Q-V16/Q-V18 kapatılmadı;
yeni Q-V20–Q-V22 append-only eklendi. Kod/DB/tenant/seed/permission değişikliği yok. `./scripts/check.sh
--skip-docker` PASS (36/333). `backlog/TASK-027-23-vardiya-lokasyon-mapping.md` `planned` → `review`. Nihai
`done` AI1'de.

## 2026-09-19 — TASK-027.23 AI1 Onayı

TASK-027.23 Vardiya Lokasyon–Tenant Mapping ve Scope Karar Paketi teslimi onaylandı ve `done`
olarak kapatıldı. BOTC'de doğrulanan beş lokasyon korunmuş, hiçbir lokasyon `RESOLVED` yapılmamış,
onaysız veya belirsiz kayıtlar erişime kapalı bırakılmıştır. `Sirket` kullanılmamış; mevcut
`TenantScopeService`, `tenant_closure`, `canAggregateChildren`, `canEnterData` ve membership
kurallarıyla uyum korunmuştur.

Q-T01, Q-V01, Q-S03, Q-V16, Q-V18 ve Q-V20–Q-V22 açık kalmıştır. `isSystemAdmin` guard bypass'ı
ile `PLATFORM_ROOT` scope çözümünün 403 vermesi TASK-027.30 için güvenlik testi girdisidir.
Tenant/seed/schema/migration/API/UI/production kodu değişmemiştir; Wave 2 ve Wave 3 kapsam dışıdır.

## 2026-09-19 — TASK-027.24 Vardiya API/Service Domain Boundary ve Scope Contract (AI2 teslimi, review)

**Sonuç: implementasyon BLOKLU; blocker + contract teslimi yapıldı, `apps/` altında kod yazılmadı.**
`docs/migration/METNEX_SHIFT_REPORT_API_SERVICE_CONTRACT.md` (5 endpoint şema-nötr kontratı, servis sınırları,
R1–R10 izolasyon kuralları, lifecycle, idempotency/hata matrisi, audit tasarımı; permission adları sembolik) ve
`docs/migration/METNEX_SHIFT_REPORT_API_SERVICE_BLOCKER.md` (B0 şema yokluğu + Q-V07/V19/V11/V20/V21 implementasyonu
engelliyor; Q-V22/V09/V14/V23 endpoint bazlı; her biri için etki/seçenek/varsayım riski/gerekli karar/dosya listesi).

**Bulgular:** `TenantScopeService`'in üretim tüketicisi yok (ShiftReport ilk tüketici, Q-V11 etkili); `resolve()`
davranışı mevcut 8 testle zaten kanıtlı (yeni test bilinçli olarak eklenmedi); `isSystemAdmin` guard bypass'ı
`resolve()` PLATFORM_ROOT 403'ünü aşmaz; `TENANT_ADMIN` rolü permission kodu aramadan geçer ve `@RequirePermission`
olmayan endpoint fail-open'dır; uygulamada idempotency-key kuralı yok. Yeni Q-V23 (idempotency anahtarı), Q-V24
(audit hata politikası) append-only eklendi; Q-V07/V08/V11/V16/V18/V19/V20/V21/V22 kapatılmadı. Schema, migration,
seed, catalogue kodu, tenant/mapping tablosu, DB, UI, email yok. Backlog `TASK-027-24-vardiya-api-servis-katmani.md`
`planned` → `review`. Nihai `done` ve blocker kararları AI1/PO'da.

## 2026-09-20 — TASK-027.24 AI1 Onayı

TASK-027.24 Vardiya API/Service Domain Boundary ve Scope Contract teslimi onaylandı ve `done`
olarak kapatıldı. Şema-nötr kontrat ve blocker paketi kabul edildi; production API/service,
schema, migration, seed, mapping tablosu ve DB bağlantısı oluşturulmadı.

Q-V07, Q-V08, Q-V11, Q-V16, Q-V18, Q-V19, Q-V20–Q-V24 ve ilgili lifecycle/audit soruları
açık kaldı. Permission guard'ın fail-open riski ve `isSystemAdmin`/`PLATFORM_ROOT` scope farkı
TASK-027.30 güvenlik test girdileridir. Wave 2 ve Wave 3 kapsam dışıdır.

## 2026-09-21 — TASK-027.25 Vardiya PostgreSQL Schema Placement ve Persistence Karar Paketi (AI2 teslimi, review)

Karar/blocker paketi: `docs/migration/METNEX_SHIFT_REPORT_POSTGRES_SCHEMA_DECISION_PACKAGE.md` ve
`docs/migration/METNEX_SHIFT_REPORT_SCHEMA_BLOCKER.md`. Q-V11 (A/B/C/D matrisi), `shift_reports` 19 alanlı taslak +
index/constraint taslağı, Q-V21 mapping persistence (M1–M5), Q-ID01 staging/retention, Q-V20 preflight+BLOCKED kuralı, Q-V12 audit
tenant izi (AU1–AU4) hazırlandı; her biri için AI2 önerisi sunuldu ama **hiçbir soru kapatılmadı** — nihai seçim AI1/PO'da
(Q-V11 önerisi C, Q-V21 M2, Q-ID01 düzleme göre staging, Q-V12 AU1).

**Yeni bulgular:** `tenantId` nullable taslağı DB_META Tenant Isolation Standard'ıyla (NOT NULL) çelişiyor (F1); data-plane altyapısı
yok, ShiftReport ilk tüketici olur (F2); gerçek tenant slug'ları küçük harfli/ebeveyn önekli olduğundan Wave 1 `'MOSB'` anahtarlarıyla
eşleşmez (F3, yeni Q-V25); tenant seed yok, Q-V20 `[DOĞRULANAMADI]`; PLATFORM_ROOT data-plane'i okuyamaz. Q-V10 korundu. `DB_META.md`'ye
yalnızca referans notu eklendi. Schema/migration/seed/tablo/tenant/mapping kaydı, DB bağlantısı, kod yok; `./scripts/check.sh
--skip-docker` PASS (36/333). Backlog `TASK-027-25-vardiya-workflow-kilitleme.md` `planned` → `review` (dosya adı mevcut ID dosyası).
Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.25 AI1 Onayı

TASK-027.25 Vardiya PostgreSQL Schema Placement ve Persistence Karar Paketi teslimi onaylandı
ve `done` olarak kapatıldı. `tenantId NOT NULL` standardı ile nullable taslak çelişkisi, gerçek
slug formatı (Q-V25), data-plane altyapı eksikliği, tenant seed yokluğu ve PLATFORM_ROOT yönetim
sınırı blocker olarak kabul edildi.

Q-V11, Q-V20, Q-V21, Q-ID01, Q-V12, Q-V25 ve F1/Q-V17 ilişkisi açık kaldı; AI2 önerileri
uygulanmadı. Schema, migration, seed, tenant/mapping kaydı, API ve production kodu oluşturulmadı.
Q-V09 workflow kilitleme bu task kapsamında değildir; Wave 2 ve Wave 3 kapsam dışıdır.

## 2026-09-21 — TASK-027.26 Customer-Root Data-Plane Foundation ve Migration Fan-out Karar Paketi (AI2 teslimi, review)

Karar paketi + kavramsal standart + blocker: `docs/migration/METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md`,
`METNEX_DATA_PLANE_MIGRATION_FANOUT_STANDARD.md`, `METNEX_DATA_PLANE_READINESS_BLOCKER.md`. Kanıtlı durum: provisioning yalnızca boş schema oluşturur,
`pgSchema()`/fan-out/registry↔fiziksel schema doğrulaması yok, `migrationVersion` sabit `'0000_empty'`. Data-plane A/B/C/D matrisi (öneri C = DEC-0010'un
yazılı tasarımı; A ve B uyumsuz), fan-out yaşam döngüsü ve hata/retry/rollback standardı, test planı ve Vardiya uygulanabilirlik sırası (8 adım) hazırlandı.

**Yeni bulgular:** `ARCHIVED` registry satırı sessizce yeniden ACTIVE olur (D1); `FAILED` registry için otomatik retry yok (D2); schema isim alanı sınırıdır,
ayrıcalık sınırı değil (D3); `resolve()` closure↔customerRoot tutarlılığını doğrulamaz (D4); DEC-0010 §8 DEC-0011 ile eski (D5); Phase 7-9 tanımsız (D6);
`drizzle.config` sabit varsayılan bağlantı bilgisi içeriyor, değer kopyalanmadı (D7); ön-DEC-0010 tenant'larda backfill yok (D8). Kapatılan soru yok; Q-V11/V12/V16/V20/V21/
V25/ID01 açık, yeni Q-DP01–Q-DP07 eklendi. `apps/` değişmedi, kod/tablo/tenant/DB bağlantısı yok; `DB_META.md`'ye yalnızca referans notu. `./scripts/check.sh --skip-docker`
PASS (36/333). Backlog `TASK-027-26-vardiya-arsiv-migration.md` (aynı ID, archive migration YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.26 AI1 Onayı

TASK-027.26 Customer-Root Data-Plane Foundation ve Migration Fan-out Karar Paketi teslimi
onaylandı ve `done` olarak kapatıldı. Data-plane/fan-out altyapısının mevcut olmadığı,
ARCHIVED yeniden aktivasyon ve FAILED retry riskleri, schema/privilege sınırı eksikliği,
closure tutarlılığı, eski DEC kapsamı ve bağlantı bilgisi hijyeni blocker olarak kabul edildi.

Q-V11, Q-V12, Q-V16, Q-V20, Q-V21, Q-V25, Q-ID01 ve Q-DP01–Q-DP07 açık kaldı; AI2 önerileri
uygulanmadı. `pgSchema()`, runner, schema, migration, seed, tenant/mapping kaydı, API ve
archive migration oluşturulmadı. Q-V09 workflow kilitleme bu task kapsamında değildir.

## 2026-09-21 — TASK-027.27 Data-Plane Karar Kapıları ve Registry Hardening Karar Paketi (AI2 teslimi, review)

Karar paketi + remediation planı: `docs/migration/METNEX_DATA_PLANE_DECISION_GATE_CLOSURE_PACKAGE.md` (Q-V11, Q-V20, Q-V21, Q-V25, Q-ID01, Q-DP01–Q-DP07 için matris, AI2 önerisi, risk, geri dönüş,
dosya listesi; **AI1/PO karar formu boş**) ve `docs/migration/METNEX_DATA_PLANE_REGISTRY_HARDENING_PLAN.md` (R1–R10: kök neden, güvenlik etkisi, veri kaybı riski, düzeltme, test, sonraki task, rollback).
DEC-0010/0011 ve mevcut kod (ARCHIVED/FAILED/resolve) **değiştirilmedi**.

**Yeni bulgular:** DEC-0010 ∧ DEC-0011 Q-V11'i büyük ölçüde zaten yazılı kılıyor (A seçeneği aykırı); **pipeline `node apps/api/dist/migrate.js` çağırıyor ama kaynak/dist/Dockerfile karşılığı yok**
(D9/Q-DP08, `[DOĞRULANAMADI]`); sabit varsayılan bağlantı bilgisi `check-db.js`'de de var (değer kopyalanmadı); `PROVISIONING`'de takılma (D10); DEC çelişkileri (Phase 5-9 vs 5-7, fan-out Phase 5 vs 7, eski Prisma/RLS/demo
ifadeleri). Kapatılan soru yok; tüm kapılar AI1/PO kararı bekliyor, sayısal parametre/retention süreleri "PO kararı gerekli". `apps/` değişmedi; DB/pgSchema/runner/schema/seed/tenant yok; `DB_META.md`'ye yalnızca referans notu.
`./scripts/check.sh --skip-docker` PASS (36/333). Backlog `TASK-027-27-vardiya-arsiv-read-api.md` (aynı ID; arşiv read API YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.27 AI1 Onayı

TASK-027.27 Data-Plane Karar Kapıları ve Registry Hardening Karar Paketi teslimi onaylandı ve
`done` olarak kapatıldı. Q-V11'in DEC-0010/0011 ile ilişkisi, kaynaksız `dist/migrate.js`
pipeline çağrısı (D9/Q-DP08), `PROVISIONING`'de takılma (D10), sabit bağlantı fallback'leri
ve DEC faz çelişkileri doğru biçimde kaydedildi; R1–R10 remediation planı kabul edildi.

Hiçbir karar kapısı kapanmış sayılmamıştır: Q-V11, Q-V20, Q-V21, Q-V25, Q-ID01 ve Q-DP01–Q-DP08
açık kaldı. `pgSchema()`, runner, schema, migration, seed, tenant/registry kaydı, DB role/RLS,
API ve archive read API oluşturulmadı; ARCHIVED/FAILED mevcut davranışı değiştirilmedi.

## 2026-09-21 — TASK-027.28 Migration Entrypoint ve Pipeline Provenance Karar Paketi (AI2 teslimi, review)

Kanıt analizi + karar paketleri: `docs/migration/METNEX_MIGRATION_ENTRYPOINT_PROVENANCE.md`, `METNEX_PIPELINE_MIGRATION_TRIGGER_DECISION_PACKAGE.md`, `METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` (karar formları boş).
**`dist/migrate.js`:** kaynak yok, `dist`'te yok, Dockerfile üretmiyor, image'da yok; **Prisma kalıntısı olduğuna dair kanıt yok** — runbook §7 onu `packages/db/migrations/*.sql` + `platform._migration_log` kullanan özel bir SQL çalıştırıcı
olarak anlatıyor (bu dizin/tablo mevcut değil; `extract-db-meta.sh`, `recreate-db-with-icu.sh`, `DB-METADATA-TEMPLATE.md` aynı eski düzene atıf yapıyor); dönem `[DOĞRULANAMADI]` (depoda commit yok). Pipeline'da `set -euo pipefail`
nedeniyle migration satırı başarısız olup **deploy'un durması** beklenir (run geçmişi `[DOĞRULANAMADI]`); TASK-027.27 R8'deki "sessiz şema gerilemesi" ifadesi pipeline yolu için düzeltildi.

**Diğer bulgular:** programatik Drizzle migrator drizzle-kit ile aynı takip tablosunu kullanıyor; `pnpm`/`scripts/` image'da yok; pipeline `concurrency` `cancel-in-progress: true` (P6: çalışan migration iptal edilebilir); CI'da migration artifact
doğrulaması yok; `dev.sh` her çalıştırmada `db:generate`; sabit bağlantı dizesi iki dosyada (değer kopyalanmadı), `.dockerignore` yok, pipeline'da geniş `source`+argv genişletmesi, ortak DB kimliği (S1–S6). Kapatılan soru yok: Q-DP02, Q-DP07, Q-DP08 açık.
Pipeline/Dockerfile/kod/runbook/DEC değişmedi; migration çalıştırılmadı; DB bağlantısı yok. `./scripts/check.sh --skip-docker` PASS (36/333). Backlog `TASK-027-28-vardiya-email-distribution.md` (aynı ID; email dağıtımı YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.28 AI1 Onayı

TASK-027.28 Migration Entrypoint ve Pipeline Provenance Karar Paketi teslimi onaylandı ve
`done` olarak kapatıldı. `dist/migrate.js` provenance analizi, kaynaksız pipeline çağrısı,
P6 `cancel-in-progress` riski, CI artifact doğrulaması eksikliği, `.env`/argv secret yüzeyi,
`.dockerignore` eksikliği ve ortak DB kimliği riskleri kabul edildi.

Q-DP02, Q-DP07 ve Q-DP08 açık kaldı; öneriler uygulanmadı. Pipeline, Dockerfile, production
kodu, migration entrypoint'i, bağlantı politikası, DB, email dağıtımı ve archive read API
değiştirilmedi. Wave 2 ve Wave 3 kapsam dışıdır.

## 2026-09-21 — TASK-027.29 Migration ve Runtime Database Connection Security Hardening (AI2 teslimi, review)

**Uygulama task'ı.** AI1 güvenlik kararı uygulandı: `DATABASE_URL` her ortamda zorunlu, sabit fallback yok, fail-fast, değer loglanmaz. Değişen: `apps/api/drizzle.config.ts`, `apps/api/scripts/check-db.js` (sabit fallback'ler kaldırıldı, eksik/hatalı → `exit 1`, maskeleme
korundu), `apps/api/src/db/db.service.ts` (`DATABASE_URL` yoksa Pool oluşmadan fail-fast; pg/libpq varsayılanına düşmez), yeni `apps/api/src/db/database-url.ts`, `.github/workflows/pipeline.yml` (`source .env`/`set -a`/`-e DATABASE_URL="$DATABASE_URL"`
kaldırıldı; özel `--env-file` + açık env allowlist), yeni `scripts/ci/env-allowlist.sh`, yeni `.dockerignore`, yeni `apps/api/src/db/connection-security.spec.ts` (38 test, gerçek DB yok). Kimlik sınırı belgelendi
(`METNEX_MIGRATION_CONNECTION_SECURITY_BOUNDARY.md` §8–§9): runtime/migration/fan-out kimlikleri ayrı olmalı, bugün tek kimlik, hiçbiri oluşturulmadı; `isSystemAdmin`/PLATFORM_ROOT/TENANT_ADMIN migration yetkisi değil.

**Kapatılmayanlar:** Q-DP02 ve Q-DP08 AÇIK — `dist/migrate.js` oluşturulmadı, pipeline'daki `node apps/api/dist/migrate.js` çağrısı değişmedi (hedef yok → deploy durur). Q-DP07: AI1 kararı uygulandı ve kapatıldı. Yeni Q-DP09: `--env-file` değeri
`docker inspect`'te görünür kalır (container `Config.Env`), stack deploy interpolasyonu servis tanımına yazar; `.env` biçimi varsayımı `[DOĞRULANAMADI]` — ilk dev deploy'unda doğrulanmalı; pipeline runner'da çalıştırılamadı. `./scripts/check.sh --skip-docker`
PASS (37 suite / 371 test). Backlog `TASK-027-29-vardiya-ui-ekranlari.md` (aynı ID; Vardiya UI YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.29 AI1 Onayı ve Q-DP07 Kapanışı

TASK-027.29 Migration ve Runtime Database Connection Security Hardening teslimi onaylandı
ve `done` olarak kapatıldı. `DATABASE_URL` her ortamda zorunlu, sabit fallback yok, fail-fast,
değer loglanmıyor/raporlanmıyor kararı uygulandı; env allowlist, geçici env-file, `.dockerignore`
ve 38 yeni test kabul edildi.

Q-DP07 kapandı. Q-DP02 ve Q-DP08 açık kaldı; Q-DP09 (Docker `Config.Env` görünürlüğü, `*_FILE`/
Docker secrets ve sunucu `.env` biçimi) açık risk olarak korundu. Migration entrypoint, fan-out,
DB role/RLS ve Vardiya UI oluşturulmadı.

## 2026-09-21 — TASK-027.30 Control-Plane Migration Entrypoint ve Pipeline Migration Job (AI2 teslimi, review)

**Uygulama task'ı; gerçek migration/PostgreSQL bağlantısı/Docker build-run yok.** AI1 kararları uygulandı: `apps/api/src/migrate.ts` (yeni) programatik Drizzle migrator ile yalnızca control-plane migration çalıştırır — `DATABASE_URL` eksik/hatalı → exit 1 (bağlantısız), başarı 0, hata 1 (URL/kullanıcı/parola/host log'dan temizlenir),
parametresiz, HTTP/Nest yok, DB advisory lock; `nest build` `apps/api/dist/migrate.js`'i üretiyor (doğrulandı); Dockerfile build aşamasında artifact'i zorunlu kılıyor (CMD değişmedi). Pipeline: ayrı `migrate` işi (`deploy needs migrate`), iş düzeyinde `concurrency: metnex-migration-<env>, cancel-in-progress: false`,
artifact DB'ye dokunmadan önce doğrulanır (yoksa fail), secret allowlist + özel `--env-file` `migrate` işine taşındı, deploy'dan migration kaldırıldı; workflow düzeyi `cancel-in-progress` yalnızca PR'larda `true` (P6). 30 yeni test (gerçek derleme çıktısı dahil).

**Durum:** Q-DP08 uygulandı ve kapatıldı. Q-DP02'nin control-plane kısmı uygulandı; data-plane fan-out tetikleyicisi/yetkisi, sayısal parametreler ve ayrı migration DB kimliği açık. **Q-DP09 AÇIK** (`docker inspect`/`Config.Env` görünürlüğü, `*_FILE` yok).
Dikkat: `migrate` ve `deploy` aynı Environment'ı kullandığından prod'da onay iki kez istenir; push'lar artık kuyruğa girer; pipeline runner'da ve Docker'da çalıştırılamadı, `.env` biçim varsayımı ilk dev deploy'unda doğrulanmalı; runbook/`DB-METADATA-TEMPLATE.md` eski. `./scripts/check.sh --skip-docker`
PASS (38 suite / 401 test). Backlog `TASK-027-30-vardiya-permission-audit-testleri.md` (aynı ID; Vardiya permission/audit testleri YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.30 AI1 Onayı ve Q-DP08 Kapanışı

TASK-027.30 Control-Plane Migration Entrypoint ve Pipeline Migration Job teslimi onaylandı
ve `done` olarak kapatıldı. `migrate.ts`, build artifact guard'ı, ayrı migration job'ı,
artifact doğrulaması, advisory lock, güvenli env aktarımı ve 30 yeni test kabul edildi.

Q-DP08 kapandı. Q-DP02'nin yalnızca control-plane kısmı kapandı; data-plane fan-out,
yetki/sayısal parametreler ve ayrı migration DB kimliği açık kaldı. Q-DP09 açık risk olarak
korundu. Gerçek migration/DB bağlantısı/Docker build-run yapılmadı.

## 2026-09-21 — TASK-027.31 Customer Schema Registry State Safety Hardening (AI2 teslimi, review)

## 2026-09-21 — AI1 Onayı → TASK-027.40 ve R1 Done

TASK-027.40 MFA/Settings/Perf Input Validation Boundary ve TASK-027.40-R1 MFA
Admin Reset Authorization teslimleri onaylandı ve `done` olarak kapatıldı.
MFA/settings/perf girişleri saf validator'larla korunuyor. MFA admin reset
controller ve service katmanında iki bağımsız fail-closed kontrolle yalnızca
ACTIVE system admin'e açık.

Q-DP21 ve Q-DP22a kod düzeyinde giderildi. Q-DP22b/c, Q-DP21d, Q-DP17,
Q-DP04, Q-ENV01 ve dev ROOT backfill açık kaldı. Gerçek HTTP/DB/MFA provider
ve tarayıcı doğrulaması yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.39 Done

TASK-027.39 Platform DTO Validation Boundary teslimi ve R1/R2 düzeltmeleri
onaylandı ve `done` olarak kapatıldı. Platform girişleri DB/hash/transaction/
audit/scope öncesinde saf validator'larla korunuyor; invalid input fail-closed
reddediliyor; canonical parola politikası API/web arasında korunuyor.

Package code formatı ile package name/description üst sınırları kanıtsız iş kuralı
olarak uygulanmadı ve Q-DP21d altında açık bırakıldı. Q-DP21'in MFA/settings/perf
alanları, Q-DP17, Q-DP04, Q-ENV01 ve dev ROOT backfill açık kaldı.

## 2026-09-21 — AI1 Onayı → TASK-027.38 Done

TASK-027.38 Customer Provisioning Backend Validation ve Parola Policy Hardening
teslimi onaylandı ve `done` olarak kapatıldı. `provisionCustomer` artık DB,
hash ve schema provisioning öncesinde saf doğrulama yapıyor; invalid input
fail-closed reddediliyor. Canonical parola politikası API ve web arasında
senkronlandı ve credential sızıntısı test edildi.

Q-DP19 kod düzeyinde kapandı. Q-DP20 sistemik DTO validation stratejisi olarak,
Q-DP17, Q-DP04, Q-ENV01 ve dev ROOT backfill açık kaldı. Gerçek DB/HTTP/tarayıcı
doğrulaması yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.37 Done

TASK-027.37 Customer ROOT Provisioning UI teslimi onaylandı ve `done` olarak
kapatıldı. UI gerçek provisioning DTO'su ile hizalı, paketleri mevcut API'den
alıyor, çift submit'i engelliyor, credential'ı kalıcı depolama/log/URL'ye
yazmıyor ve Q-DP17 uyarısını saklamıyor.

Q-DP18 kod düzeyinde karşılandı. Q-DP19 backend provisioning/parola validation
eksikliği olarak ayrı task'a devredildi ve açık kaldı. Q-DP17, Q-DP04, Q-ENV01
ve dev ROOT backfill açık durumdadır; tarayıcı/gerçek backend testi yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.36 Done

TASK-027.36 Platform Tenant UI ROOT Provisioning Boundary teslimi onaylandı ve
`done` olarak kapatıldı. UI artık yalnızca parent seçilmiş child/STANDARD tenant
oluşturuyor; ROOT alanı veya yetenek bypass'ı göndermiyor, PLATFORM_ROOT'u aday
olarak göstermiyor ve teknik ROOT provisioning hatasını kullanıcı dostu iletiyor.

Q-DP18 müşteri ROOT provisioning ekranı kararı olarak açık kaldı. Q-ENV01 web lint
bağımlılık çözümleme borcu olarak açık kaldı; kalıcı dependency düzenlemesi yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.35 Done

TASK-027.35 ROOT Tenant Provisioning Consistency ve Fail-Closed Creation Boundary
teslimi onaylandı ve `done` olarak kapatıldı. Generic ROOT oluşturma yolu kaldırıldı;
`parentId` olmadan gelen istekler DB'ye dokunmadan `ROOT_PROVISIONING_REQUIRED`
ile reddediliyor. ROOT üretimi yalnızca `SaasService.provisionCustomer` sınırında
kaldı; STANDARD/child akışları korundu.

Q-DP15 kod düzeyinde giderildi. Q-DP17 (iki aşamalı atomiklik ve FAILED ROOT retry),
Q-DP04 ve UI formunun akıbeti açık kaldı; mevcut dev ROOT backfill'i yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.34 Done

TASK-027.34 Data-Plane Hedef Ortam ve PostgreSQL Readiness Evidence teslimi
onaylandı ve `done` olarak kapatıldı. Dev PostgreSQL 16.15, doğrudan bağlantı,
boş/eski schema bulguları, UUID örneklemi, mevcut kimlik yapısı ve timeout/pooler
belirsizlikleri kanıt sınırlarıyla kabul edildi.

Production readiness onayı verilmedi. Q-DP05, Q-DP11, Q-DP12, Q-DP13, Q-DP14,
Q-DP15, Q-DP16 ve Q-ID01 açık kaldı. Gerçek port/probe/ledger/executor/fan-out,
Vardiya, Wave 2/3 ve Git işlemleri yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.33 Done

TASK-027.33 Data-Plane Port, Ledger ve Migration Kaynağı Karar Paketi teslimi
onaylandı ve `done` olarak kapatıldı. T1–T12 karar tabloları, E1–E9 kanıtları,
Q-ID01 ayrımı ve implementation blocker'ları kabul edildi.

Bu onay teknik seçenekleri kapatmaz. Q-DP01, Q-DP02 data-plane ayrıntıları,
Q-DP03, Q-DP04, Q-DP05, Q-DP09, Q-DP11, Q-DP12, Q-DP13, Q-DP14 ve Q-ID01
açık kaldı. Gerçek ledger/port/probe/executor/fan-out/Vardiya/PostgreSQL
implementation'ı yapılmadı.

## 2026-09-21 — AI1 Onayı → TASK-027.32 Done

TASK-027.32 Metnex Data-Plane Foundation ve `pgSchema` Sözleşmesi teslimi onaylandı
ve `done` olarak kapatıldı. Merkezi identifier doğrulaması, tek noktadan
`pgSchema()` kullanımı, `search_path` yasağı, fail-closed data-plane admission,
DRY_RUN/APPLY ayrımı, lock/checksum/idempotency sözleşmesi ve control-plane
ayrımı kabul edildi.

Gerçek port implementasyonları, PostgreSQL apply, fiziksel probe, ledger/executor,
fan-out ve Vardiya schema'sı oluşturulmadı. Q-DP01, Q-DP02 data-plane ayrıntıları,
Q-DP03, Q-DP04, Q-DP09, Q-DP11 ve Q-DP12 açık kaldı.

## 2026-09-21 — AI1 Onayı → TASK-027.31 Done

TASK-027.31 Customer Schema Registry State Safety Hardening teslimi onaylandı ve
`done` olarak kapatıldı. `ARCHIVED` satırlarının `SCHEMA_ARCHIVED` ile fail-closed
reddedilmesi, koşullu registry geçişleri, bilinmeyen durumların reddi, secret
hijyeni ve yalnızca `HEALTHY` tanı sonucunun erişilebilir sayılması kabul edildi.

`FAILED`/`PROVISIONING` için mevcut açık provisioning çağrısı korundu; bunun otomatik
retry/reactivation olmadığı ve operasyonel retry politikasının Q-DP04 kapsamında
ayrıca kararlaştırılacağı netleştirildi. Q-DP01, Q-DP03 ayrıntıları, Q-DP04 ve Q-DP10
açık kaldı. Gerçek PostgreSQL, data-plane/fan-out, Vardiya, Docker ve git işlemi yapılmadı.

**Uygulama task'ı; gerçek PostgreSQL/data-plane migration/`pgSchema()`/fan-out/retry job/reactivation yok.** `ensureSchemaProvisioned` `ARCHIVED` satırı `SCHEMA_ARCHIVED` ile reddeder (DDL yok, yazma yok, status değişmez, tekrarda aynı sonuç); bilinmeyen status reddedilir; durum değişiklikleri beklenen mevcut duruma bağlı
(koşullu upsert + `PROVISIONING`-koşullu güncellemeler; eşzamanlı değişen satır ACTIVE ile ezilmez); `lastError`/log/hata DB metni içermez (`Error [SQLSTATE]: schema provisioning failed`, dış hata `SCHEMA_PROVISIONING_FAILED`). Yeni `registry-state.ts` (saf durum/geçiş kuralları) ve `registry-diagnostics.ts` (salt-okuma tanı sözleşmesi + probe **arayüzü**,
yalnızca HEALTHY erişilebilir, stale eşiği çağıranca verilir, production'a bağlı değil). `TenantScopeService` değişmedi (ACTIVE dışı → 403, PLATFORM_ROOT 403 testlerle kilitlendi; `isSystemAdmin`/`TENANT_ADMIN` yetkisi yok). 61 yeni test; mutasyon kontrolü yapıldı.

**Açık (AI1 kararı):** Q-DP03 açık reactivation akışı, Q-DP04 retry sahibi/limit/backoff/job/CLI, Q-DP01 sürüm geçidi, yeni Q-DP10 (fiziksel schema probe implementasyonu, stale eşiği, tanı süreci). **Karar gereken nokta:** `ensureSchemaProvisioned`'ın açık çağrıda `FAILED`/`PROVISIONING` satırı yeniden sürmesi (mevcut davranış) korundu.
**Bildirim:** provisioning başarısızlığında dış hata tipi ve `lastError` biçimi değişti. `./scripts/check.sh --skip-docker` PASS (39 suite / 462 test). Backlog `TASK-027-31-scada-dms-source-catalog.md` (aynı ID; SCADA/DMS kataloğu YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.32 Metnex Data-Plane Foundation ve pgSchema Sözleşmesi (AI2 teslimi, review)

**Uygulama task'ı; gerçek PostgreSQL/gerçek port/production migration/Vardiya tablosu/wiring yok.** Yeni `apps/api/src/data-plane/`: `data-plane-schema.ts` (kod tabanında `pgSchema()` çağrılan **tek** yer; `createDataPlaneSchema`, `dataPlaneSchemaFor(scope)`), `data-plane-version.ts` (taban `0000_empty`, `NNNN_ad`, kesin artan zincir, sha256 checksum),
`data-plane-migration.contract.ts` (istek/çıktı tipleri + portlar + kilit anahtarı) ve `data-plane-migration.orchestrator.ts` (port-tabanlı saf çekirdek, hiçbir yerden çağrılmaz). Merkezi `schema-name.util.ts` genişletildi (`isCustomerSchemaName`, `assertCustomerSchemaName`, `schemaNameMatchesCustomerRoot`). `search_path` yok; DDL enterpolasyonu yalnızca `quoteIdentifier`.
Runner yalnızca açık `{ customerRootTenantId (UUID), mode, runId }` ile çalışır; parametresiz/wildcard/fazladan anahtar (`isSystemAdmin`, `role`…) reddedilir; ARCHIVED/FAILED/PROVISIONING/SCHEMA_MISSING/VERSION_GATE_BLOCKER/… fail-closed (sıfır yazma); DRY_RUN kalıcı state üretmez; root başına advisory lock, kilit altında yeniden kabul, ledger idempotency, checksum koruması; registry portunda status değiştiren işlem yok; control-plane migration ile ayrım testli. 138 yeni test, mutasyon kontrolü yapıldı.

**Açık (hiçbiri kapatılmadı):** Q-DP01 (çalışma zamanı sürüm geçidi yok; yalnızca migration sıralama ön koşulu), Q-DP03, Q-DP04, Q-DP09, Q-DP02'nin data-plane kısmı; yeni Q-DP11 (gerçek port implementasyonları, ledger yeri, kilit granülaritesi, VERIFY aşaması), Q-DP12 (migration tanımlarının kaynağı, UUID zorunluluğu teyidi).
**Dikkat:** port-tabanlı orkestrasyon çekirdeği "yalnızca port/interface" ifadesini biraz aşıyor (davranış testleri için); wiring yok. `./scripts/check.sh --skip-docker` PASS (40 suite / 600 test). Backlog `TASK-027-32-sql-server-readonly-connection-provider.md` (aynı ID; SQL Server provider YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.33 Data-Plane Port, Ledger ve Migration Kaynağı Karar Paketi (AI2 teslimi, review)

**Karar paketi; kod/DB/ledger/migration/schema/port implementasyonu/Docker/Git yok, kapatılan soru yok.** `docs/migration/METNEX_DATA_PLANE_PORT_AND_LEDGER_DECISION_PACKAGE.md`: 12 konu (registry portu, fiziksel probe, advisory lock/granülarite, ledger yeri, retention/PII, executor transaction, migration kaynağı, checksum politikası, VERIFY, UUID, fan-out, kimlik ayrımı) için
kanıt, seçenekler, güvenlik/izolasyon/operasyon etkisi, geri dönüş maliyeti, AI2 önerisi ve **boş AI1/PO karar formu**. Q-ID01 ilişkisi: "ledger" 4 kayıt sınıfına ayrıştırıldı (uygulanmış-takip, run ledger, identity staging, Vardiya payload/legacy ledger); yalnızca ilk ikisi karara sunuldu, Q-ID01 kapsamı (3–4) etkilenmedi.

**Öne çıkan bulgular:** mevcut sözleşmede DDL/ledger/registry-CAS üç ayrı commit (DDL sonrası çökme "aynı DDL'i yeniden çalıştırma" penceresi bırakır; yedekten geri yükleme `public` ledger'ı ile schema'yı ayrıştırır) → ledger yeri ve executor transaction sınırı birlikte karara bağlanmalı;
drizzle hash normalizasyonsuz ve repoda `.gitattributes` yok; `init-db.sql` eski şablon schema'ları (`platform`/`shared`/`customer_root`); `DbService` tek uygulama havuzu; `drizzle/data-plane/` Dockerfile değişikliği olmadan image'a girer. VERIFY'ın sözleşme etkisi belgelendi (yeni `verifier` portu, `VERIFY_FAILED`, sıra) — sözleşme değiştirilmedi.
**Blocker'lar:** ledger yeri (T4) → ledger/executor; migration kaynağı + checksum (T7/T8) → gerçek migration dosyası; kimlik ayrımı + schema sahipliği (T12, Q-DP05, yeni Q-DP13); pooler/PG sürümü/eski schema teyidi (yeni Q-DP14, `[DOĞRULANAMADI]`). Sayısal parametreler/retention: PO kararı gerekli.
`./scripts/check.sh --skip-docker` PASS (40 suite / 600 test). Backlog `TASK-027-33-source-table-column-allowlist.md` (aynı ID; SCADA/DMS allowlist YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.34 Data-Plane Hedef Ortam ve PostgreSQL Readiness Evidence (AI2 teslimi, review)

**Yalnızca salt-okuma kanıt toplama (yerel dev PostgreSQL); production'a bağlanılmadı, hiçbir veri/schema/rol/yetki/owner/migration değişmedi, kod/yapılandırma değişmedi.** `docs/migration/METNEX_DATA_PLANE_TARGET_ENVIRONMENT_READINESS.md`. Dev DB container'ı durmuştu; yalnızca mevcut `metnex-postgres-dev` başlatılıp işten sonra durduruldu
(silme/prune/`down -v`/reset yok); bağlantı `default_transaction_read_only=on`, yalnızca SELECT/SHOW; bağlantı dizesi/tenant adı-slug'ı yazılmadı.
**Sonuçlar (dev):** PG 16.15; doğrudan bağlantı (pooler yok, prod doğrulanamadı); `platform`/`shared`/`customer_root` var ama tamamen boş ve kodda kullanılmıyor (tek referans var olmayan `platform._migration_log`); customer schema ve registry satırı yok (üretici gerçek ROOT id'siyle uyumlu ad üretiyor); tenant id'leri 2/2 UUID (n=2);
tek rol `metnex` superuser+`BYPASSRLS`; `pg_namespace`/`pg_roles`/advisory-lock için ek yetki gerekmez, `information_schema.schemata` yetkiye göre süzülür (probe için uygun değil); zaman aşımı ayarları 0 (sınırsız). **Yeni bulgu (Q-DP15):** `TenantService.create` ROOT tenant açıp registry/schema provizyonu çağırmıyor (yalnızca `SaasService.createCustomerTenant` çağırıyor) → dev'deki ROOT data-plane'de sessizce fail-closed.
**Açık (kapatılmadı):** Q-DP14 (dev kanıtlandı, prod açık), Q-DP13, Q-DP12, Q-DP11, Q-DP05, Q-ID01; yeni Q-DP15, Q-DP16 (eski schema'ların akıbeti). Düşük yetkili rolde ampirik doğrulama yapılamadı (rol oluşturmak yasak). `./scripts/check.sh --skip-docker` PASS (40 suite / 600 test).
Backlog `TASK-027-34-dynamic-query-contract.md` (aynı ID; dynamic query contract YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.35 ROOT Tenant Provisioning Consistency ve Fail-Closed Creation Boundary (AI2 teslimi, review)

**Uygulama task'ı (gerçek DB/Docker/secret yok).** Q-DP15 kök nedeni giderildi: `TenantService.create` (`POST platform/tenants`) `parentId` olmadan artık ROOT açmaz — **delege edilmedi, fail-closed reddedilir** (`ROOT_PROVISIONING_REQUIRED`, HTTP 400, statik mesaj, DB'ye dokunmadan); ROOT dalı koddan kaldırıldı. Sebep: resmi akış `SaasService.provisionCustomer` paket + yönetici + abonelik ister, generic istek yalnızca `name`/`slug` taşır (delege için alan uydurmak gerekirdi).
Tek ROOT ataması `provisionCustomer`'da (provizyon tenant transaction'ından sonra, sonuç yalnızca başarıda döner; hata statik, tek deneme, retry/reactivation yok). Child/STANDARD akışı korundu; registry yok/PROVISIONING/FAILED/ARCHIVED iken ROOT ve child `resolve()` 403; route izinleri değişmedi, yeni bypass yok. 26 yeni test.
**Adlandırma düzeltmesi:** önceki belgelerdeki `SaasService.createCustomerTenant` (provizyon çağıranı) yanlıştı — doğrusu `provisionCustomer` (`createCustomerTenant` STANDARD alt tenant açar).
**Dikkat/açık:** web "Tenant oluştur" formu (system/tenants) artık daima reddedilir — UI kararı AI1'de; resmi akış iki adımlı (DEC-0010 §10) olduğundan provizyon hatasında ROOT `FAILED` kalır ve aynı istek tekrarlanamaz (yeni Q-DP17, Q-DP04); dev'deki registry'siz mevcut ROOT düzeltilmedi. Q-DP15 kod düzeyinde giderildi (kapanış AI1'de).
`./scripts/check.sh --skip-docker` PASS (41 suite / 626 test). Backlog `TASK-027-35-tenant-scope-adapter-integration.md` (aynı ID; SCADA/DMS adapter YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.36 Platform Tenant UI ROOT Provisioning Boundary (AI2 teslimi, review)

**Uygulama task'ı (DB/Docker/secret yok; backend değişmedi).** `system/tenants` "Tenant oluştur" formu child-only yapıldı: zorunlu Üst Tenant seçimi (aktif ROOT/STANDARD; PLATFORM_ROOT yok), gövde yalnızca `{parentId, name, slug?}` (`type`/yetenek alanı yok, `type: ROOT` asla gönderilmez). `ROOT_PROVISIONING_REQUIRED` teknik olmayan Türkçe mesajla, bilinmeyen/5xx/ağ hataları güvenli fallback ile gösterilir; liste/filtre/detay akışları ve stil sözleşmesi korundu. Mantık `apps/web/src/lib/tenant-create.ts`'te (26 test).
**Karar:** seçenek 2. Web'de `provisionCustomer` çağıran ekran olmadığından yönlendirme/CTA uygulanamadı (yeni **Q-DP18**); `/system` kartının yanıltıcı metni düzeltildi.
**Dikkat/açık:** web lint önceden var olan ortam sorunu (`eslint-plugin-react-hooks` çözümlenemiyor; turbo cache maskeliyordu) → **Q-ENV01**; gate çalıştırma-başına `NODE_PATH` + `TURBO_ENV_MODE=loose` ile geçti. UI tarayıcıda doğrulanmadı. Q-DP17(a)(c), Q-DP04, dev ROOT backfill açık.
web vitest 6 dosya / 63 test; `./scripts/check.sh --skip-docker` PASS (api 41 suite / 626 test). Backlog `TASK-027-36-query-timeout-row-export-limits.md` (aynı ID; Wave 5 placeholder YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.36 Done; TASK-027.37 Customer ROOT Provisioning UI (AI2 teslimi, review)

TASK-027.36 AI1 tarafından kabul edildi (`done`). **TASK-027.37 uygulama task'ı (DB/Docker/secret yok; backend değişmedi):** `system/tenants` sayfasında "Müşteri Provision Et" modalı; `POST platform/saas/customers/provision` DTO'suyla birebir, paketler API'den, `type`/yetenek alanı gönderilmez, çift submit korumalı, parola yalnızca state'te (başarıda/kapanışta temizlenir; storage/URL/console/analytics yok), başarıda müşteri/yönetici/abonelik/veri alanı durumu gösterilir ve liste yenilenir. Hatalar statik/güvenli; **Q-DP17 riski gizlenmedi** (provizyon hatasında "kayıt oluşmuş olabilir, tekrar denemeyin" uyarısı).
**Bulgu/açık:** provision DTO backend'de doğrulanmıyor, parola politikası yok (yeni **Q-DP19**; UI'daki 12 karakter kuralı geçici); Q-DP18 kod düzeyinde karşılandı (kapanış AI1'de); Q-ENV01 açık; UI tarayıcıda doğrulanmadı; Q-DP17(a)(c), Q-DP04, dev ROOT backfill açık.
web vitest 7 dosya / 100 test; `check.sh --skip-docker` PASS (api 41/626) — `NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla. Backlog `TASK-027-37-hourly-analysis-engine.md` (aynı ID; saatlik analiz YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.37 Done; TASK-027.38 Customer Provisioning Backend Validation (AI2 teslimi, review)

TASK-027.37 AI1 tarafından kabul edildi (`done`). **TASK-027.38 (Q-DP19):** `SaasService.provisionCustomer` girişte saf domain doğrulayıcıyla (`customer-provision.domain.ts`) tüm girdiyi doğrular; geçersizse DB'ye hiç dokunulmaz (transaction/hash/kullanıcı/abonelik/`ensureSchemaProvisioned` yok), 400 + statik mesajlar. Parola politikası canonical `validatePasswordStrength` (8–128, büyük+küçük+rakam); frontend'in geçici 12 karakter kuralı kaldırıldı, web aynası API validator'ıyla parite testiyle korunuyor. Q-DP17, ARCHIVED, generic ROOT fail-closed, izinler, yanıt şekli (credential yok) değişmedi.
**Açık:** yeni **Q-DP20** (diğer SaaS DTO'ları da doğrulamasız; sistemik çözüm kararı); Q-DP17(a)(c), Q-DP04, Q-ENV01, dev ROOT backfill. Uçtan uca/gerçek DB denemesi yok.
API 42 suite / 714 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-38-daily-analysis-engine.md` (aynı ID; günlük analiz YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.38 Done; TASK-027.39 Platform DTO Validation Boundary (AI2 teslimi, review)

TASK-027.38 AI1 tarafından kabul edildi (`done`, Q-DP19 kapandı). **TASK-027.39 (Q-DP20):** platform modülünün düz interface DTO'ları (paket, customer-admin tenant/user/membership/update/set-password, platform user/tenant/role/assign akışları, `me/active-tenant`, login/bootstrap tür koruması, tenant/user list query) saf `domain/platform-input.domain.ts` validator'larıyla servis girişinde — DB/hash/transaction/audit/scope-servisinden önce — doğrulanır; statik mesajlar, nesne/dizi/NoSQL girdileri reddedilir, parola canonical politika. Yeni framework/dependency yok; permission/scope/ROOT fail-closed değişmedi.
**Açık:** yeni **Q-DP21** (MFA DTO'larındaki class-validator dekoratörleri uygulanmıyor çünkü ValidationPipe yok; settings/perf gövdeleri ve yalnızca-`:id` uçlar kapsam dışı; paket kodu formatı konservatif varsayım); Q-DP17(a)(c), Q-DP04, Q-ENV01, dev ROOT backfill. Uçtan uca/gerçek DB denemesi yok.
API 43 suite / 992 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-39-index-real-value-calculations.md` (aynı ID; index hesaplamaları YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.39-R1 (review'da kaldı)

AI1 geri bildirimiyle `createPackage.code` için kanıtsız regex ve 2–50 sınırı kaldırıldı; validator yalnızca tür/trim/min 2 (mevcut servis davranışı) uygular, format kararı açık AI1/PO kararı (Q-DP21d); mevcut paket verisi varsayılmadı. Diğer validation ve Q-DP21 (MFA/settings/perf) kapsamına dokunulmadı; Q-ENV01 workaround'u aynen. API 43 suite / 996 test, web 8 dosya / 117 test, `check.sh --skip-docker` PASS. TASK-027.39 status: `review`.

## 2026-09-21 — TASK-027.39-R2 (review'da kaldı)

Paket `name` ≤100 ve `description` ≤500 kanıtsız sınırları kaldırıldı; `createPackage` validator'ı yalnızca tür/trim/mevcut min-2 (name) uygular; üst sınırlar açık AI1/PO kararı. R1 düzeltmesine ve diğer DTO validation'a dokunulmadı; Q-DP21, Q-ENV01 açık. API 43 suite / 998 test, web 8 dosya / 117 test, `check.sh --skip-docker` PASS. TASK-027.39 status: `review`.

## 2026-09-21 — TASK-027.39 Done; TASK-027.40 MFA, Settings ve Perf Input Validation Boundary (AI2 teslimi, review)

TASK-027.39 ve R1/R2 AI1 tarafından kabul edildi (`done`, Q-DP20 kapandı). **TASK-027.40 (Q-DP21 a–c):** MFA DTO dekoratörleri `ValidationPipe` olmadığı için fiilen etkisizdi; sözleşme saf validator'lara (`mfa-input.domain`, `settings-input.domain`, `perf-input.domain`) taşındı ve controller girişinde çağrılıyor. MFA gövdeleri, platform/tenant settings upsert gövdeleri, tenant settings `X-Tenant-Id` biçimi (I/O'suz `TenantHeaderFormatGuard`, DB'li guard'lardan önce) ve perf query/path/body girdileri doğrulanır; yetkisiz çağrı doğrulamadan önce 403; yeni framework/dependency/global pipe yok; yalnızca koda/şemaya/UI'ya kanıtlı kurallar (kanıtsızlar kabul edilir, Q-DP21d açık).
**KRİTİK/AÇIK — yeni Q-DP22 (değiştirilmedi):** `auth/mfa/admin/:userId/reset` yetki denetimsiz (yalnızca `AuthGuard('jwt')`; koda göre oturumlu herhangi bir kullanıcı başkasının MFA'sını kapatabilir); `auth/mfa/policy` uçları `:tenantId` route parametresi olmadığından ölü. Acil AI1 kararı gerekli. Diğer açık: Q-DP17(a)(c), Q-DP04, Q-ENV01, dev ROOT backfill. Gerçek HTTP/DB denemesi yok.
API 44 suite / 1240 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-40-analysis-statistics.md` (aynı ID; analiz istatistikleri YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.40-R1 MFA Admin Reset Authorization Boundary (AI2 teslimi, review; TASK-027.40 de review'da)

**Kritik authorization açığı (Q-DP22) kod düzeyinde giderildi:** `POST auth/mfa/admin/:userId/reset` yalnızca JWT ile korunuyordu (herhangi bir oturumlu kullanıcı başkasının MFA'sını silebilirdi). Şimdi iki bağımsız fail-closed katman: controller'da `isSystemAdmin` kontrolü (girdi doğrulamasından önce) ve `MfaService.adminResetMfa` içinde actor'ı DB'den yeniden okuyan ikinci kontrol (ACTIVE + `isSystemAdmin`); hedef doğrulaması (400/404); MFA yazımı ve audit yalnızca yetki geçtikten sonra. Tenant admin/normal kullanıcı reset edemez; yetkisiz istekte yazma/audit yok; audit'te actor+target, secret/OTP yok. Yeni permission kodu uydurulmadı → geçici kural yalnızca `isSystemAdmin`.
**Açık kararlar:** Q-DP22a (kalıcı permission modeli), Q-DP22b (`auth/mfa/policy` uçları ölü; öneri: yetki tasarımı sonrası ayrı görevde düzelt), Q-DP22c (mfaVerified/self-reset/impersonation ayrıntıları); gerçek ortamlarda geçmiş `MFA_ADMIN_RESET` audit kayıtları denetlenmeli; benzer "yalnızca kimlik doğrulaması" uçları için sistematik tarama önerilir. Diğer açık: Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill.
API 45 suite / 1265 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Gerçek HTTP/DB denemesi yok. Yeni kayıt: `backlog/TASK-027-40-R1-mfa-admin-reset-authorization-boundary.md` (`review`). TASK-027.40 status: `review`.

## 2026-09-21 — TASK-027.40 / 027.40-R1 Done; TASK-027.41 Authenticated Endpoint Authorization Audit ve MFA Policy Karar Paketi (AI2 teslimi, review)

TASK-027.40 ve R1 AI1 tarafından kabul edildi (`done`; Q-DP21 ve Q-DP22a kod düzeyinde giderildi). **TASK-027.41 (denetim/karar; davranış değişmedi):** 90 endpoint / 16 controller envanteri (7 public, 31 yalnızca-authn, 52 permission'lı) statik testle sabitlendi; ana rapor `docs/migration/METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md`.
**KRİTİK/AÇIK — yeni Q-DP23 (düzeltilmedi; karakterizasyon testli, gerçek ortamda yeniden üretilmedi):** F1 CRITICAL customer-admin hesap ele geçirme zinciri (`memberships` kapsamsız hedef + `set-password` sysadmin hedefini dışlamıyor, audit yok); F2 HIGH `customer-admin/users` yanıtlarında passwordHash; F3 `auth/me` kendi hash'ini döndürür; F4 latent hedef/actor ayrıcalık kuralı yok; F6 saas/tenant/role/settings/perf mutasyonlarında audit yok. **Acil TASK-027.41-R1 remediation önerildi (AI1/PO onayı bekliyor).**
**MFA:** policy route'ları ölü+yetkisiz ve MFA zorlaması (`MfaEnforcementGuard`) hiçbir endpoint'e bağlı değil → tenant/rol MFA politikası bugün zorlama üretmez; Q-DP22b (A/B/C/D) ve Q-DP22c (mfaVerified, self-reset, impersonation, tenant-admin reset, permission kodu, geçici sınır süresi) karar paketleri hazır, **kapatılmadı**, karar alanları boş.
Diğer açık: Q-DP22a, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill; gerçek ortamda geçmiş kötüye kullanım incelemesi.
API 47 suite / 1292 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-41-virtual-column-domain-model.md` (aynı ID; virtual column domain modeli YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.41-R1 Customer Admin Authorization ve Credential Projection Remediation (AI2 teslimi, review; TASK-027.41 de review'da)

**F1 CRITICAL / F2 HIGH / F3 MEDIUM (Q-DP23) kod düzeyinde giderildi:** customer-admin `memberships`/`set-password`/`PATCH users/:id` hedefi yalnızca çağıranın aktif customer-root ağacında aranır (404), sistem yöneticisi hedefi reddedilir (403), kendi parolasını değiştirme yasağı korunur; customer-admin create/update yanıtları ve `GET auth/me` whitelist projeksiyonu döndürür; `validateJwtPayload` hash taşımaz; customer-admin kullanıcı oluşturma/güncelleme/parola sıfırlama/üyelik ekleme (ve reddi) actor/hedef/tenant-root/sonuç/impersonator ile audit'lenir, credential yok. **Ek bulgu düzeltildi:** `platform/users` yanıtları `passwordHash` sızdırıyordu (`PLATFORM:USER:VIEW`, VIEWER dahil). Yeni permission/bypass/route yok.
**Açık:** F4 (platform user-admin hedef/actor ayrıcalık kuralı), F6'nın kalanı (saas/tenant/role/settings/perf audit), Q-DP22a/b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill; gerçek ortamda geçmiş kötüye kullanım incelemesi ve olası hash ifşası için parola rotasyonu/oturum iptali değerlendirmesi.
API 48 suite / 1314 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Gerçek HTTP/DB denemesi yok. Yeni kayıt: `backlog/TASK-027-41-R1-customer-admin-authorization-credential-projection-remediation.md`. TASK-027.41 ve R1 status: `review`.

## 2026-09-21 — AI1 Onayı: TASK-027.41 ve TASK-027.41-R1

TASK-027.41 ve R1 `done` olarak onaylandı. R1 ile F1 hesap ele geçirme zinciri, F2/F3 `passwordHash` sızıntıları ve ilgili customer-admin kapsam/audit eksikleri giderildi. F4, F6'nın kalan audit kapsamı, Q-DP22b/c, MFA enforcement, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill ve gerçek ortam geçmiş audit incelemesi açık bırakıldı. Orijinal virtual-column placeholder kapsamı yapılmadı.

## 2026-09-21 — TASK-027.41 / 027.41-R1 Done; TASK-027.42 Platform User-Admin Privilege Boundary Remediation (AI2 teslimi, review)

## 2026-09-21 — AI1 Onayı: TASK-027.42

TASK-027.42 `done` olarak onaylandı. F4 platform user-admin privilege sınırı, sistem yöneticisi hedef koruması, global rol kuralı, actor yeniden doğrulaması ve audit/credential kontrolleriyle giderildi. Q-DP24 kalıcı yetki modeli ve tenant-kapsamlı rol delegasyonu ile F6'nın kalan audit işleri sonraki karar/task kapsamına bırakıldı.

TASK-027.41 ve R1 AI1 tarafından kabul edildi (`done`; F1/F2/F3 giderildi). **TASK-027.42 (F4) kod düzeyinde giderildi:** `platform/users` yedi mutasyonu (update, set-password, deactivate, rol ekle/kaldır, üyelik ekle/kaldır) actor'ı DB'den yeniden okuyan tek yetki noktasına bağlandı — sistem yöneticisi hedefi ve global rol atama/geri alma (`SYSTEM_ADMIN` dahil) yalnızca ACTIVE sistem yöneticisine açık; impersonation ek yetki vermez; başarı audit'i zorunlu, ret/hata audit'i best-effort (statik neden kodu, credential yok); yanıtlar güvenli görünüm; yeni permission/route/bypass yok; route izinleri aynen.
**Açık:** yeni **Q-DP24** (kalıcı yetki modeli: kim SYSTEM_ADMIN/global rol verebilir, eş sysadmin'ler, delegasyon üst sınırı, tenant-kapsamlı rol verme artık riski, doğrulama sırası yorumu); F6'nın kalanı (saas/tenant/role/settings/perf audit); Q-DP22a/b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill; gerçek ortam audit incelemesi/parola rotasyonu değerlendirmesi. Gerçek HTTP/DB denemesi yok.
API 49 suite / 1346 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-42-virtual-column-formula-validator.md` (aynı ID; formül doğrulayıcı YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — TASK-027.42 Done; TASK-027.43 Platform Privilege Model ve Tenant Role Delegation Karar Paketi (AI2 teslimi, review)

TASK-027.42 AI1 tarafından kabul edildi (`done`; F4 giderildi). **TASK-027.43 (Q-DP24) karar/kanıt paketi — production authorization kodu, permission, rol ve veri değiştirilmedi; Q-DP24 kapatılmadı:** `docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md`. Kanıtlanan yapısal gerçekler: üç yetki temsili (bayrak, `SYSTEM_ADMIN` ataması, global atamalar) ve iki farklı son-yönetici sayımı; tenant-rol tabloları yalnızca okunur (tenant-rol yönetim yüzeyi yok; müşteri yöneticisi rol veremez); `TENANT_ADMIN` tenant kapsamında her şey, global atanırsa PLATFORM yazma izinleri; delegasyon tavanı yok (latent); `assignRole` tenant tipini doğrulamaz; `SETTINGS:*` katalog boşluğu; impersonation'da ayrıcalık kısıtı yok. Seçenekler A/B/C + a–j karar matrisi, actor/target ve impersonation matrisleri, audit sözleşmesi, T1–T9 görev listesi, rollback/geçiş planı ve boş PO karar alanları hazır. AI2 önerisi (karar değil): kademeli A → B çekirdeği → gerekirse C.

## 2026-09-21 — AI1 Onayı: TASK-027.43

TASK-027.43 `done` olarak onaylandı. Q-DP24 karar paketi yeterli kanıt ve seçenek karşılaştırması sağladı; nihai Product Owner kararı, production privilege implementasyonu, tenant role delegation ve F6 audit işleri açık kaldı.
**Açık:** Q-DP24 (karar bekliyor), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill; gerçek ortam verisi/audit incelemesi `[DOĞRULANAMADI]`.
`privilege-model-evidence.spec.ts` (18 salt-okunur kanıt testi) eklendi; API 50 suite / 1364 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-43-virtual-column-dependency-resolution.md` (aynı ID; placeholder işi YAPILMADI) `planned` → `review`. Nihai karar/`done` AI1'de.

## 2026-09-21 — TASK-027.43 Done; TASK-027.44 Q-DP24 Karar Kapanış Formu (AI2 teslimi, review — Q-DP24 KAPANMADI)

TASK-027.43 AI1 tarafından karar/kanıt paketi olarak kabul edildi (`done`). **TASK-027.44 docs-only:** onaylı AI1/PO kararı iletilmediği (yalnızca AI2 önerisi) için Q-DP24 **kapatılmadı**; `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14'te 10 madde için AI2 önerisi, gerekçe, endpoint/service, permission/rol, migration, rollback ve önerilen sonraki task hazırlandı, **"AI1/PO kararı" sütunları BOŞ**; production kodu/rol modeli/permission kataloğu değişmedi. AI2 sınama notları: eş sistem yöneticisi yönetim yasağı onay mekanizması olmadan containment'ı yok eder (deaktivasyon serbest bırakılması önerildi — bilinçli sapma, PO seçecek); global `TENANT_ADMIN` yasağı kodda ürün akışını bozmaz (gerçek veri [DOĞRULANAMADI]); MFA şartı önce `mfaVerified` semantiği/MFA'sız admin geçişi kararı ister; tenant-rol delegasyonu yeni permission ister (uydurulmadı).
**Önerilen implementation görevleri (AI1 numara atar; karar bekliyor):** 027.45 canonical kaynak + son-yönetici invariant'ı; 027.46 `assignRole` sertleştirmesi; 027.47 eş yönetimi + ikinci onay; 027.48 global privilege'da MFA; 027.49 tenant-rol delegasyonu.
**Açık:** Q-DP24 (karar bekliyor), F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill.
API 50 suite / 1364 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla; kod değişmedi). Backlog `TASK-027-44-central-report-preset-model.md` (aynı ID; placeholder işi YAPILMADI) `planned` → `review`. Nihai karar/`done` AI1/PO'da.

## 2026-09-21 — TASK-027.44 güncellemesi: Q-DP24 AI1 karar seti kayda alındı (review; kapanış AI1'in `done` onayıyla; implementation başlatılmadı)

AI1 10 maddelik Q-DP24 karar setini iletti; `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.2/§5 dolduruldu. **Kararlar:** SYSTEM_ADMIN verme/kaldırma yalnızca aktif SYSTEM_ADMIN; eş yöneticiler parola/rol işlemlerinde birbirini yönetemez (deactivation/containment serbest); global TENANT_ADMIN yasak (mevcutlar otomatik silinmeden ön kontrolde raporlanır); privilege tavanı (etkin izin kümesi); canonical = SYSTEM_ADMIN rol ataması + `isSystemAdmin` türetilmiş/cache + drift kontrolü; impersonation'da privilege değişikliği yasak; MFA ayrı karar/geçişten önce zorunlu değil; tenant-role delegation yeni permission + ayrı task; son yönetici tek invariant; global privilege audit zorunlu, rollback/break-glass ayrı task.
**AI2 teyit noktaları (§14.5):** ⚠️ karar 2 uygulanınca sistem yöneticisi parolası için hiçbir API yolu kalmaz (self-servis değiştirme yok; `SELF_CHANGE` yasağı) → kimlik bilgisi rotasyon/break-glass yolu eş-yönetim kısıtıyla birlikte/önce (027.47); drift davranışı ve ACTIVE tanımı (027.45); "etkin izin kümesi" semantiği (027.46); global↔tenant sınırı ve "sysadmin impersonate edilemez" AI1 setinde yok/kısmen; ikinci onay, ≥2 yönetici, `SETTINGS:*` katalog boşluğu, shadow-mode kararlaştırılmadı.
**Sıradaki:** TASK-027.45 (AI1). Önerilen görevler (başlatılmadı): 027.45 ön kontrol + canonical kaynak + son-yönetici invariant'ı + drift; 027.46 assignRole sertleştirmesi; 027.47 eş yönetimi + rotasyon yolu + break-glass/rollback; 027.48 MFA geçişi; 027.49 tenant-rol delegasyonu.
**Açık:** F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill; gerçek ortam verisi `[DOĞRULANAMADI]`. Backlog `TASK-027-44-central-report-preset-model.md` `review` (kod değişmedi; `done` AI1'de).

## 2026-09-21 — Q-DP24 KAPANDI (AI1 teyidi); sıradaki görev TASK-027.45

AI1 teyitleri: eş sistem yöneticisi kısıtı parola rotasyonu/onaylı break-glass hazır olmadan production'da zorunlu olmayacak; mevcut davranış TASK-027.47'ye kadar korunacak; **TASK-027.45** yalnızca salt-okunur ön kontrol + canonical kaynak + drift + son-yönetici invariant'ı (**enforcement yok**); **TASK-027.46** global `TENANT_ADMIN` yasağı + privilege tavanı (mevcut atamalar otomatik silinmez); **TASK-027.47** eş yönetici parola/MFA + break-glass birlikte. TASK-027.44 `done` AI1'de. Açık alt konular: ikinci onay, ≥ 2 yönetici politikası, `SETTINGS:*` katalog boşluğu, shadow-mode, tenant-kapsamlı atamada ROOT+`TENANT_ADMIN`/scope dönüştürme (027.46'da teyit), sistem yöneticisi impersonate yasağı (Q-DP22c). Diğer açık: F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill. Uygulama başlatılmadı.

## 2026-09-21 — TASK-027.44 Done / Q-DP24 Kapandı; TASK-027.45 Privilege Canonical Source, Drift Detection ve Admin Invariant (AI2 teslimi, review)

**Salt-okunur temel — enforcement yok, erişim davranışı değişmedi, gerçek DB kullanılmadı.** `apps/api/src/platform/privilege/`: canonical kaynak = global `SYSTEM_ADMIN` rol ataması, `users.isSystemAdmin` türetilmiş/cache; yalnızca ACTIVE aktif sistem yöneticisi; son yönetici canonical atamalardan (invariant ≥ 1; "≥ 2" yalnızca bilgi); global ve tenant atamalar ayrı raporlanır; dokuz drift kategorisi; deterministik, credential'sız çıktı (yalnızca kimlik/kapsam/durum/statik neden kodu); adapter yalnızca 4 SELECT ve hiçbir route/CLI/job'a bağlı değil; global `TENANT_ADMIN` atamaları silinmez/değiştirilmez, yalnızca raporlanır. Bugünkü iki son-yönetici guard sayımının farkı `MULTIPLE_ADMIN_COUNT_MISMATCH` olarak görünür.
**[DOĞRULANAMADI]:** gerçek ortam drift'i, global `TENANT_ADMIN` atamaları ve sistem yöneticisi sayısı (rapor gerçek DB'de çalıştırılmadı; çalıştırma yolu AI1 kararı).
**Sıradaki:** TASK-027.46 (global `TENANT_ADMIN` yasağı + privilege tavanı + impersonation'da privilege yasağı; mevcut atamalar silinmez), 027.47 (eş yönetici parola/MFA + break-glass + rotasyon yolu; **o zamana kadar mevcut davranış korunur**), 027.48, 027.49. Diğer açık: F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, MFA enforcement, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill.
API 51 suite / 1396 test; web 8 dosya / 117 test; `check.sh --skip-docker` PASS (`NODE_PATH` + `TURBO_ENV_MODE=loose` geçici workaround'uyla). Backlog `TASK-027-45-…` (aynı ID; placeholder işi YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-21 — AI1 Onayı: TASK-027.45

TASK-027.45 `done` olarak onaylandı. Canonical global `SYSTEM_ADMIN` rol kaynağı, drift raporu, aktif yönetici invariant'ı ve credential'sız salt-okunur analiz kabul edildi. Gerçek ortam raporlama yolu, enforcement ve sonraki privilege sertleştirmeleri açık bırakıldı.

## 2026-09-22 — TASK-027.46 Role Assignment Privilege Ceiling ve Global TENANT_ADMIN Boundary (AI2 teslimi, review)

Q-DP24 kararlarından **privilege ceiling (madde 3), global `TENANT_ADMIN` yasağı (madde 5, enforcement) ve impersonation'da privilege değişikliği yasağı (madde 6)** uygulandı. **Eş sistem yöneticisi kısıtı (madde 2) bilerek UYGULANMADI** — §14.6 teyidi gereği mevcut davranış TASK-027.47'ye kadar korunuyor.
Yeni `apps/api/src/platform/domain/privilege-ceiling.domain.ts`: gerçek `PermissionGuard` semantiğini (bayrak = her şey; `PLATFORM:*` yalnızca global atamalardan; `TENANT_ADMIN` yalnızca kendi root'unda) saf fonksiyonlara taşıyan model, 225 kombinasyonluk parite testiyle guard'a karşı doğrulandı. `UserService`'in yedi işlemi, `MfaService.adminResetMfa`, `SaasService`'in müşteri parola/üyelik işlemleri bu modeli ve impersonation reddini kullanıyor.
**Global `TENANT_ADMIN`:** yeni atama (global, `tenantId` null) her actor için DB'ye dokunmadan reddediliyor; **mevcut atamalar hiçbir kod yolunda otomatik silinmiyor/değiştirilmiyor**, yalnızca açık `revokeRole` ile kaldırılabiliyor; TASK-027.45'in raporu bunları hâlâ listeliyor.
**Privilege ceiling:** hedef rolün etkin izin kümesi actor'ınkinin alt kümesi değilse reddediliyor; bilinmeyen izin/tenant tipi fail-closed.
**Impersonation:** altı işlem (görünen-ad güncellemesi hariç) impersonation oturumunda hiçbir DB okuması olmadan statik kodla reddediliyor; best-effort `DENIED` audit.
**Açık teknik teyit noktaları (kodda uygulandı ama Q-DP24 setinde açık teyit edilmedi):** tenant-kapsamlı atamanın yalnızca ROOT/PLATFORM_ROOT'ta anlamlı olması; "sistem yöneticisi impersonate edilemez" (Q-DP22c) uygulanmadı.
Testler: 44 yeni + mevcut spec uyarlamaları; 3 mutasyon kontrolü (global TENANT_ADMIN reddi, UserService impersonation reddi, MfaService impersonation reddi) geri alınınca sırasıyla 3/10/2 test kırıldı, geri alındı. `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 15 suite / 862 test; `./scripts/check.sh --skip-docker` PASS (API 52 suite / 1454 test, web 8 dosya / 117 test) — Q-ENV01 nedeniyle `NODE_PATH` + `TURBO_ENV_MODE=loose` ile. Gerçek DB/HTTP/MFA sağlayıcısı kullanılmadı.
**Sıradaki:** TASK-027.47 (eş sistem yöneticisi kısıtı + kimlik bilgisi rotasyon yolu + break-glass/rollback, **birlikte**), 027.48 (MFA), 027.49 (tenant-rol delegasyonu). Diğer açık: F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill. Backlog `TASK-027-46-period-comparison.md` (aynı ID; period comparison işi YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-22 — AI1 Onayı: TASK-027.46

TASK-027.46 `done` olarak onaylandı. Privilege ceiling, yeni global `TENANT_ADMIN` atamasının reddi ve impersonation privilege sınırı uygulandı; mevcut global atamalar korunarak otomatik veri değişikliği yapılmadı. Eş sistem yöneticisi kısıtı, credential rotation/break-glass, MFA ve tenant-role delegation sonraki tasklara bırakıldı.

## 2026-09-22 — TASK-027.47 Eş Sistem Yöneticisi Yönetimi, Credential Rotation ve Break-Glass (AI2 teslimi, review)

Q-DP24 kapanışının **madde 2 (Model B: eş sistem yöneticisi kısıtı), madde 1 (self-servis parola rotasyonu) ve madde 4'ün kalanı (break-glass)** uygulandı; madde 7/10 (genel MFA enforcement, ikinci onay) TASK-027.48'e bırakıldı.
**Model B:** `setPassword`/`assignRole`/`revokeRole`/`adminResetMfa` artık hedef sistem yöneticisiyse actor da sistem yöneticisi olsa bile reddediliyor (`PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED`); deaktivasyon (containment) dokunulmadı. **Bilinen sonuç:** peer actor'lar artık bir sistem yöneticisinin `SYSTEM_ADMIN` rolünü geri alamıyor — resmi demotion yalnızca break-glass veya ayrı bir görevle mümkün; son-yönetici sayım koruması bayrak↔rol drift'i için ikinci savunma katmanı olarak kod tabanında kaldı.
**Self-servis rotasyon:** yeni `POST auth/change-password`, her ACTIVE kullanıcıya açık, hedef alanı yok; başarıda hedefin tüm oturumları (`authSessions`) iptal ediliyor (aynı karar admin-başlatan `setPassword`'a da eklendi); erişim jetonu en fazla `JWT_EXPIRES_IN` (varsayılan 15dk) kadar geçerli kalabilir — bilinçli, belgelenmiş kalan risk.
**Break-glass:** yeni `apps/api/src/platform/break-glass/` — servis kasıtlı olarak `@Injectable()` değil ve modülde listeli değil (route'tan erişilemez); bağımsız CLI (`migrate.ts` deseni). Yalnızca hiçbir ACTIVE sistem yöneticisi kalmadığında çalışır, hedefin zaten canonical `SYSTEM_ADMIN` ataması olmalı; varsayılan KAPALI, `timingSafeEqual` token karşılaştırması, her sonuç audit'lenir, başarı sonrası doğal tek-kullanımlık.
**Yapılmayan (blocker olarak raporlandı):** break-glass hız sınırlama altyapısı kurulmadı (süreçler-arası durum tutan bir mekanizma bu task'ın kapsamında güvenli şekilde sağlanamaz).
Testler: 36 yeni (`system-admin-credential-rotation-and-break-glass.spec.ts`) + F4/boundary spec güncellendi; 4 zorunlu mutasyon kontrolü (eş-yönetici kısıtı → 4, break-glass token → 7, audit redaksiyonu → 1, son-yönetici koruması → 1 test kırıldı, geri alındı). `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 16 suite / 898 test; `./scripts/check.sh --skip-docker` PASS (API 53 suite / 1490 test, web 8 dosya / 117 test) — Q-ENV01 nedeniyle `NODE_PATH` + `TURBO_ENV_MODE=loose` ile. Gerçek DB/HTTP/MFA sağlayıcısı/production secret kullanılmadı.
**Sıradaki:** TASK-027.48 (MFA enforcement), TASK-027.49 (tenant-rol delegasyonu). **Gerçek ortam için kalan operasyonel adımlar:** `BREAK_GLASS_RECOVERY_TOKEN` üretimi/saklanması, break-glass runbook'u, hız sınırlama/izleme kurulumu, `JWT_EXPIRES_IN` kararı, geçmiş kötüye kullanım incelemesi, formal `SYSTEM_ADMIN` demotion yolu tasarımı. Diğer açık: F6'nın kalan audit kapsamı, Q-DP22b/c, Q-DP21d, Q-DP17, Q-DP04, Q-ENV01, dev ROOT backfill. Backlog `TASK-027-47-second-source-comparison.md` (aynı ID; second source comparison işi YAPILMADI) `planned` → `review`. Nihai `done` AI1'de.

## 2026-09-22 — AI1 Reddi: TASK-027.47 `done` onaylanmadı, TASK-027.47-R1 açıldı

AI1, TASK-027.47 teslimini **`review`'da tuttu**, `done` onaylamadı. Kapanışı engelleyen dört madde: (1) break-glass hız sınırlama altyapısı yok — brute-force/kötüye kullanıma açık; (2) break-glass gerçek DB/HTTP ortamında doğrulanmamış; (3) peer demotion tamamen engellenmiş durumda, ele geçirilmiş bir sistem yöneticisi için yalnızca break-glass kalıyor; (4) self-servis parola değişiminde session/audit davranışı ayrıca kanıtlanmalı. **TASK-027.47-R1** açıldı: break-glass rate-limit + tek-kullanımlık/süre sınırlı recovery + audit/tekrar-kullanım koruması + kontrollü yerel DB smoke test + peer demotion operasyonel açığının kapatılması + self-servis kanıtının tamamlanması. Hiçbir dosya/status değişikliği AI1 tarafından yapılmadı.

## 2026-09-22 — TASK-027.47-R1 Break-Glass Güvenlik Sertleştirmesi ve Credential Rotation Review (AI2 teslimi, review)

AI1'in dört kapanış engelini ele aldı. **Kod tarafında kapatılanlar:** (1) kalıcı, süreçler-arası hız sınırlama — yeni `break_glass_attempts` singleton tablosu, `SELECT ... FOR UPDATE` transaction'la atomik artırılıyor (gerçek Postgres altyapısı, sahte/bellek-içi değil; varsayılan 15dk/5 deneme); başarılı VE başarısız her deneme (yanlış token dahil) sayılıyor. (1 devamı) kalıcı tek-kullanımlık defter — yeni `break_glass_recovery_events` tablosu, `tokenHash` üzerinde UNIQUE; claim, credential yazma işlemiyle aynı transaction'da `INSERT ... ON CONFLICT DO NOTHING` ile yapılıyor (paralel-yarış garantisinin tek kaynağı); token kalıcı olarak tek kullanımlık. Opsiyonel `BREAK_GLASS_TOKEN_EXPIRES_AT` süre sınırı eklendi. Durum modeli: `AVAILABLE | USED | EXPIRED | RATE_LIMITED | INVALID | BLOCKED | FAILED`. (4) impersonation oturumu artık kendi parolasını dahi değiştiremiyor (`PRIVILEGE_DENIAL.IMPERSONATION`, controller `@CurrentUser()`'dan iletiyor).
**Kod dışı, operasyonel doküman kararı:** (3) peer demotion için mevcut yollar (deaktivasyon/containment → audit inceleme → yalnızca break-glass ile formal rollback) `METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md` §14.11'de belgelendi; resmi bir demotion permission/akışı bu task'ta eklenmedi.
**Kontrollü yerel DB smoke test (2) — TAMAMLANDI (kullanıcı onayıyla):** kullanıcı onayı sorulup alındıktan sonra çalıştırıldı. İzole, tek seferlik, kalıcı volume'suz bir Postgres container'ı (`docker run --rm`, rastgele yerel port) başlatıldı; `DATABASE_URL` yalnızca bu geçici container'a işaret etti (production'a hiç bağlanılmadı); tüm migration'lar derlenmiş `dist/migrate.js` ile uygulandı; break-glass servisi gerçek `PlatformAuditService` ile örneklenip 15 senaryo elle tetiklendi — **15/15 geçti**, en önemlisi gerçek eşzamanlı iki `recover()` çağrısının aynı token'da yarıştığı senaryoda yalnızca birinin başarılı olduğu, kaybedenin `TOKEN_ALREADY_USED` ile reddedildiği doğrulandı (mock'larla kanıtlanamayan tek senaryo). Audit satırlarında credential yok. Container `docker stop` ile durduruldu (`--rm` ile otomatik silindi), kalıcı volume hiç oluşmadı.
**Doğrulama:** `system-admin-credential-rotation-and-break-glass.spec.ts` 36 → 56 test. **5 mutasyon kontrolü** manuel çalıştırıldı, dosyalar geri yüklendi: tek-kullanım kontrolü kaldırılınca 2, hız sınırlama kısa-devre edilince 17, audit'e yeni parola sızdırılınca 1, break-glass oturum iptali kaldırılınca 1 test kırıldı. `pnpm --filter api exec tsc --noEmit` temiz; `pnpm --filter api exec jest platform --runInBand` 16 suite / 909 test; `pnpm --filter api exec jest src/db --runInBand` 2 suite / 40 test; **`./scripts/check.sh --skip-docker` PASS (exit 0)** — API **53 suite / 1501 test**, web 8 dosya / 117 test. Migration: `apps/api/drizzle/migrations/0003_break_glass_hardening.sql` (drizzle-kit `generate` ile, canlı DB'ye bağlanmadan, yalnızca şema-snapshot diff'i üzerinden üretildi). Gerçek production DB/HTTP/MFA sağlayıcısı/production secret hiç kullanılmadı.
**Sıradaki:** TASK-027.48 (MFA enforcement), TASK-027.49 (tenant-rol delegasyonu). Backlog `TASK-027-47-R1-break-glass-security-hardening.md` oluşturuldu, `status: review`. Nihai `done` AI1'de.

## 2026-09-22 — AI1 Onayı: TASK-027.47-R1 ve TASK-027.47 birlikte `done`

AI1, TASK-027.47-R1 teslimini onayladı: kalıcı PostgreSQL rate-limit (atomik `SELECT ... FOR UPDATE`), token hash ledger'ı ve tek kullanımlık claim, gerçek izole PostgreSQL smoke testinde 15/15 başarı, self-servis parola değişimi/session iptali kanıtı ve peer demotion operasyonel prosedürü kabul edildi; gerçek production DB/HTTP/secret kullanılmaması ve break-glass'ın Nest/HTTP'ye bağlanmaması doğrulandı. **TASK-027.47-R1 `done`; ana TASK-027.47 de R1 ile birlikte `done` kapandı.** Backlog: `TASK-027-47-R1-break-glass-security-hardening.md` ve `TASK-027-47-second-source-comparison.md` (TASK-027.47) her ikisi `review` → `done`. AI1, dosya/DB/Docker/runtime değişikliği yapmadığını belirtti. **Sıradaki görev: TASK-027.48 (MFA enforcement)** — AI1'in detaylı spesifikasyonu bekleniyor.

## Gelecek Ürün Kapsamı Notu — Laboratuvar ve İşletme Modülleri

Mevcut Wave 4/5 ve güvenlik zinciri tamamlandıktan sonra kapsam genişletilecektir. Gelecekte ayrı epic/task planı hazırlanacak iki ana ürün alanı kayda alındı:

- **Laboratuvar modülü:** İşletmede yapılan tüm analizlerin, analiz sonuçlarının ve ilgili kayıtların Metnex üzerinden girilebilmesi ve yönetilebilmesi.
- **İşletme modülü:** İşletmede elle girilen tüm operasyonel değerlerin Metnex üzerinden girilebilmesi, doğrulanması, tenant/lokasyon kapsamında saklanması, audit'lenmesi ve raporlanması.

Bu not şu an implementation kapsamı değildir; domain keşfi, veri sözleşmesi, ekranlar, yetki matrisi, audit, migration ve raporlama gereksinimleri zamanı geldiğinde ayrı epic/task'lara ayrılacaktır.

## Marka Anlamı — Metnex

`Metnex`, **Metis** ve **Nexus** isimlerinin birleşimidir. Metis; bilgi, akıl ve analizi, Nexus ise bağlantı, merkez ve entegrasyonu temsil eder. Ürün adı; Metnex'in SCADA, DMS, laboratuvar, işletme ve raporlama verilerini analiz eden ve farklı işletme sistemlerini ortak bir merkezde birleştiren platform vizyonunu ifade eder.
