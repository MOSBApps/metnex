# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

## Doküman Bilgileri

| Alan | Değer |
|---|---|
| Proje / Ürün Adı | Metnex — MİP Çok Kiracılı Operasyon, SCADA/DMS Analiz Platformu |
| Doküman | Software Requirements Specification (SRS) |
| Sürüm | 1.3 |
| Tarih | 2026-09-22 |
| Durum | Review — DEC-0014 ürün sınırı güncellemesi |
| Kaynak Discovery Dokümanı | `docs/requirements/DISCOVERY.md` |
| Hazırlayan | AI0 / AI1 Pipeline |
| Gözden Geçiren | Product Governance Agent (AI1) |
| Onaylayan | Lead Architect & Security Lead |

---

# 1. Amaç ve Kapsam

## 1.1 Dokümanın Amacı

Bu doküman, Metnex ürününün mevcut implementation programındaki fonksiyonel ve fonksiyonel olmayan gereksinimlerini tanımlar. Bu SRS'nin temel kaynak dokümanı `docs/requirements/DISCOVERY.md`'dir.

## 1.2 Ürünün Amacı

Metnex, mevcut Next.js + NestJS + PostgreSQL stack'i üzerinde kurumsal seviyede çoklu kiracı (multi-tenant) desteği, rol bazlı yetkilendirme, güvenlik katmanları (MFA, impersonation, audit), lisanslama/paketleme altyapısı ve operasyonel SCADA/DMS analiz kabiliyeti sağlayan kurumsal platformdur.

---

# 2. Kullanıcı Rolleri ve Yetki Matrisi

| ID | Rol | Açıklama |
|---|---|---|
| ROLE-001 | SYSTEM_ADMIN | Platform yöneticisi; tüm kiracılar, paketler, audit ve performans konsolu üzerinde tam yetkilidir. |
| ROLE-002 | TENANT_ADMIN | Müşteri Kök Kiracı yöneticisi; kendi ağacında alt kiracılar, kullanıcılar ve rol atamalarını yönetir. |
| ROLE-003 | VIEWER / USER | Standart kullanıcı; atandığı kiracı kapsamındaki modülleri ve raporları kullanır. |

---

# 3. Modül ve Feature Gereksinimleri

## MOD-001 — Platform & Kimlik Doğrulama (`apps/api/src/platform`)

### FEAT-001 — Hiyerarşik Multi-Tenant Yapısı
**FR-001:** Sistem `PLATFORM_ROOT`, `ROOT` (Müşteri Kök) ve `STANDARD` (Alt Kiracı) tiplerini desteklemelidir.  
**FR-002:** Kiracı izolasyonu relational `parentId` ve `customerRootId` alanları üzerinden sıkı şekilde uygulanmalıdır.  
**BR-001:** Bir `STANDARD` kiracı yalnızca ait olduğu `customerRootId` altındaki verilere erişebilir.

**FR-002A (DEC-0014 ile superseded):** MİP root altında yalnızca operasyonel erişim sınırı olan işletmeler tenant olarak modellenir. Güncel hedefte MOSB Enerji ve MOSBIO ayrı operasyon tenantlarıdır; MOSB ve MOSEDAŞ Metnex operasyon tenantı değildir.
**FR-002B:** MİP root tenant kapsamındaki aggregate analiz, yalnızca ilgili permission, `canAggregateChildren` yetkisi ve çözümlenmiş data scope birlikte sağlandığında yapılabilmelidir.  
**BR-001A:** Bir işletme tenant'ı varsayılan olarak başka bir işletme tenant'ının verisini görememelidir.

### FEAT-002 — Kimlik Doğrulama & Oturum Yönetimi
**FR-003:** Kullanıcı girişi JWT access token ve httpOnly cookie içinde saklanan hashed refresh token ile sağlanmalıdır.  
**FR-004:** Oturum tazeleme `/auth/refresh` ve güvenli çıkış `/auth/logout` ile yönetilmelidir.  
**SEC-AUTH-001:** Şifreler bcrypt / argon2id algoritması ile hash'lenmelidir.

### FEAT-003 — MFA (TOTP) Katmanı
**FR-005:** TOTP secret'ları veritabanında AES-256-GCM ile şifrelenmiş olarak tutulmalıdır.  
**FR-006:** Kurtarma kodları (Recovery Codes) tek kullanımlık ve hash'lenmiş olarak saklanmalıdır.  
**BR-002:** `TENANT_ADMIN` veya `SYSTEM_ADMIN` politikası gerektirdiğinde kullanıcı MFA kurulumu yapmadan korumalı rotalara erişemez.

### FEAT-004 — Impersonation (Kılığına Girme)
**FR-007:** `SYSTEM_ADMIN` yetkisine sahip kullanıcılar hedef kullanıcı adına kısa süreli impersonation token'ı üretebilmelidir.  
**SEC-AUDIT-001:** Tüm impersonation işlemleri `PlatformAuditLog` tablosuna aktör ve hedef kullanıcı bilgisiyle kaydedilmelidir.

---

## MOD-002 — SaaS Foundation & Lisanslama (`apps/api/src/package-entitlements`)

### FEAT-005 — Resource Package ve Paket Hakları (Entitlements)
**FR-008:** Sistem `ResourcePackage` ve `PackageFeature` tanımlarını içermelidir.  
**FR-009:** Bir kiracıya atanan paket hakları (`TenantPackageAssignment`), kullanıcının rollerinden bağımsız olarak modül erişimini kısıtlayabilmelidir.  
**BR-003:** Kiracı paket hakkına sahip değilse, ilgili API ve UI rotaları 403 Forbidden dönmelidir.

---

## MOD-003 — Reporting Foundation (Raporlama Temeli) (`apps/api/src/reporting`)

