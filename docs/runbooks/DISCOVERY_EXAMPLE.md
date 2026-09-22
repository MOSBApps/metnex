# Müşteri Görüşme ve İhtiyaç Toplama Dokümanı

## 1. Görüşme Bilgileri

| Alan | Bilgi |
|---|---|
| Proje / Ürün Adı | MOSB Ziyaretçi ve Randevu Yönetim Sistemi |
| Müşteri / Birim | MOSB |
| Görüşme Tarihi | 09.09.2026 |
| Görüşme No | 1 |
| Katılımcılar | İlgili MOSB birimleri, Proje Ekibi |
| Notları Alan | Proje Ekibi |
| Doküman Sürümü | 0.1 |

---

# 2. Projenin Özeti

## 2.1 İhtiyaç

MOSB'ye gelecek ziyaretçilerin önceden kayıt altına alınabileceği ve güvenlik personelinin bu kayıtları kullanarak ziyaretçinin giriş ve çıkışını takip edebileceği merkezi bir uygulamaya ihtiyaç vardır.

Çalışanlar kendilerine veya birimlerine gelecek ziyaretçiler için önceden ziyaret kaydı oluşturabilmelidir.

Güvenlik personeli gelen kişinin planlanmış bir ziyareti olup olmadığını görebilmeli ve ziyaretçi geldiğinde giriş işlemini gerçekleştirebilmelidir.

Ziyaretçinin MOSB'den ayrılması sırasında da çıkış işlemi yapılarak ziyaretin tamamlandığı kayıt altına alınmalıdır.

Yönetim tarafında ise ziyaretlere ilişkin genel durumun görülebilmesi ve geçmiş kayıtların incelenebilmesi istenmektedir.

---

## 2.2 Beklenen Sonuç

Proje tamamlandığında:

- Planlı ziyaretler merkezi olarak kayıt altına alınabilmelidir.
- Güvenlik personeli beklenen ziyaretçileri görebilmelidir.
- Ziyaretçinin giriş yaptığı zaman kayıt altına alınabilmelidir.
- MOSB içerisinde bulunan ziyaretçiler görülebilmelidir.
- Ziyaretçinin çıkış yaptığı zaman kayıt altına alınabilmelidir.
- Geçmiş ziyaretler sorgulanabilmelidir.
- Yetkisiz kullanıcıların kendilerine ait olmayan işlemleri yapması engellenmelidir.
- Günlük ziyaret durumu özet olarak izlenebilmelidir.

---

# 3. Mevcut Durum

Ziyaretçi bilgilerinin farklı yöntemlerle güvenlik birimine iletilmesi nedeniyle ziyaretlerin merkezi ve standart bir şekilde takip edilmesi güçtür.

Çalışanların gelecek ziyaretçilerini önceden sisteme kaydetmesini ve güvenliğin bu kayıtları doğrudan görmesini sağlayacak ortak bir uygulama bulunması istenmektedir.

İlk aşamada mevcut sistemlerle entegrasyon düşünülmemektedir.

### Kullanılan Araçlar / Sistemler

Mevcut yöntemler birimler arasında değişebilmektedir.

### Temel Sorunlar

- Ziyaret bilgilerinin standart biçimde tutulmaması.
- Güvenlik personelinin beklenen ziyaretçiler hakkında merkezi bir listeye sahip olmaması.
- Ziyaretçinin giriş ve çıkış zamanlarının merkezi olarak takip edilememesi.
- O anda içeride bulunan ziyaretçilerin kolayca görülememesi.
- Geçmiş ziyaret bilgilerinin merkezi olarak sorgulanamaması.

---

# 4. Kullanıcılar ve Paydaşlar

| Kullanıcı / Paydaş | Rolü | Sistemi Nasıl Kullanacak? |
|---|---|---|
| MOSB Çalışanı | Ziyaret sahibi | Gelecek ziyaretçiler için ziyaret kaydı oluşturacak ve kendi ziyaretlerini takip edecek |
| Güvenlik Personeli | Giriş / çıkış işlemleri | Günün beklenen ziyaretçilerini görecek, giriş ve çıkış işlemlerini yapacak |
| Sistem Yöneticisi | Yönetim | Tüm ziyaretleri ve kullanıcıları görebilecek, kullanıcı rollerini yönetebilecek |
| MOSB Yönetimi | İzleme | Gerektiğinde ziyaret bilgilerini ve özet raporları inceleyecek |

