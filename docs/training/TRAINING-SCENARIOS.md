# metnex Eğitim Senaryosu Paketi

Sürüm: v1.0
Tarih: 2026-03-06
Hedef kitle: Eğitim koordinatörleri, sistem yöneticileri, yeni kullanıcı onboarding ekipleri

---

## Senaryo 1 — Tetkikten Aksiyona Uçtan Uca

### Amaç

Bir iç tetkikin planlanmasından bulgu tespitine, oradan uygunsuzluk yönetimine ve aksiyon kapanışına kadar tüm akışı deneyimlemek.

### Ön Koşullar

| Gereklilik | Açıklama |
|------------|---------- |
| Roller | AUDIT_ADMIN veya TENANT_ADMIN + LEAD_AUDITOR + AUDITOR + PROCESS_OWNER |
| Referans veri | En az 1 departman, 1 süreç alanı tanımlı |
| Standart | ISO 9001 seçilmiş ve soru bankasında soruları mevcut |
| Kullanıcılar | Baş tetkikçi, 1 tetkikçi, 1 süreç sahibi tanımlı |

---

### Adımlar

**Aşama 1 — Tetkik Kurulumu (AUDIT_ADMIN / TENANT_ADMIN)**

1. **İç Tetkik → Yeni Tetkik**
   - Ad: "ISO 9001 Q1 Tetkiki"
   - Baş tetkikçi: [Eğitimdeki kullanıcı]
   - Planlanan başlangıç: [bugün + 1 gün]
   - Standart: ISO 9001
   - Kaydet.

2. Tetkik → **Düzenle** → Ekip sekmesi
   - 1 tetkikçi ekle.
   - Kaydet.

3. Tetkik → **Düzenle** → Soru Seçimi sekmesi
   - "Tüm Standart Soruları" seçeneğini kullan veya belirli maddeleri işaretle.
   - "Soruları Kaydet"e tıkla.

**Aşama 2 — Atama (LEAD_AUDITOR)**

4. Tetkik → **Düzenle** → Atamalar sekmesi
   - Yeni atama oluştur: Tarih, saat, süreç alanı.
   - Baş tetkikçi olarak kendinizi seçin.
   - Yardımcı tetkikçi ekleyin.
   - Çakışma yoksa kaydedin.

**Aşama 3 — Checklist Yürütme (AUDITOR)**

5. Tetkik detayı → **Checklist** sekmesi.
6. İlk 5 soruyu "Uygun" işaretle; açıklama gir.
7. Madde 5.1 "Liderlik"i **"Uygunsuz"** seç:
   - Açıklama: "Üst yönetim kalite politikasını duyurmuyor."
   - "Bulgu Aç" → Majör Uygunsuzluk.
8. Bir maddeyi "Kısmen Uygun" seç → sistem otomatik Minör Uygunsuzluk oluşturur.

**Aşama 4 — Uygunsuzluk Yönetimi (NONCONFORMITY_ADMIN)**

9. **Uyumluluk → Uygunsuzluklar** → UYG-xxxx kaydını aç.
10. "KNA Gerekli mi?" kararı ver:
    - Senaryo A: "Gerekmez" → direkt ACTION_PLANNED'a geç.
    - Senaryo B: "Gerekli" → komisyon üyelerini seç (PROCESS_OWNER dahil), yöntem: "5 Neden".
11. (Senaryo B) Süreç Sahibi e-posta ile davet edilir → geri bildirim sayfasına gidip görüş gönderir.
12. NC Manager: "KNA Sonuçlandır" → kök neden ve düzeltici faaliyet metnini gir.

**Aşama 5 — Düzeltici Faaliyet (PROCESS_OWNER)**

13. Uygunsuzluk detayında düzeltici faaliyeti uygula.
14. **"Tamamlandı İşaretle"** butonuna bas.
15. Baş tetkikçiye otomatik bildirim gider.

**Aşama 6 — Doğrulama (LEAD_AUDITOR)**

16. E-posta bildirimiyle doğrulama daveti gelir.
17. Uygunsuzluk → **"Onayla"** (kanıtı yeterli bulunursa).
18. Durum: VERIFIED.

