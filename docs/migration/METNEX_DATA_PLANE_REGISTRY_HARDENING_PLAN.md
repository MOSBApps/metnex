# Data-Plane Registry Hardening — Remediation Planı (TASK-027.27)

> **Güncel durum (TASK-027.31):** R1, R2 (yalnızca erişim güvenliği), R3/R7 (yalnızca saf sözleşme) ve R10 (yalnızca erişim kapalılığı/tanı) **kısmen uygulandı** — ayrıntı dosya sonundaki "TASK-027.31 Uygulama Durumu" bölümünde. Aşağıdaki metin TASK-027.27 anındaki plandır (tarihsel).
> **Durum (TASK-027.27 anı): Yalnızca remediation planı. Mevcut kod DEĞİŞTİRİLMEMİŞTİR** (`ARCHIVED`/`FAILED`/`resolve()` davranışları aynen duruyor);
> test, schema, migration, `pgSchema()`, runner, seed, gerçek DB bağlantısı yok. Düzeltme kararları AI1/PO'ya aittir; bu plan
> `METNEX_DATA_PLANE_DECISION_GATE_CLOSURE_PACKAGE.md` kapılarına bağlanır. **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

**Kanıt:** `tenant-scope/{customer-schema-registry.service,tenant-scope.service,tenant-closure.service,tenant-scope.constants}.ts` + spec'ler, `platform/{saas,tenant}.service.ts`,
`db/schema/platform.ts`, `drizzle.config.ts`, `scripts/check-db.js`, `Dockerfile`, `pipeline.yml`, DEC-0010 (§Consequences).

Etiketler: **D1–D8** = TASK-027.26 bulguları; **D9–D10** = bu task'ta yeni (bkz. karar paketi N2 ve R10). **R#** = bu plandaki iş kalemi.

