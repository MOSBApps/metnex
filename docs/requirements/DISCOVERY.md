# Müşteri Görüşme ve İhtiyaç Toplama Dokümanı (DISCOVERY)

## 1. Görüşme ve Kaynak Bilgileri

| Alan | Bilgi |
|---|---|
| Proje / Ürün Adı | MİP — Çok Kiracılı İşletme, SCADA/DMS Analiz ve Operasyon Platformu |
| Kaynak Uygulama | BOT — Bakım & Operasyon Takip Sistemi (`../BOTC`) |
| Müşteri / İşletmeler | MİP, MOSB Enerji, MOSEDAŞ, MOSBİO ve bağlı işletme birimleri |
| Görüşme / Değerlendirme Tarihi | 2026-09-16 |
| Görüşme No | DISC-MIP-001 |
| Kaynak Discovery | `../BOTC/DISCOVERY.md` — reverse engineering ve paydaş teyidi |
| Hedef Repository | `metnex` |
| Doküman Sürümü | 1.3 — Birleştirilmiş migration wave planı işlendi |

> Bu Discovery, BOTC uygulamasının kaynak kodundan çıkarılan mevcut davranışları ve MİP/Metnex
> hedef mimarisi için verilen paydaş kararlarını birleştirir. BOTC’deki WPF ekranları davranış
> referansıdır; WPF/.NET katmanları hedef teknoloji olarak doğrudan taşınmayacaktır.

---

# 2. Projenin Özeti

## 2.1 İhtiyaç

MİP ve bağlı işletmelerin SCADA, DMS ve operasyon verileri farklı SQL Server veritabanlarında
bulunmaktadır. Kullanıcıların bu verileri işletme bazında ve MİP root tenant kapsamında analiz
edebilmesi için merkezi, tenant-scope kontrollü bir platforma ihtiyaç vardır.

BOTC uygulaması bu ihtiyacın bir bölümünü Windows masaüstü uygulaması olarak karşılamaktadır.
BOTC’deki seçilmiş modüller ve iş kuralları, mevcut Metnex stack’i üzerinde yeniden modellenerek
PostgreSQL tabanlı platforma taşınacaktır.

Başlangıçta SCADA/DMS verileri SQL Server’da kalacak ve METNEX tarafından salt okunur adapter’lar
üzerinden erişilecektir. BOTC’nin `BOT_APP` içindeki uygulama verileri, seçilen modüllerin
migration kapsamına göre PostgreSQL’e taşınacaktır.

## 2.2 Hedef Mimari

```text
METNEX Web Console (Next.js)
        ↓
METNEX API (NestJS)
        ↓
PostgreSQL — platform, tenant ve uygulama domain verileri
        ↓
Read-only SQL Server adapters — SCADA / DMS / işletme verileri
```

Kurallar:

- Hedef stack bu repository’deki Next.js, NestJS, Drizzle ORM ve PostgreSQL stack’idir.
- BOTC ekranları METNEX web/API yüzeyleri için davranış referansıdır.
- BOTC `BOT_APP` verileri PostgreSQL domain modellerine dönüştürülerek migrate edilecektir.
- SCADA/DMS SQL Server veritabanlarına runtime erişim yalnızca read-only olacaktır.
- SQL Server SCADA/DMS verilerine INSERT, UPDATE veya DELETE yapılmayacaktır.
- Raporlama, METNEX Reporting Foundation ve Jasper Render Service üzerinden yürütülecektir.

## 2.3 Tenant ve Veri Kapsamı

```text
MİP customer root tenant
├── MOSB tenant
├── MOSEDAŞ tenant
└── MOSBİO tenant
```

- MOSB, MOSEDAŞ ve MOSBİO kendi tenant kapsamlarında kendi SCADA/DMS verilerini görür.
- MİP root tenant, yetkili kullanıcılar için bağlı işletmelerin aggregate analizlerini görebilir.
- Bir şirket tenant’ı varsayılan olarak diğer şirketlerin verisini göremez.
- Root tenant görünürlüğü yalnızca tenant türüne dayanmaz; permission ve `canAggregateChildren`
  birlikte değerlendirilir.
- Kullanıcıdan gelen tenant, database, schema veya tablo seçimi tek başına güvenlik kararı değildir.
- Data scope backend tarafından çözülür ve SQL Server adapter’a güvenli biçimde aktarılır.

## 2.4 Beklenen Sonuç

- Kullanıcılar METNEX web konsolundan yetkili işletme tenant’ına erişir.
- MİP root tenant kullanıcıları izinleri dahilinde işletme bazlı ve toplulaştırılmış analiz yapar.
- BOTC’den seçilen modüller PostgreSQL üzerinde METNEX domain/service sınırlarıyla çalışır.
- SCADA/DMS verileri SQL Server’dan read-only, allowlist ve tenant scope kontrollü okunur.
- Dinamik dashboard, saatlik tüketim ve işletme raporları merkezi reporting altyapısını kullanır.
- PDF/XLSX çıktıları Jasper Render Service üzerinden alınabilir.

---

# 3. Mevcut Durum ve Kaynak Uygulama

## 3.1 METNEX Mevcut Stack’i

- API: NestJS
- Web: Next.js
- ORM: Drizzle ORM
- Veritabanı: PostgreSQL, ICU `tr-TR` collation
- Cache: Redis
- Object storage: MinIO/S3
- Reporting: `ReportArtifact`, `ReportDatasetProvider`, Jasper Render Service
- Tenant modeli: customer root ve child tenant hiyerarşisi
- Yetkilendirme: role-based permission, package capability ve row-level scope

## 3.2 BOTC Kaynak Uygulaması

