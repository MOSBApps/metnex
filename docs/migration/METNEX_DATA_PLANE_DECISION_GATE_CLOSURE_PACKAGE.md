# Data-Plane Karar Kapıları Kapanış Paketi (TASK-027.27)

> **Durum: Karar paketi. Production kodu, schema, migration, seed, `pgSchema()`, runner, DB role/RLS, gerçek DB değişikliği YOK.**
> **AI2 hiçbir kapıyı kapatmaz.** Her kapı için: kanıt, seçenekler, **AI2 önerisi**, risk, geri dönüş maliyeti, uygulanacak dosyalar ve
> **AI1/PO karar alanı** (boş) ayrı tutulmuştur. AI2 önerisi ile AI1/PO kararı birbirinden **yalnızca §14 Karar Formu'ndaki
> "AI1/PO KARARI" sütununun doldurulmasıyla** ayrışır; o sütun dolmadan hiçbir öneri bağlayıcı değildir.
> DEC dosyaları **değiştirilmemiştir**; DEC güncelleme metni yalnızca taslak olarak §8'dedir.
> **Tarih:** 2026-09-21 · **Hazırlayan:** AI2
> **Eşlik eden belge:** `METNEX_DATA_PLANE_REGISTRY_HARDENING_PLAN.md`; önceki: TASK-027.25/26 paketleri.

**Kanıtlar:** `DEC-0009/0010/0011`, `docs/domain/DB_META.md`, `db/{db.service,schema/platform}.ts`,
`tenant-scope/{customer-schema-registry.service,tenant-scope.service,tenant-closure.service,schema-name.util,tenant-scope.constants}.ts`,
`platform/{saas.service,tenant.service}.ts`, `apps/api/{drizzle.config.ts,scripts/check-db.js,Dockerfile,package.json}`,
`.github/workflows/pipeline.yml`, `dev.sh`, `migration/botc-identity/types.ts`, TASK-027.22–26 paketleri.

---

## 0. Ön bulgular (bu task'ta, önceki paketlerde olmayan)

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **N1** | **DEC-0010 ∧ DEC-0011 Q-V11'i büyük ölçüde zaten yazılı hâle getiriyor:** iş tabloları `public`'te değil müşteri-root schema'sında (DEC-0010 §2); DEC-0011 "§1-7, §9-12 **stands unchanged**", runtime `pgSchema(schemaName)` şart, `search_path` ile tenant değiştirme yasak. Açık olan **karar değil uygulama zamanlaması ve Phase 5-9 kapsamı** | DEC-0011 "Decision" + "Context (Forbidden)" | Q-V11'deki A seçeneği yazılı kararlara aykırıdır; "karar" fiilen **teyit/uygulama önceliği** meselesidir |
| **N2** | **Pipeline'ın migration adımı var olmayan bir dosyayı çağırıyor:** `pipeline.yml` deploy adımında `docker run … node apps/api/dist/migrate.js`; **`apps/api/src` altında migrate kaynağı yok, `apps/api/dist` içinde `migrate*` yok, `apps/api/Dockerfile` bunu üretmiyor** (yalnızca `drizzle/` klasörünü ve `drizzle.config.ts`'i kopyalıyor, `CMD main.js`). Pipeline çalıştırılmadığından çalışma zamanı sonucu `[DOĞRULANAMADI]`; kodda karşılık **bulunamadı** | `pipeline.yml:232-263`, `Dockerfile:25-30`, `find`/`ls` | Control-plane migration'ın üretimde nasıl uygulandığı belirsiz (Prisma dönemi kalıntısı olabilir) → Q-DP02'nin "pipeline adımı" seçeneği **bugün dayanaksız**; yeni bulgu **D9** |
| **N3** | **Varsayılan bağlantı bilgisi iki yerde:** `drizzle.config.ts` **ve** `scripts/check-db.js` aynı sabit dev fallback'ini taşır; `db.service.ts` fallback'siz `process.env.DATABASE_URL` kullanır. Değer bu belgeye **kopyalanmadı** | ilgili dosyalar | Q-DP07 kapsamı iki dosya |
| **N4** | **DEC-0010 ↔ DEC-0011 çelişki/eskime listesi** (§8 ayrıntı): faz numaralandırması, "iki ORM" sonucu, RLS ertelemesinin Prisma gerekçesi, `demo.ts` referansı | DEC metinleri | Q-DP06 |

---

## 1. Q-V11 — Data-plane mimarisi

