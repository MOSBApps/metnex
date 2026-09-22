# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

## Doküman Bilgileri

| Alan | Değer |
|---|---|
| Proje / Ürün Adı | |
| Doküman | Software Requirements Specification |
| Sürüm | 0.1 |
| Tarih | |
| Durum | Taslak |
| Kaynak Discovery Dokümanı | |
| Hazırlayan | AI0 / |
| Gözden Geçiren | |
| Onaylayan | |

---

# 1. Amaç ve Kapsam

## 1.1 Dokümanın Amacı

Bu doküman, [PROJE ADI] yazılımının fonksiyonel ve fonksiyonel olmayan
gereksinimlerini tanımlar.

Bu SRS'nin temel iş gereksinimi kaynağı:

[DISCOVERY DOKÜMANI]

dokümanıdır.

---

## 1.2 Ürünün Amacı

[Uygulamanın hangi problemi çözdüğünü ve hangi iş sonucunu sağlamayı
amaçladığını özetleyin.]

---

## 1.3 Hedefler

- 
- 
- 

---

## 1.4 Başarı Kriterleri

| ID | Başarı Kriteri | Ölçüm / Kabul Yöntemi |
|---|---|---|
| SC-001 | | |
| SC-002 | | |

---

# 2. Tanımlar ve Kısaltmalar

| Terim / Kısaltma | Açıklama |
|---|---|
| | |

---

# 3. Referanslar

| ID | Doküman / Kaynak | Sürüm / Tarih |
|---|---|---|
| REF-001 | Discovery Dokümanı | |
| REF-002 | | |

---

# 4. Sistem Kapsamı

## 4.1 Kapsam Dahilinde

- 
- 
- 

---

## 4.2 Kapsam Dışında

- 
- 
- 

---

## 4.3 Gelecek Fazlarda Değerlendirilecekler

- 
- 
- 

---

# 5. Paydaşlar ve Kullanıcı Rolleri

## 5.1 Paydaşlar

| ID | Paydaş | Rol / Beklenti |
|---|---|---|
| STK-001 | | |

---

## 5.2 Kullanıcı Rolleri

| ID | Rol | Açıklama |
|---|---|---|
| ROLE-001 | | |
| ROLE-002 | | |

---

## 5.3 Yetki Matrisi

| İşlem / Kaynak | ROLE-001 | ROLE-002 | ROLE-003 |
|---|---|---|---|
| | | | |
| | | | |

Yetkiler mümkün olduğunca görüntüleme, oluşturma, değiştirme,
silme, onaylama ve özel işlemler seviyesinde tanımlanmalıdır.

---

# 6. İşlevsel Yapı

Sistem, aşağıdaki modül veya işlevsel alanlardan oluşur.

| ID | Modül / İşlevsel Alan | Amaç | İlgili Discovery Kayıtları |
|---|---|---|---|
| MOD-001 | | | M-... / F-... |
| MOD-002 | | | M-... / F-... |

> Discovery dokümanındaki modül yapısı kesin bir yazılım mimarisi olarak
> kabul edilmemelidir. Gerekirse SRS hazırlanırken yeniden düzenlenebilir.
> Yapılan değişikliklerin gerekçesi belirtilmelidir.

---

# 7. Modül ve Feature Gereksinimleri

Her modül aşağıdaki yapı kullanılarak tanımlanır.

---

## MOD-001 – [Modül Adı]

### 7.1 Amaç

[Modülün sistem içerisindeki sorumluluğunu açıklayın.]

### 7.2 Kullanıcı Rolleri

- ROLE-...
- ROLE-...

### 7.3 İlgili Discovery Talepleri

- F-...
- F-...

---

## FEAT-001 – [Feature Adı]

### Açıklama

