# ESEDAS ve Metnex — Yönetim ve Geliştirme Sunum Brifi

**Amaç:** Bu belge, Metnex’in mevcut durumunu, ESEDAS ile sistem sınırını, tamamlanan platform temelini ve gelecek ürün vizyonunu kısa bir sunum anlatısına dönüştürmek için hazırlanmıştır.

Bu belge task listesi veya teknik uygulama talimatı değildir.

## 1. Metnex nedir?

Metnex adı **Metis + Nexus** birleşimidir.

- **Metis:** bilgi, analiz ve doğru karar verme.
- **Nexus:** farklı sistemleri, verileri ve operasyonları birbirine bağlayan merkez.

Metnex’in amacı yalnızca grafik üretmek değildir. Platform; üretim, vardiya, laboratuvar, işletme verileri ve dış sistemleri güvenli biçimde bir araya getirerek operasyonun izlenebilir ve analiz edilebilir olmasını sağlar.

## 2. ESEDAS ve Metnex arasındaki görev paylaşımı

ESEDAS, MOSEDAŞ için planlama ve üretim emirlerini oluşturan dış sistemdir.

```text
ESEDAS
  → üretim planını oluşturur
  → elektrik ve buhar üretim emirlerini oluşturur
  → emirleri Metnex’e iletir

Metnex
  → emirleri alır ve doğrular
  → kabul veya ret verir
  → emirleri vardiya operasyonlarına aktarır
  → gerçekleşme, sapma ve olayları yönetir
  → sonuçları ESEDAS’a bildirir
```

Bu ayrımın temel ilkeleri:

- ESEDAS planlama ve üretim emri sistemidir.
- Metnex operasyon yürütme, vardiya ve gerçekleşme sistemidir.
- ESEDAS, Metnex tenantı değildir; dış sistem olarak bağlanır.
- Entegrasyon kullanıcı JWT’siyle değil, güvenli B2B kimliği ve allowlist ile çalışır.
- Emirler versiyonlu ve idempotent olmalıdır.
- Olay, sapma ve gerçekleşme kayıtları Metnex’te audit edilebilir biçimde tutulur.

## 3. Kırım Tesisi için ayrı üretim emri

Kırım Tesisi’nin paçal üretim emri, ESEDAS’tan gelen enerji üretim emriyle aynı şey değildir.

- Kırım Tesisi MOSBİO altında bir operasyon merkezidir.
- Kırım iç üretim emrinin sahibi Metnex’tir.
- Emir, reçeteyi hazırlayan yetkili kullanıcı tarafından açılır.
- Vardiya sorumlusu üretimi yürütür ve tamamlar.
- Reçete, kova ölçümü, laboratuvar analizi ve paçal ilişkisi ayrı izlenir.
- Yüklenen malzeme miktarı otomatik olarak nihai paçal üretim miktarı kabul edilmez.

Bu iki emir türü aynı tabloya, aynı durum makinesine veya aynı entegrasyon sözleşmesine indirgenmez.

## 4. Mevcut platform temeli

Metnex’in teknik temeli:

- Next.js / React web uygulaması
- NestJS API
- PostgreSQL ve Drizzle
- Çok kiracılı tenant ve operasyon kapsamı
- Rol ve permission tabanlı yetkilendirme
- MFA, audit ve fail-closed güvenlik yaklaşımı
- Recharts tabanlı grafikler
- CSV, XLSX, PDF/Jasper ve PNG çıktı desteği

Veri sahipliği ilkesi:

```text
PostgreSQL
  → kullanıcı, tenant, rol, yetki ve Metnex domain kayıtları

Dış sistemler / SQL Server
  → SCADA, işletme ve kaynak sistemlerinin kendi verileri

Metnex
  → salt-okunur veri erişimi, analiz, operasyon ve gerçekleşme yönetimi
```

## 5. Bugün çalışan analiz temeli

SCADA/reporting temeli geliştirme ortamında CSV snapshot verileriyle çalışmaktadır.

Kullanıcı:

1. Kaynak seçer.
2. Doğrulanmış kolon ve serileri seçer.
3. Tarih aralığı ve saatlik/günlük aralık belirler.
4. İstatistikleri seçer.
5. Karşılaştırma ve sanal kolon kullanabilir.
6. Grafik ve tabloyu görüntüler.
7. CSV, XLSX, PDF veya PNG çıktı alabilir.

Veri kalitesi kuralları:

- Gerçek sıfır değer sıfır olarak korunur.
- Eksik değer sıfıra çevrilmez.
- Çözülemeyen sayaç devri açıkça işaretlenir.
- DST belirsizliklerinde tahmini zaman atanmaz.
- Eksik veya güvenilmez veri grafik ve istatistiklerde gizlenmez.
- Tenantlar ve kaynaklar birbirine karışmaz.
- Sanal kolon hataları güvenli biçimde `null` ve kalite durumu olarak gösterilir.

Bu CSV akışı geliştirme ve gösterim içindir. Gerçek SQL Server bağlantısı henüz kurulmamıştır.

## 6. Vardiya Operasyon Merkezi

Vardiya bağımsız bir ana varlık değil, zaman ve sorumluluk boyutudur.