```text
BOT WPF UI → BOT.Services → BOT.Data / EF Core → BOT.Domain
```

Kaynak veri alanları:

- `BOT_APP`: kullanıcı, rol, permission ilişkileri ve uygulama domain verileri
- `DOF_APP`, vardiya ve arşiv veritabanları: BOTC’ye ait operasyonel veriler
- SCADA/DMS/işletme SQL Server veritabanları: başlangıçta dış read-only veri kaynakları

BOTC’deki `Admin`, `Can*` permission ve kullanıcı bayrakları METNEX’a birebir taşınmayacak;
METNEX’ın kanonik permission formatına ve tenant scope modeline dönüştürülecektir.

---

# 4. Migration Kapsamı

## 4.1 Migration Adayları

| Alan | Kaynak | Hedef yaklaşım | Durum |
|---|---|---|---|
| Kimlik ve kullanıcılar | `BOT_APP` | METNEX users/roles/permissions | Eşleme gerekli |
| Vardiya raporlama | BOTC vardiya DB’leri | METNEX domain modülü + PostgreSQL | Aday |
| Vardiya arşivi | `VARDIYA_RAPORLARI_ARSIV` | PostgreSQL archive/read model | Aday |
| SCADA/DMS analiz | SQL Server kaynak DB’leri | Read-only API adapter + tenant scope | Öncelikli aday |
| Saatlik tüketim | SCADA/işletme DB’leri | Reporting service + normalized dataset | Aday |
| İşletme raporları | SCADA/işletme DB’leri | Jasper/reporting artifact + dashboard | Aday |
| Bildirimler | SMTP/Telegram | METNEX settings/notification adapters | Aday |

## 4.2 Mevcut Migration Kapsamı Dışında

- BOTC Bakım/Arıza modülü — önceki Wave 2 kapsamı alınmıyor.
- BOTC DÖF modülü — önceki Wave 3 kapsamı alınmıyor.
- Periyodik Bakım Takvimi
- Laboratuvar
- İSG
- Kapsamı netleşmemiş İşletme Modülü
- BOTC WPF arayüzünün doğrudan port edilmesi
- SCADA/DMS veritabanlarına yazma

Bu modüller kaynak Discovery’deki davranış referansı olarak kalabilir; METNEX backlog’una ancak
yeni kapsam ve SRS ile alınabilir.

## 4.3 Migration İlkeleri

- Her BOTC entity’si için hedef METNEX entity/service sahibi belirlenmeden migration yapılmaz.
- `BOT_APP` verisi PostgreSQL’e dönüştürülür; SQL Server şema isimleri hedef domain modeli olarak
  kabul edilmez.
- Eski integer ID’ler, tarihçe ve foreign key ilişkileri için açık mapping tutulur.
- Tarihsel veri taşıma, arşivleme veya dışarıda bırakma kararı her modül için ayrı verilir.
- Migration idempotent ve tekrar çalıştırılabilir olmalıdır.
- Secret, düz metin parola ve legacy auth davranışı yeni sisteme taşınmaz.

---

# 5. Kullanıcılar, Roller ve Yetkiler

| Kullanıcı / Paydaş | Rolü | Sistemi Nasıl Kullanacak? |
|---|---|---|
| MİP platform yöneticisi | `SYSTEM_ADMIN` | Platform, tenant, kullanıcı, permission ve audit yönetimi |
| MİP root tenant yöneticisi | `TENANT_ADMIN` | MOSB, MOSEDAŞ ve MOSBİO tenant kapsamlarını ve kullanıcılarını yönetme |
| İşletme yöneticisi | İşletme tenant yöneticisi | Kendi işletmesinin operasyon ve SCADA/DMS raporlarını görme |
| Yetkili analiz kullanıcısı | Permission bazlı | Yetkili işletme veya aggregate scope içinde dashboard/rapor görme |
| Standart kullanıcı | `USER` / `VIEWER` | Atandığı tenant ve permission kapsamındaki read işlemleri |

## 5.1 Yetkilendirme İlkeleri

- Rol yalnızca permission set’inin taşıyıcısıdır; frontend rol dizilerini auth kararı olarak kullanmaz.
- Menü görünürlüğü ile API CRUD/action permission ayrıdır.
- Dashboard/report görünürlüğü ile export permission ayrıdır.
- Root aggregate analiz için hem ilgili `VIEW` permission hem de data scope gerekir.
- SQL Server kaynak, tablo ve kolon seçimi backend allowlist ile sınırlandırılır.
- Read endpoint’lerinde açık `VIEW` guard bulunur.
- Satır/veri kapsamı tenant scope resolver tarafından uygulanır.

Örnek permission’lar:

```text
SCADA:DASHBOARD:VIEW
SCADA:DATA:VIEW
SCADA:DATA:EXPORT
REPORT:HOURLY_CONSUMPTION:VIEW
REPORT:PLANT:VIEW
REPORT:ARTIFACT:EXPORT
SHIFT:REPORT:VIEW
SHIFT:REPORT:UPDATE
```

---

# 6. Özellik / Feature Talepleri

## F-001 — Tenant Bazlı SCADA/DMS Analizi

MOSB, MOSEDAŞ ve MOSBİO kullanıcıları kendi tenant kapsamındaki SCADA/DMS verilerini analiz
edebilmelidir. MİP root tenant kullanıcıları, yetki ve aggregate scope izinleri varsa bağlı
işletmelerin verilerini karşılaştırmalı veya toplulaştırılmış biçimde görebilmelidir.

## F-002 — Read-only SQL Server Veri Kaynakları

