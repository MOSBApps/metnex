# metnex Son Kullanıcı Kılavuzu (TR)

Sürüm: v1.2
Tarih: 2026-03-09
Hedef kitle: Son kullanıcılar, birim yöneticileri, iç tetkik ekipleri, sistem yöneticileri

---

## 1) Bu Doküman Ne İçin?

Bu kılavuz, metnex uygulamasını ilk kez kullanacak ekiplerin sistemi hızlıca anlayıp doğru kullanabilmesi için hazırlanmıştır.

Bu dokümanda şunlar vardır:

- Roller ve yetkiler
- Uygulamanın genel çalışma mantığı
- Tüm ana modüllerin adım adım kullanımı
- Gerçek hayata yakın örnek kullanım senaryoları
- Sık hatalar ve çözüm önerileri

---

## 2) metnex Nedir?

metnex, birden fazla standardı (ör. ISO 9001, ISO 14001, ISO 45001, ISO 27001, ISO 50001, ISO 46001) tek platformda yönetmek için kullanılan çok kiracılı (multi-tenant) bir yönetim sistemidir.

Temel işlevler:

- Stratejik hedef ve KPI yönetimi
- İç tetkik planlama ve yürütme
- Bulgu / uygunsuzluk / düzeltici faaliyet yönetimi
- Yönetim gözden geçirme (YGG)
- Yetkinlik değerlendirme
- Organizasyonel referans veri yönetimi (departman, lokasyon, süreç vb.)
- Kontrol kütüphanesi ve risk-kontrol ilişkilendirmesi
- Risk kaydı ve risk azaltma takibi

---

## 3) Temel Kavramlar

| Kavram | Açıklama |
| --- | --- |
| Tenant | Sistemdeki kurum/şirket alanı |
| Holding Tenant | Üst kurum alanı |
| Membership | Kullanıcının bir tenant içindeki rol ilişkisi |
| Role | Kullanıcı yetki seviyesi |
| Checklist | Tetkik sorularının yürütüldüğü kontrol listesi |
| Finding | Tetkik bulgusu |
| Nonconformity | Uygunsuzluk (DÖF süreci ile ilişkili) |
| Action | Aksiyon kaydı (iyileştirme, önleyici, düzeltici vb.) |
| YGG | Yönetim Gözden Geçirme toplantı kaydı |

---

## 4) Roller ve Yetki Çerçevesi

Platformdaki temel roller:

| Rol | Kapsam |
| --- | --- |
| SUPER_ADMIN | Tüm platform üzerinde en yüksek yetki |
| HOLDING_ADMIN | Holding seviyesinde yönetim |
| TENANT_ADMIN | Tenant içinde genel yönetim |
| AUDIT_ADMIN | İç tetkik yapılandırma/yönetim |
| LEAD_AUDITOR | Tetkik lideri rolü |
| AUDITOR | Tetkikçi rolü |
| AUDITEE | Tetkik edilen kullanıcı |
| PERFORMANCE_ADMIN | Performans/KPI yönetimi |
| STRATEGY_ADMIN | Stratejik plan yönetimi |
| REVIEW_ADMIN | YGG yönetimi |
| NONCONFORMITY_ADMIN | Uygunsuzluk yönetimi |
| ACTION_ADMIN | Aksiyon yönetimi |
| COMPLIANCE_ADMIN | Uyum/çerçeve/yetkinlik seti yönetimi |
| COMPETENCY_ADMIN | Yetkinlik modülü yönetimi |
| PROCESS_OWNER | Süreç sahibi operasyonel rol |
| VIEWER | Sadece görüntüleme |

Not:

- Bir kullanıcı birincil role ek olarak ek fonksiyonel role sahip olabilir.
- Kullanıcı birden fazla tenant üyesi olabilir.
- Kullanıcı girişte tenant seçebilir.

---

## 5) İlk Kullanım Akışı

### 5.1 İlk Kurulum (Sadece ilk açılışta)

Ekran: `Kurulum (Setup)`

Adımlar:

1. Kurum adı girin.
2. Kurum kısa adı girin (opsiyonel).
3. Tenant slug belirleyin (küçük harf/rakam/-).
4. İlk yönetici e-posta ve şifresini girin.
5. Kurulumu tamamlayın.

Sonuç:

- Tenant oluşturulur.
- Yönetici hesap açılır.
- Login ekranına yönlendirilirsiniz.

### 5.2 Giriş

Ekran: `Login`