**FR-012:** Rapor şablonları (`ReportArtifact`) HTML canlı önizleme, PDF ve XLSX dışa aktarma formatlarını desteklemelidir.  
**FR-013:** JRXML şablonları SQL/JDBC içermemeli, veriyi doğrudan API dataset orchestrator üzerinden almalıdır.

---

# 4. Veri ve Veritabanı Gereksinimleri

## 4.1 Collation ve Locale Standardı (DEC-0006 / DEC-0007)
- Veritabanı ICU locale provider (`tr-TR`) ve UTF8 encoding ile yapılandırılmalıdır.
- Tüm `VARCHAR` ve `TEXT` alanlarda Türkçe karakter sıralama kuralları (İ-i, I-ı, Ş-ş, Ğ-ğ) geçerlidir.

## 4.2 ORM Standardı (DEC-0011)
- Veritabanı erişimi ve migration süreçleri tam Drizzle ORM standardı ile yürütülmelidir.

---

# 5. Kalite Kapıları ve Kabul Kriterleri

**AC-001:** `./scripts/check.sh --skip-docker` çalıştırıldığında audit, typecheck, lint, vitest/jest unit testleri ve Turborepo build aşamalarının tamamı PASS olmalıdır. Docker kapısı kullanıcı kararıyla bu programda atlanır.  
**AC-002:** `pnpm --filter web exec tsc --noEmit` ve `pnpm --filter api exec tsc --noEmit` sıfır hata vermelidir.  
**AC-003:** ODC contract (`ODC.md`), `docs/opendevcon/METNEX_STATE.md` ve `docs/opendevcon/PROGRESS_LOG.md` her oturum sonunda güncellenmiş olmalıdır.

---

# 6. Metnex Ürün Katmanı — Uygulama Spesifik Gereksinimler

Bu bölüm, yukarıdaki METNEX platform foundation gereksinimlerini değiştirmez. Metnex'in uygulama seviyesindeki iş gereksinimleri, mevcut platform gereksinimlerinin üzerine eklenir.

Ürün adı: **Metnex**

Slogan: **Stratejik aklın ve bağlantılı operasyonların merkezi.**

## 6.1 Birleştirilmiş Migration Wave Planı

Bu SRS’nin implementation sırası aşağıdaki migration planına bağlıdır:

| Wave | Kapsam | Durum |
|---|---|---|
| Wave 0 | Mimari, güvenlik, tenant/lokasyon eşlemesi, permission, SCADA read-only modeli, BOTC mapping ve platform hazırlığı | Platform/rename tamamlandı; mapping ön koşulu sürüyor |
| Wave 1 | Kimlik ve kullanıcı migration’ı: users, roles, permissions, session, password reset/migration, email verification | Sıradaki migration wave’i |
| Wave 2 | Bakım/Arıza | Mevcut program kapsamı dışı |
| Wave 3 | DÖF | Mevcut program kapsamı dışı |
| Wave 4 | Vardiya raporlama ve arşiv | Discovery/SRS tamamlandı (FEAT-022); implementation Q-V01–Q-V10 çözülmeden başlamaz |
| Wave 5 | Reporting/SCADA/DMS: read-only adapter, saatlik analiz, sanal kolon, rapor ve export | Ana iş modülü |

Wave 2 ve Wave 3 bu geliştirme programının implementation kapsamına dahil değildir.
Bu alanlar ancak ayrı Discovery/SRS ve açık Product Owner onayıyla yeniden ele alınabilir.

Wave 1 implementation’ı başlamadan önce aşağıdaki iki belge hazırlanmalıdır:

1. `BOTC → Metnex Migration Mapping`
2. `BOTC Migration Architecture Decision`

Bu belgeler kaynak şema, tenant/user eşlemesi, tarihsel veri kapsamı,
idempotency ve güvenli password migration kararlarını içermelidir.

---

## MOD-004 — Metnex Tenant Kontrollü Operasyonel Veri Erişimi

### FEAT-008 — Yetkili SCADA / DMS / İşletme Veri Kaynağı Erişimi

**FR-014:** Metnex kullanıcıya yalnızca tenant, permission ve data scope kapsamında yetkili olduğu veri kaynaklarını göstermelidir.  
**FR-015:** Kullanıcının gönderdiği database, schema, table veya column değeri tek başına erişim yetkisi olarak kabul edilmemelidir.  
**FR-016:** Veri erişim kapsamı backend tarafından çözülmeli ve read-only veri erişim katmanına aktarılmalıdır.  
**FR-017:** SCADA / DMS / işletme SQL Server kaynaklarına Metnex üzerinden INSERT, UPDATE veya DELETE yapılmamalıdır.  
**SEC-DATA-001:** Kullanıcıya serbest SQL sorgusu çalıştırma yeteneği verilmemelidir.  
**SEC-DATA-002:** Veri kaynağı, tablo ve kolon seçimleri backend allowlist ve permission/data-scope kontrolünden geçmelidir.

### Kabul Kriterleri

**AC-004:** Yetkisiz veri kaynağı UI üzerinden gösterilemez ve API parametre manipülasyonuyla erişilemez.  
**AC-005:** Analiz / rapor işlemleri kaynak SCADA/DMS verisini değiştiremez.

---

## MOD-005 — Wave 5: Reporting / SCADA / DMS Analiz ve Raporlama

### FEAT-009 — Dinamik Veri Kaynağı ve Kolon Seçimi

**FR-018:** Yetkili kullanıcı analiz için veri kaynağı seçebilmelidir.  
**FR-019:** Sistem seçilen kaynak için erişilebilir database / tablo listesini dinamik olarak getirebilmelidir.  
**FR-020:** Sistem seçilen tablo için kullanılabilir kolonları getirebilmelidir.  
**FR-021:** Sistem sayısal kolonları analiz kolonu adayı olarak ayırt edebilmelidir.  
**FR-022:** Kullanıcı rapor filtrelemesinde kullanılacak tarih kolonunu seçebilmelidir.  
**FR-023:** Kullanıcı veri kaynağında ayrı saat kolonu varsa saat kolonunu seçebilmelidir.  
**FR-024:** Kullanıcı aynı analizde bir veya daha fazla analiz kolonu seçebilmelidir.