[Feature'ın kullanıcıya veya sisteme sağladığı işlev.]

### Kaynak

Discovery:

- F-...

### Kullanıcı / Aktör

- ROLE-...

### Ön Koşullar

- 
- 

### Son Koşullar

- 
- 

---

### Fonksiyonel Gereksinimler

#### FR-001 – [Gereksinim Adı]

Sistem [...]

**Kaynak:** F-...

**Öncelik:** Must / Should / Could / Won't

---

#### FR-002 – [Gereksinim Adı]

Sistem [...]

**Kaynak:** F-...

**Öncelik:** Must / Should / Could / Won't

---

### İş Kuralları

#### BR-001 – [İş Kuralı]

[...]

**Kaynak:** F-... / D-...

---

### Temel Akış

Bu feature bir kullanıcı veya sistem akışı içeriyorsa tanımlanır.

1. 
2. 
3. 
4. 

Akış bulunmayan feature'larda bu bölüm kullanılmayabilir.

---

### Alternatif Akışlar

#### AF-001 – [Alternatif Akış]

1.
2.
3.

---

### Hata ve İstisna Durumları

#### EX-001 – [Durum]

**Koşul:**

[...]

**Beklenen Sistem Davranışı:**

[...]

---

### Girdiler

| Alan | Veri Tipi | Zorunlu | Doğrulama / Kural |
|---|---|---|---|
| | | | |

---

### Çıktılar

| Çıktı | Açıklama |
|---|---|
| | |

---

### Yetkilendirme

| İşlem | Yetkili Rol |
|---|---|
| Görüntüleme | |
| Oluşturma | |
| Güncelleme | |
| Silme | |

---

### Kabul Kriterleri

#### AC-001

**Given:**  
[...]

**When:**  
[...]

**Then:**  
[...]

#### AC-002

**Given:**  
[...]

**When:**  
[...]

**Then:**  
[...]

---

# 8. Sistem Durumları ve Durum Geçişleri

Sistemde yaşam döngüsü bulunan temel nesneler burada tanımlanır.

## 8.1 [Nesne Adı] Durumları

| Durum | Açıklama |
|---|---|
| | |
| | |

---

## 8.2 İzin Verilen Durum Geçişleri

| Mevcut Durum | İşlem | Yeni Durum | Yetkili Rol | Koşul |
|---|---|---|---|---|
| | | | | |

---

## 8.3 Geçersiz Durum Geçişleri

- 
- 

---

# 9. Veri Gereksinimleri

## 9.1 Temel Veri Varlıkları

| ID | Varlık | Açıklama |
|---|---|---|
| ENT-001 | | |
| ENT-002 | | |

---

## 9.2 Varlık Detayları

### ENT-001 – [Varlık Adı]

| Alan | Veri Tipi | Zorunlu | Tekil | Açıklama / Kural |
|---|---|---|---|---|
| id | UUID | Evet | Evet | Sistem kimliği |
| | | | | |

---

## 9.3 Varlık İlişkileri

| Varlık | İlişki | Varlık | Açıklama |
|---|---|---|---|
| | 1:N / N:N / 1:1 | | |

---

## 9.4 Veri Yaşam Döngüsü

Gerekli olduğu durumlarda:

- Veri nasıl oluşturulur?
- Kim değiştirebilir?
- Ne kadar süre saklanır?
- Arşivlenir mi?
- Silinir mi?
- Anonimleştirilir mi?

---

# 10. Entegrasyon Gereksinimleri

## INT-001 – [Entegrasyon Adı]

### Dış Sistem

[...]

### Amaç

[...]

### Veri Yönü

- [ ] Gelen
- [ ] Giden
- [ ] Çift Yönlü

### Entegrasyon Yöntemi

REST / SOAP / Dosya / Queue / Webhook / Diğer

### Aktarılan Veriler

- 
- 

### Kimlik Doğrulama

[...]

### Hata Yönetimi

[...]

### Zamanlama

Gerçek zamanlı / Periyodik / Talep üzerine

---

# 11. Kullanıcı Arayüzü Gereksinimleri

## 11.1 Genel Gereksinimler

- 
- 
- 

---

## 11.2 Ekranlar

| ID | Ekran | Amaç | Kullanıcı Rolleri | İlgili Feature |
|---|---|---|---|---|
| UI-001 | | | | FEAT-... |
| UI-002 | | | | FEAT-... |

---

## 11.3 Navigasyon

[Temel ekran geçişleri ve navigasyon yapısı.]

---

# 12. Raporlama ve Dashboard Gereksinimleri

| ID | Rapor / Gösterge | Kullanıcı | İçerik | Filtreler | Çıktı |
|---|---|---|---|---|---|
| REP-001 | | | | | |

---

# 13. Fonksiyonel Olmayan Gereksinimler

Fonksiyonel olmayan gereksinimler mümkün olduğunca ölçülebilir ve
test edilebilir biçimde yazılmalıdır.

## 13.1 Performans

### NFR-PERF-001

[...]

**Ölçüm / Kabul Kriteri:** [...]

---

## 13.2 Kullanılabilirlik

### NFR-USE-001

[...]

**Ölçüm / Kabul Kriteri:** [...]

---

## 13.3 Ölçeklenebilirlik

### NFR-SCALE-001

[...]

**Ölçüm / Kabul Kriteri:** [...]

---

## 13.4 Erişilebilirlik

### NFR-ACC-001

[...]

---

## 13.5 Uyumluluk

### NFR-COMP-001

Desteklenmesi gereken:

- İşletim sistemleri:
- Tarayıcılar:
- Cihazlar:
- Ekran çözünürlükleri:

---

## 13.6 Güvenilirlik ve Erişilebilirlik

### NFR-REL-001

[...]

---

## 13.7 Yedekleme ve Geri Yükleme

### NFR-BACKUP-001

[...]

---

## 13.8 İş Sürekliliği / Felaket Kurtarma

### NFR-BCP-001

[...]

Varsa:

- RTO:
- RPO:

---

# 14. Güvenlik Gereksinimleri

## 14.1 Kimlik Doğrulama

### SEC-AUTH-001

[...]

---

## 14.2 Yetkilendirme

### SEC-AUTHZ-001

[...]

---

## 14.3 Oturum Yönetimi

### SEC-SESSION-001

[...]

---

## 14.4 Veri Güvenliği

### SEC-DATA-001

[...]

---

## 14.5 Denetim İzi / Audit Log

### SEC-AUDIT-001

[...]

Aşağıdaki bilgiler gerektiğinde kaydedilmelidir:

- İşlemi yapan kullanıcı
- İşlem
- Etkilenen kayıt
- Tarih / saat
- Önceki değer
- Yeni değer
- Sonuç

---

## 14.6 Loglama

### SEC-LOG-001

[...]

---

# 15. Kişisel Veri ve Veri Gizliliği Gereksinimleri

## 15.1 İşlenen Kişisel Veriler

| Veri | Amaç | Zorunlu | Saklama Süresi |
|---|---|---|---|
| | | | |

---

## 15.2 Veri Saklama ve Silme

[...]

---

## 15.3 Erişim

[...]

---

# 16. Teknik Mimari ve Teknoloji Kısıtları

Bu bölüm müşteri iş gereksinimleri ile teknik kararları birbirinden
ayırmalıdır.

## 16.1 Zorunlu Teknik Kısıtlar

Müşteri veya kurum tarafından zorunlu tutulan teknik koşullar:

- 
- 

---

## 16.2 Önerilen Teknik Kararlar

Aşağıdaki kararlar müşteri gereksinimi değil, teknik ekip tarafından
önerilen çözüm kararlarıdır.

| ID | Teknik Karar | Gerekçe | Durum |
|---|---|---|---|
| TD-001 | | | Öneri |
| TD-002 | | | Öneri |

---

## 16.3 Hedef Mimari

- Frontend:
- Backend:
- Database:
- Authentication:
- File/Object Storage:
- Cache:
- Messaging:
- Deployment:
- Containerization:
- Monitoring:
- Logging:

Yalnızca proje kapsamında belirlenmiş alanlar doldurulmalıdır.

---

# 17. Dağıtım ve Operasyon Gereksinimleri

## 17.1 Ortamlar

- Development
- Test
- Staging
- Production

Proje için gerekli olmayan ortamlar çıkarılabilir.

---

## 17.2 Deployment

[...]

---

## 17.3 Configuration Management

[...]

---

## 17.4 Monitoring

[...]

---

## 17.5 Backup

[...]

---

# 18. Varsayımlar

| ID | Varsayım | Kaynak | Doğrulama Gerekiyor mu? |
|---|---|---|---|
| ASM-001 | | Discovery A-... | Evet/Hayır |

Varsayımlar gereksinim gibi değerlendirilmemelidir.

---

# 19. Bağımlılıklar

| ID | Bağımlılık | Etkisi |
|---|---|---|
| DEP-001 | | |

---

# 20. Kısıtlar

| ID | Kısıt | Kaynak |
|---|---|---|
| CON-001 | | |

---

# 21. Açık Konular ve Sorular

## 21.1 Açık Sorular

| ID | Soru | Kaynak | Etkilenen Gereksinimler | Durum |
|---|---|---|---|---|
| OQ-001 | | Discovery Q-... | FR-... | Açık |

---

## 21.2 Çelişkiler

| ID | Çelişki | Kaynaklar | Çözüm Gereksinimi |
|---|---|---|---|
| CF-001 | | | |

AI0 çelişkileri kendi kararıyla çözmemelidir.

---

## 21.3 Eksik Gereksinimler

| ID | Eksik Bilgi | Etkilenen Alan | Önerilen Aksiyon |
|---|---|---|---|
| MR-001 | | | |

---

# 22. Faz ve Sürüm Kapsamı

## 22.1 MVP

| Feature | Gereksinimler |
|---|---|
| FEAT-... | FR-..., FR-... |

---

## 22.2 Faz 2

| Feature | Gereksinimler |
|---|---|
| | |

---

## 22.3 Gelecek Fazlar

| Feature / Konu | Açıklama |
|---|---|
| | |

---

# 23. Sistem Seviyesi Kabul Kriterleri

## 23.1 Fonksiyonel Kabul

- MVP kapsamındaki tüm Must gereksinimler karşılanmalıdır.
- Tanımlanan kabul testleri başarıyla tamamlanmalıdır.
- Açık kritik hata bulunmamalıdır.

---

## 23.2 Güvenlik Kabulü

- 
- 

---

## 23.3 Performans Kabulü

- 
- 

---

## 23.4 Operasyonel Kabul

- 
- 

---

# 24. Gereksinim İzlenebilirlik Matrisi

Her gereksinim mümkün olduğunca kaynağından teste kadar
izlenebilir olmalıdır.

| Discovery | Modül | Feature | Gereksinim | İş Kuralı | Kabul Kriteri | Test |
|---|---|---|---|---|---|---|
| F-001 | MOD-001 | FEAT-001 | FR-001 | BR-001 | AC-001 | TC-001 |
| | | | | | | |

---

# 25. AI0 Analiz Özeti

Bu bölüm SRS üretimi tamamlandıktan sonra AI0 tarafından hazırlanır.

## 25.1 Tespit Edilen Açık Sorular

- 
- 

## 25.2 Eksik Gereksinimler

- 
- 

## 25.3 Tespit Edilen Çelişkiler

- 
- 

## 25.4 Varsayımlar

- 
- 

## 25.5 Önerilen Teknik Kararlar

- 
- 

## 25.6 Riskli / Belirsiz Alanlar

- 
- 

## 25.7 Müşteri ile Yeniden Görüşülmesi Gereken Konular

1.
2.
3.

---

# 26. Onay

| Rol | Ad Soyad | Tarih | Durum |
|---|---|---|---|
| Ürün / İş Birimi Sorumlusu | | | |
| Teknik Sorumlu | | | |
| Proje Sorumlusu | | | |

---

# 27. Değişiklik Geçmişi

| Sürüm | Tarih | Değişiklik | Hazırlayan |
|---|---|---|---|
| 0.1 | | İlk taslak | AI0 |