Adımlar:

1. E-posta + şifre girin.
2. 2FA aktifse e-posta OTP kodunu girin.
3. Birden fazla tenant üyeliğiniz varsa kurum seçin.

### 5.3 Şifre Sıfırlama

Akış:

1. `Şifremi Unuttum` tıklayın.
2. E-postaya gelen kod ile yeni şifre belirleyin.

---

## 6) Ana Menü ve Genel Navigasyon

Ana modül grupları:

- Dashboard
- Stratejik Plan
- Yönetim
- İç Tetkik ve Uyum
- DÖF / Aksiyonlar
- Performans
- Risk Yönetimi
- Kontrol Kütüphanesi
- Yetkinlik
- Ayarlar
- Profil

Kullanıcı, rolüne göre farklı menü görür.

---

## 7) Dashboard (Ana Ekran)

Amaç:

- Güncel durumu tek ekrandan görmek.

İçerik:

- Açık tetkikler
- Bekleyen YGG kayıtları
- Aksiyon durumu
- Kişiye atanmış tetkik görevleri
- Yaklaşan ve geciken gündem

Örnek:

- Bir tetkikçi dashboard’a girdiğinde “Atanmış tetkiklerim” alanını görür.
- Bir yönetici “açık aksiyon” sayısını görüp doğrudan Aksiyon modülüne geçer.

---

## 8) Stratejik Plan Modülü

Ekranlar:

- `Vizyon & Misyon`
- `Stratejik Yönetişim`
- `Hedefler / Amaçlar`

### 8.1 Vizyon & Misyon

Ne yapılır:

- Kurumun vizyon/misyon metni oluşturulur.
- Geçmiş versiyonlar izlenebilir.

### 8.2 Stratejik Yönetişim

Ne yapılır:

- Stratejik hedefler süreçlerle ilişkilendirilir.
- Hedef-KPI ilişkileri kurulur.

### 8.3 Hedef Yönetimi

Ne yapılır:

- Hedef ekleme/güncelleme/silme
- Hedefe KPI bağlama
- Hedefe süreç alanı bağlama

Örnek senaryo:

1. “Müşteri memnuniyetini artırma” hedefi aç.
2. Hedefe “şikayet kapanma süresi” KPI’ını bağla.
3. İlgili süreç olarak “Müşteri İlişkileri”ni ekle.

---

## 9) Yönetim Modülü (Referans Veri ve Uyum Altyapısı)

Ekranlar:

- `Departmanlar`
- `Lokasyonlar`
- `Süreç Alanları`
- `Çerçeveler`
- `Soru Bankası`
- `Özel Sorular`
- `Referans Veri`

### 9.1 Departmanlar

Ne yapılır:

- Departman kartları oluşturulur, düzenlenir, pasiflenir.

### 9.2 Lokasyonlar

Ne yapılır:

- Tesis/ofis/lokasyon tanımı yapılır.

### 9.3 Süreç Alanları

Ne yapılır:

- Süreç alanı tanımlanır.
- Departmanlarla ilişkilendirilir.

### 9.4 Çerçeveler (Compliance Framework)

Ne yapılır:

- Kuruma özel framework oluşturulur.
- Framework maddeleri/soruları eklenir.

### 9.5 Soru Bankası

Ne yapılır:

- Standartlara göre sorular listelenir.
- Arama ve filtre yapılır.
- Tetkik için kullanılacak soru havuzu yönetilir.

### 9.6 Referans Veri

Ne yapılır:

- Referans veriler toplu import edilir.

Örnek senaryo:

1. Önce departmanları aç.
2. Lokasyonları ekle.
3. Süreç alanlarını departmanlara bağla.
4. Sonra tetkik planlamaya geç.

---

## 10) İç Tetkik Modülü

Ekranlar:

- `İç Tetkikler` listesi
- `Yeni Tetkik`
- `Tetkik Detayı`
- `Tetkik Atamaları`
- `Checklist/Değerlendirme`

### 10.1 Tetkik Programı

Ne yapılır:

- Yıllık/periodik tetkik programı oluşturulur.

### 10.2 Tetkik Kaydı

Ne yapılır:

- Tetkik başlatılır.
- Lider tetkikçi ve ekip atanır.
- Plan tarihleri belirlenir.

### 10.3 Tetkik Yaşam Döngüsü

Durumlar:

- Planlandı
- Başladı
- Tamamlandı

### 10.4 Atamalar

Ne yapılır:

- Tetkik soruları tetkikçilere atanır.
- Toplu atama yapılabilir.

### 10.5 Checklist

Ne yapılır:

- Standartlardan checklist başlatılır.
- Özel soru eklenebilir.
- Cevaplar ve kanıtlar girilir.

### 10.6 Bulgular

Ne yapılır:

- Tetkik içinde bulgu açılır.
- Bulgular aksiyon veya uygunsuzluk süreçlerine bağlanır.

Örnek senaryo:

1. Yeni tetkik aç.
2. Süreç alanı ve ekip atamasını yap.
3. Checklist’i standarttan başlat.
4. Cevapları gir, kanıt yükle.
5. Bulgu aç, aksiyon oluştur.
6. Tetkiki tamamla.

---

## 11) Uygunsuzluk (DÖF) Modülü

Konum: `Uyumluluk → Uygunsuzluklar`

### 11.1 Durum Akışı (Risk-Temelli)

```text
OPEN → RCA_IN_PROGRESS → ACTION_PLANNED → ACTION_DONE → VERIFIED → CLOSED
              ↓ (RCA gerekmiyorsa)
        ACTION_PLANNED
```

| Durum | Açıklama |
| ----- | -------- |
| OPEN | Tetkik bulgusundan otomatik veya manuel oluşturulur |
| RCA_IN_PROGRESS | NC Manager RCA kararı verdi; komisyon kuruldu |
| ACTION_PLANNED | Düzeltici faaliyet planlandı |
| ACTION_DONE | Sorumlu tamamlandı işaretledi |
| VERIFIED | Baş tetkikçi doğruladı |
| CLOSED | NC Manager kapattı |

### 11.2 NC Manager İşlemleri

- RCA kararı: "RCA Gerekli" → komisyon üyeleri seçilir, email gönderilir
- RCA gerekmiyorsa: direkt düzeltici faaliyet planla
- Toplantı ayarlama (yetersiz feedback durumunda)
- KNA sonuçlandırma (kök neden + önleyici faaliyetler)
- Nihai kapatma

### 11.3 Sorumlu (Owner) İşlemleri

- Düzeltici faaliyeti uygula
- "Tamamlandı İşaretle" butonu ile ACTION_DONE'a geç

### 11.4 Doğrulayıcı (Verifier) İşlemleri

- Baş tetkikçi olarak otomatik atanır
- Onayla → VERIFIED
- İade et → ACTION_PLANNED'a geri döner (owner'a email)

### 11.5 RCA Komisyonu İşlemleri

- Email ile davet edilir
- `/compliance/nonconformities/[id]/rca-feedback` sayfasından feedback girer

Örnek senaryo:

1. Tetkik bulgusundan uygunsuzluk OPEN olarak açıldı.
2. NC Manager RCA gerekli buldu, komisyon kurdu.
3. Komisyon üyeleri feedback gönderdi.
4. NC Manager KNA'yı sonuçlandırdı, düzeltici faaliyet planlandı.
5. Sorumlu tamamlandı işaretledi.
6. Baş tetkikçi doğruladı.
7. NC Manager kapattı.

---

## 12) Aksiyon Modülü

Ekran: `Aksiyonlar`

Ne yapılır:

- Aksiyon açma
- Sorumlu ve termin atama
- Durum geçişi (açık/devam/tamamlandı vb.)
- Gecikme takibi

Örnek:

- YGG kararından aksiyon üret, sorumlu ata, tamamlanma tarihini izle.

---

## 12a) Risk Yönetimi Modülü

Ekran: `Risk Yönetimi`

### Risk Kaydı

Ne yapılır:

- Risk açma (RSK-YYYY-NNN referans no)
- Standart ve madde seçimi (çoklu standart desteği)
- Olasılık × Etki skoru ile risk seviyesi (LOW/MEDIUM/HIGH/CRITICAL)
- Kalıntı risk değerlendirmesi (tedavi sonrası)
- Tedavi planı ve status takibi (OPEN/IN_PROGRESS/CLOSED/ACCEPTED)

### Risk-Kontrol İlişkilendirmesi

Ne yapılır:

- "Kontroller" tabından mevcut kontrolleri riske bağla
- Uygulama rolü: PRIMARY / SECONDARY / COMPENSATING
- Bağlı kontrolün etkinlik değerlendirmesini görüntüle

### Otomatik Tetkik Tetikleyicisi