**Aşama 7 — Kapatma (NONCONFORMITY_ADMIN)**

19. Uygunsuzluk → **"Kapat"** butonu.
20. Durum: CLOSED.

---

### Beklenen Çıktı

- Tetkik: TAMAMLANDI durumunda
- Uygunsuzluk kaydı: CLOSED durumunda
- Aksiyon kaydı (varsa): TAMAMLANDI durumunda
- E-posta logunda davet, bildirim ve doğrulama e-postaları görünür

### Başarı Kriterleri

- [ ] Tüm checklist soruları cevaplanmış
- [ ] En az 1 Majör Uygunsuzluk açılmış ve CLOSED durumuna getirilmiş
- [ ] Doğrulayıcı (Baş Tetkikçi) "Onayla" vermiş
- [ ] Süreç sahibi e-posta bildirimi almış (e-posta logundan doğrula)

---

## Senaryo 2 — Stratejik Hedeften KPI Takibine

### Amaç

Stratejik bir hedefi oluşturmak, KPI bağlamak, aylık ölçüm girmek ve dashboard üzerinden gerçekleşmeyi izlemek.

### Ön Koşullar

| Gereklilik | Açıklama |
|------------|----------|
| Roller | STRATEGY_ADMIN + PERFORMANCE_ADMIN |
| Vizyon | Vizyon & Misyon tanımlı olması önerilir |
| Süreç alanı | En az 1 süreç alanı tanımlı |

---

### Adımlar

**Aşama 1 — Stratejik Hedef Oluşturma (STRATEGY_ADMIN)**

1. **Stratejik Plan → Stratejik Amaçlar → Yeni Hedef**
   - Seviye: Stratejik
   - BSC Perspektifi: Müşteri
   - Ad: "Müşteri Memnuniyetini Artır"
   - Hedef yılı: 2026
   - Kaydet.

2. Alt hedef ekle (Strateji seviyesi):
   - Ad: "Şikayet Yanıt Süresini Kısalt"
   - Üst hedef: "Müşteri Memnuniyetini Artır"
   - Kaydet.

**Aşama 2 — KPI Hedefi Tanımlama (PERFORMANCE_ADMIN)**

3. **Performans → KPI Hedefleri → Yeni Hedef**
   - Ad: "Ortalama Şikayet Yanıt Süresi"
   - Birim: Gün
   - Hedef değer: 3
   - Karşılaştırma: ≤ (küçük veya eşit olmalı)
   - Dönem: Aylık
   - Sorumlu: [Süreç sahibi kullanıcı]
   - Kaydet.

**Aşama 3 — Ölçüm Girişi (PERFORMANCE_ADMIN / Sorumlu)**

4. Ocak ölçümü: **Hedef detayı → Ölçüm Ekle**
   - Dönem: Ocak 2026
   - Gerçekleşen: 5 gün
   - Kaydet. → Sistem: AŞILDI

5. Şubat ölçümü:
   - Gerçekleşen: 2.8 gün
   - Kaydet. → Sistem: ULAŞILDI

**Aşama 4 — Dashboard İzleme**

6. **Performans → Pano**yu aç.
7. "Ortalama Şikayet Yanıt Süresi" kartında Ocak (kırmızı) ve Şubat (yeşil) görülür.
8. Trendi incele.

---

### Beklenen Çıktı

- Stratejik hedef hiyerarşisi: 1 Stratejik → 1 Strateji
- KPI kartı: 1 ölçüm AŞILDI, 1 ölçüm ULAŞILDI
- Pano: trend görselleştirilmiş

### Başarı Kriterleri

- [ ] Stratejik amaç ve alt hedef bağlı
- [ ] KPI hedefi oluşturulmuş ve 2 dönem ölçümü girilmiş
- [ ] Dashboard'da durum renkleri doğru (kırmızı / yeşil)
- [ ] Hedef referans kodu (PHD-YYYY-NNN) görünür

---

## Senaryo 3 — Yetkinlik Döngüsü