Tanımlar (talimat): **C** iş verisi customer-root data-plane, control-plane metadata `public` · **B** iş verisi **ve** metadata tamamen data-plane ·
**A** tüm tablolar `public` · **D** geçici hibrit. Kapsamlı 12 kriterli matris: `METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md` §2 (aynen geçerli); özet:

| Seçenek | DEC-0010/0011 uyumu | Cross-customer | PLATFORM_ROOT yönetimi (F5) | Geri dönüş (iş verisi yazıldıktan sonra) |
|---|---|---|---|---|
| **C** | **Uyumlu** (DEC-0010 §1: `public` = tenant ağacı/metadata; §2: iş tabloları data-plane) | Schema sınırı | Metadata (mapping/ledger) `public` → platform yönetebilir | C→B orta (küçük metadata), C→A yüksek |
| **B** | **Kısmen uyumlu** (iş verisi uyumlu; ama `tenant_closure`/registry gibi *tenant ağacı hakkındaki* metadata'yı data-plane'e koymak DEC-0010 §1 gerekçesiyle çelişir) | Schema sınırı | **Platform metadata'yı yönetemez** | B→C orta |
| **A** | **Uyumsuz** (DEC-0010 §2; DEC-0011 "Forbidden" gerekçesi cross-customer sınırı) | Yalnızca `tenantId` disiplini | Doğrudan SQL ile görünür | A→C yüksek (satır taşıma + F2 altyapısı) |
| **D** | Geçici sapma; **yazılı çıkış kriteri şart** | Geçişte zayıf | Karışık | En yüksek (taşıma penceresi) |

**AI2 önerisi (karar değil): C.** Gerekçe: DEC-0010/0011 ile uyumlu tek seçenek + PLATFORM_ROOT'un mapping/ledger'ı yönetebilmesi. **Risk:** altyapı yok (registry düzeltmeleri, runner, harness), Vardiya'yı geciktirir.
**Karar için gereken:** AI1/PO teyidi + altyapının Vardiya'dan **önce** zorunlu olduğu kararı. **Dosyalar (onay sonrası):** DEC-0010 Phase 5-9 bölümü (§8), `DB_META.md`, ilgili altyapı task'ları (§13).

---

## 2. Q-DP01 — Sürüm geçidi ve provisioning

**Mevcut durum:** provisioning yalnızca boş schema oluşturur ve `ACTIVE` işaretler (`migrationVersion='0000_empty'`); data-plane migration'ı olmadığı için `0000_empty` **bugün** doğru ve tutarlıdır. `resolve()` yalnızca registry `ACTIVE` mi diye bakar; `migrationVersion`'a bakmaz.

| Alt soru | Seçenekler | AI2 önerisi (karar değil) |
|---|---|---|
| `0000_empty` ne zaman `ACTIVE` kabul edilebilir | (a) yalnızca **hiç data-plane migration yokken** (bugün) · (b) hiçbir zaman: `ACTIVE` = "head'e ulaşmış + VERIFY" | **(a)→(b) geçişi:** ilk data-plane migration yazıldığı anda kural (b) olur; bu geçiş yazılı kurala bağlanmalı |
| Provisioning tamamlanmadan `ACTIVE`? | (a) evet (bugün: boş schema = tamam) · (b) hayır: `ACTIVE` yalnızca schema + tüm migration'lar head'de + doğrulama sonrası; aksi `PROVISIONING`/`FAILED` | **(b)** (ilk migration ile birlikte) |
| Sürüm nasıl kontrol edilir | **G1** kontrol yok · **G2** `resolve()` içinde `migrationVersion ≥ gerekli` · **G3** ayrı `DataPlaneVersionGate` servisi, data-plane erişim fabrikası tüketir · **G4** açılışta tüm `ACTIVE` schema'ları kontrol, geride olan varsa boot reddi | **G3** (+ isteğe bağlı G4'ün uyarı modu) |
| Eski schema'ya erişimde ne olur | Fail-closed, ayırt edilebilir hata (`DATA_PLANE_VERSION_BEHIND`), veri sorgusu **hiç atılmaz**; etkilenen müşteri dışında kimse etkilenmez | Fail-closed |
| `resolve()` mi ayrı servis mi | `resolve()` mevcut 8 spec ve PLATFORM_ROOT/inaktif/registry sözleşmesini taşır; sürüm reddi ona eklenirse **sözleşme değişir** ve control-plane çağıranlar (tek tüketici olmasa da) etkilenir | **Ayrı servis (G3)**; `resolve()` çıktısına **additive** `migrationVersion` alanı eklemek yeterli (mevcut alanlar değişmez) |