### Kabul Kriterleri

**AC-006:** Yetkili bir veri kaynağı ve tablo seçildiğinde kolon listesi dinamik olarak yüklenir.  
**AC-007:** Kullanıcı en az iki sayısal kolonu aynı analiz için seçebilir.

---

### FEAT-010 — Endeks ve Çözünürlük Hesaplama

**FR-025:** Sistem `Saatlik` çözünürlükte ilgili saatin son endeksi ile ilk endeksi arasındaki farkı analiz değeri olarak hesaplayabilmelidir.  
**FR-026:** Sistem `Günlük` çözünürlükte ilgili günün son endeksi ile ilk endeksi arasındaki farkı analiz değeri olarak hesaplayabilmelidir.  
**FR-027:** Kullanıcı rapor çözünürlüğünü en az `Saatlik` ve `Günlük` seçenekleri arasında değiştirebilmelidir.  
**FR-028:** Kullanıcı başlangıç ve bitiş tarih/saat aralığını belirleyebilmelidir.  
**FR-029:** Sistem sonuçlarda seçilen rapor zaman aralığı dışındaki kayıtları göstermemelidir.  
**FR-030:** Sistem gerekli veri kaynakları için `Endeks` ve `Gerçek Değer` ayrımını destekleyebilmelidir.  
**BR-004:** `Gerçek Değer` davranışının kesin tablo ve hesap kuralları Product Owner tarafından doğrulanmadan genişletilmemelidir.

### Kabul Kriterleri

**AC-008:** Doğrulanmış örnek bir endeks serisinde saatlik sonuç `son endeks - ilk endeks` ile eşleşir.  
**AC-009:** Aynı verinin günlük çözünürlük sonucu ilgili günün ilk/son endeksiyle hesaplanır.

---

### FEAT-011 — Kullanıcı Tanımlı Sanal Kolon

**FR-031:** Yetkili kullanıcı seçili veri tablosundaki kolonları matematiksel ifadelerde kullanarak sanal kolon oluşturabilmelidir.  
**FR-032:** Kullanıcı sanal kolona isim verebilmelidir.  
**FR-033:** Sanal kolon tanımı kaydedilebilmelidir.  
**FR-034:** Kayıtlı sanal kolon daha sonraki analizlerde tekrar kullanılabilmelidir.  
**FR-035:** Sanal kolon normal analiz kolonu gibi grafik ve istatistiklerde kullanılabilmelidir.  
**FR-036:** Sistem sanal kolonun başka bir sanal kolona bağımlı olabilmesi ihtiyacını destekleyebilmelidir.  
**FR-037:** Sanal kolon tanımı kullanıcı sahipliği ve ilgili kaynak/table bağlamıyla ilişkilendirilmelidir.  
**FR-038:** Sanal kolon formülü çalıştırılmadan önce izin verilen ifade kurallarına göre doğrulanmalıdır.

**TBD-W5-001:** İzin verilen matematiksel operatörler ve fonksiyonlar.  
**TBD-W5-002:** Sıfıra bölme, null, negatif, NaN ve sonsuz sonuç davranışları.  
**TBD-W5-003:** Sonuç upper/lower limitleri.  
**TBD-W5-004:** Maksimum sanal kolon dependency derinliği.

### Kabul Kriterleri

**AC-010:** Kullanıcı iki gerçek kolona dayalı sanal kolon oluşturup kaydedebilir.  
**AC-011:** Kayıtlı sanal kolon yeni oturumda yeniden tanımlanmadan kullanılabilir.  
**AC-012:** Geçersiz formül kontrolsüz biçimde çalıştırılmaz.

---

### FEAT-012 — Çoklu Seri Grafik ve Scale Yönetimi

**FR-039:** Birden fazla analiz kolonu aynı grafikte ayrı seri olarak gösterilebilmelidir.  
**FR-040:** Seriler görsel olarak birbirinden ayrılmalıdır.  
**FR-041:** Sistem seri bazında ayrı Y-axis / scale kullanabilmelidir.  
**FR-042:** Kullanıcı seri bazında maksimum scale değerini değiştirebilmelidir.  
**FR-043:** Sistem uygun otomatik scale değeri üretebilmelidir.  
**FR-044:** Kullanıcı veri etiketlerini gösterip gizleyebilmelidir.  
**FR-045:** Grafik tooltip üzerinde ilgili veri noktasının değerini gösterebilmelidir.  
**FR-046:** Sistem grafik / özet için genişletilmiş sunum görünümü sağlayabilmelidir.

### Kabul Kriterleri

**AC-013:** Farklı büyüklükte en az iki seri bağımsız Y-scale ile okunabilir biçimde görüntülenebilir.  
**AC-014:** Kullanıcı özel maksimum scale değerini değiştirdiğinde grafik yeniden ölçeklenir.  
**AC-015:** Değer etiketleri kullanıcı aksiyonuyla açılıp kapatılabilir.

---

### FEAT-013 — Dönem Karşılaştırması

**FR-047:** Kullanıcı ana tarih aralığına ek olarak ikinci bir karşılaştırma tarih aralığı tanımlayabilmelidir.  
**FR-048:** Sistem ana dönem ve karşılaştırma dönemini ayrı grafiklerde gösterebilmelidir.  
**FR-049:** Sistem ana dönem ve karşılaştırma dönemini aynı grafikte overlay olarak gösterebilmelidir.  
**FR-050:** Karşılaştırma serileri ana seriden görsel olarak ayırt edilebilmelidir.