---

# 5. Proje Kapsamı

## 5.1 Kapsam Dahilinde

İlk sürümde aşağıdaki fonksiyonların bulunması beklenmektedir:

- Kullanıcı girişi
- Kullanıcı rolleri ve yetkilendirme
- Ziyaretçi bilgilerinin kaydedilmesi
- Planlı ziyaret oluşturulması
- Ziyaret sahibinin belirlenmesi
- Beklenen ziyaretçilerin görüntülenmesi
- Ziyaretçi giriş işlemi
- Ziyaretçi çıkış işlemi
- İçeride bulunan ziyaretçilerin görüntülenmesi
- Geçmiş ziyaretlerin görüntülenmesi
- Günlük ziyaret özetlerinin görüntülenmesi
- Ziyaret kaydının iptal edilebilmesi

## 5.2 Kapsam Dışında

İlk sürümde aşağıdaki konular düşünülmemektedir:

- Turnike entegrasyonu
- Plaka tanıma sistemi
- QR kod ile giriş
- SMS gönderimi
- E-posta bildirimi
- Kimlik kartı / T.C. kimlik kartı okuma
- Active Directory / Entra ID entegrasyonu
- Ziyaretçiye ait KVKK onay süreçlerinin sistem üzerinden yürütülmesi
- Mobil uygulama

## 5.3 Gelecek Fazlarda Değerlendirilecekler

İhtiyaç halinde sonraki sürümlerde:

- QR kod ile ziyaretçi doğrulama
- E-posta veya SMS bildirimi
- Plaka bilgilerinin tutulması
- Plaka tanıma sistemi entegrasyonu
- Turnike / geçiş kontrol sistemi entegrasyonu
- Kurumsal kullanıcı dizini entegrasyonu
- Ziyaretçi KVKK süreçleri
- Gelişmiş raporlama

değerlendirilebilir.

---

# 6. İşlevsel Kapsam ve Modüller

Modül isimleri ve sınırları proje analizi sırasında değiştirilebilir. Aşağıdaki yapı müşterinin mevcut beklentisini ifade etmektedir.

## M-001 – Kullanıcı ve Yetkilendirme

### Amaç

Sistemi kullanan MOSB personelinin yetkilerine göre işlem yapabilmesi.

### Kullanıcılar

- MOSB çalışanı
- Güvenlik personeli
- Sistem yöneticisi

### Beklenen Temel İşlevler

- Kullanıcı sisteme giriş yapabilmeli.
- Kullanıcının rolüne göre görebileceği ekranlar ve yapabileceği işlemler değişmeli.
- Normal çalışanlar yalnızca kendi oluşturdukları ziyaretleri yönetebilmeli.
- Güvenlik personeli ziyaretlerin giriş ve çıkış işlemlerini yapabilmeli.
- Sistem yöneticisi tüm kayıtları görebilmeli ve kullanıcı rollerini yönetebilmeli.

---

## M-002 – Ziyaretçi Yönetimi

### Amaç

MOSB'ye gelen kişilere ait temel bilgilerin kayıt altına alınması.

### Beklenen Temel İşlevler

- Ziyaretçinin adı kaydedilmeli.
- Soyadı kaydedilmeli.
- Firma bilgisi kaydedilebilmeli.
- Telefon bilgisi kaydedilebilmeli.

Aynı kişinin daha önce gelmiş olması durumunda tekrar kayıt oluşturulmasının nasıl ele alınacağı proje analizi sırasında değerlendirilmelidir.

---

## M-003 – Ziyaret Planlama

### Amaç

MOSB çalışanlarının gelecek ziyaretlerini önceden sisteme bildirebilmesi.

### Beklenen Temel İşlevler

Ziyaret oluşturulurken en az:

- ziyaretçi,
- ziyaretçinin firması,
- ziyaret tarihi,
- beklenen geliş saati,
- ziyaret edilecek MOSB çalışanı,
- ziyaret amacı

bilgileri girilebilmelidir.

Ziyaret oluşturulduğunda başlangıç durumu **Bekleniyor** olmalıdır.

Ziyaret sahibi kendi oluşturduğu ve henüz gerçekleşmemiş ziyareti iptal edebilmelidir.

---

## M-004 – Güvenlik / Giriş-Çıkış İşlemleri

### Amaç

Güvenlik personelinin planlanan ziyaretleri görmesi ve ziyaretçinin MOSB'ye giriş ve çıkışını kayıt altına alması.