**Riskler:** G2 sözleşmeyi bozar; G1 sürüm kaymasında yanlış şekle sorgu; G4 tek bozuk müşteri yüzünden **tüm uygulamayı** durdurabilir (öneri: uyarı modu). **Geri dönüş:** G1→G3 düşük (additive), G2→G3 orta. **Dosyalar:** `tenant-scope.service.ts` (+spec, additive alan), yeni `tenant-scope/data-plane-version-gate.service.ts`, `customer-schema-registry.service.ts` (ACTIVE kuralı), `tenant-scope.constants.ts`. **Karar sahibi:** AI1/PO. **Bağlı:** Q-DP02, Q-DP04.

## 3. Q-DP02 — Fan-out tetikleyicisi ve yetkisi

**Kanıt:** Uygulama `main.js` başlar; pipeline'ın migration çağrısı `dist/migrate.js` **kaynaksız** (N2); `dev.sh` yerel `pnpm db:migrate` (drizzle-kit); kimlik migration'ı için ayrı CLI deseni mevcut (`migrate:identity:dry-run`). Pipeline zaten `docker run --rm` tek-seferlik container deseni kullanıyor.

| Seçenek | Artı | Eksi | Not |
|---|---|---|---|
| **T1** Startup (her API örneği açılışta) | Basit | Çok kopyalı ortamda yarış, uzun açılış, uygulama kimliğine DDL yetkisi, hata = boot reddi | **Önerilmez** |
| **T2** Deploy pipeline adımı | Otomatik, sürümle senkron | Bugün hedef dosya **yok** (N2); pipeline sırrına bağlı | Yalnızca T4 aracını çağıran ince adım olarak |
| **T3** Yönetici CLI | İnsan kontrollü, dry-run doğal (mevcut CLI deseni) | Elle unutulabilir | Manuel/acil için |
| **T4** Ayrı migration job (tek seferlik container) | Uygulamadan bağımsız kimlik/yetki; mevcut `docker run --rm` deseni | Kimlik/secret yönetimi | **Yürütme mekanizması** |
| **T5** Manuel onaylı run | İnsan onay noktası (fan-out standardı §7) | Yavaş | İlk üretim run'ları için **onay kapısı** |

