# metnex — Modal / Drawer / Detail Panel Pattern

Bu repo için karar sadece modal vs drawer değil, bağlam koruma kararıdır.

---

## Ne Zaman Hangisi

### Modal

Uygun:

- delete confirmation
- kısa approval / confirmation
- 2-4 alanlık küçük yardımcı form

Uygun değil:

- yoğun edit ekranı
- sekmeli detay çalışması

### Detail Panel / Drawer

Uygun:

- listeden bağlam kopmadan detay inceleme
- orta karmaşıklıkta edit/read akışı
- platform users/tenants gibi operasyon yüzeyi

### Dedicated Detail Screen

Uygun:

- büyük form
- çok sekme
- derin ilişkili veri

---

## Yoğunluk

Skeleton’da detail panel ve modal iki yoğunluk destekler:

- `compact`
- `comfortable`

Kural:

- CRUD/detail için `compact`
- daha anlatı ağırlıklı dialog için `comfortable`

---

## Confirmation Standard

Destructive action:

- kısa başlık
- geri alınamazlık bilgisi
- primary destructive button
- secondary cancel

Kural:

- confirmation metni açık olmalı
- kullanıcı neyi onayladığını bilmelidir

---

## Detail Panel Standardı

Detail panel:

- başlık
- kısa subtitle
- içerik blokları
- gerekirse footer aksiyonları

Kural:

- bilgi blokları section halinde gruplanır
- yoğun panelde boşluk kontrollü kalır

---

## Yasaklar

- modal içinde modal
- drawer içinde drawer
- dashboard üzerinde yoğun CRUD form modal’ı
- sırf görsel nedenlerle bağlam kaybettiren tam sayfa geçiş