### Kabul Kriterleri

**AC-016:** Aynı kolon seçimi iki farklı tarih aralığıyla kıyaslanabilir.  
**AC-017:** Overlay görünümünde ana seri ve kıyas serisi birbirinden ayırt edilebilir.

---

### FEAT-014 — İkinci Veri Kaynağı Karşılaştırması

**FR-051:** Kullanıcı yetkisi varsa isteğe bağlı ikinci veri kaynağı seçebilmelidir.  
**FR-052:** İkinci veri kaynağı için ayrı tablo ve analiz kolonları seçilebilmelidir.  
**FR-053:** İkinci veri kaynağından gelen seriler ana analiz grafiğinde gösterilebilmelidir.  
**BR-005:** Farklı veri kaynaklarındaki zaman kayıtlarının kesin eşleştirme kuralı TBD'dir.

### Kabul Kriterleri

**AC-018:** Yetkili kullanıcı iki farklı veri kaynağından seçtiği serileri aynı analizde karşılaştırabilir.  
**AC-019:** Yetkisiz ikinci kaynak API/UI üzerinden seçilemez.

---

### FEAT-015 — Rapor Özet İstatistikleri

**FR-054:** Sistem seçilen her analiz serisi için toplam değer gösterebilmelidir.  
**FR-055:** Sistem seçilen her analiz serisi için maksimum değer gösterebilmelidir.  
**FR-056:** Sistem seçilen her analiz serisi için minimum değer gösterebilmelidir.  
**TBD-W5-005:** Minimum hesaplamasında sıfır değerlerinin dahil edilip edilmeyeceği kesinleştirilmelidir.

---

### FEAT-016 — Kayıtlı Rapor Şablonları

**FR-057:** Kullanıcı mevcut rapor konfigürasyonuna isim verebilmelidir.  
**FR-058:** Rapor şablonu veri kaynağı, tablo, çözünürlük, seçilen kolonlar, değer tipleri ve scale ayarlarını kaydedebilmelidir.  
**FR-059:** Kullanıcı kayıtlı rapor şablonunu tekrar çağırabilmelidir.  
**FR-060:** Rapor şablonları yerel istemci dosyasına bağlı olmadan merkezi Metnex verisi olarak saklanmalıdır.  
**FR-061:** En az kişisel kullanıcı rapor şablonları desteklenmelidir.  
**TBD-W5-006:** Ekip/tenant ile paylaşılabilen ortak rapor şablonlarının Wave 5 kapsamı ayrıca onaylanmalıdır.

### Kabul Kriterleri

**AC-020:** Kullanıcı rapor şablonunu kaydedip sonraki oturumda yeniden çağırabilir.  
**AC-021:** Aynı kullanıcı farklı istemciden giriş yaptığında merkezi kayıtlı şablonuna erişebilir.

---

### FEAT-017 — Export

**FR-062:** Kullanıcı grafiği PNG olarak dışa aktarabilmelidir.  
**FR-063:** Kullanıcı rapor sonucunu CSV olarak dışa aktarabilmelidir.  
**BR-006:** Mevcut Reporting Foundation'ın PDF/XLSX çıktıları, ilgili rapor için ayrıca onaylandığında kullanılmalıdır.  
**SEC-EXPORT-001:** Export permission, rapor VIEW permission'ından bağımsız uygulanabilmelidir.

### Kabul Kriterleri

**AC-022:** Görüntülenen grafik PNG çıktısı üretir.  
**AC-023:** Görüntülenen sonuç veri seti CSV çıktısı üretir.  
**AC-024:** Export yetkisi olmayan kullanıcı görüntüleme yetkisine sahip olsa dahi export aksiyonunu kullanamaz.

---

## MOD-006 — Metnex Merkezi Kullanıcı Konfigürasyonu

### FEAT-018 — Sanal Kolon ve Rapor Preset Veri Sahipliği

**FR-064:** Sanal kolon tanımları merkezi platform veritabanında kullanıcı sahipliğiyle tutulmalıdır.  
**FR-065:** Rapor preset/şablon tanımları merkezi platform veritabanında kullanıcı sahipliğiyle tutulmalıdır.  
**FR-066:** Kaynak uygulamadaki Windows kullanıcı adı / AppData bağımlılığı Metnex kullanıcı kimliği yerine kullanılmamalıdır.  
**SEC-AUDIT-002:** Sanal kolon oluşturma, değiştirme ve silme işlemleri audit edilebilir olmalıdır.  
**SEC-AUDIT-003:** Veri kaynağı yönetimi ve kritik rapor konfigürasyonu değişiklikleri audit edilebilir olmalıdır.

---

## MOD-007 — Wave 4: Vardiya Raporlama ve Arşiv (Discovery — Kaynak Kararı Bekliyor)

> Bu bölüm TASK-027.21 (Vardiya SRS ve Migration Mapping) kapsamında eklenmiştir. Kaynak:
> `docs/migration/BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md` ve
> `docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md`. **Bu bölüm implementation kararı
> içermez** — Q-V01–Q-V10 (bkz. §12 altı) çözülmeden Wave 4 implementation'ı başlatılamaz.

### FEAT-022 — Vardiya (Shift) Raporlama ve Arşiv Kayıtları

**Amaç:** MOSB, MOSBİO ve bağlı lokasyonlardaki (Kömür Kazanı, Mosbİo Kırım Depo, Santral)
operatörlerin her vardiya için doldurduğu rapor kayıtlarını ve bu kayıtların tarihsel (arşiv)
kopyalarını Metnex'e taşımak; Metnex'in tenant/permission modeliyle tutarlı, sunucu tarafında
zorunlu kılınan bir yaşam döngüsü sağlamak.