METNEX, başlangıçta SCADA/DMS verilerini SQL Server üzerinden okumalıdır. Veri kaynakları,
tablolar ve kolonlar allowlist ile doğrulanmalı; tarih ve filtre parametreleri güvenli biçimde
bağlanmalı; SQL Server’a INSERT/UPDATE/DELETE yapılmamalıdır.

## F-003 — BOT_APP Kullanıcı ve Yetki Migration’ı

BOTC `BOT_APP` kullanıcı, rol ve permission verileri METNEX PostgreSQL modeline dönüştürülmelidir.
Legacy `Admin`, düz metin parola, global salt ve kullanıcı bayrakları METNEX authorization
kararının kaynağı olmamalıdır. Kullanıcı migration’ı güvenli password reset/hash stratejisiyle
yapılmalıdır.

## F-004 — Saatlik Tüketim Analizi

Yetkili kullanıcılar endeks/anlık değer ayrımı, tarih aralığı, fark/toplam hesabı, formüllü kolon,
karşılaştırmalı grafik ve CSV/PNG veya kanonik PDF/XLSX çıktılarıyla analiz yapabilmelidir. Hedef
çıktı formatı her rapor için ayrıca kesinleştirilecektir.

## F-005 — İşletme Raporları

Elektrik üretimi, buhar üretimi, yakıt tüketimi ve ilgili işletme göstergeleri işletme tenant’ı
ve MİP aggregate scope’u içinde raporlanabilmelidir. Raporlar `ReportArtifact`, dataset provider
ve Jasper Render Service üzerinden üretilebilmelidir.

## F-006 — Vardiya Raporlama ve Arşiv Adayı

Vardiya raporları lokasyon bazında taslak/tamamlandı akışı ve geçmiş arşiv erişimi sağlayabilir.
Bu özellik migration adayındadır; lokasyon mapping’i, geçmiş veri kapsamı ve önceliği ayrıca
onaylanmadan implementation task’ına dönüştürülemez.

## F-007 — Bildirim ve Audit

İşletme raporu, vardiya ve seçilecek diğer workflow’lar için e-posta/uygun bildirim adapter’ları
ve denetlenebilir işlem kayıtları tanımlanmalıdır. Secret’lar source veya düz metin config içinde
tutulmamalıdır.

---

# 7. Kararlar, Riskler ve Açık Sorular

## 7.1 Mimari Kararlar

| ID | Karar | Tarih | Karar Veren |
|---|---|---|---|
| D-001 | Hedef uygulama bu repository’deki Next.js + NestJS + Drizzle + PostgreSQL stack’i olacaktır. | 2026-09-16 | Product Owner / AI1 |
| D-002 | BOTC WPF/.NET katmanları doğrudan taşınmayacak; davranışlar METNEX web/API modüllerinde yeniden modellenmelidir. | 2026-09-16 | Product Owner / AI1 |
| D-003 | BOTC `BOT_APP` uygulama verileri PostgreSQL’e migrate edilecek; kaynak SQL Server runtime domain store olmayacaktır. | 2026-09-16 | Product Owner / AI1 |
| D-004 | SCADA/DMS SQL Server verileri başlangıçta dış read-only adapter’lar üzerinden okunacaktır. | 2026-09-16 | Product Owner / AI1 |
| D-005 | MİP customer root tenant; MOSB, MOSEDAŞ ve MOSBİO bağlı işletme tenant’larıdır. | 2026-09-16 | Product Owner / AI1 |
| D-006 | MİP root tenant aggregate analizi permission + `canAggregateChildren` + data scope ile yapılacaktır. | 2026-09-16 | Product Owner / AI1 |
| D-007 | Bakım/Arıza ve DÖF migration’ı mevcut kapsamda alınmayacaktır. | 2026-09-16 | Product Owner / AI1 |
| D-008 | Raporlama Jasper Render Service ve METNEX Reporting Foundation üzerinden yürütülecektir. | 2026-09-16 | Product Owner / AI1 |
| D-009 | Kullanıcı-facing Türkçe metin ve sıralama davranışları için PostgreSQL ICU `tr-TR` kararı korunacaktır. | 2026-09-16 | Lead Architect |

## 7.2 Riskler ve Teknik Borçlar

| ID | Risk | Etki | Öncelik |
|---|---|---|---|
| R-001 | BOTC kaynak config’inde düz metin SQL/SMTP/Telegram secret’ları bulunabilir. | Kritik | Acil |
| R-002 | BOTC düz metin parola fallback’i ve global salt kullanır. | Kritik | Acil |
| R-003 | BOTC sabit AES anahtarı kullanır. | Kritik | Acil |
| R-004 | SCADA/DMS erişimi tek SQL Server ve çoklu database bağımlılığına sahiptir. | Yüksek | Yüksek |
| R-005 | Kaynak veritabanı şemaları ve işletme mapping’i henüz doğrulanmamıştır. | Yüksek | Yüksek |
| R-006 | Büyük dinamik sorgular API/SQL Server performansını etkileyebilir. | Yüksek | Yüksek |
| R-007 | BOTC’de otomatik test, CI/CD ve güvenilir migration geçmişi sınırlıdır. | Yüksek | Yüksek |
| R-008 | Historical BOTC ID’leri ile PostgreSQL ID’leri arasında mapping gerekir. | Orta | Yüksek |

## 7.3 Açık Sorular