- HIGH veya CRITICAL seviyeli risk → tetkik tetikleyicisi (audit_triggers) otomatik oluşur
- Tetkik sorumlusu tetikleyiciyi kabul eder ve tetkik planlar

Örnek senaryo:

1. Yeni risk aç, ISO 14001 Madde 6.1 seç.
2. Olasılık: 3, Etki: 4 → Risk Skoru: 12 → HIGH seviye.
3. Tedavi planı gir, kalıntı riski belirle.
4. Kontrol kütüphanesinden önleyici kontrol bağla.
5. Risk kapattığında status CLOSED.

---

## 12b) Kontrol Kütüphanesi Modülü

Ekran: `Kontrol Kütüphanesi`

### 12b.1 Kontrol Tanımı

Ne yapılır:

- Kontrol kodu ve başlık (kod büyük harfe otomatik dönüştürülür)
- Kontrol türü: Önleyici / Tespit Edici / Düzeltici
- Kategori, uygulama sıklığı (Günlük/Haftalık/Aylık/Üç Aylık/Yıllık)
- Anahtar kontrol işareti (★ Anahtar)
- Standart etiketleri (ISO 9001, ISO 27001 vb.)
- Sorumlu kullanıcı ve birim
- Durum: Aktif / Pasif

### 12b.2 Etkinlik Değerlendirmesi

Ne yapılır:

- Değerlendirme tarihi + etkinlik seviyesi (Etkili / Kısmi / Etkisiz)
- Opsiyonel puan (0–100) ve kanıt notu
- Kaynak tipi: Öz Değerlendirme / Tetkik / Olay İncelemesi / Yönetim Gözden Geçirme
- Kaynak olmayan değerlendirmeler append-only (silinmez, değiştirilemez)

### 12b.3 Risk-Kontrol Eşleştirme

Ne yapılır:

- Risk detay sayfasındaki "Kontroller" tabından kontrol bağla
- Bağlı kontrolün son etkinlik değerlendirmesi risk listesinde görünür

Örnek senaryo:

1. "CTRL-001: Erişim Yetkilendirme Kontrolü" kontrolü oluştur.
2. ISO 27001 standardıyla etiketle.
3. Risk detayından bu kontrolü bağla (PRIMARY rol).
4. Etkinlik değerlendirmesi ekle: "Etkili", puan 85.

---

## 13) Yönetim Gözden Geçirme (YGG) Modülü

Ekranlar:

- `YGG listesi`
- `Yeni YGG`
- `YGG Detayı`

Ne yapılır:

- Toplantı kaydı oluşturma
- Gündem maddeleri yönetimi
- Canlı veri ile değerlendirme
- Toplantı çıktılarından aksiyon üretimi

Örnek:

1. Yeni YGG oluştur.
2. Ajanda maddelerini gir.
3. Toplantı sonucunda aksiyonları kaydet.
4. YGG kaydını tamamla.

---

## 14) Performans Modülü

Ekranlar:

- `Pano`
- `KPI Hedefleri`
- `Veri Girişi`

### 14.1 KPI Hedef Yönetimi

Ne yapılır:

- KPI hedefi tanımlama
- Hedef güncelleme
- Ölçüm girişleri ile gerçekleşme takibi

### 14.2 Veri Girişi

Ne yapılır:

- Hedef bazlı dönemsel ölçüm girişi

Örnek:

1. KPI hedefi aç (ör. “Enerji tüketimini %5 azalt”).
2. Aylık gerçekleşme değerlerini gir.
3. Dashboard’da hedefe yaklaşım oranını izle.

---

## 15) Yetkinlik Modülü

Ekranlar:

- `Çalışanlar`
- `Yetkinlik Kütüphanesi`
- `Pozisyonlar & Profiller`
- `Değerlendirme Döngüleri`
- `Ekibimi Değerlendir`

### 15.1 Çalışan Yönetimi

Ne yapılır:

- Çalışan ekleme/düzenleme
- Toplu import

### 15.2 Yetkinlik Kütüphanesi

Ne yapılır:

- Yetkinlik tanımlarını yönetme
- Gerekirse seviyelendirme

### 15.3 Pozisyon Profilleri

Ne yapılır:

- Pozisyona gerekli yetkinlikleri bağlama

### 15.4 Değerlendirme Döngüleri

Ne yapılır:

- Döngü açma
- Döngü başlatma
- Döngü kapatma
- İlerleme izleme

### 15.5 Ekip Değerlendirme

Ne yapılır:

- Yönetici kendi ekibini değerlendirir.
- Puanlama girer, gönderir.

Örnek senaryo:

1. Yetkinlik setini tanımla.
2. Pozisyon profiline bağla.
3. Çalışanları içe aktar.
4. Değerlendirme döngüsünü başlat.
5. Yönetici değerlendirmeleri toplansın.
6. Sonuç raporunu değerlendir.

---

## 16) Ayarlar Modülü

Ekranlar:

- `Genel Ayarlar`
- `Kullanıcılar`
- `Referans Veri`
- `Admin / Tenant yönetimi` (role bağlı)

### 16.1 Genel Ayarlar

Ne yapılır:

- Sistem ayarları
- E-posta (SMTP) ayarları
- Test e-posta gönderimi

### 16.2 E-posta Log

Ne yapılır:

- Gönderim geçmişini izleme
- Başarısız e-postaları yeniden kuyruğa alma

### 16.3 Kullanıcı Yönetimi

Ne yapılır:

- Kullanıcı ekleme
- Rol güncelleme
- Şifre sıfırlama
- Tenant üyelik yönetimi

---

## 17) Profil Modülü

Ekran: `Profil`

Ne yapılır:

- Kişisel bilgi güncelleme
- Şifre değiştirme
- Gerekliyse 2FA yönetimi

---

## 18) Önerilen Operasyonel Kullanım Sırası (Yeni Kurum İçin)

1. İlk kurulum ve admin hesabı.
2. Departman/lokasyon/süreç alanı tanımları.
3. Kullanıcı ve rol atamaları.
4. Çerçeve/soru bankası kontrolü.
5. Stratejik hedef + KPI tanımları.
5a. Risk kaydı oluştur ve tedavi planla.
5b. Kontrol kütüphanesini oluştur, risklerle ilişkilendir.
6. İlk iç tetkik planlama.
7. Bulguların uygunsuzluk/aksiyon süreçlerine akıtılması.
8. YGG kaydı ve kararların takibi.
9. Yetkinlik döngüsünün başlatılması.

---

## 19) Sık Hatalar ve Çözüm

### 19.1 Giriş yapamıyorum

Kontrol:

- E-posta doğru mu?
- Şifre doğru mu?
- OTP kodu süresi doldu mu?

### 19.2 Tenant listesi gelmiyor

Kontrol:

- Kullanıcının tenant membership kaydı var mı?
- Hesap aktif mi?

### 19.3 Menüler eksik görünüyor

Kontrol:

- Rolünüz ilgili modül için yeterli olmayabilir.
- Ek rol tanımı yapılmış mı kontrol edin.

### 19.4 Kayıt güncellenmiyor

Kontrol:

- Zorunlu alanlar dolu mu?
- İlgili role sahip misiniz?

---

## 20) Eğitim İçin Örnek Senaryolar

### Senaryo A: İç Tetkikten Aksiyona Uçtan Uca

1. Tetkik aç.
2. Checklist başlat.
3. Bulgu oluştur.
4. Bulgudan aksiyon üret.
5. Aksiyon tamamla ve doğrula.

### Senaryo B: Stratejiden Performansa

1. Stratejik hedef oluştur.
2. KPI bağla.
3. Aylık veri girişi yap.
4. Dashboard’dan trendi izle.

### Senaryo C: Yetkinlik Döngüsü

1. Yetkinlik kütüphanesi oluştur.
2. Pozisyon profillerini tanımla.
3. Çalışanları ekle.
4. Döngü başlat ve değerlendirmeleri topla.

---

## 21) Yönetici İçin Hızlı Kontrol Listesi

- Kullanıcı ve roller güncel mi?
- Açık tetkikler ve geciken aksiyonlar takipte mi?
- YGG kayıtları tamamlanıyor mu?
- Kritik uygunsuzlukların kapanış kanıtı var mı?
- KPI verileri düzenli giriliyor mu?
- Yetkinlik döngüleri planlandığı gibi ilerliyor mu?

---

## 22) Notlar

- Bu kılavuz canlı kullanım geri bildirimlerine göre güncellenmelidir.
- Ekran görüntülü sürüm için bu dokümanın “Sürüm 2” çıktısı hazırlanabilir.
- Kurum içi eğitimlerde bölüm 18 ve 20 birlikte kullanılmalıdır.
- v1.2 ile eklenen modüller: Risk Yönetimi (12a), Kontrol Kütüphanesi (12b), DÖF risk-temelli durum akışı (11).
