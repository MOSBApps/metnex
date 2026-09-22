# Hızlı Başlangıç — Baş Tetkikçi (LEAD_AUDITOR)

Sürüm: v1.0 | Hedef: İç tetkik lider rolü üstlenen kullanıcılar

---

## Bu Rolün Amacı

Baş Tetkikçi, bir tetkikin planlama ve yürütme sürecini koordine eder. Ekip ataması, checklist yönetimi, bulgu açma ve tetkiki tamamlama bu rolün birincil sorumluluklarıdır. Ayrıca üzerine atanan uygunsuzlukları **doğrulama** (VERIFIED aşaması) yetkisine sahiptir.

---

## Göreceğiniz Menüler

| Menü | İçerik |
|------|--------|
| Dashboard | Kişisel görevler ve atamalar |
| İç Tetkik | Sorumlu olduğunuz tetkikler |
| Uyumluluk → Uygunsuzluklar | Doğrulama bekleyen kayıtlar |

> Not: AUDIT_ADMIN ek rolü varsa tüm tetkikleri yapılandırabilirsiniz.

---

## Günlük 5 Temel İşlem

### 1. Tetkik Planlama

1. **İç Tetkik → Yeni Tetkik**
2. Ad, standartlar ve tarih aralığını doldurun.
3. Kaydedin.
4. Tetkik → **Düzenle** → "Ekip" sekmesinde heyet üyelerini (AUDITOR) seçin.

### 2. Soru Seçimi ve Checklist Başlatma

1. Tetkik → **Düzenle** → "Soru Seçimi" sekmesine gidin.
2. Standart gruplarını ve kurumsal framework sorularını seçin.
3. "Soruları Kaydet"e tıklayın.
4. Tetkik detayında **Checklist** sekmesi aktif hale gelir.

### 3. Çakışmasız Atama Yapma

1. Tetkik → **Düzenle** → "Atamalar" sekmesi.
2. Her atama bloğu için tarih ve saat belirleyin.
3. Sistem çakışan tetkikçileri kırmızı gösterir — onları seçmeyin.
4. "★ Önerilen" etiketli tetkikçiyi tercih edin (en yüksek puanlı).

### 4. Bulgu Açma

1. Checklist'te "Uygunsuz" veya "Kısmen Uygun" cevapladığınız maddeye tıklayın.
2. "Bulgu Aç" butonuyla bulgu tipini (Majör / Minör / Gözlem) seçin.
3. Bulgu metni ve kanıt ekleyin.
4. Sistem otomatik olarak NONCONFORMING bulgulardan uygunsuzluk oluşturur.

### 5. Uygunsuzluk Doğrulama

1. E-posta bildiriminiz gelir: "Doğrulama Bekleniyor".
2. **Uyumluluk → Uygunsuzluklar** listesinden kaydı açın.
3. Düzeltici faaliyetin yeterli olduğuna kanaat getirirseniz **"Onayla"**.
4. Yetersizse **"İade Et"** — sorumlu tekrar haberdar edilir.

---

## Kritik Hatalar — Yapmayın

| Hata | Neden Tehlikeli |
|------|----------------|
| Checklist başlatmadan tetkiki tamamlamak | Bulgular kayıt altına alınamaz |
| Çakışmalı tetkikçi atamak | Sistem engeller veya raporlama tutarsız olur |
| Uygunsuzluğu kanıt incelemeden onaylamak | Etkinlik doğrulaması yapılmamış olur |
| Tetkiki tamamlamadan başka tetkik açmak | Ekip kapasitesi aşılır |
| Bulgu tipini yanlış seçmek (Majör/Minör karışıklığı) | Uygunsuzluk akışı ve raporlama etkilenir |
