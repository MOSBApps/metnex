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
| Doküman Sürümü | 1.4 — TASK-029.14: DEC-0017 kararları ana bölümlere taşındı, açık soru/TBD durumu tekilleştirildi (bkz. §28) |

> Bu Discovery, BOTC uygulamasının kaynak kodundan çıkarılan mevcut davranışları ve MİP/Metnex
> hedef mimarisi için verilen paydaş kararlarını birleştirir. BOTC’deki WPF ekranları davranış
> referansıdır; WPF/.NET katmanları hedef teknoloji olarak doğrudan taşınmayacaktır.

> **v1.4 notu (2026-10-06, TASK-029.14):** Bu sürüm hiçbir eski metni silmez veya yeni iş kuralı
> icat etmez. §21/§22'deki DEC-0017 kararları ilgili ana bölümlere kısa özet olarak taşınmıştır
> (ayrıntı hâlâ §27'dedir); Wave 5 implementation'ıyla (TASK-027.6x–.74, DEC-0015) kapanmış eski
> TBD'ler kendi yerlerinde kapatıldı notuyla işaretlenmiştir; tüm açık soru/TBD maddeleri tek bir
> durum sınıflandırmasıyla (`RESOLVED`/`PARTIALLY_RESOLVED`/`TBD`/
> `EXTERNAL_VALIDATION_REQUIRED`/`OUT_OF_SCOPE`) §28'de tekilleştirilmiştir.

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
├── MOSB Enerji operasyon tenantı
└── MOSBİO operasyon tenantı
```

- MOSB Enerji ve MOSBİO kendi operasyon tenantlarında kendi yetkili verilerini görür.
- MOSEDAŞ Metnex tenantı değildir; dış üretim planlama sistemi olarak B2B external-system kimliğiyle bağlanır.
- MOSB varlık sahibi olabilir ancak Metnex operasyon tenantı değildir; sahiplik BEAM/ERP'de kalır.
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
| Üretim planlama | MOSEDAŞ ayrı uygulaması | Plan ve üretim emri SoR'u; Metnex operasyon yürütme ve gerçekleşme SoR'u |
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

> **Durum (v1.4, TASK-029.14):** `RESOLVED` — Q-W503 kararı (2026-09-23, DEC-0015): davranış
> katalog + analiz parametreleriyle tanımlanır, tablo adına göre varsayım yapılmaz; saatlik/günlük
> işlem tipi, toplam/ortalama/min/max ve zaman kaydırması katalogda parametriktir. Bkz.
> `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` Q-W503.

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

> **Durum (v1.4, TASK-029.14):** `RESOLVED` — Q-W504 kararı (DEC-0015): serbest JS/SQL/
> `DataTable.Compute` yok; allowlist tabanlı, versiyonlu formül dili; sıfıra bölme/null/negatif/
> NaN/∞/derinlik limitleri tanımlı, hatalı sonuç sessizce 0 yapılmaz. AI0 önerisi (merkezi saklama)
> de Q-W505 ile `RESOLVED`: control-plane'de `tenantId`+`ownerUserId` sahipliğiyle, TASK-027.70/.71
> implementation'ında teslim edildi.

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

> **Durum (v1.4, TASK-029.14):** `RESOLVED` — Q-W508 kararı (DEC-0015): normalize zaman kovalarıyla
> eşleme; satır sırası/pozisyonel eşleme esas değildir; gizli/otomatik tolerans yok; eşleşmeyen
> kovalar veri kalite durumuyla işaretlenir.

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

> **Durum (v1.4, TASK-029.14):** `RESOLVED` — Q-W509 kararı (DEC-0015): min/max/toplam/ortalama
> ayrı kurallarla, kaynak/kolon katalog politikasına göre hesaplanır; null/boş seri/eksik veri
> sessizce 0 yapılmaz, veri yoksa null + veri kalite durumu döner.

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

## 21.1 Elektrik Üretim Talebi ve Planlama — DEC-0014 ile Güncellenmiş Gelecek Adayı

> **DEC-0017 notu (2026-09-28):** Bu bölümdeki "üretim emri" **yalnızca enerji üretim emrini** (MOSEDAŞ SoR) ifade eder. Kırım Tesisi'nin kendi (paçal) üretim emri **ayrı bir bounded context**'tir, MOSEDAŞ'tan gelmez ve bu bölümün kapsamında değildir — bkz. §27.1.

- MOSEDAŞ enerji ticareti yapmaktadır.
- Elektrik fiyatlarının üretimi anlamlı kıldığı durumlarda üretim siparişi oluşturulur.
- Üretim planı ve üretim emri ayrı MOSEDAŞ uygulamasında oluşturulur.
- MOSEDAŞ üretim planı ve emrinin System of Record'udur.
- Metnex emri teknik ve operasyonel olarak doğrular, kabul/ret eder ve sahada yürütür.
- Metnex gerçekleşme, sapma ve üretim olaylarını MOSEDAŞ'a geri bildirir.
- Netsis/ERP ana veri ve ERP süreçleri kendi System of Record sınırında kalır; Metnex planlama SoR'u değildir.
- Pazar, fiyat, optimizasyon ve tedarikçi planlama fonksiyonları Metnex kapsamına alınmaz.

### 21.1.1 Operasyon ve tenant sınırı

- MİP root altında MOSB Enerji ve MOSBIO ayrı operasyon tenantlarıdır.
- MOSB varlık sahibi olsa da Metnex operasyon tenantı değildir.
- MOSEDAŞ Metnex tenantı değildir; external-system kimliği ve allowlist ile entegre olur.
- Varlık sahipliği BEAM/ERP'de; Metnex tesis/makine referansı ve operasyonel snapshot kullanır.
- Kömür Kazanı MOSB Enerji altında tesis/ünite operasyon referansıdır.
- **Kırım Tesisi, MOSBİO altında aynı biçimde bir tesis/ünite operasyon referansıdır** (DEC-0017
  D-09, ana bölüme taşındı — ayrıntı §27.9). Kırım Tesisi ile `MOSBİO KIRIM DEPO` lokasyonunun aynı
  fiziksel/işletme birimi olup olmadığı **dış doğrulama bekliyor**, varsayılmamıştır.

### 21.1.2 Üretim emri ve olay akışı

> **Ana bölüme taşındı (DEC-0017 D-01, v1.4):** Bu alt bölümdeki emir/olay akışı **yalnızca enerji
> üretim emrini** (MOSEDAŞ SoR) kapsar. Kırım Tesisi'nin kendi (paçal) üretim emri **ayrı bir
> bounded context**'tir — Metnex SoR'ludur, MOSEDAŞ'tan gelmez, bu akışa girmez; reçeteyi hazırlayan
> yetkili kişi açar, vardiya sorumlusu yürütür/tamamlar; bir reçete farklı zamanlarda yeniden
> kullanılabilir, bir emir vardiyalar arasında açık kalabilir, tamamlanan emir yeniden açılmaz.
> Ayrıntı: §27.1.

- Emirler versiyonlu ve idempotent alınır; Metnex operasyon uygunluğunu kontrol eder.
- Koşullar bozulursa emir `PAUSED` veya `EXECUTION_BLOCKED` olur ve MOSEDAŞ'a olay gönderilir.
- Olaylar Metnex'te önce kalıcılaşır, ardından asenkron gönderilir.
- `CRITICAL`, `HIGH`, `NORMAL` öncelikleri ve teknik alındı/işleme sonucu ayrımı bulunur.

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

> **DEC-0017 notu (2026-09-28):** Bu bölüm 2026-09-22 tarihli görüşme (`METNEX_AI1_DISCOVERY_BRIF2.md`) ile önemli ölçüde genişletildi: ortak laboratuvar ekibi, MOSB ENERJİ kömür kabul/kantar/yığın/kazan külü, MOSBİO gelen biyokütle ürünü analizleri ve Kırım Tesisi reçete/üretim emri/paçal/kova ölçümü. Ayrıntılı addendum §27'dedir; bu bölümün eski metni silinmemiştir, §27 ile birlikte okunmalıdır.

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

### 22.3.1 Onaylı Laboratuvar Ürün Sınırı

- Laboratuvar analiz türleri ve parametreleri parametrik olarak eklenebilir.
- İlk analiz kümesi kömür, biyokütle, blend/paçal ve su analizleridir.
- Analiz tanımları Laboratuvar domain yöneticisi tarafından onay ve audit ile yönetilir.
- Sonuç yaşam döngüsü taslak → onay → kilitli şeklindedir; düzeltme yeni revizyonla yapılır.

> **DEC-0017 ile karma model (2026-09-28):** "Taslak → onay → kilitli" yalnız **analiz türü/parametre/referans tanımı** katmanı için geçerlidir. **Sonuç/analiz kaydı** katmanında: kısmi parametrelerle açılıp tamamlanabilir, her parametre için laboratuvar yetkilisi ayrı **esas sonuç** seçer, tamamlanmış kayıt sunucu tarafında kilitlenir ve düzeltme yeni revizyonla (eski/yeni değer, kullanıcı, zaman) yapılır — bu, bağımsız yeni bir ölçüm olan "tekrar analiz"den ayrı bir işlemdir. Ayrıntı: DEC-0017 §D-02, §27.2.

## 22.4 İşletme Modülü Ürün Sınırı

- İşletmede elle girilen operasyonel değerler kontrollü parametrik formlarla tutulur.
- İşletme form/alan tanımları İşletme domain yöneticisi tarafından onay ve audit ile yönetilir.
- Veri yaşam döngüsü taslak → kontrol/onay → kilitli şeklindedir; düzeltme revizyonla yapılır.
- Laboratuvar ve İşletme ayrı altyapı, domain, permission ve audit sınırlarına sahiptir.

## 22.5 İlk Ekran Sırası

1. Operasyon merkezi özeti, vardiya listesi/detayı, üretim emri listesi/detayı ve olay akışı.
2. Laboratuvar analiz/parametre, numune, sonuç, onay/kilit ve geçmiş ekranları.
3. İşletme form/alan, veri girişi, onay/kilit ve geçmiş ekranları.

## 22.6 DEC-0017 ile Ana Bölüme Taşınan Kararlar (v1.4 — ayrıntı §27)

Aşağıdaki kararlar `METNEX_AI1_DISCOVERY_BRIF2.md` görüşmesinden çıkmış, DEC-0017 ile kapanmış ve
bu ana bölüme taşınmıştır (tam ayrıntı §27'de kalır, silinmemiştir):

- **Laboratuvar yaşam döngüsü karma modeldir** (D-02): tanım/referans katmanı taslak → onay →
  versiyon (yukarıdaki §22.3.1 ile aynı); sonuç/analiz kaydı katmanı kısmi-kayıt + parametre bazlı
  esas-sonuç + kilit-sonrası-revizyon; "tekrar analiz" bundan ayrı, bağımsız bir kayıttır.
- **Ortak laboratuvar ekibi çoklu tenant üyeliğiyle çalışır** (D-03/D-03a): mevcut
  `tenantMemberships` mekanizmasıyla MOSB Enerji ve MOSBİO'ya ayrı ayrı üyelik; performans raporu
  işletme bazında + ortak toplam, Vardiya Operasyon Merkezi'nin parçası değildir, yeni bir
  aggregate mekanizması icat edilmez.
- **Vardiya bağımsız bir varlık değil, zaman/sorumluluk boyutudur** (D-08): ayrı zorunlu bir
  "vardiya operasyonu" kaydı açılmaz; bu, §11.5/§11.6'daki Wave 4 Vardiya raporu/arşiv modelini
  (FEAT-022) değiştirmez.
- **Yeni domain kayıtları tenant data-plane şemasında tutulacaktır** (D-14): data-plane fan-out
  altyapısı bugün eksiktir; bu bir ön koşuldur, bu notla giderilmiş değildir.

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

---

# 27. DEC-0017 Addendum — Operasyon, Laboratuvar ve Kırım Tesisi (2026-09-28)

> **Kaynak:** `METNEX_AI1_DISCOVERY_BRIF2.md` (PO görüşme aktarımı, 2026-09-22/25) → `docs/discovery/METNEX_AI1_DISCOVERY_BRIF2_EVALUATION.md` (TASK-029.00-R1, kanıt/çelişki analizi) → `docs/decisions/DEC-0017-…md` (TASK-029.00-R2, kapanış). Bu bölüm **eski metni değiştirmez**; §21/§22'yi tamamlar. Production kodu, migration veya UI bu addendum ile başlamaz.

## 27.1 Üretim emri — iki bounded context (DEC-0017 D-01)

> **v1.4:** Kısa özet §21.1.2'ye taşındı; burada tam ayrıntı korunur.

- **Enerji üretim emri:** §21.1'deki tanım aynen geçerlidir; SoR MOSEDAŞ, Metnex doğrular/kabul-ret/yürütür/geri bildirir.
- **Kırım Tesisi (paçal) üretim emri:** yeni, **Metnex SoR'lu**, MOSEDAŞ'tan gelmeyen ayrı bir emir türü. Reçeteyi hazırlayan yetkili kişi açar; vardiya sorumlusu fiilî üretimi başlatır/tamamlar; bir reçete farklı zamanlarda yeniden kullanılabilir; bir emir vardiyalar arasında açık kalabilir; hedefe ulaşmadan (gerekçeyle veya "miktar bilinmiyor" ile) tamamlanabilir; tamamlanan emir yeniden açılmaz, devamı için yeni emir açılır; ilgili üretim dönemine ait numune/analiz sonradan eklenebilir ve bu, emri yeniden açmaz.

## 27.2 Laboratuvar — karma yaşam döngüsü (DEC-0017 D-02)

> **v1.4:** Kısa özet §22.6'ya taşındı; burada tam ayrıntı korunur.

- **Tanım katmanı** (analiz türü, parametre, referans/kriter): taslak → onay → versiyonlu (mevcut §22.3.1 hükmü).
- **Sonuç katmanı** (analiz kaydı): kısmi parametrelerle açılır/tamamlanır; eksik parametre sonradan aynı kayda eklenir; parametre bazında laboratuvar yetkilisi **esas sonucu** seçer (önceki/yeni seçim + kullanıcı + zaman korunur); tamamlanmış kayıt kilitlenir; düzeltme yeni revizyon; **tekrar analiz** (yeni numune/ölçüm) ayrı, bağımsız bir kayıttır.
- Uygulama alanları: kömür (araç numunesi, günlük ortak numune, kazan külü), MOSBİO gelen biyokütle ürünü (araç bazlı), su laboratuvarı (numune noktası bazlı), paçal (Kırım Tesisi, reçete sürümü bazlı).

## 27.3 Ortak laboratuvar ve tenant modeli (DEC-0017 D-03, D-03a)

> **v1.4:** Kısa özet §22.6'ya taşındı; burada tam ayrıntı korunur.

- Ortak laboratuvar ekibi **MOSB Enerji** ve **MOSBİO** tenant'larına **ayrı ayrı üyelik** ile bağlanır (mevcut `tenantMemberships` mekanizması, yeni mekanizma yok); görüntüleme/veri girişi yetkisi her üyelikte ayrı tanımlanır.
- Laboratuvar performansı işletme bazında ve iki üyeliğin toplamı olarak (ortak toplam) raporlanır; bu, **Vardiya Operasyon Merkezi'nin bir parçası değildir**, laboratuvar kendi domain'inde raporlanır; yeni bir aggregate/root mekanizması değildir.

## 27.4 MOSB / MOSB ENERJİ / MOSBİO tenant dili (DEC-0017 D-04)

`docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md` ve ilgili mapping belgelerindeki "MOSEDAŞ tenant'tır" ifadesi ile DEC-0014/DEC-0017 (MOSEDAŞ tenant değildir) arasındaki fark, **ayrı bir uyum task'ı** ile ele alınacaktır (bu addendum onu kapatmaz). §2.3, D-005 ve ilgili tablo bu ayrı task tamamlanana kadar **eski hükümleriyle** okunmalı, DEC-0014/DEC-0017'nin MOSEDAŞ/MOSB tenant sınırına **üstün gelmediği** unutulmamalıdır.

## 27.5 Kantar / Netsis (DEC-0017 D-05 — kısmen açık)

Kantar kaydının SoR'u **geçici olarak Netsis** kabul edilir (§10 tablosundaki "Metnex adayı" ifadesi bu addendum ile netleşir): Netsis'te oluşup eşleşmeden Metnex işlemi kesinleşmez; Metnex okur/eşler, istisnai yetkili manuel eşleştirme yapılabilir. **Netsis entegrasyon anahtarları/veri sözleşmesi (Q-024) hâlâ açıktır.**

## 27.6 MOSB ENERJİ kömür kabulü, yığın, kazan külü

- Araç → tartım (kantar/Netsis) → laboratuvar araç numunesi (4 nokta) → **günlük ortak numune** (kül/uçucu, tedarikçi bazlı): katılan araçlar ile uygulandığı araçlar **ayrı ilişkilerdir**; bir analiz sonucu birden çok araca uygulanması, birden çok test sayılmaz.
- Fiziksel **kömür yığını**: araç/tedarikçi ile ilişkili, aynı tedarikçiye ait birden çok ayrı yığın olabilir.
- Kazan besleme sayacı: **ana kaynak SCADA** (Wave 5 read-only, DEC-0015 sınırı korunur — bu domain SCADA'ya yazmaz), **manuel giriş yalnızca istisna** ve açıkça işaretli (DEC-0017 D-10).
- Yanma sonrası **kazan külü** gelen kömürün laboratuvar kül yüzdesinden ayrı bir analizdir; vardiya başına birden çok numune olabilir; kabul zamanı ile fiilî alma zamanı ayrı izlenir; yığın ilişkisi önerilir, laboratuvar personeli düzeltebilir.
- Yığın kapanışını operatör yapar; uzman inceleyip "İncelendi" işaretleyebilir.

## 27.7 MOSBİO gelen biyokütle ürünü analizi

Araç bazlı tartım → 6 noktadan numune → laboratuvar araç numunesi (kendi analiz kaydı); ürünler ortak stokta tutulduğundan **araç/sevkiyat → belirli paçal üretimi düzeyinde izlenebilirlik iddia edilmez**. Kısmi sonuç, parametre bazında esas sonuç, değiştirilebilir alt/üst kalite sınırı (kriter yoksa "Kriter tanımlı değil"), ortak alıcı listesine bildirim (uygulama içi + e-posta, ortak notification service — DEC-0017 D-15), sonuç/tartım eşleştirme düzeltme talebi + laboratuvar yetkilisi gerçekleştirmesi.

## 27.8 Su laboratuvarı (MOSB Enerji / MOSBİO)

Tek zaman alanı = laboratuvar numune kabul tarihi/saati; kısmi kayıt; otomatik görev/gerçekleşmemiş analiz kaydı üretilmez; referans işletme+sistem+numune noktası+parametre bağlamında, versiyonlu; referansı olmayan sonuç "Referans tanımlı değil"; limit dışı sonuç **numune kaydı tamamlandığında** bildirilir (zorunlu onay/aksiyon yok); MOSBİO Online Drum/Steam ilk fazda manuel girilir, ayrı kolonlar (DEC-0017 D-19); su analiz parametreleri/limitleri **Q-023 hâlâ açık**.

## 27.9 Kırım Tesisi — reçete, üretim emri, paçal, kova ölçümü

> **v1.4:** Tenant/operasyon merkezi özeti §21.1.1'e taşındı; burada tam ayrıntı korunur.

- Kırım Tesisi **MOSBİO'nun alt operasyonudur**, kendi tenant'ı (MOSBİO) altında bir operasyon merkezidir (DEC-0017 D-09); Kömür Kazanı aynı biçimde MOSB Enerji altındadır. **`MOSBİO KIRIM DEPO` ile aynı birim olup olmadığı dış doğrulama bekliyor.**
- Reçete sürümü: fiilen uygulanmaya başlama zamanı vardiya sorumlusundan; hedefler/ürün miktarları/paçal analizleri sürüm bazında; revizyon yetkisi reçete yetkilisi + Kırım Tesisi sorumlusu.
- Paçal numunesi yalnız laboratuvar kabul zamanı taşır; emir/sürüm eşleştirmesi Metnex tarafından önerilir, laboratuvar doğrular/düzeltir.
- **Toplu kalite özeti reçete sürümü bazında** hesaplanır, güncel esas sonuçlara göre yeniden hesaplanır, eski değerlendirmeler korunur (DEC-0017 D-07); yöntem **yalnızca aritmetik ortalama**dır, ağırlıklı ortalama miktar verisi (TBD-L03) doğrulanana kadar uygulanmaz (DEC-0017 D-17).
- **Hedef dışı paçal analizi için rutin/otomatik bildirim yoktur; sonradan parametre eklenince veya esas sonuç değişince güncel analiz yeniden bildirilir** (DEC-0017 D-06 — TBD-G01 kapandı).
- **Kova ölçümü:** her kepçe yüklemesi ayrı ölçüm kaydı; ürün/emir/sürüm fiilî yükleme zamanına göre belirlenir; **toplam yüklenen malzeme miktarı nihai paçal üretim miktarı değildir**, raporda eşitlenemez; ölçülmüş/tahmini/birleşik toplam ayrı gösterilir; tahmin doğrulanınca güncel toplamda yerini alır, eski tahmin geçmişte kalır. Kepçe cihazı entegrasyonu **açık** (TBD-K01–K04, DEC-0017 D-11). Nihai paçal miktarının ayrıca ölçülmesi **kapsam dışı, ileride değerlendirilecek** (DEC-0017 D-18).

## 27.10 Vardiya — bağımsız varlık değil, boyut (DEC-0017 D-08)

> **v1.4:** Kısa özet §22.6'ya taşındı; burada tam ayrıntı korunur.

Vardiya, üretim emri/kova ölçümü/olay/rapor kayıtlarının **zaman ve sorumluluk boyutudur**; ayrı zorunlu bir "vardiya operasyonu" kaydı açılmaz. Bu, §11.5/§11.6 Wave 4 Vardiya raporu/arşiv modelini (FEAT-022) **değiştirmez** — FEAT-022 kendi lokasyon bazlı raporunu sürdürür; FEAT-023 Operasyon Merkezi bu yeni "boyut" yaklaşımını sunar.

## 27.11 Kalori/kül raporlama (DEC-0017 D-12, D-20)

Kullanılan alt kalori sonucu = `KALORI HESAP.xlsx` G6 (üst kalori girdisi) → G7 (alt kalori, esas sonuç); diğer kalori değerleri silinmez, ayrı kolonlarda tutulur. Ana raporda ekranda ilk+güncel değer, Excel/PDF çıktısında yalnız güncel değer. **Formülün tam doğrulaması (TBD-L02) ve rapor kolonlarının/Jasper şablonlarının kesinleşmesi (TBD-L01) hâlâ açıktır.**

## 27.12 Veri yerleşimi, bildirim, rol modeli, audit, migration (DEC-0017 D-14, D-15, D-16, D-21, D-22)

> **v1.4:** D-14 (data-plane yerleşimi) özeti §22.6'ya taşındı; burada tam ayrıntı (D-15/D-16/D-21/
> D-22 dahil) korunur.

- Bu addendumdaki domain kayıtları **tenant data-plane şemasında** tutulacaktır (DEC-0010 Faz 5'in ilk gerçek tüketicisi); data-plane altyapısı bugün eksiktir, bu bir ön koşuldur.
- Bildirimler **ortak bir notification service** üzerinden (uygulama içi + e-posta) gönderilir.
- Yeni roller mevcut tenant rol/permission modelinin **genişletilmesiyle** tanımlanır; yeni bir paralel yetki sistemi açılmaz.
- Audit kayıtlarında yalnız **asgari kullanıcı kimliği** (id + görünen ad) tutulur; serbest metin alanlarındaki olası kişisel veri implementation task'ında ayrıca ele alınmalıdır.
- Tarihsel Excel/kağıt veri migration'ı, yapılırsa **seçilmiş kapsamla** yapılır; otomatik/tam geçmiş taşınması varsayılmaz.

## 27.13 Kapatılmayan açık sorular (bilinçli olarak korunmuştur)

`Q-023` (su analiz parametreleri/limitleri), `Q-024` (Netsis veri sözleşmesi), `TBD-L01` (rapor kolonları/Jasper), `TBD-L02` (kalori formülü tam doğrulama), `TBD-L04`/`TBD-013`'ün lab karşılığı (başlangıç kalite limitleri), `TBD-K01`–`TBD-K04` (kepçe cihazı), `TBD-G02` (nihai paçal miktarı ölçümü) — **bu addendum ile kapatılmamıştır**, DEC-0017'nin "Açık statüler" tablosuyla birebir eşleşir.

---

# 28. Açık Soru ve TBD Durum Sınıflandırması (v1.4, TASK-029.14)

> Bu bölüm hiçbir eski soruyu veya TBD'yi siler/kapatmaz; yalnızca §7.3, §12–§18, §21, §25 ve
> §27.13'teki maddeleri **tek bir durum sözlüğüyle** görünür kılar. Kaynak kararlar: DEC-0014,
> DEC-0015 (`docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` Q-W5xx kapanışları, 2026-09-23),
> DEC-0017. Yeni iş kuralı icat edilmemiştir.
>
> **Durum sözlüğü:**
> - `RESOLVED` — bağlayıcı bir kararla kapandı, implementation'da kullanılabilir.
> - `PARTIALLY_RESOLVED` — ilke/mimari karar var, bir alt-parçası hâlâ açık.
> - `TBD` — henüz ele alınmadı, PO/AI1 kararı bekliyor.
> - `EXTERNAL_VALIDATION_REQUIRED` — kararı Metnex içinde verilemez, dış kaynak (Netsis, kepçe
>   tedarikçisi, laboratuvar, SQL Server sahibi) doğrulaması gerekir.
> - `OUT_OF_SCOPE` — mevcut program kapsamına bilinçli olarak alınmadı (Wave 2/3 veya ayrı karar).

## 28.1 §7.3 — Discovery İlk Açık Sorular

| ID | Konu | Durum | Kapanış / kalan parça |
|---|---|---|---|
| Q-001 | MİP root tenant ağacı ve işletme kodları | `PARTIALLY_RESOLVED` | DEC-0014: MOSB Enerji/MOSBIO ayrı operasyon tenant, Kömür Kazanı/Kırım Tesisi operasyon merkezi (D-09). Kesin tenant slug/kod eşlemesi D-04'e (ayrı uyum task'ı) devredildi. |
| Q-002 | SQL Server database/schema/table/kolon ayrımı | `PARTIALLY_RESOLVED` | Mimari karar: SCADA catalog + allowlist (TASK-027.63, Q-W515). Gerçek kaynak envanteri hâlâ çıkarılmadı. |
| Q-003 | Her SQL Server kaynağı için read-only kullanıcı/bağlantı hazır mı | `EXTERNAL_VALIDATION_REQUIRED` | Operasyonel/deployment; gerçek SQL Server bağlantısı henüz kurulmadı. |
| Q-004 | Root aggregate analiz yetkisi hangi kullanıcılarda | `RESOLVED` | FR-002B: permission + `canAggregateChildren` + data scope birlikte (TenantScopeService). |
| Q-005 | İlk migration'a Vardiya/Arşiv dahil mi | `PARTIALLY_RESOLVED` | Wave 1 (kimlik) ilk migration oldu; Wave 4 (Vardiya, FEAT-022) Discovery/SRS tamam ama Q-V01–V10 çözülmeden implementation başlamaz. |
| Q-006 | `BOT_APP` migrate edilecek tablolar / geçmiş veri başlangıcı | `PARTIALLY_RESOLVED` | Kullanıcı/rol/izin Wave 1 ile `RESOLVED` (TASK-027.12–.20 done). Diğer modüller için tablo/tarih kapsamı hâlâ TBD. |
| Q-007 | Eski kullanıcılar için parola reset/hash prosedürü | `RESOLVED` | TASK-027.16 done. |
| Q-008 | SCADA canlı mı sorgulanacak, cache/read-model mi | `PARTIALLY_RESOLVED` | Mimari karar `RESOLVED` (Q-W512: UTC normalize, canlı sorgu, cache modeli yok). Gerçek SQL Server provider hâlâ yok (dev fixture ile çalışıyor). |
| Q-009 | Saatlik tüketim/işletme raporu kanonik çıktı formatları | `RESOLVED` | Q-W513 + TASK-027.74 (export: CSV/PNG/PDF/XLSX aynı sözleşmeden). |
| Q-010 | BOTC SMTP/Telegram bildirimlerinin MVP'ye taşınması | `TBD` | Henüz ele alınmadı; Wave 1 yalnızca kimlik migration'ı yaptı. |
| Q-011 | SCADA sorgu timeout/max satır/export sınırı | `TBD` | SRS §8 NFR-001–006 hâlâ TBD. |

## 28.2 §25 — Ek Açık Sorular

| ID | Konu | Durum | Kapanış / kalan parça |
|---|---|---|---|
| Q-012 | `Gerçek Değer` ile `Endeks` kesin iş kuralı | `RESOLVED` | Q-W503 (katalog + analiz parametreleri, tablo adına göre varsayım yok). |
| Q-013 | Sayaç rollover hangi sayaçlarda, hangi maksimum değerle | `RESOLVED` | Q-W502 (katalog bazlı, sabit `+100000` taşınmadı, kalite uyarısı). |
| Q-014 | Sanal kolonda izin verilecek operatör/fonksiyon | `RESOLVED` | Q-W504 (allowlist tabanlı, versiyonlu formül dili). |
| Q-015 | Sanal kolon geçersiz sonuç davranışı (0/null/hata) | `RESOLVED` | Q-W504 (sessizce 0 yapılmaz; limit/derinlik kararlı). |
| Q-016 | Farklı kaynaklar arası zaman noktası eşleme | `RESOLVED` | Q-W507/Q-W508 (normalize zaman kovaları, pozisyonel eşleme yok). |
| Q-017 | Maksimum sorgu tarih aralığı ve maksimum seri sayısı | `TBD` | SRS §8 NFR-001/002 hâlâ TBD. |
| Q-018 | CSV/PNG kesin Wave 5 export formatları mı | `RESOLVED` | Q-W513 + TASK-027.74 (CSV/PNG/PDF/XLSX hepsi aynı sözleşmeden, export done). |
| Q-019 | Rapor şablonları kişisel mi, ekip/tenant paylaşımlı mı | `RESOLVED` | Q-W506 (`PRIVATE`/`TENANT_SHARED`, aynı ad sessizce üzerine yazılmaz). |
| Q-020 | Saatlik Rapor modülünün nihai kullanıcı-görünür adı | `TBD` | Ürün terminolojisi kararı henüz verilmedi. |
| Q-021 | Buhar arzında fazla arz marjı hesabı | `OUT_OF_SCOPE` | §21.2 "Wave 2/3 Dışı Gelecek Adayı" — mevcut program kapsamında değil. |
| Q-022 | Biyokütle paçal kalori değeri ölçülen mi, hesaplanan mı | `PARTIALLY_RESOLVED` | DEC-0017 D-12/D-17: kalori laboratuvarda ölçülür (`KALORI HESAP.xlsx` G6→G7), ağırlıklı ortalama veri gelene kadar yok. Formülün tam doğrulaması (TBD-L02) hâlâ açık. |
| Q-023 | Su analiz parametreleri, limitleri, sıklıkları | `EXTERNAL_VALIDATION_REQUIRED` | DEC-0017 D-13 — laboratuvarın gerçek kriter verisi gerekir. |
| Q-024 | Netsis üretim tetikleme entegrasyonunun veri sözleşmesi | `EXTERNAL_VALIDATION_REQUIRED` | DEC-0017 D-05 — kantar SoR'u geçici Netsis kabul edildi, teknik sözleşme dış doğrulama bekliyor. |

## 28.3 Wave 5 TBD'leri (§13.2, §14, §16.2, §18) ve `TBD-W5-00x`

Hepsi `RESOLVED` — DEC-0015 (Q-W501–Q-W515, 2026-09-23) ile kapandı; kapanış notları ilgili
bölümlerin hemen altına da işlendi (§13.2, §14, §16.2, §18). `TBD-W5-001–004` (sanal kolon
operatör/null/limit/derinlik) → Q-W504; `TBD-W5-005` (minimum istatistik sıfır) → Q-W509;
`TBD-W5-006` (ekip/tenant preset) → Q-W506.

## 28.4 DEC-0017 Açık Statüleri (Wave 2/3 dışı laboratuvar/Kırım/kantar alanı)

| ID | Konu | Durum |
|---|---|---|
| D-04 | MOSB/MOSB ENERJİ/MOSBİO tenant dili uyumu | `TBD` — ayrı, henüz `ready` olmayan uyum task'ı gerekir |
| D-05 (teknik) | Netsis entegrasyon anahtarları/veri sözleşmesi | `EXTERNAL_VALIDATION_REQUIRED` |
| D-11 | Kepçe ölçüm cihazı entegrasyonu (TBD-K01–K04) | `EXTERNAL_VALIDATION_REQUIRED` |
| D-12 (formül) | `KALORI HESAP.xlsx` tam formül/birim/test doğrulaması (TBD-L02) | `EXTERNAL_VALIDATION_REQUIRED` |
| D-13 | Ürün/parametre bazlı başlangıç kalite limitleri (TBD-L04, Q-023) | `EXTERNAL_VALIDATION_REQUIRED` |
| D-18 | Nihai paçal miktarının ayrıca ölçülmesi (TBD-G02) | `OUT_OF_SCOPE` — ileride değerlendirilecek |
| D-20 | Rapor kolonları ve Jasper şablonları (TBD-L01) | `EXTERNAL_VALIDATION_REQUIRED` |

## 28.5 Wave 2/3 ve Diğer Gelecek Adayları

§11.3 (Bakım/Arıza), §11.4 (DÖF), §21.2 (Buhar arz marjı), §21.3 (Sıcak su), §23 (hafif no-code
genel amaçlı designer/script/SQL/low-code istisnaları) — tümü `OUT_OF_SCOPE`: mevcut geliştirme
programının implementation kapsamında değildir, ancak ayrı Discovery/SRS ve açık Product Owner
onayıyla yeniden ele alınabilir (§11.6, §4.2 ile tutarlı).