### Beklenen Temel İşlevler

- Güvenlik personeli bugünün beklenen ziyaretçilerini görebilmeli.
- Ziyaretçi geldiğinde ilgili ziyaret kaydı bulunabilmeli.
- Giriş işlemi yapılabilmeli.
- Gerçek giriş zamanı sistem tarafından kaydedilmeli.
- Giriş yapılan ziyaretin durumu **İçeride** olmalı.
- Ziyaretçi ayrıldığında çıkış işlemi yapılabilmeli.
- Gerçek çıkış zamanı kaydedilmeli.
- Çıkış yapılan ziyaretin durumu **Çıktı** olmalı.
- Güvenlik personeli o anda içeride bulunan ziyaretçileri görebilmeli.

---

## M-005 – Dashboard ve Raporlama

### Amaç

Günün ziyaret durumunun hızlı şekilde görülebilmesi.

### Beklenen Temel İşlevler

En az aşağıdaki bilgiler gösterilmelidir:

- Bugün beklenen ziyaretçi sayısı
- Şu anda içeride bulunan ziyaretçi sayısı
- Bugün çıkış yapmış ziyaretçi sayısı

Geçmiş ziyaretlerin tarih ve ziyaretçi gibi temel kriterlerle aranabilmesi istenmektedir.

Raporlama ihtiyaçları kullanım sonrasında genişletilebilir.

---

# 7. Özellik / Feature Talepleri

## F-001 – Planlı Ziyaret Oluşturma

### İlgili Modül / İş Alanı

M-003 – Ziyaret Planlama

### Talep / İhtiyaç

MOSB çalışanı kendisini ziyaret edecek bir kişi için önceden ziyaret kaydı oluşturabilmelidir.

### İş Gerekçesi

Güvenlik personelinin ziyaretçi gelmeden önce ziyaretten haberdar olması istenmektedir.

### Kullanıcılar

MOSB çalışanları.

### Beklenen Davranış

Çalışan yeni ziyaret oluşturur ve ziyaretçi ile ziyaret bilgilerini girer.

Kaydedilen ziyaret güvenlik personeli tarafından görüntülenebilir hale gelir.

### Bilinen İş Kuralları

- Ziyaret tarihi zorunlu olmalıdır.
- Ziyaretçi adı ve soyadı zorunlu olmalıdır.
- Ziyaret sahibi belirlenmiş olmalıdır.
- Yeni ziyaretin durumu Bekleniyor olmalıdır.

### Öncelik

- [x] Kritik

### Faz

- [x] MVP

### Durum

- [x] Onaylandı

---

## F-002 – Günlük Beklenen Ziyaretçiler

### İlgili Modül / İş Alanı

M-004 – Güvenlik / Giriş-Çıkış İşlemleri

### Talep / İhtiyaç

Güvenlik personeli o gün gelmesi beklenen ziyaretçileri tek ekranda görebilmelidir.

### İş Gerekçesi

Güvenlik personelinin gelen kişinin planlanmış ziyaretini hızlı şekilde bulabilmesi gerekmektedir.

### Kullanıcılar

Güvenlik personeli.

### Beklenen Davranış

Güvenlik ekranında günün ziyaretleri listelenir.

Ziyaretçi geldiğinde güvenlik ilgili kaydı seçerek giriş işlemini gerçekleştirir.

### Öncelik

- [x] Kritik

### Faz

- [x] MVP

### Durum

- [x] Onaylandı

---

## F-003 – Ziyaretçi Girişi

### İlgili Modül / İş Alanı

M-004 – Güvenlik / Giriş-Çıkış İşlemleri

### Talep / İhtiyaç

Güvenlik personeli ziyaretçinin geldiğini sistemde kayıt altına alabilmelidir.

### Beklenen Davranış

Güvenlik ziyaret kaydını bulur ve giriş işlemi yapar.

Sistem gerçek giriş zamanını kaydeder.

Ziyaretin durumu:

**Bekleniyor → İçeride**

olarak değişir.

### Bilinen İş Kuralları

- Giriş işlemini güvenlik personeli yapabilmelidir.
- Giriş zamanı otomatik kaydedilmelidir.

### Öncelik

- [x] Kritik

### Faz

- [x] MVP

### Durum

- [x] Onaylandı

---

## F-004 – Ziyaretçi Çıkışı

### İlgili Modül / İş Alanı

