# Hızlı Başlangıç — Tenant Yöneticisi (TENANT_ADMIN)

Sürüm: v1.0 | Hedef: Kurum/tenant düzeyinde sistem yöneticileri

---

## Bu Rolün Amacı

Tenant Admin, kurum içindeki tüm metnex işlemlerini yapılandırma ve yönetme yetkisine sahiptir. Kullanıcı yönetimi, modül yapılandırması ve tüm veri görüntüleme bu rolde toplanır.

---

## Göreceğiniz Menüler

| Menü | İçerik |
|------|--------|
| Dashboard | Genel durum özeti |
| Stratejik Plan | Vizyon, amaçlar, yönetişim |
| Performans | KPI hedefleri ve pano |
| İç Tetkik | Tüm tetkikler |
| Uyumluluk | Uygunsuzluklar, framework |
| Aksiyonlar | Tüm aksiyon kayıtları |
| YGG | Yönetim gözden geçirme |
| Yetkinlik | Tüm yetkinlik modülleri |
| Sistem | Kullanıcılar, referans veri, ayarlar |

---

## Günlük 5 Temel İşlem

### 1. Yeni Kullanıcı Ekle

1. **Sistem → Kullanıcılar → Yeni Kullanıcı**
2. Ad, soyad ve e-posta girin.
3. Birincil rol seçin (ör. AUDITOR, PROCESS_OWNER).
4. Gerekli ek rolleri işaretleyin.
5. Kaydedin — kullanıcıya hoş geldin e-postası gönderilir.

### 2. Açık Tetkikleri İzle

1. **Dashboard** → "Açık Tetkikler" kartına tıklayın.
2. Ya da **İç Tetkik** listesini açın.
3. Durumu "DEVAM EDİYOR" olanları filtreleyin.
4. Geciken atamalara tıklayarak müdahale edin.

### 3. Geciken Aksiyonları Takip Et

1. **Aksiyonlar** → "Gecikiyor" filtresini seçin.
2. Sorumlu kişiyle iletişime geçin veya termini güncelleyin.

### 4. Kullanıcı Rolü Güncelle

1. **Sistem → Kullanıcılar** listesinden kullanıcıyı bulun.
2. Satır sonundaki "Rol" butonuna tıklayın.
3. Yeni rolü seçip kaydedin — kullanıcıya bildirim gönderilir.

### 5. Referans Veri Tanımla

1. **Sistem → Referans Veri** altında Departmanlar / Lokasyonlar / Süreç Alanlarını açın.
2. Eksik tanımları ekleyin.
3. Tetkik ve yetkinlik modülleri bu verileri kullanır.

---

## Kritik Hatalar — Yapmayın

| Hata | Neden Tehlikeli |
|------|----------------|
| Aktif kullanıcıyı silmek yerine pasifleştirmeden kaldırmak | Kayıtlarda sahipsiz atama kalır |
| Rol atamadan kullanıcı oluşturmak | Kullanıcı sistemi göremez |
| Tetkik tamamlanmadan durumu CLOSED yapmak | Checklist kayıtları kaybolabilir |
| SUPER_ADMIN yetkisi olmadan Sistem Ayarları'nı değiştirmeye çalışmak | Erişim reddedilir |
| Üst organizasyon tenant'ını kendi tenant'ınızla karıştırmak | Veriler yanlış şemaya yazılabilir |
