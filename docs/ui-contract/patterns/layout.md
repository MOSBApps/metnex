# metnex — Layout Kalıbı

Bu dosya, skeleton’daki app shell ve sayfa iskeletini tanımlar.

---

## Shell Kararı

Varsayılan iskelet:

- sidebar solda
- content sağda
- content alanı scroll eder
- header çoğu sayfada bağımsız component değil, sayfa içi intro ile çözülür

Kural:

- yeni yüzeyler mevcut shell’i bozmamalı
- platform ve app yüzeyleri aynı temel layout dilini korumalı

---

## Sidebar

Sidebar rolleri:

- navigasyon
- grup ayrımı
- oturum/çıkış aksiyonu

Kurallar:

- nav item’lar kısa isimli olmalı
- görünürlük role/permission/tenant-type’a göre bilinçli yönetilmeli
- operasyonel olmayan dekoratif alanlar sidebar’ı şişirmemeli

---

## Page Intro

Skeleton’daki fiili giriş primitive’i `PageIntro`’dur.

Yoğunluk kararı:

- dashboard: `comfortable`
- CRUD/list: `compact`

`PageIntro` rolü:

- başlık
- kısa açıklama
- sağ aksiyonlar

Kural:

- CRUD sayfasında intro alanı mümkün olduğunca kısa tutulur
- dashboard intro biraz daha açıklayıcı olabilir

---

## Page Content

Sayfa gövdesi tipik olarak:

- section stack
- stats / toolbar / table / panel sırası

Kural:

- dense ekranlarda “hero alan” yaratılmaz
- ana aksiyon ve filtreler viewport üstünde tutulur

---

## Platform vs Customer-Admin

Görsel dil aynı ailede kalır:

- aynı spacing ritmi
- aynı card/badge/table primitive’leri
- aynı compact/comfortable mantığı

Kural:

- farklı yüzeyler farklı ürünmüş gibi görünmemeli

---

## Responsive

- mobilde sidebar davranışı shell seviyesinde çözülür
- içerik alanı yatay taşabilir; özellikle tabloda bu kabul edilir
- dense masaüstü düzeni mobilde kırılmadan tek kolona düşebilir

---

## Yasaklar

- her sayfa için yeniden tasarlanmış shell
- sayfa başlığı olmayan operasyon ekranı
- sidebar’ı marketing paneline çevirmek