M-004 – Güvenlik / Giriş-Çıkış İşlemleri

### Talep / İhtiyaç

Ziyaretçinin MOSB'den ayrıldığı kayıt altına alınabilmelidir.

### Beklenen Davranış

Güvenlik içeride bulunan ziyaretçiyi seçerek çıkış işlemi yapar.

Sistem gerçek çıkış zamanını kaydeder.

Ziyaretin durumu:

**İçeride → Çıktı**

olarak değişir.

### Öncelik

- [x] Kritik

### Faz

- [x] MVP

### Durum

- [x] Onaylandı

---

## F-005 – İçerideki Ziyaretçilerin Görüntülenmesi

### İlgili Modül / İş Alanı

M-004 – Güvenlik / Giriş-Çıkış İşlemleri

### Talep / İhtiyaç

Herhangi bir anda MOSB içerisinde hangi ziyaretçilerin bulunduğu görülebilmelidir.

### İş Gerekçesi

Özellikle güvenlik ve acil durum açısından içeride bulunan ziyaretçilerin bilinmesi gerekmektedir.

### Kullanıcılar

- Güvenlik
- Sistem yöneticisi

### Öncelik

- [x] Kritik

### Faz

- [x] MVP

### Durum

- [x] Onaylandı

---

## F-006 – Ziyaret İptali

### İlgili Modül / İş Alanı

M-003 – Ziyaret Planlama

### Talep / İhtiyaç

Planlanan ziyaret gerçekleşmeyecekse ziyaret sahibi kaydı iptal edebilmelidir.

### Bilinen İş Kuralları

Giriş yapılmış bir ziyaretin normal kullanıcı tarafından iptal edilmemesi gerektiği düşünülmektedir.

### Öncelik

- [x] Yüksek

### Faz

- [x] MVP

### Durum

- [ ] Onaylandı
- [x] Netleştirilecek

---

## F-007 – Günlük Dashboard

### İlgili Modül / İş Alanı

M-005 – Dashboard ve Raporlama

### Talep / İhtiyaç

Günün ziyaret durumunun özet olarak görülebileceği bir ekran istenmektedir.

### Beklenen İçerik

- Beklenen
- İçeride
- Çıkış yapan

ziyaretçi sayıları.

### Öncelik

- [x] Orta

### Faz

- [x] MVP

### Durum

- [x] Onaylandı

---

## F-008 – Geçmiş Ziyaretlerin Aranması

### İlgili Modül / İş Alanı

M-005 – Dashboard ve Raporlama

### Talep / İhtiyaç

Daha önce gerçekleşmiş ziyaretler aranabilmelidir.

### Beklenen Arama Kriterleri

En az:

- Tarih
- Ziyaretçi adı / soyadı

üzerinden arama yapılabilmesi istenmektedir.

Firma veya ziyaret edilen çalışan üzerinden arama ihtiyacı ayrıca değerlendirilebilir.

### Öncelik

- [x] Orta

### Faz

- [x] MVP

### Durum

- [ ] Onaylandı
- [x] Netleştirilecek

---

# 8. Ziyaret Durumları

Şimdilik aşağıdaki durumların yeterli olacağı düşünülmektedir:

| Durum | Açıklama |
|---|---|
| Bekleniyor | Ziyaret planlandı ancak ziyaretçi henüz gelmedi |
| İçeride | Ziyaretçi giriş yaptı ve henüz çıkış yapmadı |
| Çıktı | Ziyaretçi çıkış yaptı |
| İptal | Planlanan ziyaret iptal edildi |

Başka durumlara ihtiyaç olup olmadığı analiz sırasında değerlendirilmelidir.

---

# 9. Veri İhtiyaçları

## Kullanıcı

Bilinen temel bilgiler:

- Ad
- Soyad
- E-posta
- Rol

## Ziyaretçi

Bilinen temel bilgiler:

- Ad
- Soyad
- Firma
- Telefon

## Ziyaret

Bilinen temel bilgiler:

- Ziyaretçi
- Ziyaret edilecek çalışan
- Ziyaret tarihi
- Beklenen geliş saati
- Ziyaret amacı
- Durum
- Gerçek giriş zamanı
- Gerçek çıkış zamanı
- Kaydı oluşturan kullanıcı
- Kayıt oluşturma zamanı

Verilerin kesin yapısı teknik analiz sırasında belirlenecektir.

---

