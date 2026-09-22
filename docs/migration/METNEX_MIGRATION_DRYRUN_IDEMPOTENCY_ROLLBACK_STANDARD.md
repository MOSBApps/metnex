# Metnex Migration Dry-run / Idempotency / Rollback Standardı

> **Durum: Discovery/standart dokümanı — kod, migration veya veri değişikliği içermez.**
> Kaynak görev: `backlog/TASK-027-10-migration-dry-run-idempotency-rollback-standard.md`
> (EPIC-004, Wave 0, bağımlılık: TASK-027.1 + TASK-027.6 — done). Bu belge
> `BOTC_MIGRATION_ARCHITECTURE_DECISION.md` §7'yi (idempotency/dry-run/rollback ilkeleri, özet
> düzey) **tamamlar, tekrar etmez** — bu belge tüm BOTC→Metnex migration task'ları (Wave 1/4/5)
> için **ortak, entity'den bağımsız bir standart** tanımlar. Bu bir **prosedür/standart
> dokümanıdır, bir implementation script'i değildir** — hiçbir migration komutu çalıştırılmamış,
> hiçbir rollback komutu **çalıştırılmamış, yalnızca dokümante edilmiştir**.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)

## Kaynak İnceleme Yöntemi

Bu belge, Metnex kod tabanındaki **gerçek, var olan** idempotency/transaction/backup desenlerini
temel alır — hiçbir mekanizma varsayılmadan icat edilmemiştir:

- **İdempotent provisioning örneği:** `apps/api/src/tenant-scope/customer-schema-registry.service.ts`
  — `ensureSchemaProvisioned()`: durum makinesi (`PROVISIONING`/`ACTIVE`/`FAILED`), `ACTIVE`
  satırda no-op, `FAILED` satırda yeniden dene, `onConflictDoUpdate` ile idempotent upsert,
  hata durumunda `lastError` ile durum kaydı.