**Aktörler:** Vardiya operatörü (`CanManageShifts`), rapor görüntüleyici (`CanViewShiftReports`),
email bildirim alıcısı (`CanReceiveShiftReportEmail`).

**Use Case'ler (BOTC'den doğrudan taşınan, kaynak: kaynak envanteri §5-§7):**
- UC-V01: Operatör yeni bir vardiya raporu taslağı oluşturur (lokasyon, vardiya kodu, notlar).
- UC-V02: Operatör mevcut bir taslağı düzenler.
- UC-V03: Operatör taslağı tamamlar ("Onayla ve Bildir") — bu işlem raporu salt-okunur yapar ve
  yetkili kullanıcılara email bildirimi gönderir.
- UC-V04: Yetkili kullanıcı, tarih aralığı/lokasyon/anahtar kelimeye göre filtrelenmiş rapor
  listesini görüntüler.
- UC-V05: Yetkili kullanıcı bir arşiv kaydı (geçmiş/kağıt logbook verisi) manuel olarak girer —
  bu kayıt oluşturulduktan sonra **düzenlenemez/silinemez** (kaynakta güncelleme/silme yolu yok).
- UC-V06: Yetkili kullanıcı arşiv kayıtlarını görüntüler.

**Veri Modeli (öneri, kesinleşmemiş — bkz. hedef mapping §2-§3):**

**FR-097:** Sistem her vardiya raporu için lokasyon, vardiya kodu, operatör kimliği, ikinci
operatör adı (serbest metin), kayıt notları ve kayıt zamanını tutmalıdır.  
**FR-098:** Sistem arşiv kayıtları için ayrıca bir "defter tarihi" (kağıt logbook'taki tarih, sisteme
giriş tarihinden bağımsız) alanı tutmalıdır.  
**FR-099:** Sistem, canlı ve arşiv rapor tablolarının BOTC'deki 5 lokasyona (`MOSBİO`,
`MOSB ENERJİ`, `KÖMÜR KAZANI`, `MOSBİO KIRIM DEPO`, `SANTRAL`) karşılık gelen kayıtları
destekleyebilmelidir — tek tablo (lokasyon kolonu) veya çoklu tablo modeli TASK-027.22'de karara
bağlanacaktır (Q-V10).

**Workflow / Yaşam Döngüsü:**

**FR-100:** Bir vardiya raporu `DRAFT` (taslak, düzenlenebilir) veya `COMPLETED` (tamamlanmış,
salt-okunur) durumunda olabilmelidir.  
**BR-018:** `COMPLETED` durumundaki bir rapor **sunucu tarafında** güncellemeye kapatılmalıdır —
BOTC'de bu kural yalnızca istemci (UI) tarafında uygulanıyordu (kaynak envanteri §5.1), Metnex bu
boşluğu kapatmalıdır (Q-V09, PO onayı gerekir).  
**FR-101:** Arşiv kayıtları oluşturulduktan sonra güncellenemez veya silinemez olmalıdır (BOTC'nin
mevcut davranışının doğrudan korunması — kaynakta zaten bir düzenleme/silme yolu yok).

**Tenant/Location Scope:**

**FR-102:** Bir kullanıcı yalnızca yetkili olduğu tenant'a ait vardiya raporlarını
görüntüleyebilmelidir — bu, mevcut `tenantMemberships`/`PermissionGuard` mekanizmasının (FEAT-001)
doğrudan yeniden kullanılmasıdır, yeni bir izolasyon mekanizması gerektirmez.  
**FR-103:** Lokasyon-tenant eşlemesi çözülemeyen (`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL`,
Q-V01/Q-T01 açık) kayıtlar hiçbir kullanıcıya erişilebilir gösterilmemelidir.  
**BR-019:** MİP root tenant aggregate erişimi yalnızca mevcut `canAggregateChildren` +
`TenantScopeService` kuralıyla sınırlı kalmalıdır; Vardiya modülü için yeni bir aggregate yetkisi
tanımlanmamalıdır.

**Migration:**

**FR-104:** Vardiya/arşiv migration'ı, Wave 1'in idempotency standardını (`sourceChecksum` tabanlı
tekrar-çalıştırma güvenliği) yeniden kullanmalıdır — Vardiya'ya özgü ayrı bir idempotency mekanizması
icat edilmemelidir.  
**BR-020:** `OperatorBotUserId` alanı, Wave 1 identity migration'ı tamamlanıp legacy-ID-mapping
üretilmeden çözülemez — Wave 4 migration implementation'ı **Wave 1'in gerçek apply aşamasına
bağımlıdır**.

**Audit:**

**FR-105:** Vardiya raporu oluşturma, tamamlama ve arşiv girişi işlemleri audit edilebilir
olmalıdır (mevcut `platform-audit` sözleşmesiyle, FEAT-004/SEC-AUDIT-001 ile aynı desende).

**Permission:**

**FR-106:** Sistem `SHIFT:REPORT:UPDATE` (rapor girme/düzenleme) ve `SHIFT:REPORT:VIEW` (rapor
görüntüleme) permission kodlarını desteklemelidir — bu kodlar Q-M03'te (TASK-027.12-R1) zaten
onaylanmış taslaktır, ama gerçek `permission-catalogue.ts`'e **henüz eklenmemiştir** (Wave 4
implementation'ının önkoşulu, Q-V07).  
**BR-021:** Onaysız yeni bir permission kodu (örn. arşive özel ayrı bir kod) icat edilmeden önce
PO onayı (Q-V08) alınmalıdır.

**Raporlama:** Vardiya raporlarının Wave 5'in genel raporlama/export altyapısıyla (MOD-005)
ilişkisi bu task'ta değerlendirilmemiştir — kapsam dışıdır.

### Kabul Kriterleri