| R# | Bulgu | Önem (AI2 değerlendirmesi) | Kapı |
|---|---|---|---|
| R1 | D1 `ARCHIVED` → `ACTIVE` sessiz yeniden aktivasyon | **Yüksek** (iş verisi öncesi) | Q-DP03 |
| R2 | D2 `FAILED` için retry yolu yok | Orta-Yüksek | Q-DP04 |
| R3 | Registry ↔ fiziksel schema doğrulaması yok | **Yüksek** | Q-V20, Q-DP01 |
| R4 | D4 closure ↔ customerRoot tutarsızlığı doğrulanmıyor | Orta | Q-V20 |
| R5 | `migrationVersion = 0000_empty` sabit / sürüm izlenmiyor | Orta (iş verisiyle Yüksek) | Q-DP01 |
| R6 | D8 pre-DEC-0010 tenant backfill yok | Orta (ortama bağlı, `[DOĞRULANAMADI]`) | Q-V20 |
| R7 | Schema var/yok ↔ `ACTIVE` durum çelişkisi (R3'ün operasyonel yüzü) | **Yüksek** | Q-V20, Q-DP04 |
| R8 | D9 pipeline `dist/migrate.js` kaynaksız | **Yüksek** (control-plane migration yolu) | Q-DP02 |
| R9 | D7 varsayılan bağlantı fallback'i (2 dosya) | Orta | Q-DP07 |
| R10 | D10 `PROVISIONING`'de takılma (upsert sonrası, DDL öncesi çökme) | Orta | Q-DP04 |

---

## R1 — `ARCHIVED` → `ACTIVE` (D1)
- **Kök neden:** `ensureSchemaProvisioned` yalnızca `existing?.status === 'ACTIVE'` iken erken döner; diğer tüm durumlar (`ARCHIVED` dahil) upsert ile `PROVISIONING` yazılır, `CREATE SCHEMA IF NOT EXISTS` çalışır, `ACTIVE` olur. `ARCHIVED` semantiği kodda ayrı ele alınmamış; spec'te senaryo yok.
- **Güvenlik etkisi:** arşivlenmiş (kapatılmış/askıya alınmış) müşterinin data-plane'i yanlışlıkla erişime açılabilir; tenant oluşturma akışı yeniden tetiklenirse (idempotent varsayılan) sessiz.
- **Veri kaybı riski:** Düşük (`IF NOT EXISTS` mevcut veriyi silmez); asıl risk **yetkisiz yeniden erişim**.
- **Önerilen düzeltme (karar sonrası):** `ensureSchemaProvisioned` `ARCHIVED`'da hata verir (kod: `SCHEMA_ARCHIVED`); reaktivasyon ayrı, onaylı, audit'li akış (Q-DP03 AR2).
- **Test senaryosu:** (a) `ARCHIVED` satır → `ensureSchemaProvisioned` fırlatır, `CREATE SCHEMA` **çağrılmaz**, status değişmez; (b) reaktivasyon akışı onaysız reddedilir; (c) onaylı akış `ACTIVE`+audit; (d) `resolve()` `ARCHIVED`'da 403 (mevcut davranış korunur).
- **Sonraki task:** "Registry Hardening 1: ARCHIVED/PROVISIONING durum kuralları" (bu, Phase 5).
- **Rollback:** durum kuralı geri alınabilir (kod); veri etkilenmez. Yanlış reaktivasyon → `ARCHIVED`'a geri (schema silinmez).

## R2 — `FAILED` retry eksikliği (D2)
- **Kök neden:** Tek çağıran tenant oluşturma; `ensureSchemaProvisioned` hata fırlatır ve tenant kalır (DEC-0010 §10 tasarımı) ama yeniden deneyecek tetikleyici (job/CLI/endpoint) yok.
- **Güvenlik etkisi:** Fail-closed korunur (`getActiveRegistry` `ACTIVE` dışını `null` döner → `resolve()` 403); güvenlik açığı yok, **erişilemezlik** var.
- **Veri kaybı riski:** Yok (schema henüz iş verisi taşımıyor); ileride iş verili müşteride kesinti riski.
- **Düzeltme:** platform operasyonu sahipliğinde manuel retry CLI; sonra sınırlı zamanlanmış job (limit/backoff PO); `FAILED` yaşı alarmı (Q-DP04).
- **Test:** `FAILED` → retry başarı ⇒ `ACTIVE`; tekrar hata ⇒ `FAILED` + `lastError` güncel; limit aşımı ⇒ kalıcı alarm; retry sırasında eşzamanlı ikinci retry engellenir (kilit).
- **Sonraki task:** Registry Hardening 2: retry aracı.
- **Rollback:** job devre dışı; manuel CLI kalır. Veri etkisi yok.

## R3 / R7 — Registry ↔ fiziksel schema doğrulaması ve ACTIVE↔varlık çelişkisi
- **Kök neden:** `getActiveRegistry` yalnızca registry satırına bakar; `information_schema`/`pg_namespace` kontrolü hiçbir yerde yok. `ACTIVE` bir satır için schema silinmiş/hiç oluşmamış olsa da `resolve()` başarılı döner.
- **Güvenlik etkisi:** `resolve()` başarılıyken data-plane sorguları var olmayan schema'ya gider (hata); daha kötüsü, runner/uygulama "onarmak" için `CREATE SCHEMA IF NOT EXISTS` ile **boş** schema yaratırsa iş verisi kaybı **sessiz** kalır (yeni boş schema "sağlıklı" görünür).
- **Veri kaybı riski:** **Yüksek** (iş verisi geldikten sonra): schema kaybı fark edilmez, otomatik yeniden yaratma kaybı maskeler.
- **Düzeltme:** salt-okuma "registry health" kontrolü (schema var mı, sürüm tablosu var mı) — çalışma yolunda değil **preflight/izleme** olarak (her `resolve()`'a DB yükü ekleme kararı Q-DP01/G3 ile birlikte); tutarsızlıkta **otomatik onarım yok**, `BLOCKED` + alarm; `SCHEMA_MISSING` durumu registry'yi otomatik değiştirmez (insan kararı).
- **Test:** (a) registry `ACTIVE` + fiziksel yok ⇒ health `SCHEMA_MISSING`, runner `BLOCKED`, `CREATE SCHEMA` çağrılmaz; (b) fiziksel var + registry `FAILED` ⇒ uyarı, yeniden aktivasyon retry ile; (c) sağlıklı ⇒ geçer. *(Gerçek DB entegrasyonu ayrı harness task'ı; birim düzeyinde fake sorgu sonucu ile.)*
- **Sonraki task:** Registry Hardening 3: health/preflight servisi.
- **Rollback:** servis salt-okuma; kaldırılabilir. Onarım adımları elle yapıldığından geri alma yok/gerekmez.

## R4 — Closure ↔ customerRoot tutarlılığı (D4)
- **Kök neden:** `getDescendantTenantIds` yalnızca `ancestorTenantId` filtreler; `tenant_closure.customerRootTenantId` ile `tenants.customerRootId` eşitliği ve her descendant'ın aynı customer root'a ait olduğu **doğrulanmaz**; re-parenting API'si yok (DEC-0010 §6) ama veri hatası/elle müdahale mümkün.
- **Güvenlik etkisi:** Schema-per-customer altında başka müşteri tenant ID'leri bu schema'da satır bulamayacağından **veri sızmaz**; ancak tutarsız closure `dataScopeTenantIds`'ı şişirir/eksiltir ve hata sessiz kalır (yanlış "hiç veri yok" veya kapsam sapması).
- **Veri kaybı riski:** Yok (okuma tarafı).
- **Düzeltme:** salt-okuma tutarlılık doğrulayıcısı (preflight/izleme): her tenant için self-row var, descendant'ların `customerRootTenantId` = ata `customerRootId`, döngü yok, `ROOT` self-row kendine işaret eder. **Yeni scope mekanizması değil**; `resolve()` davranışı korunur (isteğe bağlı savunmacı kontrol Q-DP01/G3 tasarımına bağlı).
- **Test:** bozuk closure fixture'ları (self-row yok, farklı root'a ait descendant, döngü) ⇒ doğrulayıcı `CLOSURE_INCONSISTENT`; `resolve()` mevcut 8 spec değişmez.
- **Sonraki task:** Registry Hardening 3 (R3 ile birlikte).
- **Rollback:** doğrulayıcı kaldırılabilir; veri değişmez.

## R5 — `migrationVersion = 0000_empty` / sürüm izlenmiyor
- **Kök neden:** Sabit `DATA_PLANE_SCHEMA_VERSION` yalnızca provisioning'de yazılır; fan-out yok; sürüm hiçbir yerde okunmaz/doğrulanmaz.
- **Güvenlik etkisi:** Sürüm kaymasında uygulama yanlış şekle sorgu atar → kesinti/yanlış sonuç; izolasyon ihlali değil.
- **Veri kaybı riski:** Orta (başarısız/yarım migration fark edilmez).
- **Düzeltme:** sürüm kaynağı = gerçek data-plane migration günlüğü (sabit değil); `ACTIVE` tanımı "head'e ulaşmış + VERIFY" (ilk migration ile); sürüm geçidi ayrı servis (Q-DP01/G3); registry `migrationVersion` yalnızca VERIFY sonrası güncellenir (fan-out standardı §2).
- **Test:** registry sürümü < head ⇒ geçit `DATA_PLANE_VERSION_BEHIND` ve sorgu atılmaz; sürüm = head ⇒ geçer; `0000_empty` + hiç migration yok ⇒ geçer.
- **Sonraki task:** Phase 7 (fan-out + version gate).
- **Rollback:** geçit devre dışı bırakılabilir (yalnızca izleme moduna); veri etkilenmez.

## R6 — Pre-DEC-0010 tenant backfill eksikliği (D8)
- **Kök neden:** DEC-0010: "Tenants created before this migration do not get backfilled `tenant_closure` rows"; registry de yalnızca yeni ROOT oluşturma yoluyla yaratılır. Hedef ortamda böyle tenant olup olmadığı **`[DOĞRULANAMADI]`** (DB'ye bağlanılmadı).
- **Güvenlik etkisi:** Fail-closed (closure yok ⇒ `canAggregateChildren` tenant için boş kapsam; registry yok ⇒ `resolve()` 403). Erişilemezlik, sızıntı değil.
- **Veri kaybı riski:** Yok; yanlış backfill (yanlış `customerRootTenantId`) **yanlış kapsam** yaratabilir → dikkat.
- **Düzeltme:** **idempotent backfill planı** (yalnızca plan): `tenants.parentId` zincirinden closure yeniden türetilir (`createClosureForNewTenant` zaten upsert), `customerRootId` `tenants` tablosundan doğrulanır; her `ROOT` için registry `ensureSchemaProvisioned`. **Önce salt-okuma sayım/rapor**, sonra onaylı uygulama (tenant **oluşturulmaz**).
- **Test:** eksik closure fixture ⇒ backfill dry-run raporu; tekrar çalıştırma no-op; yanlış root tespiti ⇒ `BLOCKED`.
- **Sonraki task:** "Pre-DEC-0010 tenant backfill" (Q-V20 teyidinden sonra, gerekirse).
- **Rollback:** closure satırları türetilmiş veridir → silinip yeniden türetilebilir; registry satırı `ARCHIVED` (silinmez); schema silinmez.

## R8 — Pipeline migration adımı kaynaksız (D9, yeni)
- **Kök neden (kanıt):** `pipeline.yml` deploy adımı `node apps/api/dist/migrate.js` çağırır; `apps/api/src`'de `migrate` kaynağı **yok**, `dist`'te `migrate*` **yok**, `Dockerfile` bunu üretmez (yalnızca `drizzle/` + `drizzle.config.ts` kopyalar). Prisma dönemi kalıntısı olması olası (`[DOĞRULANAMADI]`; pipeline çalıştırılmadı).
- **Güvenlik etkisi:** Dolaylı: migration çalışmazsa deploy hata verir (iyi) **veya** yalnızca dev'de elle migration yapılır ve üretim şeması geride kalır (kötü).
- **Veri kaybı riski:** Orta (üretim şeması ↔ kod uyuşmazlığı).
- **Düzeltme:** control-plane migration yolunun **tek doğru mekanizması** belirlenir (programatik `drizzle-orm` migrator, `migrationsFolder`; `drizzle-kit` devDependency olduğundan image'da olmayabilir) ve fan-out aracıyla aynı ailede tasarlanır (Q-DP02/T4).
- **Test:** image'da migrate girişi mevcut ve boş DB'ye tüm migration'ları uygular (harness); yanlış `DATABASE_URL` ⇒ fail-fast.
- **Sonraki task:** "Migration entrypoint & pipeline düzeltmesi" (Phase 5 öncesi, Q-DP02/Q-DP07 ile).
- **Rollback:** pipeline adımı eski hâline döner; veri etkisi migration içeriğine bağlı (forward-only standardı).

## R9 — Varsayılan bağlantı fallback'i (D7)
- **Kök neden:** `drizzle.config.ts` ve `scripts/check-db.js` sabit dev fallback taşır; `db.service.ts` fallback'siz.
- **Güvenlik etkisi:** yanlış ortamda sessiz varsayılan hedefe bağlanma/DDL; kaynakta sabit credential bulunması hijyen sorunu (**değer kopyalanmadı**).
- **Veri kaybı riski:** Düşük-Orta (yanlış DB'ye migration).
- **Düzeltme:** Q-DP07 önerisi (production'da fallback reddi, geliştirmede yalnızca loopback+non-production); credential kaynaktan kaldırılıp `.env.example`/dev.sh'ye taşınması ayrı karar.
- **Test:** `NODE_ENV=production` + `DATABASE_URL` yok ⇒ fail-fast; loopback dışı host + fallback ⇒ reddedilir; maskeleme çıktıda parolayı göstermez.
- **Sonraki task:** R8 ile aynı task.
- **Rollback:** düşük (yapılandırma).

## R10 — `PROVISIONING`'de takılma (yeni)
- **Kök neden:** Upsert `PROVISIONING` yazılır, ardından `CREATE SCHEMA`; süreç bu aralıkta ölürse satır `PROVISIONING` kalır. `ensureSchemaProvisioned` yeniden çağrılırsa devam eder (idempotent) ama çağıran yok (R2 ile aynı kök).
- **Güvenlik etkisi:** Fail-closed (ACTIVE değil ⇒ 403).
- **Veri kaybı riski:** Yok.
- **Düzeltme:** `PROVISIONING` yaşı için zaman aşımı eşiği (**PO/AI1 sayı**) + retry aracına dahil (Q-DP04).
- **Test:** `PROVISIONING` + eski `updatedAt` ⇒ health "stuck"; retry ⇒ `ACTIVE`.
- **Sonraki task:** Registry Hardening 2 (R2 ile).
- **Rollback:** düşük.

---

## Önerilen uygulama grupları (öneri; AI1 backlog planlaması)
| Grup | Kalemler | Ön koşul karar | Not |
|---|---|---|---|
| **G-A durum kuralları** | R1, R10, R2 | Q-DP03, Q-DP04 | Küçük, kod+spec |
| **G-B sağlık/preflight** | R3/R7, R4, R6 (rapor) | Q-V20, Q-DP01 | Salt-okuma servisleri |
| **G-C migration girişi** | R8, R9 | Q-DP02, Q-DP07 | Pipeline + fan-out temeli |
| **G-D sürüm** | R5 | Q-DP01 | Phase 7 |

Hiçbir kalem bu task'ta uygulanmamıştır; mevcut kod değişmemiştir.

---

## TASK-027.31 Uygulama Durumu (2026-09-21)

AI1 güvenlik kararlarıyla aşağıdaki kalemler **uygulandı** (kod: `customer-schema-registry.service.ts`, yeni `registry-state.ts`, yeni `registry-diagnostics.ts`; 61 yeni test, gerçek DB yok). Bu bölüm yukarıdaki plan metnini değiştirmez; güncel durumu verir.

| R# | Durum | Uygulanan / uygulanmayan |
|---|---|---|
| **R1** ARCHIVED→ACTIVE | **Uygulandı** | `ensureSchemaProvisioned` `ARCHIVED` satırı `SCHEMA_ARCHIVED` (409, statik mesaj, schema adı/detay yok) ile reddeder; **`CREATE SCHEMA` çağrılmaz, satır yazılmaz**, tekrar çağrıda aynı sonuç. İkinci savunma katmanı: durum geçiş doğrulayıcısı `ARCHIVED→PROVISIONING`'i de reddeder. **Açık reactivation akışı uygulanmadı** (Q-DP03: ayrı gelecek task; onaylayan/audit/rollback kararı bekliyor) |
| **R2** FAILED retry | **Kısmen (yalnızca erişim güvenliği)** | `FAILED` erişime **kapalı** (`getActiveRegistry` yalnızca `ACTIVE` döndürür; `resolve()` 403), okuma yolu hiçbir durumu terfi ettirmez. **Retry sahibi/limit/backoff/otomatik job/CLI uygulanmadı** (Q-DP04 açık). **Dikkat:** `ensureSchemaProvisioned`'ın **açık çağrıda** `FAILED`/`PROVISIONING` satırı idempotent yeniden sürmesi (DEC-0010 §4, mevcut spec) **korundu**; bu otomatik değildir, tek çağıranı tenant oluşturmadır — kaldırılıp kaldırılmayacağı AI1 kararıdır (Q-DP04 sınırı) |
| **R3/R7** Registry↔fiziksel schema | **Sözleşme hazır, uygulama yok** | Salt-okuma saf sözleşme `diagnoseRegistryState` + `RegistryPhysicalSchemaProbe` arayüzü (yalnızca interface; **DB sorgusu/implementasyonu yok**): `ACTIVE+schema yok→SCHEMA_MISSING`, `ARCHIVED+schema var→ARCHIVED (reactivation yok)`, `FAILED+schema var→FAILED (otomatik ACTIVE yok)`, `PROVISIONING+schema var→PROVISIONING (durum değişmez)`, `ACTIVE+sürüm bilinmiyor→VERSION_GATE_BLOCKER`, `registry yok→REGISTRY_MISSING`, tutarsız değer→`REGISTRY_INCONSISTENT`; yalnızca `HEALTHY` `accessible`. Hiçbir tanı onarım tetiklemez; production'a bağlı **değil** |
| **R4** Closure↔customerRoot | **Uygulanmadı** | AI1: closure doğrulaması bu task'ta genişletilmez |
| **R5** `migrationVersion` | **Uygulanmadı** | Sürüm geçidi (Q-DP01) uygulanmadı; yalnızca "sürüm bilinmiyor" tanı sözleşmesinde blocker olarak modellendi |
| **R6** pre-DEC-0010 backfill | **Uygulanmadı** | Kapsam dışı |
| **R8/R9** entrypoint/bağlantı | **Önceki task'larda** | TASK-027.29/027.30 |
| **R10** PROVISIONING takılması | **Kısmen** | `PROVISIONING` **hiçbir zaman erişilebilir değil** (test kanıtlı) ve otomatik ACTIVE olmaz; stale tespiti yalnızca **salt-okuma tanıda**, eşik **çağıran tarafından** verilir (varsayılan yok, sayı uydurulmadı); otomatik timeout/retry **yok** |

**Ek sertleştirmeler (AI1 kararlarına hizmet eder):** (1) durum değişiklikleri beklenen mevcut duruma bağlı (`upsert` yalnızca yok/`PROVISIONING`/`FAILED` durumunda talep eder; `ACTIVE`/`FAILED` güncellemeleri yalnızca `PROVISIONING` satırda) — eşzamanlı `ARCHIVED`/`ACTIVE` satırı asla `ACTIVE` ile ezilmez, DDL çalışmaz, `REGISTRY_STATE_CONFLICT`; (2) bilinmeyen durum değeri `REGISTRY_STATUS_UNKNOWN` ile reddedilir; (3) `lastError`, log satırı ve fırlatılan hata **veritabanı metni içermez** (yalnızca hata sınıfı + SQLSTATE, örn. `Error [42501]: schema provisioning failed`); başarısızlıkta artık ham hata yerine `InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED' })` fırlatılır.
**Davranış değişikliği bildirimi:** provisioning başarısızlığında dış hata tipi/mesajı ve `lastError` içeriği değişti (ham DB metni artık yok).