# 10. Roller ve Yetkiler

## EMPLOYEE – MOSB Çalışanı

- Ziyaret oluşturabilir.
- Kendi oluşturduğu ziyaretleri görebilir.
- Uygun durumdaki kendi ziyaretini iptal edebilir.
- Diğer çalışanların ziyaretlerini görmemelidir.

## SECURITY – Güvenlik

- Günlük ziyaretleri görebilir.
- Beklenen ziyaretçileri görebilir.
- Giriş işlemi yapabilir.
- Çıkış işlemi yapabilir.
- İçeride bulunan ziyaretçileri görebilir.

## ADMIN – Sistem Yöneticisi

- Tüm ziyaretleri görebilir.
- Kullanıcıları görebilir.
- Kullanıcı rollerini yönetebilir.
- Raporlara erişebilir.

Admin kullanıcısının ziyaret kayıtlarını değiştirme yetkisinin olup olmayacağı ayrıca değerlendirilmelidir.

---

# 11. Raporlama ve Dashboard İhtiyaçları

| Rapor / Gösterge | Kullanıcı | Beklenen İçerik |
|---|---|---|
| Bugün Beklenenler | Güvenlik / Admin | Bugün gelmesi beklenen ziyaretçiler |
| İçerideki Ziyaretçiler | Güvenlik / Admin | Giriş yapmış ancak çıkış yapmamış ziyaretçiler |
| Bugün Çıkış Yapanlar | Güvenlik / Admin | Bugün çıkış işlemi yapılan ziyaretçiler |
| Geçmiş Ziyaretler | Admin | Önceki ziyaret kayıtları |

İlk sürüm için grafiksel raporlar gerekli değildir.

---

# 12. Entegrasyonlar

MVP için dış sistem entegrasyonu beklenmemektedir.

Gelecek fazlarda aşağıdaki entegrasyonlar değerlendirilebilir:

- Active Directory / Entra ID
- E-posta
- SMS
- Turnike / geçiş kontrol
- Plaka tanıma

---

# 13. Güvenlik ve Yetkilendirme

- Sistem kullanıcı adı / e-posta ve parola ile çalışabilir.
- Kullanıcılar rollerine göre yetkilendirilmelidir.
- Kullanıcı başka kullanıcıya ait yetkisiz verilere erişememelidir.
- Güvenlik personeli giriş ve çıkış işlemlerini gerçekleştirebilmelidir.
- Kritik işlemlerin kim tarafından ve ne zaman yapıldığının kayıt altına alınması istenmektedir.
- Parolalar açık biçimde saklanmamalıdır.

KVKK kapsamında tutulabilecek ziyaretçi bilgilerinin saklama süresi ve silme politikası ilgili birimlerle ayrıca değerlendirilmelidir.

---

# 14. Teknik / Operasyonel Beklentiler

- Uygulama web tabanlı olmalıdır.
- Masaüstü bilgisayarlardan kullanılabilmelidir.
- Güvenlik noktasındaki bilgisayarlardan kullanılabilmelidir.
- Güncel web tarayıcıları desteklenmelidir.
- Uygulamanın MOSB test ortamında yayınlanması beklenmektedir.
- Kullanıcı sayısı ve eş zamanlı kullanıcı sayısı henüz belirlenmemiştir.
- Kesinti toleransı henüz belirlenmemiştir.
- Yedekleme gereksinimleri teknik analiz sırasında belirlenecektir.

Teknik ekip tarafından React, NestJS, PostgreSQL ve Docker kullanılması değerlendirilmektedir. Bunun müşteri iş gereksinimi olmadığı, teknik ekip tarafından verilen bir karar olduğu dikkate alınmalıdır.

---

# 15. Kısıtlar

- İlk sürüm eğitim projesi kapsamında geliştirilecektir.
- İlk sürümün kapsamı kontrollü tutulmalıdır.
- MVP sonunda çalışan ve MOSB test ortamında erişilebilir bir uygulama ortaya çıkmalıdır.
- İlk sürümde harici sistem entegrasyonlarından kaçınılmalıdır.
- Geliştirme sırasında sonraki fazlarda genişletilebilir bir yapı tercih edilmelidir.

---

# 16. Varsayımlar