**AC-025:** Yetkisiz bir kullanıcı, kendi tenant'ına ait olmayan veya lokasyon-tenant eşlemesi
çözülmemiş bir vardiya raporuna erişemez.  
**AC-026:** `COMPLETED` durumundaki bir rapor, doğrudan bir API çağrısıyla (UI bypass edilerek)
dahi güncellenemez.  
**AC-027:** Arşiv kaydı oluşturulduktan sonra hiçbir API endpoint'i onu güncelleyemez veya silemez.

### Açık Sorular

Q-V01–Q-V10 — tam liste ve gerekçe: `docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md` §11,
`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` "Wave 4 Vardiya" bölümü.

---

# 7. Legacy Davranışların Taşınma Kuralı

Aşağıdaki kaynak uygulama davranışları kodda görülmekle birlikte doğrulanmış iş gereksinimi değildir:

- belirli kolonlarda büyük negatif fark için sayaç rollover düzeltmesi,
- bazı sanal kolon sonuçlarının `0` değerine zorlanması,
- belirli tablolar için varsayılan `Gerçek Değer`,
- sorgu bitiş aralığına ek saat ekleme ve sonradan kırpma,
- sanal kolon bağımlılık çözümleme iteration sınırı.

**BR-007:** Bu legacy davranışlar Product Owner / operasyon uzmanı tarafından iş gerekçesiyle doğrulanmadan Metnex implementasyon requirement'ı kabul edilmemelidir.

---

# 8. Wave 5 Performans ve Kapasite Gereksinimleri

**NFR-001:** Maksimum sorgu tarih aralığı TBD'dir.  
**NFR-002:** Tek raporda maksimum analiz seri sayısı TBD'dir.  
**NFR-003:** Maksimum sorgu satır sayısı TBD'dir.  
**NFR-004:** Sorgu timeout değeri TBD'dir.  
**NFR-005:** Export satır / dosya boyutu limiti TBD'dir.  
**NFR-006:** Uzun veya geniş sorguların API veya kaynak SQL Server'ı kontrolsüz biçimde tüketmesi engellenmelidir.  
**NFR-007:** UI sorgu çalışırken kullanıcıya loading/progress durumu göstermelidir.  
**NFR-008:** Uygun veri bulunamadığında kullanıcıya açık bilgi verilmelidir.

---

# 9. Geleceğe Ait Ürün Gereksinimleri — Mevcut Program Kapsamı Dışı

Bu bölümdeki gereksinimler mevcut geliştirme programının implementation kapsamına
dahil değildir. Wave 2 ve Wave 3 ancak ayrı Discovery/SRS kapsamı ve açık Product
Owner onayıyla yeniden ele alınabilir; bu bölüm mevcut task'lar için acceptance
criterion oluşturmaz.

## MOD-007 — Elektrik Üretim Siparişi ve Üretim Planlama

**FR-067:** MOSEDAŞ tarafından üretim yapan şirket/şirketlere elektrik üretim siparişi oluşturulabilmelidir.  
**FR-068 (DEC-0014 ile superseded):** MOSEDAŞ üretim planı ve üretim emrini oluşturmalı; Metnex emri teknik/operasyonel olarak doğrulayıp kabul veya reddetmelidir.
**FR-069 (DEC-0014):** Üretim planı ve emirlerinin System of Record'u ayrı MOSEDAŞ uygulamasıdır; Metnex operasyon yürütme ve gerçekleşme System of Record'udur.
**FR-070 (DEC-0014):** Metnex kabul edilen emri vardiyalar arasında yürütebilmeli, koşullar bozulduğunda `PAUSED` veya `EXECUTION_BLOCKED` üretebilmelidir.
**FR-071 (DEC-0014):** Metnex gerçekleşme, sapma ve operasyon olaylarını kalıcılaştırıp asenkron ve idempotent biçimde MOSEDAŞ'a bildirebilmelidir.
**BR-008 (DEC-0014):** MOSEDAŞ'ın pazar, fiyat, optimizasyon ve tedarikçi planlama fonksiyonları Metnex'te yeniden geliştirilmemelidir.

### Üretim Kaynakları

**FR-072:** Sistem GT1, GT2, GT3, SG1, SG2, SG3, kömür kazanı ve MOSBİO üretim kaynaklarını operasyonel planlama bağlamında temsil edebilmelidir.  
**FR-073:** Üretim kaynağının yakıt/girdisi ile ana ve yan ürünleri ifade edilebilmelidir.  
**BR-009:** Varlık ve bakım System of Record'u Beam olmaya devam etmelidir.

---

## MOD-008 — Buhar ve Sıcak Su Arzı

**FR-074:** Sistem buhar müşterilerinin sözleşmesel / beklenen tüketim bilgilerini arz planlamasında kullanabilmelidir.  
**FR-075:** Bakımda veya devre dışı olduğu bilinen müşteri tüketimi hedef arz hesabında dikkate alınabilmelidir.  
**FR-076:** Elektrik üretimi sırasında oluşan yan ürün buhar arz planında kullanılabilmelidir.  
**FR-077:** Kömür kazanı buhar arz kaynağı olarak kullanılabilmelidir.  
**FR-078:** MOSBİO gerektiğinde MOSB Enerji için kısmi veya tam buhar destek kaynağı olarak planlanabilmelidir.  
**FR-079:** Buhar müşterileri yüksek basınç / alçak basınç ihtiyacıyla ayrıştırılabilmelidir.  
**FR-080:** Yüksek basınç kaynağı olarak doğrulanmış GT3 ve kömür kazanı temsil edilebilmelidir.  
**BR-010:** Buhar arzı anlık müşteri siparişiyle başlayan workflow olarak modellenmemelidir.  
**TBD-OPS-001:** Fazla arz marjının hesap kuralı.  
**TBD-OPS-002:** Yüksek/alçak basınç hat kapasite kuralları.  
**TBD-OPS-003:** MOSBİO destek kapasite sınırları.