### Amaç

Yetkinlik kütüphanesi kurulumundan pozisyon profiline, çalışan ekleme ve dönemsel değerlendirmeye kadar tam yetkinlik döngüsünü tamamlamak.

### Ön Koşullar

| Gereklilik | Açıklama |
|------------|----------|
| Roller | COMPETENCY_ADMIN (yapılandırma) + TENANT_ADMIN / yönetici (değerlendirme) |
| Kullanıcılar | En az 2 çalışan hesabı (değerlendirilecek) |
| Departmanlar | En az 1 departman tanımlı |

---

### Adımlar

**Aşama 1 — Yetkinlik Kütüphanesi Kurulumu (COMPETENCY_ADMIN)**

1. **Yetkinlik → Yetkinlik Kütüphanesi → Yeni Yetkinlik**
   - "Süreç Bilgisi" — açıklama gir, seviyeler: Başlangıç / Orta / İleri
   - "Problem Çözme" — aynı şekilde
   - "Ekip Çalışması" — aynı şekilde

2. **Yetkinlik → Pozisyonlar & Profiller → Yeni Pozisyon**
   - Ad: "Kalite Uzmanı"
   - Gereken yetkinlikleri bağla: Süreç Bilgisi (İleri), Problem Çözme (Orta), Ekip Çalışması (Orta)
   - Kaydet.

**Aşama 2 — Çalışan Ekleme (COMPETENCY_ADMIN / TENANT_ADMIN)**

3. **Yetkinlik → Çalışanlar → Yeni Çalışan**
   - Ad/Soyad, departman, pozisyon: "Kalite Uzmanı"
   - Kaydet. (2 çalışan için tekrarla)

**Aşama 3 — Değerlendirme Döngüsü (COMPETENCY_ADMIN)**

4. **Yetkinlik → Değerlendirme Döngüleri → Yeni Döngü**
   - Ad: "2026 Q1 Yetkinlik Değerlendirmesi"
   - Kapsam: Kalite Uzmanı pozisyonu / tüm çalışanlar
   - Kaydet.

5. Döngü → **"Başlat"** butonuna bas.
   - Değerlendirici yöneticilere bildirim gönderilir.

**Aşama 4 — Değerlendirme Yapma (Yönetici / TENANT_ADMIN)**

6. **Yetkinlik → Ekibimi Değerlendir**
7. Döngüyü seç → çalışan listesi görünür.
8. Her çalışan için yetkinlik puanlarını gir (1-5 arası).
9. **"Gönder"** butonuna bas.

**Aşama 5 — Döngüyü Kapat ve Sonuçları İncele (COMPETENCY_ADMIN)**

10. Tüm değerlendirmeler tamamlandığında döngü → **"Kapat"**.
11. Sonuç özeti: hangi yetkinlikte ortalama en düşük?
12. Tespit edilen gelişim ihtiyaçlarından aksiyon oluşturmayı düşünün.

---

### Beklenen Çıktı

- Yetkinlik kütüphanesi: 3 yetkinlik tanımlı
- Pozisyon profili: 1 pozisyon, 3 yetkinlik bağlı
- Çalışanlar: 2 kişi, doğru pozisyona atanmış
- Döngü: TAMAMLANDI durumunda
- Sonuçlar: yetkinlik bazlı ortalama puanlar görülür

### Başarı Kriterleri

- [ ] Pozisyon profilinde en az 3 yetkinlik bağlı
- [ ] Her çalışan için değerlendirme formu doldurulmuş
- [ ] Döngü kapatılmış ve sonuçlar görüntülenebilir
- [ ] En düşük puan alan yetkinlik tespit edilmiş

---

## Genel Eğitim Notları

- Senaryolar birbirinden bağımsız olarak veya sıralı olarak uygulanabilir.
- Her senaryo için ayrı test tenant'ı kullanılması önerilir.
- Senaryo tamamlandıktan sonra e-posta logunu **Sistem → E-posta Kuyruğu** ekranından kontrol edin.
- Sorular için Tenant Admin veya uygulama yöneticinize başvurun.