Vardiya bilgisi şu kayıtlarla ilişkilendirilebilir:

- üretim emri,
- üretim gerçekleşmesi,
- kova veya yükleme ölçümü,
- operasyon olayı,
- manuel işletme değeri,
- laboratuvar veya kalite sonucu.

Operasyon merkezi kapsamı tenant ile birlikte değerlendirilir:

- Kömür Kazanı → MOSB Enerji operasyon merkezi
- Kırım Tesisi → MOSBİO operasyon merkezi

Operasyon merkezleri ayrı tenant değildir. Kullanıcı yetkisi hem tenant hem operasyon merkezi kapsamında kontrol edilir.

## 7. Laboratuvar ve işletme vizyonu

Laboratuvar, basit bir CRUD ekranı olarak değil; analiz yaşam döngüsü ve veri kalitesi platformu olarak ele alınacaktır.

Kapsam:

- ortak laboratuvar,
- kömür ve gelen biyokütle analizleri,
- su analizleri,
- kazan külü,
- Kırım Tesisi paçal analizleri,
- işletmede elle girilen operasyon değerleri.

Temel davranışlar:

- Analiz eksik parametrelerle açılabilir.
- Eksik parametreler aynı kayda sonradan eklenebilir.
- Her parametre için esas sonuç seçilebilir.
- Tamamlanmış kayıt kilitlenir.
- Düzeltme eski kaydı silmek yerine yeni revizyon oluşturur.
- Tekrar analiz yeni bağımsız kayıt olarak tutulur.
- Kritik sonuçlar kalite kriterleriyle karşılaştırılır.
- Bildirimler ortak bildirim altyapısı üzerinden yönetilir.

Ortak laboratuvar ayrı tenant olmayacaktır. Kullanıcı, MOSB Enerji ve MOSBİO tenantlarına ayrı üyeliklerle erişecektir.

## 8. Dış sistem sınırları

- **ESEDAS:** planlama ve elektrik/buhar üretim emirleri.
- **BEAM:** varlık, bakım ve nominal ekipman bilgileri.
- **ERP/Netsis:** özellikle kantar/tartım için geçici system of record.
- **SQL Server/SCADA:** kaynak ve sayaç verileri; Metnex salt-okunur erişir.
- **Ölçüm cihazları:** teknik sözleşme ve veri formatı netleştiğinde entegre edilir.

Her sistemin sahipliği korunur. Metnex dış sistemlerin işlevlerini kopyalamaz; kendi sorumluluğundaki operasyonu, analizi ve gerçekleşmeyi yönetir.

## 9. Gerçek veri bağlantısı için yaklaşım

İlk tercih, tüm SQL Server verisini sürekli PostgreSQL’e kopyalamak değildir.

Önerilen yol:

1. IT tarafından yalnızca `SELECT` yetkili servis kullanıcısı hazırlanması.
2. TLS, firewall ve erişim sınırlarının tanımlanması.
3. Kaynak tablo, kolon, tarih/saat ve timezone bilgilerinin doğrulanması.
4. Read-only adapter ve katalog preflight kontrolünün çalıştırılması.
5. Sınırlı gerçek veri smoke testinin yapılması.
6. Gerektiğinde yalnızca analiz snapshot’larının veya değişikliklerin aktarılmasının ayrıca değerlendirilmesi.

Credential, ham veri ve production bağlantı bilgileri uygulama koduna veya rapor çıktısına yazılmayacaktır.

## 10. Gelecek yönü

```text
Mevcut platform temeli
        ↓
Gerçek ESEDAS ve SQL Server bağlantıları
        ↓
Vardiya Operasyon Merkezi
        ↓
Laboratuvar modülü
        ↓
İşletme manuel veri modülü
        ↓
Kömür, biyokütle, kazan ve paçal süreçleri
        ↓
Bildirim, kalite ve karşılaştırmalı analizler
        ↓
Birleşik operasyon dashboard’ları
```

Hedef; üretim planından vardiya gerçekleşmesine, laboratuvar sonucundan kalite değerlendirmesine kadar izlenebilir tek bir operasyon görünümü oluşturmaktır.

## 11. Yönetimden beklenen destek

Uygulama aşamasında şu bilgiler dış ekiplerden teyit edilmelidir:

- ESEDAS mesaj ve emir sözleşmesi
- SQL Server kaynak ve kolon kataloğu
- Netsis kantar veri sözleşmesi
- Ölçüm cihazı protokolü
- Laboratuvar kalite kriterleri ve limitleri
- Kalori hesabı formülünün tam doğrulaması
- Rapor kolonları ve resmi çıktı şablonları

Bu bilgiler netleştikçe Metnex’in güvenli ve kontrollü biçimde gerçek operasyon verisine bağlanması mümkün olacaktır.

## Sonuç

Metnex’in analiz ve raporlama temeli hazırdır. ESEDAS planlama ve üretim emirlerinin sahibi olarak dış sistem sınırında dururken, Metnex bu emirleri operasyon, vardiya, gerçekleşme ve analiz katmanında yönetir.

Sonraki büyük ürün adımı, bu sağlam analiz temelini laboratuvar ve işletme operasyonlarına taşımaktır.