**FR-081:** Buharın sıcak su üretiminde kullanıldığı operasyonel ilişki temsil edilebilmelidir.  
**TBD-OPS-004:** Sıcak su tüketim, kapasite, ölçüm ve kesinti kuralları.

---

## MOD-009 — Yakıt, Biyokütle ve Laboratuvar

### FEAT-019 — Biyokütle Reçete / Paçal

**FR-082:** MOSBİO biyokütle reçeteleri birden fazla bileşen içerebilmelidir.  
**FR-083:** Sistem en az pulper, gübre, tahta, orman atıkları ve kurutulmuş atık su çamurunu reçete bileşeni olarak destekleyebilmelidir.  
**FR-084:** Her reçete bileşeninin bağımsız kalori değeri kaydedilebilmelidir.  
**FR-085:** Paçal / karışım sonucu kalori değeri kaydedilebilmelidir.  
**TBD-OPS-005:** Paçal kalorisinin hesaplanan mı, laboratuvarda ölçülen mi, yoksa ikisinin de mi olacağı.

### FEAT-020 — Kömür Kalitesi

**FR-086:** Kömür kalori sonucu ilgili kömür/kantar operasyon kaydıyla ilişkilendirilebilmelidir.  
**TBD-OPS-006:** Brüt/dara/net, numune ve sevkiyat workflow'u ayrıca doğrulanmalıdır.

### FEAT-021 — Manuel Laboratuvar Verisi

**FR-087:** Kömür, biyokütle bileşeni, paçal/karışım ve su laboratuvar analiz sonuçları yetkili kullanıcı tarafından manuel girilmelidir.  
**FR-088:** Mevcut kapsamda laboratuvar cihazı, LIMS veya başka bir sistemden otomatik analiz sonucu aktarımı yapılmamalıdır.  
**FR-089:** Laboratuvar kaydı kaydı giren kullanıcı ve zaman bilgisiyle izlenebilir olmalıdır.  
**FR-090:** Sonradan yapılan değişikliklerin audit izi korunmalıdır.  
**TBD-OPS-007:** Su analizi parametreleri, limitleri ve sıklıkları.

---

## MOD-010 — Hafif No-Code Form Kabiliyeti

**FR-091:** Yetkili kullanıcılar basit iş formları tanımlayabilmelidir.  
**FR-092:** Formlar temel alan tipleriyle veri girişi sağlayabilmelidir.  
**FR-093:** Form kayıtları listelenebilmeli ve filtrelenebilmelidir.  
**FR-094:** Form ve form verisi erişimi permission ile sınırlandırılabilmelidir.  
**FR-095:** Form kayıtları gerektiğinde dosya/ek ile ilişkilendirilebilmelidir.  
**FR-096:** Kritik form değişiklikleri audit edilebilmelidir.  
**BR-011:** No-code kabiliyeti kritik/karmaşık domain süreçlerinin varsayılan implementasyon yöntemi olmamalıdır.  
**BR-012:** BPMN designer, script motoru, kullanıcı tanımlı SQL, genel amaçlı entegrasyon designer ve tam low-code platform ilk kapsamın parçası değildir.

---

## 9.1 DEC-0014 Ürün Sınırı ve Yeni Uygulama Programı

Bu bölüm 2026-09-22 tarihli DEC-0014 ile onaylanan ürün sınırını tanımlar. Eski
üretim planlama SoR ifadeleri superseded edilmiştir; MOSEDAŞ plan ve üretim
emrinin, Metnex ise operasyon yürütme ve gerçekleşmenin System of Record'udur.

### 9.1.1 System of Record ve tenant sınırı

- MOSEDAŞ ayrı bir uygulamadır; Metnex'te tenantı yoktur.
- MOSB Enerji ve MOSBIO MİP root altında ayrı operasyon tenantlarıdır.
- MOSB varlık sahibi olarak Metnex operasyon tenantı değildir.
- Varlık ana verisi ve sahiplik BEAM/ERP'de kalır; Metnex sınırlı dış ID ve
  operasyonel referans/snapshot tutabilir.
- Kömür Kazanı MOSB Enerji altında tesis/ünite operasyon referansıdır.

#### FEAT-023 — Vardiya Operasyon Merkezi ve Üretim Yürütme

Vardiya, üretim emri, gerçekleşme, kapasite, operasyon olayı ve olay geri
bildirimi aynı operasyon sınırı içinde ele alınır; üretim emri vardiya kaydına
gömülmez.

#### FEAT-024 — Parametrik Laboratuvar

Analiz tanımı, parametre, numune, sonuç, onay, kilitleme ve revizyon yaşam
döngüsüyle manuel laboratuvar verisi yönetilir.

#### FEAT-025 — Parametrik İşletme Verisi

İşletmede elle girilen operasyonel değerler ayrı domain ve altyapı üzerinden
form, onay, kilitleme, revizyon, audit ve raporlama ile yönetilir.

### 9.1.2 Üretim emri ve olay sözleşmesi

- Metnex emri teknik ve operasyonel olarak doğrular, kabul/ret eder ve yürütür.
- MOSEDAŞ plan/emir durumlarının, Metnex operasyon durumlarının sahibidir.
- Emir versiyonlu, idempotent ve çoklu vardiyaya yayılabilir olmalıdır.
- Koşullar bozulduğunda Metnex `PAUSED` veya `EXECUTION_BLOCKED` üretir.
- Gerçekleşme ve olaylar önce Metnex'te kalıcılaşır, sonra asenkron gönderilir.
- Olaylar `CRITICAL`, `HIGH`, `NORMAL` önceliklerine göre kuyruklanır.
- Teknik alındı ile işleme sonucu ayrıdır (`DELIVERED`, `ACCEPTED`, `REJECTED`,
  `FAILED`, `RETRYING`).