- **Transaction sınırı örneği:** `apps/api/src/platform/bootstrap.service.ts` —
  `this.db.transaction(async tx => {...})`: ilişkili yazma işlemlerini (örn. "admin var mı
  kontrolü + oluşturma") tek transaction içinde, race condition'ı önleyecek şekilde gruplama.
- **Gerçek backup örneği (bu oturumda fiilen üretilmiş):** `backup/openmas-pre-metnex-migration-
  20260917_072650.dump` + `.dump.sha256` — TASK-024.5'te gerçek `pg_dump` ile üretilmiş, ayrı bir
  `.sha256` dosyasıyla checksum'lanmış, dosya adında bağlam+zaman damgası (`<bağlam>-
  <YYYYMMDD_HHMMSS>.dump`) taşıyan **gerçek, kanıtlanmış** bir backup deseni.
- **Audit sözleşmesi:** `apps/api/src/audit/platform-audit.service.ts` (TASK-027.9'da
  derinlemesine incelenmişti, burada migration run metadata'sına genişletilerek referans alındı).

`BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §5 (legacy ID/UUID mapping ihtiyacı) ve
`BOTC_USER_ROLE_PERMISSION_MIGRATION_MAPPING.md` (Q-P01/Q-M04 karar bekleyen alanlar) bu belgede
**doğrulama kapıları** (§7) bağlamında referans alınmıştır, yeniden üretilmemiştir.

**Bu belgede hiçbir gerçek secret/parola/hash/salt/token/connection string yazılmamıştır. Hiçbir
migration script'i veya production kodu üretilmemiştir. PostgreSQL'de hiçbir veri değişikliği
yapılmamış, SQL Server'a bağlanılmamıştır.**

---

## 1. Migration Yaşam Döngüsü — 8 Aşama

Her BOTC→Metnex migration çalıştırması (Wave 1 kimlik, Wave 4 Vardiya, Wave 5 SCADA fark etmeksizin)
aşağıdaki **8 aşamadan sırayla** geçer. Bir sonraki aşamaya yalnızca önceki aşama **başarıyla**
tamamlandığında geçilir.

| # | Aşama | Amaç | Geri dönüşü var mı? |
|---|---|---|---|
| 1 | **Preflight** | Kaynak/hedef erişilebilirlik kontrolü, şema uyumluluğu, ön koşul doğrulama (§7'deki kapılar) — **hiçbir veri okunmaz/yazılmaz**, yalnızca bağlantı/yetki/şema kontrolü | Etkisiz — yan etkisi yok |
| 2 | **Backup** | Migration'dan etkilenecek PostgreSQL şemasının/tablolarının tam yedeği (§5) | Backup'ın kendisi geri alınabilir (silinebilir), ama migration henüz başlamadı |
| 3 | **Dry-run** | Gerçek yazma **yapılmadan**, planlanan değişikliklerin tam simülasyonu ve standart rapor üretimi (§3) | Etkisiz — yan etkisi yok |
| 4 | **Approval gate** | Dry-run raporunun **insan** (AI1/Product Owner) tarafından incelenip onaylanması — otomatik geçiş **yok** | Onay verilmezse süreç burada durur, hiçbir şey yazılmaz |
| 5 | **Apply** | Onaylanmış planın gerçek yazımı — idempotent (§4), transaction sınırları belirli (§6.5) | Kısmi — transaction içindeki adımlar atomik, transaction dışı adımlar için §6 rollback stratejileri geçerli |
| 6 | **Verification** | Yazılan verinin dry-run planıyla **birebir eşleştiğinin** doğrulanması (satır sayıları, checksum'lar) | Etkisiz — yalnızca okuma |
| 7 | **Reconciliation** | Verification'da fark bulunursa, farkın kaynağının analiz edilmesi (bir sonraki adıma geçmeden önce) | Farklara göre 5'e geri dönüş veya 8 (rollback) tetiklenebilir |
| 8 | **Finalize / Rollback** | Başarılıysa: migration run kaydı `COMPLETED` işaretlenir, geçici kaynaklar temizlenir. Başarısızsa: §6'daki stratejilerden biri (yalnızca **dokümante edilir**, otomatik çalıştırılmaz) devreye alınır | Rollback'in kendisi de audit'lenir (§9) |

**Kritik ilke:** Aşama 4 (approval gate) **zorunlu bir insan müdahale noktasıdır** — hiçbir
migration, dry-run raporu bir insan tarafından incelenmeden `apply` aşamasına geçemez. Bu, mimari
karar dokümanı §7'deki "dry-run" ilkesinin **somutlaştırılmış** hâlidir.

---

## 2. Dry-run Çıktı Standardı

Her dry-run çalıştırması, aşağıdaki alanları içeren **standart bir rapor** üretir (format
implementation kararı, alan listesi bu belgede sabitlenmiştir):

| Alan | Açıklama |
|---|---|
| **Eklenecek kayıt sayısı** | Hedefte karşılığı olmayan, yeni oluşturulacak kayıtlar (entity tipine göre gruplu) |
| **Güncellenecek kayıt sayısı** | Hedefte zaten var olan ama kaynak veriyle farklı olan kayıtlar |
| **Atlanacak kayıt sayısı** | Hedefte zaten var ve kaynakla **aynı** olduğu için işlem gerektirmeyen kayıtlar (idempotent no-op, §4) |
| **Çakışmalar** | Aynı hedef kaydı için birden fazla kaynak kaydının eşleştiği durumlar (örn. iki BOTC kullanıcısının aynı e-postaya sahip olması) |
| **Tenant eşleme hataları** | Bir kaynak kaydının hiçbir Metnex tenant'ına atanamadığı durumlar (Q-M06/`Sirket` güvenilmezliği ile ilişkili, `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §2) |
| **Permission/role eşleme hataları** | Bir kaynak izninin/rolünün hedef katalogda karşılığı bulunamadığı durumlar (Q-M03/Q-P01 ile ilişkili) |
| **Parola/reset gereksinimleri** | Kaç kullanıcının hangi parola stratejisine (`BOTC_LEGACY_PASSWORD_SECRET_MIGRATION_DECISION.md` §4) tabi olacağının sayısal özeti |
| **Kritik uyarılar** | Migration'ı durdurması gereken (fatal, §8) veya insan dikkatine sunulması gereken (warning, §8) her türlü anomali |

**Kabul kriteri #1:** Bu 8 alanın **tamamı** her dry-run raporunda bulunmalıdır; approval gate
(§1 aşama 4) bu rapor **olmadan** geçilemez.

---

## 3. Idempotency Kuralları

| Kural | Tanım | Metnex precedent |
|---|---|---|
| **Duplicate üretmeme** | Aynı migration script'i **ikinci kez** çalıştırıldığında, zaten migrate edilmiş bir kaynak kaydı **tekrar** hedefte yeni bir satır oluşturmaz | `customer-schema-registry.service.ts`: `ACTIVE` durumundaki bir satır için `ensureSchemaProvisioned` **no-op** döner, yeni satır **oluşturmaz** |
| **Deterministik legacy ID mapping** | Bir BOTC `int` ID'sinin hangi Metnex `id` (UUID)'sine eşlendiği, migration'ın **her çalıştırmasında aynı sonucu** vermelidir — eşleme tablosu bir kez yazılır, her sonraki çalıştırma **aynı eşlemeyi okur**, yeni bir UUID **üretmez** | `apps/api/src/db/id.ts`'nin `randomUUID()`'si **tek seferlik** kullanılmalı (eşleme tablosuna yazıldıktan sonra tekrar üretilmez) — bu ilke, `generateId`'nin kendisinin deterministik olmasını değil, **eşleme tablosunun** deterministik referans kaynağı olmasını gerektirir |
| **Tekrar çalıştırmada mevcut hedef kayıtların davranışı** | Açıkça tanımlı olmalı: (a) hiç dokunulmaz, (b) kaynakla senkronize edilir (üzerine yazılır), veya (c) çakışma olarak işaretlenip insan kararına bırakılır — **hangisi seçilecek implementation kararıdır**, bu belge yalnızca 3 seçeneğin **var olduğunu ve açıkça belirtilmesi gerektiğini** standardize eder | — |
| **Partial failure sonrası güvenli yeniden çalıştırma** | Apply aşaması (§1.5) kısmen tamamlanıp hata verirse, migration script'i **aynı girdilerle yeniden çalıştırıldığında** zaten yazılmış kayıtları **atlamalı** (idempotent), yalnızca eksik kalanları tamamlamalı | `customer-schema-registry.service.ts`: `FAILED` durumundaki bir satır **yeniden denenir** (`existing?.schemaName ?? generateCustomerSchemaName(...)` — zaten üretilmiş bir isim varsa **tekrar üretilmez**, korunur) |

---

## 4. Backup Standardı

`backup/openmas-pre-metnex-migration-20260917_072650.dump` + `.dump.sha256` (bu oturumda
TASK-024.5'te fiilen üretilen, gerçek bir backup) **kanıtlanmış bir desen** olarak burada
standardize edilmiştir:

| Adım | Standart |
|---|---|
| **Migration öncesi PostgreSQL dump** | `pg_dump` (custom format, `-Fc`), migration'dan etkilenecek **tüm** şema/tablo kapsamını içerir — yalnızca ilgili tablolar değil, ilişkili FK zincirinin tamamı |
| **Dump doğrulama** | Dump dosyası üretildikten **hemen sonra** `pg_restore --list` ile içerik listesi kontrol edilir (gerçek veri geri yüklenmeden, yalnızca dump'ın **bozuk olmadığı** doğrulanır) — TASK-024.5'te bu adım fiilen uygulanmıştı |
| **Checksum** | `sha256sum` ile ayrı bir `.sha256` dosyası üretilir, dump dosyasıyla **birlikte** saklanır — sonradan dump'ın bozulup bozulmadığı bu checksum'a karşı doğrulanabilir |
| **Metadata ve zaman damgası** | Dosya adı `<bağlam>-<YYYYMMDD_HHMMSS>.dump` formatında (TASK-024.5 örneği: `openmas-pre-metnex-migration-20260917_072650.dump`) — hangi migration çalıştırmasına ait olduğu isimden **okunabilir** olmalı |
| **Secret/parola içermeyen raporlama** | Backup **işleminin kendisi** (dosya adı, boyutu, checksum'u, ne zaman alındığı) migration run metadata'sına (§9) yazılabilir; backup **içeriği** (gerçek satırlar, olası parola hash'leri) hiçbir teslim dokümanına **kopyalanmaz** |

**Approval gate'e geçiş koşulu:** Backup **doğrulanmadan** (dump doğrulama + checksum başarılı)
dry-run aşamasına dahi geçilmez (kabul kriteri, görev talimatı: "backup doğrulanmadan apply
aşamasına geçilmemelidir" — bu belge bu kuralı **backup'ın hemen ardından, dry-run'dan önce**
uygulayarak daha erken bir güvenlik noktası ekler).

---

## 5. Rollback Stratejileri — Karşılaştırma

**Bu 4 strateji karşılaştırılmıştır; hiçbiri burada "varsayılan" olarak seçilmemiştir — hangisinin
hangi senaryoda kullanılacağı entity-spesifik implementation task'larında karara bağlanacaktır.**
Görev talimatı gereği: **hiçbir rollback komutu burada çalıştırılmamıştır, yalnızca
dokümante edilmiştir.**

| Strateji | Tanım | Ne zaman uygun | Risk |
|---|---|---|---|
| **1. Transaction rollback** | Apply aşamasındaki bir transaction bloğu hata verirse, PostgreSQL'in kendi `ROLLBACK`'i devreye girer — **hiçbir kalıcı iz kalmaz** | Transaction sınırları içinde kalan, tek-adımlı hatalar için **en güvenli ve en hızlı** | Yalnızca transaction **içindeki** işlemler için geçerli; transaction dışı (örn. iki ayrı transaction arasında kalan) durumları kapsamaz |
| **2. Hedef kayıtların kontrollü silinmesi** | Migration run'ın ürettiği kayıtlar, migration run ID'sine göre **işaretlenmiş** olduğu için (§9) seçici olarak silinebilir | Apply tamamlandı ama verification/reconciliation'da (§1.6-7) ciddi tutarsızlık bulunduğunda | **Yüksek** — silme işlemi geri alınamaz olabilir (backup'tan restore gerekmedikçe); kullanıcı onayı **zorunlu** (güvenlik kuralı) |
| **3. Backup restore** | §4'teki dump'tan **tam geri yükleme** — migration öncesi duruma dönüş | Strateji 1/2 yetersiz kaldığında veya migration'ın etkisi çok yaygın/karmaşık olduğunda | **En yüksek etkili** — migration'dan **sonra** (ama restore'dan **önce**) yapılan **ilgisiz** değişiklikler de kaybolur; yalnızca migration'ın **izole** bir bakım penceresinde yapılmasıyla bu risk azaltılır |
| **4. Compensating migration** | Geri almak yerine, **hatayı düzelten yeni bir migration** yazılır (örn. yanlış tenant ataması yapılan kullanıcıları doğru tenant'a taşıyan ayrı bir script) | Apply'ın büyük kısmı doğruysa ve yalnızca **belirli bir alt küme** hatalıysa, tam rollback **orantısız** olur | Yeni bir migration'ın **kendisi de** bu standardın 8 aşamasından geçmeli — sonsuz döngü riski yoktur ama ek operasyonel yük vardır |

### 5.1 Yeni Açık Soru — Hangi Strateji Hangi Hata Kategorisine Varsayılan Olacak?

Bu 4 stratejinin **hangi hata kategorisinde** (§8: fatal/recoverable) hangisinin **varsayılan
öneri** olacağı bu belgede kesinleştirilmemiştir — bu, entity-spesifik implementation task'larında
(Wave 1/4/5) her migration'ın kendi risk profiline göre karar verilecek bir konudur. Genel bir
"tek strateji her zaman doğrudur" kuralı **kasıtlı olarak üretilmemiştir**.

---

## 6. Transaction Sınırları (hazırlık)

`bootstrap.service.ts`'nin `db.transaction(async tx => {...})` deseni referans alınarak, migration
apply aşaması için **ilke düzeyinde** (implementation değil) şu ayrım önerilir:

| İşlem grubu | Transaction içinde mi? | Gerekçe |
|---|---|---|
| Tek bir entity'nin (örn. bir `User` + onun `tenantMemberships` + `userTenantRoleAssignments` satırı) ilişkili çoklu-tablo yazımı | **Evet** | `bootstrap.service.ts` örneğiyle aynı ilke — yarım kalan bir kullanıcı kaydı (tenant'sız/rolsüz) tutarsız bir ara durum yaratır |
| Legacy ID eşleme tablosuna yazım | **Aynı transaction içinde**, ilgili entity yazımıyla birlikte | Eşleme kaydı ile gerçek veri kaydı **birbirinden ayrılamaz** olmalı — biri olmadan diğeri idempotency'yi bozar (§3) |
| Farklı entity'ler arası (örn. tüm `User`'lar bittikten sonra tüm `Role` atamaları) | **Hayır, ayrı transaction'lar** | Büyük ölçekli migration'larda tek dev transaction, uzun kilitlenme ve rollback maliyeti riski taşır |
| Verification (§1.6) sorguları | **Hayır** | Yalnızca okuma, transaction gerektirmez |

**Bu belge yalnızca ilkeyi tanımlar** (görev talimatı: "belgelemeye hazırla") — kesin transaction
sınırları entity-spesifik implementation task'larında (Wave 1/4/5) netleştirilecektir.

---

## 7. Doğrulama Kapıları

Preflight (§1.1) ve her apply öncesi, aşağıdaki kapılar **geçilmeden** ilerlenemez:

| Kapı | Kontrol | Bağlı olduğu açık soru |
|---|---|---|
| **Tenant eşleme** | Her kaynak kaydının bir Metnex tenant'ına atanabilir olduğu doğrulanır | Q-M06, `BOTC_MIP_TENANT_LOCATION_MAPPING.md` |
| **Role eşleme** | Her kaynak rolünün hedef `tenantRoles`/`systemRoles` modelinde bir karşılığı olduğu doğrulanır | Q-P01, Q-P04 |
| **Permission eşleme** | Her kaynak izninin katalogda (`permissions.code`) bir karşılığı olduğu doğrulanır | Q-M03 |
| **User mapping** | Her kaynak kullanıcısının hedef `users` şemasına (email/displayName zorunlu alanları) uyduğu doğrulanır | `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §2.1 (Username/Email ayrımı) |
| **Legacy ID mapping** | Eşleme tablosunun her kaynak ID için **tam ve çakışmasız** bir hedef ID ürettiği doğrulanır | `BOTC_BOT_APP_POSTGRESQL_TARGET_MAPPING.md` §5 |

Bir kapı **başarısız olursa**, o kayıt için migration **fatal** olarak işaretlenir (§8) ve dry-run
raporunda "tenant eşleme hataları"/"permission/role eşleme hataları" alanlarına (§2) yansır.

---

## 8. Hata Kategorileri ve Devam/Durdurma Politikası

| Kategori | Tanım | Politika |
|---|---|---|
| **Fatal** | Doğrulama kapısı (§7) geçilemiyor, veri bütünlüğü kaybı riski var (örn. legacy ID çakışması) | Migration **tamamen durur** — hiçbir kayıt yazılmaz, dry-run raporunda kritik uyarı olarak işaretlenir |
| **Recoverable** | Tek bir kayıt için sorun var ama migration'ın geri kalanı etkilenmiyor (örn. bir kullanıcının e-postası format hatası) | O kayıt **atlanır** (dry-run'da "atlanacak kayıt" değil, ayrı bir "hatalı kayıt" listesinde raporlanır), migration **devam eder** |
| **Warning** | Veri geçerli ama insan dikkatine değer bir anomali (örn. bir kullanıcının `Sirket` alanı boş) | Migration **devam eder**, dry-run raporunda "kritik uyarılar" listesine eklenir |
| **Skipped** | Kayıt zaten hedefte var ve kaynakla aynı (idempotent no-op, §3) | Migration **devam eder**, ayrı bir sayaç olarak raporlanır (hata değildir) |

**Genel kural:** Yalnızca **fatal** kategori migration'ı durdurur. Bu, görev talimatının
"devam/durdurma politikası" gereksinimini karşılar; hangi **spesifik** hataların hangi kategoriye
düşeceği entity-spesifik implementation task'larında detaylandırılacaktır (bu belge yalnızca
4 kategoriyi ve genel kuralı standardize eder).

---

## 9. Audit ve Migration Run Metadata Standardı

Her migration çalıştırması (dry-run **dahil**), benzersiz bir **migration run ID** ile
tanımlanır. `apps/api/src/audit/platform-audit.service.ts`'nin gerçek sözleşmesine
(`actorId`/`actionCode`/`entityType`/`entityId`/`summary`/`metadata`, TASK-027.9'da
derinlemesine incelenmişti) uygun olarak:

| Alan | İçerik |
|---|---|
| `actorId` | Migration'ı başlatan kullanıcı (AI1/admin) |
| `actionCode` | Örn. `MIGRATION:BOT_APP_USERS:DRY_RUN` / `MIGRATION:BOT_APP_USERS:APPLY` |
| `entityType` | Migration edilen entity tipi (`user`, `role`, vb.) |
| `entityId` | Migration run ID (her entity kaydı için değil, **run** için tek kayıt + §2'deki özet sayılar) |
| `summary` | İnsan-okunabilir özet ("142 kullanıcı migrate edildi, 3 hata, 0 atlanan") |
| `metadata` | Backup dosya adı/checksum (§4), dry-run raporu (§2) tam içeriği, başlangıç/bitiş zamanı — `scrubSecrets()` ile otomatik korunur |

### 9.1 Yeni Açık Sorular

- **Q-MG01** — Approval gate (§1 aşama 4) **kim** tarafından, **hangi arayüzden** (CLI onayı,
  admin panel butonu, yalnızca PROGRESS_LOG.md'ye yazılı onay) verilecek? Bu belge yalnızca
  "insan onayı zorunlu" ilkesini standardize etmiştir, mekanizmayı **tanımlamamıştır**.
- **Q-MG02** — Migration run metadata'sı genel `platform_audit_log`'a mı, yoksa Q-AD01'e (SCADA
  audit hacim kararı) benzer şekilde **ayrı bir `migration_runs` tablosuna** mı yazılacak (dry-run
  raporlarının boyutu göz önüne alındığında)?

Özet tablosuna 2 yeni satır eklendi.

---

## 10. Dry-run / Apply Çıktı Karşılaştırılabilirliği

Apply aşaması (§1.5) tamamlandıktan sonra, verification aşaması (§1.6) **aynı formatta** bir
"gerçekleşen" raporu üretir (§2'deki 8 alanla **birebir aynı yapıda**) ve bunu dry-run raporuyla
**otomatik olarak** karşılaştırır. Herhangi bir sayısal fark (örn. dry-run "5 eklenecek" dedi ama
apply "4 eklendi" ürettiyse) reconciliation aşamasını (§1.7) **zorunlu tetikler**. Bu, kabul
kriterinin ("dry-run ile apply çıktılarının karşılaştırılabilir olması") doğrudan karşılığıdır.

---

## 11. Wave 2/Wave 3 Kapsam Dışı Teyidi

Bu standart **entity-agnostiktir** ve teorik olarak her wave'e uygulanabilir, ama bu belge
Ticket/MaintenanceRecord/FaultRecord (Wave 2) veya DÖF (Wave 3) için **hiçbir spesifik mapping
veya implementation önerisi üretmemiştir** (D-007 ile tutarlı) — yalnızca Wave 1/4/5'in gelecekteki
implementation task'larının **kullanacağı ortak standardı** tanımlamıştır.

---

## 12. Doğrulama

`./scripts/check.sh --skip-docker` → sonuç aşağıda raporlanmıştır (bu belge yalnızca
dokümantasyon içerir, kod/production/PostgreSQL/SQL Server/Docker/Git değişikliği yoktur).

## 13. Kalan Riskler / Sonraki Bağımlılık

- Bu task **hiçbir implementation kararı/script üretmemiştir** — bu standart, Wave 1/4/5'in her
  birinin kendi entity-spesifik migration task'larında **somutlaştırılmayı** bekler.
- §5.1, §9.1'deki yeni açık sorular (rollback strateji varsayılanı, approval gate mekanizması,
  migration run metadata konumu) implementation başlamadan **netleşmelidir**.
- Gerçek secret/parola/hash/salt/token/connection string hiçbir teslim dokümanına yazılmadı.
- Production kodu, PostgreSQL, SQL Server, Docker, Git history değişmedi. Hiçbir migration
  script'i çalıştırılmadı, hiçbir rollback komutu icra edilmedi. Git commit/push yapılmadı.

---

## 14. TASK-027.19 Somutlaştırması — Identity Reconciliation (2026-09-18)

§1'deki 8 aşamalı yaşam döngüsünün 6. ("Verification") ve 7. ("Reconciliation") aşamaları,
identity kimliği için `apps/api/src/migration/botc-identity/reconciliation.ts` ile somutlaştırıldı:
iki dry-run çıktısı (`ReconciliationInputSnapshot`) karşılaştırılıp `MATCHED`/`CHANGED`/`BLOCKED`/
`UNRESOLVED`/`INVALID_INPUT` olarak sınıflandırılıyor. Bu, bu standardın §5.1'deki "hangi rollback
stratejisi ne zaman" sorusunu **kapatmadı** — yalnızca "fark var mı, ne tür bir fark" sorusuna
deterministik bir cevap ekledi (rollback kararının kendisi hâlâ entity-spesifik/insan kararıdır).
Detay için `docs/migration/METNEX_IDENTITY_MIGRATION_RECONCILIATION.md`'ye bakınız. Gerçek
PostgreSQL/SQL Server bağlantısı, fiziksel staging tablosu veya rollback komutu bu task'ta da
üretilmedi/çalıştırılmadı.