**AI2 önerisi (karar değil):** yürütme **T4** (ayrı job, migration'a özel DB kimliği), pipeline (T2) onu **çağıran ince adım**, ilk üretim `APPLY` run'ları **T5 onay kapısıyla**, acil/elle **T3**; **T1 yok**. **Yetki:** runner kimliği = migration servis kimliği (DB role), **`isSystemAdmin` veya PLATFORM_ROOT kullanıcı erişimi runner yetkisi değildir**; yeni uygulama-içi yetki icat edilmez. **Sayısal parametreler** (canary boyutu, hata eşiği, timeout, retry sayısı): **PO kararı gerekli — sayı uydurulmadı.**
**Riskler:** yanlış tetikleyici = üretimde kısmi/yarış migration; N2 gerçekse mevcut control-plane migration yolu zaten kırık. **Geri dönüş:** tetikleyici değişimi düşük (araç aynı). **Dosyalar:** `apps/api/src/…/data-plane-migrate.cli` (yeni), `package.json` script, `pipeline.yml` adımı, `Dockerfile` (aracın image'a girmesi), N2 düzeltmesi. **Karar sahibi:** AI1/PO.

## 4. Q-DP03 — ARCHIVED registry davranışı

**Kanıt:** `ensureSchemaProvisioned` yalnızca `ACTIVE`'i erken döndürür; `ARCHIVED` satır `PROVISIONING`→`CREATE SCHEMA IF NOT EXISTS`→`ACTIVE` olur; spec'te senaryo yok.

| Seçenek | Açıklama | Etki |
|---|---|---|
| **AR1** Yeniden aktivasyonu tamamen reddet | `ensureSchemaProvisioned` `ARCHIVED`'da hata verir | Yanlışlıkla canlanma biter; bilinçli reaktivasyon imkânsız |
| **AR2** Ayrı explicit reactivation akışı | Ayrı yöntem/komut: onay + audit + doğrulama; `ensureSchemaProvisioned` `ARCHIVED`'da **reddeder** | Bilinçli, izlenebilir |
| **AR3** Mevcut davranış | Sessiz canlanma | Kabul edilemez risk (D1) |

**AI2 önerisi (karar değil): AR2** (AR1 davranışı `ensureSchemaProvisioned` için varsayılan). **Onay kim:** PO/platform sahibi kararı gerekli (rol adı **uydurulmadı**). **Audit:** `PlatformAuditService` ile (örn. `DATA_PLANE_SCHEMA_REACTIVATED`; `metadata`: `customerRootTenantId`, `schemaName`, gerekçe kodu; veri yok). **Rollback:** yeniden `ARCHIVED` (schema **silinmez**, veri korunur). **Risk:** AR1/AR2 mevcut davranışı değiştirir (regresyon: bilinçli akışlar var mı `[DOĞRULANAMADI]` — tek çağıran tenant oluşturma). **Dosyalar (onay sonrası):** `customer-schema-registry.service.ts` + spec, yeni reactivation servisi. **Bu task mevcut davranışı değiştirmedi.**

## 5. Q-DP04 — FAILED registry retry

**Kanıt:** `FAILED` satır yalnızca `ensureSchemaProvisioned` yeniden çağrılırsa denenir; tek çağıran tenant oluşturma (D2). **Fail-closed zaten var:** `getActiveRegistry` `ACTIVE` dışını `null` döner → `resolve()` 403 ("aktif schema kaydı yok") — yani FAILED iken erişim kapalıdır (yeni kural gerekmez).

| Alt soru | Seçenekler | AI2 önerisi (karar değil) |
|---|---|---|
| Retry sahibi | platform operasyonu · migration job · tenant sahibi (yönetici) | **Platform operasyonu** (migration job kimliği); müşteri yöneticisi retry tetikleyemez (schema/DDL yetkisi) |
| Otomatik retry | yok · sınırlı zamanlanmış job · istek yolunda | İstek yolunda **hayır** (gecikme/yük/DDL riski); **önce manuel CLI (T3)**, sonra sınırlı zamanlanmış job |
| Retry limiti/backoff | — | **PO/AI1 kararı gerekli — sayı uydurulmadı**; standart: artan bekleme + üst sınır + sınırı aşan `FAILED` kalıcı alarm |
| İzleme | — | `FAILED` yaşı ve `lastError` kategorisi (veri/SQL değeri **yok**) gözlemlenmeli |

**Risk:** otomatik retry DDL'i tekrar tekrar dener (kilit/yük); hiç retry yoksa müşteri süresiz erişimsiz. **Geri dönüş:** düşük (job kapatılır). **Dosyalar:** `saas.service.ts` (hata sonrası yönlendirme), yeni retry CLI/job, `customer-schema-registry.service.ts`. **Karar sahibi:** AI1/PO.

## 6. Q-DP05 — Data-plane sertleştirme

> **Adlandırma notu:** TASK-027.26'daki H1/H2/H3 (role/RLS/uygulama) burada **talimata göre yeniden adlandırılmıştır:** H1 = yalnızca uygulama katmanı, H2 = müşteri-root başına DB role, H3 = uygulama + RLS/DB sertleştirmesi.

**Tek pool/tek role cross-customer riski (kanıt: `db.service.ts` tek `Pool`, tek `DATABASE_URL`):** (1) schema **isim alanıdır**; DB rolü tüm müşteri schema'larına yetkili olduğundan yanlış/karıştırılmış `schemaName` veya `pgSchema` bug'ı başka müşterinin verisini okur; (2) uygulamadaki herhangi bir SQL enjeksiyonu **tüm müşterileri** açar; (3) tek credential ele geçirilirse tüm müşteri verisi; (4) yedek/restore tüm-DB. **Şu an gerçek müşteri sayısı `[DOĞRULANAMADI]`** (DEC-0010: "no deployed production data"); risk **ileriye dönük** ama iş verisi yazılmadan önce sertleştirme kararı verilmeli.

| Kriter | H1 uygulama | H2 müşteri başına DB role | H3 uygulama + RLS/DB sertleştirme |
|---|---|---|---|
| Cross-customer sınırı | Uygulama doğruluğu | **DB ayrıcalığı** (rol yalnızca kendi schema'sına) | Uygulama + kısmen DB (RLS intra-customer; role yoksa cross-customer hâlâ uygulamada) |
| Karmaşıklık | Düşük | Yüksek (rol provizyonu, credential yönetimi, `SET LOCAL ROLE`/pool) | Orta-yüksek (`SET LOCAL app.tenant_ids` her transaction) |
| DEC-0011 uyumu | Uyumlu | `SET LOCAL ROLE` **transaction-yereldir**, "request-scoped `search_path` hack" değildir — ama AI1'in yorumu gerekir | Uyumlu (RLS DEC-0010 §12'de ertelenmişti) |
| Migration/backup | Etkisiz | Rol/grant fan-out'a girer | Politikalar migration'a girer |
| Test | Statik+harness | Ek: rol ihlali testleri | Ek: RLS testleri |
| Operasyonel maliyet | Düşük | Yüksek | Orta |

**AI2 önerisi (karar değil):** **H1 + sıfır-maliyetli DB hijyeni** (migration rolü ↔ uygulama rolü ayrımı: uygulama rolü DDL yetkisiz; `schemaName` yalnızca `resolve()`'dan + `isSafeSchemaIdentifier` + tek fabrika + statik test) ile **başla**; H2'yi **ayrı karar** olarak, ikinci müşteri/düzenleyici gereksinim öncesi yeniden değerlendir; H3 RLS'i "resolver bypass'ı gözlenirse" (DEC-0010 §12 koşulu). **Risk:** H1'de uygulama hatası = cross-customer sızıntı. **Geri dönüş:** H1→H2 orta-yüksek (rol/credential, tüm data-plane sorguları transaction sarmalı). **AI2 yeni DB role/RLS uygulamadı.** **Dosyalar (onay sonrası):** `db/data-plane/*` (fabrika+statik spec), `db.service.ts` (rol ayrımı), `infra/docker` (DB init/rol), DEC-0010 §12. **Karar sahibi:** PO/AI1.

## 7. Q-V20 — Tenant ve registry preflight

Öneri (karar değil): **salt-okuma preflight + `BLOCKED`**; hiçbir durumda tenant/registry/schema **oluşturulmaz** (tenant oluşturmak **kesin kapsam dışı**).

| Durum | Migration/apply run sonucu | Neden |
|---|---|---|
| Tenant yok / `ROOT` değil / `ACTIVE` değil | O müşteri `BLOCKED` (`TENANT_MISSING`/`TENANT_NOT_ROOT`/`TENANT_INACTIVE`) | `resolve()` ile aynı koşullar |
| Registry yok | `BLOCKED` (`REGISTRY_MISSING`); provisioning ayrı task (D8/Q-DP04) | Runner provizyon yapmaz |
| Registry `ACTIVE` değil | `PROVISIONING`/`FAILED` → `BLOCKED` (retry Q-DP04'e yönlendirilir); `ARCHIVED` → **atlanır** (hedef değil, Q-DP03) | Yanlış canlandırma yok |
| Fiziksel schema yok (registry `ACTIVE`) | `BLOCKED` (`SCHEMA_MISSING`) + **alarm**; runner sessizce yeniden yaratmaz (`CREATE SCHEMA IF NOT EXISTS` ile "onarma" yapılmaz) | ACTIVE↔fiziksel çelişki = veri kaybı/yanlış yapılandırma işareti |
| Closure tutarsız (`tenants.customerRootId` ↔ `tenant_closure.customerRootTenantId`, eksik self-row) | `BLOCKED` (`CLOSURE_INCONSISTENT`) | Scope güvenilmezse migration/veri işlemi yapılmaz |
| Sınırlama | Bloklama **müşteri (schema) başına**; diğer müşteriler devam eder (fan-out standardı §4); **tümü BLOCKED ise** run `FAILED` | Bağımsız müşteri izolasyonu |

**Risk:** fazla katı preflight tek bozuk müşteri için sürekli alarm; gevşek preflight yanlış schema'ya DDL. **Dosyalar:** runner preflight modülü (yeni), registry doğrulama servisi. **Bağlı:** Q-V25, Q-DP04, Hardening plan R3/R4/R6. **Karar sahibi:** AI1/PO.

## 8. Q-DP06 — DEC ve Phase 5–9 kapsamı (karar **taslağı**; DEC dosyaları değiştirilmedi)

### 8.1 Çelişki/eskime listesi

| # | DEC-0010 | DEC-0011 / kod | Durum |
|---|---|---|---|
| C1 | Status: "Phase 1-4 only — Phase 5-9 pending review" | Status: "Phase 5-**7** data-plane feature work … separate, later round" | **Faz aralığı tutarsız (5-9 vs 5-7)** |
| C2 | §9: fan-out "designed here, not built yet — **Phase 5** builds it when there is an actual data-plane migration" | (yok) | Talimatın taslağı fan-out'u **Phase 7**'ye koyuyor → yer değiştirme; karar gerekir |
| C3 | §6/Phase 6 = settings inheritance | — | Talimat taslağıyla uyumlu (Phase 6) |
| C4 | §8 "Prisma control-plane, Drizzle data-plane" | DEC-0011: Drizzle tek ORM; §8 **superseded** | DEC-0010 metni **eski** (dipnotla işaretli olmalı) |
| C5 | Consequences: "two ORMs … Prisma for control-plane" | DEC-0011 ile geçersiz | Eski |
| C6 | §12 RLS ertelemesi gerekçesi "Prisma's connection pooling" | Prisma yok | Gerekçe eski; RLS sorusu (Q-DP05) yeniden değerlendirilmeli |
| C7 | — | DEC-0011 tablo listesi `demo.ts` içerir | Demo modülü DEC-0012 ile kaldırıldı → DEC-0011 metni eski |
| C8 | "Phase 7-9" içeriği belgesiz (`DB_META.md`: "data-plane move, settings inheritance, reporting adaptation") | — | Kapsam tanımı yok (D6) |
| C9 | §9 fan-out `migrationVersion` güncelleyecek; registry bugün sabit | — | Kod ↔ tasarım açığı (Q-DP01) |

### 8.2 Önerilen Phase kapsamı (**taslak**, AI1 onayına tabi)

| Phase | Kapsam | Giriş kriteri | Çıkış kriteri |
|---|---|---|---|
| **5** Data-plane schema foundation | `pgSchema` fabrikası (tek nokta), registry düzeltmeleri (R1–R7), registry↔fiziksel doğrulama, çok-şemalı test harness, statik güvenlik testleri | Q-V11/Q-DP05 kararı | Cross-customer erişim testi geçer; `ARCHIVED/FAILED` davranışı kararlı |
| **6** Settings/inheritance | DEC-0010 §Phase 6 (closure tabanlı ayar kalıtımı) | Phase 5 | (DEC-0010'un kendi kabulü) |
| **7** Migration fan-out ve version gate | Runner + ledger + sürüm geçidi + tetikleyici (Q-DP01/02) | Phase 5 | Canary + partial + retry testleri |
| **8** Domain module adaptation | İlk iş modülü (Vardiya) data-plane'e: schema, repository, API | Phase 5+7, mapping/ledger, Q-V20/21/25 | Vardiya kontrat testleri (TASK-027.24) |
| **9** Reporting/archive/operational hardening | Raporlama uyarlaması, arşiv, izleme/alarm, retention temizliği | Phase 8 | Operasyonel gözlem, retention politikası |

Fan-out'un DEC-0010 §9'daki "Phase 5" yerleşiminden **Phase 7'ye taşınması** (C2) açık bir kararıdır; alternatif: runner'ı Phase 5'e geri koymak (Vardiya'dan önce zorunlu olduğu için mantıklı). **AI2 önerisi (karar değil):** faz **numaralarını korumak değil, giriş/çıkış kriterlerini** DEC'e yazmak; Vardiya için fan-out (Phase 7) **Phase 8'den önce** olmalı.

### 8.3 DEC güncelleme taslağı (uygulanmadı)
"DEC-0010 Amendment 1 (draft): (1) §8 ve Consequences'taki Prisma/iki-ORM ifadeleri DEC-0011 ile superseded olarak işaretlenir; (2) Status satırındaki faz aralığı tek kaynağa bağlanır (Phase 5-9, tanımlarıyla); (3) §9 fan-out yerleşimi ve sürüm geçidi eklenir; (4) §12 RLS gerekçesi güncellenir; (5) Registry davranış kuralları (ARCHIVED, FAILED, ACTIVE tanımı) eklenir." DEC-0011: `demo.ts` referansı dipnotlanır. **Karar verilmeden DEC dosyaları değiştirilmez.**

## 9. Q-DP07 — `DATABASE_URL` ve varsayılan bağlantı

**Kanıt (N3):** `drizzle.config.ts` ve `scripts/check-db.js` sabit dev fallback taşır (değer **kopyalanmadı**); `check-db.js` hata çıktısında parolayı maskeliyor; `db.service.ts` fallback'siz; pipeline `DATABASE_URL`'i açıkça geçirir; `dev.sh` yerel akış.

| Seçenek | Açıklama | Değerlendirme |
|---|---|---|
| **U1** Fallback kalsın (dev) | Mevcut | Üretimde yanlış hedefe sessiz bağlanma riski |
| **U2** `DATABASE_URL` her yerde zorunlu | Fail-fast | En güvenli; yerel geliştirmede `dev.sh`/`.env` şart |
| **U3** Fallback yalnızca `NODE_ENV≠production` | Kısmi | `NODE_ENV` yanlış ayarlanırsa risk |
| **U4** Fallback yalnızca loopback host | Host doğrulamalı | En dar geliştirme kolaylığı |

**AI2 önerisi (karar değil):** **U2**, geliştirme kolaylığı için **U3+U4 birleşimi** (yalnızca `NODE_ENV≠production` **ve** hedef host loopback iken fallback; production'da fallback **tamamen reddedilir**, fail-fast). **CI/CD:** DATABASE_URL zorunlu (pipeline zaten geçiriyor). **Risk:** yerel akışlar kırılabilir (dev.sh uyumu). **Geri dönüş:** düşük. **Dosyalar:** `drizzle.config.ts`, `scripts/check-db.js`, `db.service.ts` (fail-fast), `dev.sh`. **Karar sahibi:** AI1. **Gerçek bağlantı bilgisi hiçbir rapora yazılmadı.**

## 10. Q-V21 — Mapping persistence

| Kriter | `public` mapping tablosu | Sürüm kontrollü konfigürasyon | Customer-root mapping tablosu | Ayrı mapping/staging şeması |
|---|---|---|---|---|
| PLATFORM_ROOT yönetimi (F5) | **Evet** | Repo/deploy erişimi | **Hayır** (`resolve()` 403) | Şemaya bağlı |
| Audit/onay izi | Var (satır+`PlatformAuditService`) | **Yok** (yalnızca VCS geçmişi) | Var, platform göremez | Var |
| Tenant FK bütünlüğü | `tenants.id` FK | Yok (metin) | Şemalar arası FK (F2 belirsiz) | Şemalar arası |
| `effectiveFrom` | Satır alanı + kısmi unique | Sürüm etiketi | Satır alanı | Satır alanı |
| Reassignment (Q-V22) | Onaylı, `supersedesMappingId` zinciri | Yeni sürüm + deploy | Aynı ama platform göremez | Aynı |
| Q-V11 bağımlılığı | C ile uyumlu | Yok | B'ye bağlı | Ayrı karar |

**AI2 önerisi (karar değil): `public` control-plane mapping tablosu** (`customerRootTenantId` kapsamlı, tenant `tenantId` FK, kısmi unique tek-RESOLVED, `supersedesMappingId`). **Risk:** yeni public tablo + migration; yanlış tenant ID → K3 çakışma tespiti şart. **Geri dönüş:** tablo→data-plane orta; config→tablo düşük. **Dosyalar:** `db/schema/` yeni tablo + barrel + migration. **Karar sahibi:** AI1/PO. (`Sirket` mapping kaynağı **değildir**.)

## 11. Q-V25 — Mantıksal anahtar → gerçek tenant kimliği

**Kanıt:** Wave 1 anahtarları `'MOSB'|'MOSEDAS'|'MOSBIO'` büyük harfli ve ebeveynsizdir (`types.ts:49`); gerçek slug `slugify()` ile **küçük harf** ve alt tenant'ta **ebeveyn önekli** (`composeTenantSlug`); slug global unique ama **case-sensitive** index; DEC-0010 §3: tenant **yeniden adlandırılabilir** ("renaming a tenant must never rename its schema") → slug **değişken**, `tenants.id` (UUID) **değişmez**.

| Seçenek | Kararlılık | Ek yük | Risk |
|---|---|---|---|
| **K1** Gerçek `tenantId` ile bağla | En kararlı | Bağlama/onay gerekir | UUID okunaksız → insan doğrulaması zor |
| **K2** Gerçek slug ile bağla | **Değişken** (rename), ebeveyn öneki ve küçük harf uyuşmazlığı | Düşük | Rename = sessiz kopma; büyük harf `MOSB` hiçbir slug'la eşleşmez |
| **K3** Ayrı external/business key (mantıksal anahtar bir alan) | Kararlı (anahtar sabit) | Ek kolon | Kendi başına **tenant'a bağlamaz** |
| **K4** Onaylı mapping tablosu | Onay/audit izli | Tablo (Q-V21) | K1/K3 ile birlikte kullanılır |

**AI2 önerisi (karar değil): K4 = K3+K1:** onaylı mapping tablosunda `externalKey` (`MOSB`… mantıksal anahtar, **sabit**) → `tenantId` (FK) bağı; `tenantSlug` yalnızca bilgi/anlık görüntü. **Büyük harfli ve ebeveynsiz anahtarlar hiçbir yerde gerçek slug gibi kullanılmaz** (K2 reddedilir). Bağ **onay** gerektirir (`PENDING_APPROVAL→RESOLVED`); doğrulama: tenant `ACTIVE`, beklenen customer root altında. **Risk:** onay gecikmesi; yanlış onay = yanlış tenant (K3 çakışma tespiti, reassignment Q-V22). **Dosyalar:** mapping tablosu (Q-V21), Wave 1 `tenant-mapping.ts` adaptörü, migration motoru preflight. **Karar sahibi:** AI1/PO.

## 12. Q-ID01 — Staging ve ledger

| Öğe | Yer (AI2 önerisi; karar değil) | Gerekçe |
|---|---|---|
| Identity staging | `public` (control-plane) | Users/membership control-plane hedefli |
| Vardiya payload staging | Müşteri-root data-plane | İş verisi/PII düzlemi (DEC-0010 §2) |
| Fan-out ledger | `public` control-plane | PLATFORM_ROOT izleyebilmeli; iş verisi içermez |
| Legacy-ID ledger (kaynak→hedef eşleme) | `public` (PII'siz) veya data-plane ile birlikte — **PO/AI1 seçimi** | Idempotency için kalıcı |
| PII retention süresi | **PO kararı gerekli** (sayı uydurulmadı) | — |
| Payload retention süresi | **PO kararı gerekli** | Rollback penceresi ile ilişkili |
| Run metadata | `migrationRunId`, mod, süreler, sayaçlar, durum, kategori (veri yok) | Fan-out standardı §3 |
| Retry/reconciliation | Aynı `migrationRunId`, `attempt++`; reconciliation ledger+hedef karşılaştırır; payload temizliği rollback'i kapatır | TASK-027.19/fan-out |
| Temizleme yetkisi | Migration servis kimliği, run kapanışında; **kim tetikler PO kararı** | PLATFORM_ROOT data-plane'e erişemez (F5) |

**Dosyalar:** `db/schema/` (ledger `public`), data-plane staging schema, retention job. **Karar sahibi:** AI1/PO.

## 13. Onay sonrası uygulama sırası (öneri)
1) DEC-0010 amendment + Phase kapsamı (Q-DP06/Q-V11) → 2) Registry hardening (Q-DP03/04, R1–R10 — `..._REGISTRY_HARDENING_PLAN.md`) → 3) N2/D9 pipeline migrate yolunun netleştirilmesi + Q-DP07 →
4) `pgSchema` fabrikası + harness (Phase 5) → 5) Runner/version gate/ledger (Phase 7; Q-DP01/02) → 6) Mapping tablosu + Q-V25 bağlama → 7) Tenant/registry mevcudiyet teyidi (Q-V20) →
8) Vardiya schema/repository/API (Phase 8).