| ID | Soru | Neden Önemli |
|---|---|---|
| Q-001 | MİP root tenant altında kesin tenant ağacı ve işletme kodları nedir? | Tenant/scope mapping |
| Q-002 | İşletme verileri SQL Server’da database, schema, tablo veya kolon seviyesinde nasıl ayrılıyor? | Read-only adapter tasarımı |
| Q-003 | Her SQL Server kaynağı için read-only kullanıcı ve bağlantı erişim modeli hazır mı? | Güvenlik ve deployment |
| Q-004 | MİP root tenant hangi kullanıcılar için aggregate analiz yetkisine sahip olacak? | Permission + row scope |
| Q-005 | İlk migration’a Vardiya ve Vardiya Arşivi dahil mi? | MVP kapsamı |
| Q-006 | `BOT_APP` içindeki hangi tablolar migrate edilecek, geçmiş veri başlangıç tarihi nedir? | Migration planı |
| Q-007 | Eski kullanıcılar için parola reset/hash migration prosedürü nedir? | Kimlik güvenliği |
| Q-008 | SCADA/DMS verisi canlı mı sorgulanacak, yoksa PostgreSQL read model/cache oluşturulacak mı? | Performans ve güncellik |
| Q-009 | Saatlik tüketim ve işletme raporlarında kanonik çıktı formatları nelerdir? | Reporting/Jasper tasarımı |
| Q-010 | BOTC SMTP/Telegram bildirimlerinin hangileri METNEX MVP’sine taşınacak? | Entegrasyon kapsamı |
| Q-011 | SCADA/DMS sorguları için timeout, maksimum satır ve export sınırı nedir? | Güvenlik ve kapasite |

## 7.4 Önerilen Sonraki Adımlar

1. Bu Discovery’nin Product Owner tarafından onaylanması.
2. MİP root ve işletme tenant mapping tablosunun hazırlanması.
3. SQL Server database/table/column ve read-only credential envanterinin çıkarılması.
4. BOT_APP → PostgreSQL migration mapping dokümanının hazırlanması.
5. İlk MVP modülünün (SCADA/DMS reporting veya Vardiya) seçilmesi.
6. Seçilen modül için AI0 tarafından SRS hazırlanması.
7. Human/Product Owner SRS onayından sonra AI1’in AI2 engineering task’larını tanımlaması.

## 7.5 Kapsam Notu

Bu Discovery, BOTC’de mevcut olduğu görülen tüm davranışların METNEX’a taşınacağı anlamına
gelmez. Yalnızca D-007 ile kapsamdan çıkarılmayan ve ayrıca MVP için seçilen modüller SRS ve
engineering task zincirine alınacaktır.

---

# 8. Metnex Ürün Kimliği ve Genişletilmiş Ürün Çerçevesi

## 8.1 Ürün Adı

Bu Discovery'nin önceki bölümlerinde yer alan MİP / Metnex terminolojisi korunur. Ürün için
verilen isim kararı doğrultusunda, bu platform üzerinde geliştirilecek kurumsal operasyon
ürününün adı **Metnex** olarak kullanılacaktır.

> **TASK-024.2 güncellemesi (2026-09-17):** Bu paragraf daha önce "Metnex" ürün adının teknik
> repository/platform foundation adını değiştirmediğini belirtiyordu. AI1, TASK-024.2 incelemesinde
> bu kapsam sınırını açıkça kaldırdı: kullanıcı kararı kesindir — **teknik repository, platform ve
> aktif dokümantasyon kimliği tamamen Metnex'tir**, yalnızca ürün markası değil. Aşağıdaki paragraf
> bu doğrultuda güncellenmiştir.

**Metnex** adı:

- Yunan mitolojisindeki stratejik akıl, bilgelik ve öngörü kavramlarıyla ilişkilendirilen **Metis**,
- Latince kökenli bağlantı, birleşme noktası ve merkez anlamındaki **Nexus**

kavramlarının birleşiminden türetilmiştir.

Ürün sloganı:

> **Metnex — Stratejik aklın ve bağlantılı operasyonların merkezi.**

Bu isimlendirme yalnızca ürün kimliğini değil, teknik repository, platform foundation ve kaynak
uygulama adlarını da kapsayan tam bir kimlik kararıdır (AI1, TASK-024.2, 2026-09-17).

## 8.2 Genişletilmiş Ürün Konumlandırması

Metnex'in hedefi yalnızca SCADA/DMS raporlaması değildir.

Metnex;

- mevcut ERP ve uzman sistemlerin yerine geçmeden,
- bu sistemlerin sahiplenmediği operasyonel süreçleri dijitalleştirerek,
- saha ve işletme verilerini ortak görünürlük altında birleştirerek,
- gerekli sistemlerle entegrasyon kurarak,
- analiz, raporlama ve ilerleyen fazlarda karar desteği sağlayarak

kurumsal operasyon platformu olarak konumlandırılır.

Temel kapsam prensibi:

> **Mevcut bir ana sistemin sahip olduğu fonksiyon tekrar geliştirilmez; platform ya entegrasyon kurar, ya sahiplenmesi gereken gerçek domain sürecini yönetir, ya da basit kayıt ihtiyacını hafif no-code yaklaşımıyla merkezileştirir.**

---

# 9. Dokümantasyon ve Değişiklik Yönetimi

Metnex geliştirme sürecinde aşağıdaki doküman yapısı kullanılacaktır:

- `DISCOVERY.md` — ihtiyaçlar, mevcut durum, yeni fikirler, açık sorular ve TBD konular.
- `SRS.md` — yalnızca doğrulanmış ve onaylanmış gereksinimler.
- `DECISIONS.md` — önemli iş/ürün kararları ve bu kararların gerekçeleri.
- GitHub — commit, branch, pull request ve release geçmişi.

Yeni fikir / geliştirme akışı:

```text
Yeni Fikir
    ↓
Discovery
    ↓
Değerlendirme
    ↓
Karar
    ↓
DECISIONS
    ↓
SRS Güncellemesi
    ↓
GitHub
    ↓
Geliştirme
```

`CHANGELOG.md` zorunlu ayrı doküman olarak tutulmayacaktır; teknik değişiklik geçmişi GitHub tarafından sağlanacaktır.

---

# 10. Genişletilmiş Sistem Sahipliği / System of Record İlkeleri

| İş Alanı | Ana Sistem / System of Record | Metnex'in Rolü |
|---|---|---|
| ERP kapsamındaki mevcut süreçler | Netsis ERP | Entegrasyon; tekrar geliştirme yapılmaz |
| Maliyet muhasebesi | Netsis hedef alanı; mevcut durumda aktif değil | Varsayılan olarak Metnex sahipliği değildir |
| Üretim planlama | Metnex | Üretim siparişinden üretim kaynağı planına kadar ana planlama sistemi |
| Üretim / ERP kaydı | Netsis ERP | Metnex'teki onaylı plan üzerinden entegrasyonla tetikleme ve sonuç aktarımı |
| Varlık yönetimi | Beam | Entegrasyon |
| Bakım yönetimi | Beam | Entegrasyon |
| ISO / tetkik / aksiyon / uygunsuzluk / yetkinlik | OpenMs | Entegrasyon |
| SCADA / DMS / işletme SQL verileri | Kaynak sistemler | Read-only analiz ve görünürlük |
| Dinamik Saatlik Analiz ve Raporlama | Metnex | Wave 5 ana iş modülü |
| Kantar / kömür / operasyon kalitesi | Metnex adayı | Ayrı Discovery ile kesinleştirilecek |
| Basit Excel / Word kayıtları | Metnex | Hafif no-code aday alanı |

---

# 11. Birleştirilmiş Migration Wave Stratejisi

## 11.1 Wave 0 — Mimari, Güvenlik ve Platform Hazırlığı

Wave 0 kapsamı:

- Desktop/Web kararının kesinleştirilmesi ve Metnex hedef stack’inin belirlenmesi.
- MİP root → MOSB/MOSEDAŞ/MOSBİO tenant ve lokasyon eşlemesi.
- Permission matrix, aggregate scope ve audit modeli.
- Secret rotation ve eski parola migration/reset stratejisi.
- SQL Server → PostgreSQL veri dönüşüm kararı.
- SCADA/DMS read-only erişim modeli.
- `BOTC → Metnex Migration Mapping` ve `BOTC Migration Architecture Decision` belgeleri.
- Metnex rename, Docker, PostgreSQL ve MinIO geçişleri.

Durum: Platform/rename altyapısı tamamlandı; kaynak şema envanteri ve migration mapping
bu wave’in kalan ön koşuludur.

## 11.2 Wave 1 — Kimlik ve Kullanıcı Migration’ı

 - Users, roles ve permissions.
 - Tenant kullanıcı eşlemesi.
 - Session modeli ve email verification.
 - Password migration/reset stratejisi.
 - Legacy `Admin` ve `Can*` yetkilerinin Metnex permission modeline dönüşümü.

Durum: Wave 0 mapping belgeleri tamamlandıktan sonra implementation’a alınır.

## 11.3 Wave 2 — Bakım/Arıza

Bu geliştirme programının kapsamı dışındadır:

- Ticket, elektrik/mekanik tamamlama ve close workflow.
- Audit trail ve notification.

## 11.4 Wave 3 — DÖF

Bu geliştirme programının kapsamı dışındadır:

- DÖF kayıtları ve sorumlu/tespit eden ilişkileri.
- Close/approve workflow, notification ve audit.

## 11.5 Wave 4 — Vardiya ve Arşiv

- Vardiya raporları ve lokasyon eşlemesi.
- Taslak/tamamlandı ve kilitleme akışı.
- Vardiya arşiv migration’ı ve geçmiş veri erişimi.
- Email distribution ve tenant/permission kontrollü görünürlük.

Durum: Aday wave; kapsam ve öncelik ayrıca kesinleştirilecektir.

> **TASK-027.21 güncellemesi (2026-09-18):** Kaynak şema envanteri ve hedef mapping tamamlandı —
> `docs/migration/BOTC_VARDIYA_SOURCE_SCHEMA_INVENTORY.md`,
> `docs/migration/BOTC_VARDIYA_METNEX_TARGET_MAPPING.md`, SRS FEAT-022. Gerçek kod kanıtıyla
> doğrulanmış 5 lokasyon (`MOSBİO`/`MOSB ENERJİ`/`KÖMÜR KAZANI`/`MOSBİO KIRIM DEPO`/`SANTRAL`) —
> yukarıdaki listede henüz belirtilmeyen `MOSEDAŞ` Vardiya modülünün kapsamına **girmiyor** (kod
> kanıtı yok). 10 yeni açık soru (Q-V01–Q-V10) tespit edildi, hiçbiri bu task'ta kapatılmadı. Wave
> 4 implementation'ı bu sorular ve Wave 1'in gerçek apply aşaması tamamlanmadan başlayamaz.

## 11.6 Wave 5 — Reporting / SCADA / DMS

- SQL Server read-only adapter’ları ve dynamic query contract.
- Tenant scope ve MİP root aggregate scope.
- Saatlik/günlük tüketim, endeks ve gerçek değer analizi.
- Sanal kolonlar, grafik, scale, karşılaştırma ve istatistikler.
- Plant reports, merkezi preset’ler, Jasper output integration.
- CSV/PNG/PDF/XLSX export.