| ID | Varsayım |
|---|---|
| A-001 | İlk sürümde kullanıcılar uygulama içerisinde tanımlanacaktır. |
| A-002 | Dış kimlik doğrulama sistemi kullanılmayacaktır. |
| A-003 | Güvenlik personelinin sisteme erişebileceği bilgisayar ve ağ bağlantısı bulunmaktadır. |
| A-004 | MVP'de ziyaretçi tarafından doğrudan kullanılan bir ekran bulunmayacaktır. |
| A-005 | Bir ziyaretin tek bir ziyaret sahibi olacaktır. |

Bu varsayımlar SRS hazırlanırken müşteri gereksinimi olarak kabul edilmemeli, gerektiğinde doğrulanmalıdır.

---

# 17. Açık Sorular

| ID | Soru | Muhatap | Durum | Cevap |
|---|---|---|---|---|
| Q-001 | Aynı ziyaretçi tekrar geldiğinde mevcut ziyaretçi kaydı mı kullanılacak? | Müşteri | Açık | |
| Q-002 | Plansız gelen ziyaretçiler için güvenlik yeni ziyaret kaydı oluşturabilecek mi? | Müşteri | Açık | |
| Q-003 | Bir ziyaretin birden fazla ziyaretçisi olabilir mi? | Müşteri | Açık | |
| Q-004 | Ziyaret sahibi değiştirilebilir mi? | Müşteri | Açık | |
| Q-005 | Giriş yapılmış bir ziyaret iptal edilebilir mi? | Müşteri | Açık | |
| Q-006 | Yanlış yapılan giriş veya çıkış işlemi nasıl düzeltilecek? | Müşteri | Açık | |
| Q-007 | Admin ziyaret kayıtlarını değiştirebilecek mi? | Müşteri | Açık | |
| Q-008 | Telefon bilgisi zorunlu olacak mı? | Müşteri | Açık | |
| Q-009 | Ziyaretçi verileri ne kadar süre saklanacak? | İlgili Birim | Açık | |
| Q-010 | Kullanıcı ve eş zamanlı kullanıcı sayısı nedir? | Müşteri / BT | Açık | |
| Q-011 | Ziyaretin bir bitiş / beklenen çıkış saati olacak mı? | Müşteri | Açık | |
| Q-012 | Geçmiş ziyaretlerde hangi arama ve filtreleme kriterleri gerekli? | Müşteri | Açık | |

---

# 18. Kararlar

| ID | Karar | Tarih | Karar Veren |
|---|---|---|---|
| D-001 | İlk sürüm web uygulaması olacaktır. | 09.09.2026 | Proje Ekibi / Müşteri |
| D-002 | MVP'de dış sistem entegrasyonu yapılmayacaktır. | 09.09.2026 | Proje Ekibi / Müşteri |
| D-003 | MVP'de EMPLOYEE, SECURITY ve ADMIN olmak üzere üç temel rol bulunacaktır. | 09.09.2026 | Proje Ekibi / Müşteri |
| D-004 | Temel ziyaret durumları Bekleniyor, İçeride, Çıktı ve İptal olacaktır. | 09.09.2026 | Proje Ekibi / Müşteri |

---

# 19. Aksiyonlar

| ID | Aksiyon | Sorumlu | Hedef Tarih | Durum |
|---|---|---|---|---|
| AC-001 | Açık soruların müşteri ile netleştirilmesi | Proje Ekibi | TBD | Açık |
| AC-002 | Discovery dokümanının müşteri tarafından gözden geçirilmesi | Müşteri | TBD | Açık |
| AC-003 | Onaylanan Discovery dokümanından SRS oluşturulması | AI0 / Proje Ekibi | TBD | Bekliyor |

---

# 20. Sonraki Görüşme

Bir sonraki görüşmede özellikle aşağıdaki konular netleştirilecektir:

1. Plansız ziyaretçi süreci
2. Tek ziyarette birden fazla ziyaretçi ihtiyacı
3. Yanlış giriş / çıkış işlemlerinin düzeltilmesi
4. Ziyaretçi bilgilerinin tekrar kullanılması
5. Veri saklama süresi
6. Admin yetkileri
7. Geçmiş ziyaret arama kriterleri

---

# 21. Ek Notlar

Bu doküman yazılım tasarım dokümanı değildir.

Dokümanın amacı müşterinin ihtiyaçlarını, beklentilerini, kararlarını ve henüz netleşmemiş konuları kayıt altına almaktır.

Teknik çözüm, sistem mimarisi ve ayrıntılı yazılım gereksinimleri SRS çalışması sırasında oluşturulacaktır.