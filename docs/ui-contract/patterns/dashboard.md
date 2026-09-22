# metnex — Dashboard / Overview Pattern

Bu pattern, module entry ve high-level overview yüzeylerini tanımlar.

---

## Dashboard’ın Rolü

Dashboard:

- ilk bakışta durum okuma
- hızlı yönlendirme
- ana metrikleri özetleme

Dashboard, CRUD/list ekranının yerine geçmez.

---

## Yoğunluk Kararı

Dashboard için varsayılan:

- `comfortable`

Kullanım:

- daha nefesli kart alanı
- kısa açıklama
- 1-2 seviye metrik sunumu

Amaç:

- yoğunluğu azaltmak değil
- özet ile çalışma ekranını ayırmak

---

## Canonical Bölümler

Tipik dashboard:

1. intro
2. summary/info cards
3. alt analiz kartları veya yönlendirme blokları
4. opsiyonel quick links / alerts

---

## Info Card Kuralı

Kartlar şu tür bilgileri verir:

- toplam
- aktif / pasif
- risk / warning
- kullanım / quota
- son durum

Kural:

- kartlar operasyonel anlam taşır
- dekoratif metrik yasak
- boş durumda da dürüst bilgi verilir

---

## Alt Bölüm

Alt bölüm şu tür içerikler taşıyabilir:

- trend
- dağılım
- open issues
- quick navigation
- recent activity

Grafik varsa gerekçeli olmalıdır.
Grafik yoksa placeholder veya yönlendirici kart kabul edilir.

---

## Dashboard vs CRUD Ayrımı

Dashboard:

- overview
- yönlendirme
- status summary

CRUD:

- filtreleme
- tablo
- edit
- yoğun çalışma

Kural:

- dashboard içinde yoğun data grid ana omurga olmaz
- CRUD sayfası da dashboard kartlarıyla şişirilmez

---

## Permission Model

- dashboard görünürlüğü ayrı değerlendirilebilir
- her kart kullanıcıyı götüreceği yüzeyle uyumlu görünürlükte olmalıdır
- yetkisiz aksiyon gösterip sonradan hata vermek tercih edilmez

---

## Responsive

- kartlar temiz stack olur
- overview yapısı mobilde de overview kalır
- grafik alanı küçük ekranda yatay taşma yaratmamalı

---

## Delivery Notes

Dashboard işi şunları açıklar:

1. route
2. yoğunluk kararı
3. info card seti
4. alt bölüm mantığı
5. CRUD yüzeyiyle ilişki