Durum: Metnex’in ilk ana iş modülüdür; Wave 1 kimlik migration’ı ve kaynak
mapping ön koşullarından sonra implementation’a alınacaktır.

Wave 2 ve Wave 3 bu geliştirme programının mevcut implementation kapsamı dışındadır.
İleride ele alınmaları ancak ayrı Discovery/SRS kapsamı ve açık Product Owner onayı
ile mümkündür.

---

# 12. Wave 5 — Saatlik Rapor Mevcut İş Akışı

Mevcut EXE uygulamasındaki kullanıcı akışı aşağıdaki şekilde doğrulanmıştır:

1. Kullanıcı veri kaynağını seçer.
2. Kullanıcı ilgili database / tabloyu seçer.
3. Sistem tablo kolonlarını getirir.
4. Kullanıcı bir veya daha fazla analiz kolonu seçer.
5. Kullanıcı isterse kayıtlı bir sanal kolon seçer veya yeni sanal kolon oluşturur.
6. Kullanıcı tarih ve saat filtre kolonlarını seçer.
7. Kullanıcı çözünürlüğü `Saatlik` veya `Günlük` olarak belirler.
8. Kullanıcı başlangıç ve bitiş tarih/saat aralığını seçer.
9. Kullanıcı gerekirse seri bazında maksimum scale değerini değiştirir.
10. Kullanıcı `Uygula` ile analizi çalıştırır.
11. Sonuç tablo, istatistik ve grafik olarak gösterilir.
12. Sonuç gerektiğinde PNG grafik veya CSV veri olarak dışa aktarılabilir.

---

# 13. Wave 5 — Endeks ve Çözünürlük İş Kuralları

## 13.1 Endeks Bazlı Veri

Kaynak veriler saatlik endeks mantığında tutulabilmektedir.

Doğrulanmış temel iş kuralı:

> Seçilen periyodun değeri, ilgili periyottaki **son endeks - ilk endeks** farkıyla hesaplanır.

Bu nedenle:

- saatlik çözünürlükte saatlik ilk/son endeks farkı,
- günlük çözünürlükte günlük ilk/son endeks farkı

analiz değeri olarak kullanılabilir.

## 13.2 Gerçek Değer

Mevcut EXE bazı veri kaynakları / tablolar için `Gerçek Değer` seçeneği desteklemektedir.

**TBD:** `Gerçek Değer` tipinin hangi tablolar için, hangi kesin iş kuralıyla kullanılacağı Metnex'e aktarılmadan önce ayrıca doğrulanmalıdır.

---

# 14. Wave 5 — Sanal Kolon

Sanal kolon, seçili veri kaynağı içindeki kolonların matematiksel ifadelerle birleştirilmesi sonucu kullanıcı tarafından oluşturulan hesaplanmış analiz kolonudur.

Doğrulanmış mevcut davranış:

- kullanıcı sanal kolona isim verebilir,
- bir veya daha fazla gerçek kolon formülde kullanılabilir,
- sanal kolon kaydedilebilir,
- kaydedilen sanal kolon daha sonra tekrar kullanılabilir,
- sanal kolon normal analiz kolonu gibi grafik ve istatistiklerde kullanılabilir,
- mevcut EXE'de sanal kolon başka sanal kolonlara bağımlı olabilir.

Kavramsal örnek:

```text
Net Üretim = KolonA - KolonB
Verim = KolonA / KolonB
```

**TBD:**

- desteklenecek matematiksel operatörler,
- desteklenecek fonksiyonlar,
- sıfıra bölme davranışı,
- negatif sonuç davranışı,
- null davranışı,
- formül sonuç limitleri,
- maksimum sanal kolon bağımlılık derinliği.

**AI0 önerisi:** Sanal kolon tanımları legacy yerel JSON dosyası yerine kullanıcı/tenant bağlamlı merkezi Metnex verisi olarak saklanmalıdır.

---

# 15. Wave 5 — Grafik ve Görselleştirme

Doğrulanmış mevcut özellikler:

- birden fazla analiz serisi aynı grafikte gösterilebilir,
- seriler farklı renklerle ayrılır,
- farklı büyüklükteki seriler için bağımsız Y scale kullanılabilir,
- kullanıcı seri bazında maksimum scale değerini değiştirebilir,
- veri etiketleri gösterilebilir / gizlenebilir,
- tooltip üzerinde değer gösterilebilir,
- grafik PNG olarak dışa aktarılabilir,
- sonuç verisi CSV olarak dışa aktarılabilir,
- grafik / özet için genişletilmiş sunum görünümü bulunmaktadır.

**AI0 önerileri — henüz kesin gereksinim değildir:**

- zoom / pan,
- legend üzerinden seri aç / kapat,
- gelişmiş tooltip,
- daha güçlü görsel export seçenekleri.

---

# 16. Wave 5 — Karşılaştırma Yetenekleri

## 16.1 Dönem Karşılaştırması

Mevcut EXE:

- ikinci bir tarih aralığı tanımlamayı,
- iki dönemi ayrı grafiklerde göstermeyi,
- aynı grafikte overlay karşılaştırma yapmayı

desteklemektedir.

## 16.2 İkinci Veri Kaynağı Karşılaştırması

Mevcut EXE:

- ikinci veri kaynağı seçmeyi,
- ikinci tablo seçmeyi,
- ikinci kaynaktan bir veya daha fazla analiz kolonu seçmeyi,
- bu serileri ana analizle birlikte göstermeyi

desteklemektedir.

**TBD:** İki farklı veri kaynağındaki zaman kayıtlarının kesin eşleştirme kuralı ayrıca doğrulanmalıdır.

---

# 17. Wave 5 — Rapor Şablonları / Preset