## 14. Karar Formu (AI1/PO doldurur — AI2 doldurmaz)

| Kapı | AI2 önerisi | **AI1/PO KARARI** | Tarih/Gerekçe |
|---|---|---|---|
| Q-V11 | C | ☐ bekliyor | |
| Q-DP01 | G3 (ayrı sürüm geçidi, `resolve()` sözleşmesi korunur) + ACTIVE = head'e ulaşmış (ilk migration ile) | ☐ bekliyor | |
| Q-DP02 | T4 yürütme + T2 ince adım + T5 onay kapısı + T3 acil; T1 yok; sayısal parametreler PO | ☐ bekliyor | |
| Q-DP03 | AR2 (explicit reactivation; `ensureSchemaProvisioned` ARCHIVED'ı reddeder) | ☐ bekliyor | |
| Q-DP04 | Platform operasyonu, önce manuel CLI, sonra sınırlı job; limit/backoff PO | ☐ bekliyor | |
| Q-DP05 | H1 + DB hijyeni; H2 ayrı karar; H3 koşullu | ☐ bekliyor | |
| Q-DP06 | Phase 5-9 tablosu (§8.2) + DEC amendment taslağı (§8.3) | ☐ bekliyor | |
| Q-DP07 | U2; geliştirme için U3+U4 | ☐ bekliyor | |
| Q-V20 | Salt-okuma preflight + `BLOCKED`; tenant oluşturma kapsam dışı | ☐ bekliyor | |
| Q-V21 | `public` mapping tablosu | ☐ bekliyor | |
| Q-V25 | K4 = mapping tablosunda `externalKey`→`tenantId` | ☐ bekliyor | |
| Q-ID01 | Düzleme göre ayrım; süreler PO | ☐ bekliyor | |

## 15. Teyit
`apps/` altında dosya eklenmedi/değiştirilmedi; ARCHIVED/FAILED davranışı kodda değiştirilmedi; `pgSchema()`, runner, migration, schema, seed, tenant/registry kaydı, DB role/RLS, gerçek PostgreSQL/SQL Server bağlantısı yok;
DEC dosyaları değiştirilmedi; gerçek tenant/secret/connection string yazılmadı; Wave 2/3, Docker, git commit/push yok. **Kapatılan soru yok.**