### 9.1.3 Entegrasyon güvenliği

- Üretimde mTLS + OAuth2 client credentials birlikte kullanılır.
- Kullanıcı JWT'si, `isSystemAdmin`, `TENANT_ADMIN` ve impersonation B2B kimliği
  değildir.
- MOSEDAŞ hedefleri external-system allowlist'i üzerinden tesis/makine düzeyinde
  doğrulanır; payload tek başına erişim vermez.
- Credential ve sertifika yönetimi iki tarafın kendi sorumluluğundadır.

### 9.1.4 Kapasite ve bakım etkisi

- Operasyonel kapasite ve kullanılabilirlik modeli Metnex'e aittir.
- BEAM/ERP nominal ana verisi ve bakım kaydı SoR olarak kalır.
- Metnex bakım/duruş/arıza/vardiya etkisini kapasite snapshot'ına uygular ve
  nedeni audit'ler.

### 9.1.5 Yeni modül sırası

1. Domain/API/veri sözleşmeleri ve mapping.
2. Vardiya Operasyon Merkezi: özet, vardiya, üretim emri ve olay ekranları.
3. Laboratuvar: parametrik analiz, numune, sonuç, onay/kilit/revizyon.
4. İşletme: ayrı parametrik form, veri girişi, onay/kilit/revizyon.

Laboratuvar ve İşletme ayrı altyapı, domain, permission ve audit sınırlarına
sahiptir. Wave 2 ve Wave 3 bu yeni programa dahil değildir.

---

# 10. Metnex System of Record Gereksinimleri

**BR-013:** Beam varlık ve bakım yönetiminin System of Record'u olarak kalmalıdır.  
**BR-014:** OpenMs tetkik, aksiyon, uygunsuzluk, yetkinlik ve ilgili ISO süreçlerinin System of Record'u olarak kalmalıdır.  
**BR-015 (superseded by DEC-0014):** Üretim planlama SoR'u MOSEDAŞ; Metnex operasyon yürütme ve gerçekleşme SoR'udur.
**BR-016:** Netsis'te sahipliği net aktif ERP fonksiyonları Metnex'te paralel ana sistem olarak yeniden geliştirilmemelidir.  
**BR-017:** Yeni bir ihtiyaç önce `entegrasyon`, `gerçek domain modülü` veya `hafif no-code form` sınıflarından biriyle değerlendirilmelidir.

---

# 11. Metnex Entegrasyon Gereksinimleri

**IR-001:** Metnex REST tabanlı entegrasyonları destekleyebilmelidir.  
**IR-002:** Metnex doğrudan veritabanı bağlantılı entegrasyonları destekleyebilmelidir.  
**IR-003:** Her entegrasyonda kaynak sistem, hedef sistem, System of Record, veri yönü ve read/write ihtiyacı açıkça tanımlanmalıdır.  
**IR-004:** Doğrudan DB write yetkisi varsayılan kabul edilmemeli; use-case bazında ayrıca onaylanmalıdır.

---

# 12. Wave 5 Açık Sorular

**OQ-W5-001:** `Gerçek Değer` hesap davranışı kesin olarak nedir?  
**OQ-W5-002:** Sayaç rollover hangi kolon/sayaçlara uygulanır ve maksimum sayaç değeri nedir?  
**OQ-W5-003:** Sanal kolon operatör ve fonksiyon whitelist'i nedir?  
**OQ-W5-004:** Sanal kolon invalid/negative/zero-division sonucu nasıl gösterilir?  
**OQ-W5-005:** İkinci kaynaktaki zaman noktaları ana kaynakla nasıl eşleştirilir?  
**OQ-W5-006:** Maksimum sorgu tarih aralığı nedir?  
**OQ-W5-007:** Maksimum aynı anda çizilecek seri sayısı nedir?  
**OQ-W5-008:** CSV ve PNG Wave 5'in kesin export formatları olarak korunacak mıdır?  
**OQ-W5-009:** Rapor şablonları ekip/tenant ile paylaşılabilecek midir?  
**OQ-W5-010:** Wave 5 modülünün kullanıcıya görünen nihai adı “Saatlik Rapor” olarak mı kalacaktır?

---

# 13. Wave 5 İş Seviyesi Kabul / Definition of Done

Wave 5 iş açısından tamamlanmış kabul edilmeden önce:

1. Yetkili kullanıcı doğru veri kaynağı ve tabloyu seçebilmelidir.
2. Birden fazla kolonla saatlik analiz oluşturabilmelidir.
3. Endeks fark hesabı doğrulanmış örnek veriyle doğru sonuç vermelidir.
4. Günlük analiz doğru günlük farkı üretmelidir.
5. Sanal kolon oluşturulabilmeli, kaydedilebilmeli ve yeniden kullanılabilmelidir.
6. Çoklu seri bağımsız scale ile okunabilir gösterilmelidir.
7. Dönem kıyaslama çalışmalıdır.
8. Yetki varsa ikinci veri kaynağı kıyaslaması çalışmalıdır.
9. Toplam / maksimum / minimum istatistikleri hesaplanmalıdır.
10. Rapor şablonu kaydedilip sonraki oturumda tekrar açılabilmelidir.
11. PNG export çalışmalıdır.
12. CSV export çalışmalıdır.
13. Yetkisiz kullanıcı kaynak/table/column manipülasyonu ile veri görememelidir.
14. Kaynak SQL Server verisi hiçbir rapor aksiyonuyla değiştirilememelidir.

Bu iş seviyesi DoD, yukarıdaki §5 kalite kapılarının yerine geçmez; uygulama hem iş kabul kriterlerini hem de mevcut teknik kalite kapılarını sağlamalıdır.