Mevcut EXE rapor şablonu kaydedebilmektedir.

Bilinen kayıt alanları:

- şablon adı,
- veri kaynağı,
- tablo,
- çözünürlük,
- seçilen kolonlar,
- değer tipi,
- seri özel maksimum scale değeri.

**AI0 önerisi:**

- şablonlar kullanıcı hesabına bağlı merkezi Metnex kaydı olmalıdır,
- ilk fazda en az kişisel rapor şablonları korunmalıdır,
- ekip/tenant ile paylaşılan ortak şablon ihtiyacı ayrıca değerlendirilmelidir.

---

# 18. Wave 5 — İstatistikler

Mevcut EXE seçilen seriler için aşağıdaki özet istatistikleri üretmektedir:

- Toplam
- Maksimum
- Minimum

**TBD:** Minimum hesabında sıfır değerlerinin dahil edilip edilmeyeceği ve istatistiklerin `Endeks / Gerçek Değer` tipine göre kesin davranışı doğrulanmalıdır.

---

# 19. Wave 5 — Legacy Davranışlar / Doğrulama Gerektiren Kurallar

Mevcut kodda görülen aşağıdaki davranışlar **henüz Metnex iş gereksinimi değildir**:

1. Belirli kolonlarda büyük negatif fark oluştuğunda sayaç rollover düzeltmesi uygulanması.
2. Bazı sanal kolon sonuçlarının negatif, NaN, sonsuz veya belirli üst limit üzerinde olması durumunda `0` yapılması.
3. Sorgu bitiş zamanına ek süre eklenip sonrasında fazla satırların kırpılması.
4. Belirli tablolar için varsayılan tipin `Gerçek Değer` seçilmesi.
5. Sanal kolon dependency çözümlemesindeki legacy iteration sınırları.

Bu davranışlar gerçek iş gerekçesi doğrulanmadan SRS'te kesin iş kuralı yapılmamalıdır.

---

# 20. Wave 5 — Güvenlik ve Yetkilendirme Ek İlkeleri

Mevcut §5 ve §5.1 kurallarına ek olarak:

- kullanıcı yalnızca yetkili olduğu veri kaynaklarını seçebilmelidir,
- database / schema / table / column seçimleri backend allowlist ve data scope ile doğrulanmalıdır,
- kullanıcıya serbest SQL çalıştırma imkânı verilmemelidir,
- export işlemleri ayrı permission ile sınırlandırılabilmelidir,
- sanal kolon ve rapor şablonu sahipliği kullanıcı hesabıyla ilişkilendirilmelidir,
- veri kaynağı yönetimi ve kritik konfigürasyon değişiklikleri audit edilebilir olmalıdır.

---

# 21. Enerji Üretim, Buhar Arzı ve Operasyon Alanı

## 21.1 Elektrik Üretim Talebi ve Planlama — Wave 2/3 Dışı Gelecek Adayı

- MOSEDAŞ enerji ticareti yapmaktadır.
- Elektrik fiyatlarının üretimi anlamlı kıldığı durumlarda üretim siparişi oluşturulur.
- Üretim operasyon uzmanları çalıştırılacak üretim kaynaklarını ve üretim planını Metnex'te belirler.
- Üretim planlamasının System of Record'u Metnex'tir.
- Netsis içinde üretim planlaması yapılmayacaktır.
- Onaylı plan üzerinden gerekli ERP / üretim kayıtları entegrasyonla Netsis'te tetiklenecektir.
- Gerçekleşen üretim sonuçları gerektiğinde iki sistem arasında aktarılacaktır.

Bilinen üretim kaynakları:

| Kaynak | Yakıt / Girdi | Ana Ürün | Yan Ürün / İkincil Kullanım |
|---|---|---|---|
| GT1 | Doğalgaz | Elektrik | Buhar |
| GT2 | Doğalgaz | Elektrik | Buhar |
| GT3 | Doğalgaz | Elektrik | Buhar; yüksek basınç buhar |
| SG1 | Doğalgaz | Elektrik | Buhar |
| SG2 | Doğalgaz | Elektrik | Buhar |
| SG3 | Doğalgaz | Elektrik | Buhar |
| Kömür Kazanı | Kömür | Buhar | Yüksek basınç buhar |
| MOSBİO | Biyokütle girdileri | Buhar | Elektrik üretimi; gerektiğinde MOSB Enerji buhar desteği |

## 21.2 Buhar Arzı — Wave 2/3 Dışı Gelecek Adayı

- Buhar arzı anlık müşteri siparişiyle başlayan bir süreç değildir.
- Müşterilerin sözleşmesel / beklenen tüketimleri önceden bilinmektedir.
- İşletme aktif müşterilerin toplam beklenen tüketiminden belirli bir marj fazla arz planlamaktadır.
- Bakımda/devre dışı olan müşterilerin bilinen tüketimi ihtiyaçtan düşülebilir.
- Elektrik üretim makineleri yan ürün olarak buhar oluşturur.
- Kömür kazanında buhar ana üründür.
- MOSBİO gerektiğinde MOSB Enerji buhar arzını kısmen veya tamamen destekleyebilir.
- Yüksek basınç buhar için doğrulanmış kaynaklar GT3 ve kömür kazanıdır.

**TBD:** arz marjı hesabı, yüksek/alçak basınç hat kapasitesi ve MOSBİO destek sınırları.

## 21.3 Sıcak Su — Wave 2/3 Dışı Gelecek Adayı

- Buhar sıcak su üretiminde kullanılmaktadır.
- Sıcak su sanayi tesislerine arz edilmektedir.
- müşteri/tesis bazlı tüketim, kapasite, ölçüm ve kesinti kuralları henüz TBD'dir.

---

# 22. Biyokütle, Kömür ve Laboratuvar — Wave 2/3 Dışı Gelecek Adayı

## 22.1 Biyokütle Reçete / Paçal

Bilinen bileşenler:

- pulper,
- gübre,
- tahta,
- orman atıkları,
- kurutulmuş atık su çamuru.

Her bileşenin bağımsız kalori değeri ve karışım/paçal sonrası kalori değeri önemlidir.

## 22.2 Kömür

- Kömür kantarda tartılmaktadır.
- Kömür kalori değeri üretim/buhar operasyonu açısından önemlidir.
- brüt/dara/net, numune ve sevkiyat akışı henüz doğrulanmış gereksinim değildir.

## 22.3 Laboratuvar Verisi

> **Kesin iş kuralı:** Laboratuvar analiz sonuçları Metnex'e yetkili kullanıcı tarafından manuel girilecektir.

Bu kural:

- kömür kalori,
- biyokütle bileşen analizi,
- paçal/karışım analizi,
- su analizleri

için geçerlidir.

Otomatik cihaz / LIMS veri aktarımı mevcut kapsamın parçası değildir.

---

# 23. Hafif No-Code Yaklaşımı — Wave 2/3 Dışı Gelecek Adayı

Metnex içerisinde Excel / Word ile yürüyen basit ortak kayıt süreçleri için hafif no-code form kabiliyeti ürün kapsamında değerlendirilmektedir.

Uygun adaylar:

- basit veri giriş formu,
- checklist,
- periyodik kontrol,
- düşük karmaşıklıklı ortak kayıt.

Ayrıca Product Owner onayı olmadıkça ilk no-code kapsamına dahil edilmemesi önerilen alanlar:

- genel amaçlı BPMN designer,
- script motoru,
- kullanıcı tanımlı SQL,
- genel amaçlı entegrasyon designer,
- tam low-code uygulama geliştirme platformu.

---

# 24. Ek Riskler

| ID | Risk | Etki | Öncelik |
|---|---|---|---|
| R-009 | Saatlik Rapor'daki legacy teknik davranışların iş kuralı sanılarak doğrudan taşınması | Yüksek | Yüksek |
| R-010 | Çok geniş tarih aralığı / çok sayıda seri nedeniyle SQL Server ve API performans sorunu | Yüksek | Yüksek |
| R-011 | Sanal kolon formüllerinin yeterli doğrulama olmadan çalıştırılması | Yüksek | Yüksek |
| R-012 | Rapor preset ve sanal kolonların kullanıcı bilgisayarına bağlı tutulmaya devam etmesi | Orta | Yüksek |
| R-013 | Metnex kapsamının kontrolsüz biçimde ikinci ERP / genel amaçlı suite'e dönüşmesi | Yüksek | Yüksek |
| R-014 | Doğrudan DB entegrasyonlarının kaynak sistem şema değişikliklerine sıkı bağımlılık oluşturması | Yüksek | Yüksek |

---

# 25. Ek Açık Sorular

| ID | Soru | Neden Önemli |
|---|---|---|
| Q-012 | `Gerçek Değer` ile `Endeks` arasındaki kesin iş kuralı nedir? | Wave 5 hesaplama |
| Q-013 | Sayaç rollover hangi sayaçlarda ve hangi maksimum değerle uygulanmaktadır? | Legacy kural doğrulama |
| Q-014 | Sanal kolonda izin verilecek operatör ve fonksiyonlar nelerdir? | Güvenlik / hesap doğruluğu |
| Q-015 | Sanal kolon geçersiz sonucunda 0/null/hata/uyarı davranışı ne olmalıdır? | Veri doğruluğu |
| Q-016 | Farklı veri kaynakları kıyaslanırken zaman noktaları nasıl eşleştirilecektir? | Karşılaştırma doğruluğu |
| Q-017 | Maksimum sorgu tarih aralığı ve maksimum seri sayısı nedir? | Performans |
| Q-018 | CSV ve PNG Wave 5'te kesin export formatları olarak korunacak mı? | Kapsam |
| Q-019 | Rapor şablonları yalnızca kişisel mi olacak, ekip/tenant ile paylaşılabilecek mi? | Veri modeli / permission |
| Q-020 | Saatlik Rapor modülünün kullanıcıya görünen nihai adı nedir? | Ürün terminolojisi |
| Q-021 | Buhar arzında fazla arz marjı nasıl hesaplanır? | Arz planlama |
| Q-022 | Biyokütle paçal kalori değeri ölçülen mi, hesaplanan mı, ikisi de mi tutulacaktır? | Yakıt kalite modeli |
| Q-023 | Su analiz parametreleri, limitleri ve sıklıkları nelerdir? | Laboratuvar / proses kalite |
| Q-024 | Netsis üretim tetikleme entegrasyonunun kesin veri sözleşmesi nedir? | ERP entegrasyonu |

---

# 26. Güncellenmiş Sonraki Adımlar

Mevcut §7.4 adımlarına ek olarak:

1. `BOTC → Metnex Migration Mapping` hazırlanır.
2. `BOTC Migration Architecture Decision` hazırlanır.
3. Wave 1 kimlik ve kullanıcı migration kapsamı kesinleştirilir.
4. Wave 4 Vardiya ve Wave 5 Reporting/SCADA öncelikleri Product Owner tarafından onaylanır.
5. Wave 5 için Q-012–Q-020 açık soruları kapatılır.
6. Onaylı gereksinimler SRS'e aktarılır ve AI1 engineering task'ları üretir.
