# CRUD Screen Standard

Bu doküman, skeleton içindeki CRUD/list/detail yüzeyleri için bağlayıcı bilgi mimarisi standardını tanımlar.

Bu standart artık dense ERP yönüyle birlikte okunmalıdır.
Detaylı UI karşılığı için:

- `../ui-contract/patterns/crud-screen.md`
- `../ui-contract/patterns/table.md`
- `../ui-contract/patterns/form.md`
- `DROPDOWN_DYNAMIC_LOADING_POLICY.md`

---

## Amaç

CRUD ekranları dashboard gibi davranmamalıdır.
Yönetim yüzeyinin amacı:

- hızlı filtreleme
- yüksek veri yoğunluğu
- güvenli aksiyon modeli
- bağlam kaybetmeden detay çalışması

---

## Canonical Pattern

Varsayılan CRUD akışı:

1. giriş yüzeyi = liste + filtre
2. create = listeden tetiklenir
3. edit = satır veya detail panel içinden tetiklenir
4. destructive action = confirmation ister
5. detay çalışması = dedicated detail screen veya governance-onaylı detail panel
6. related data = sekmeler veya açık bölüm ayrımı

---

## 1. Liste Ekranı

Her CRUD yüzeyi şu öğeleri içerir:

- page intro / title
- compact filter toolbar
- data table veya yoğun liste
- create action
- row-level actions

Kural:

- operasyon girişi liste ekranıdır
- devasa tek parça form ana giriş olamaz

---

## 2. Yoğunluk Kuralı

CRUD/list yüzeylerinde varsayılan yoğunluk `compact`tır.

Bu şu anlama gelir:

- filtre toolbar kısa tutulur
- input/button yükseklikleri yaklaşık `32-36px`
- tablo satırları sıkı ama okunabilir olur
- yardımcı metin kontrollü kullanılır
- detail panel padding’i dashboard’tan daha dardır

`comfortable` CRUD yalnızca özel gerekçeyle kullanılır.

---

## 3. Filtre Toolbar Standardı

Filtre alanı:

- sayfanın üst kısmında
- bir veya iki satır içinde çözülebilir
- yatay alanı verimli kullanır

Kurallar:

- dinamik seçim alanları dropdown policy’ye uyar
- server-side filtreleme varsayılandır
- `Temizle` veya reset aksiyonu bulunur
- gereksiz tam genişlik alanlardan kaçınılır

---

## 4. Tablo / Sonuç Listesi

Kurallar:

- header ve cell spacing compact olmalı
- numerik ve kod alanları disiplinli hizalanmalı
- row action’lar görünür ama hacimsiz olmalı
- row click davranışı bilinçli olmalı; sürpriz navigasyon yapılmamalı
- placeholder veya fake metric tabloya karışmamalı

Pagination:

- büyük veri setinde server-side pagination varsayılan
- footer’da toplam kayıt ve sayfa durumu açık görünmeli

---

## 5. Create / Edit Modeli

Varsayılan model:

- create listeden açılır
- edit satır aksiyonundan açılır
- ana kayıt formu detail screen veya right-side detail panel içinde çalışılır

Kural:

- kısa tek adımlı formlar modal olabilir
- daha zengin form/detail senaryosu için detail screen veya drawer tercih edilir

---

## 6. Detail Screen / Detail Panel

Detay yüzeyi iki katmanlı düşünülür:

- üst katman: ana özellikler
- alt katman: ilişkili veri, sekmeler, yan işlemler

Kurallar:

- bilgi blokları görsel olarak ayrışmalı
- uzun formsuz read/update karışık yüzeyler bölümlere ayrılmalı
- sekmeler kozmetik değil, alan ayrımı için kullanılmalı
- her sekme için permission notu delivery’de açık yazılmalı

---

## 7. Authorization Model

Her CRUD işi en az şu yetki notlarını belirtir:

- list visibility
- create
- update
- delete
- tab/section bazlı read-write farkı

Kurallar:

- hidden ve read-only davranışı bilinçli seçilir
- menu görünürlüğü ile API yetkisi karıştırılmaz
- detay içinde bazı bölümler read-only kalabilir

---

## 8. Dashboard Ayrımı

CRUD yüzeyi dashboard değildir.

Bu nedenle CRUD ekranında:

- iri info-card grid’i ana odak olmaz
- dekoratif chart ile üst alan şişirilmez
- asıl öncelik tablo, filtre ve aksiyon akışıdır

Dashboard ile ilişki:

1. modül girişi = dashboard
2. operasyon = CRUD/list
3. derin çalışma = detail

---

## 9. Responsive Davranış

Kurallar:

- filtre toolbar kırılmadan aşağı sarabilir
- tablo yatay scroll kabul eder
- detail panel küçük ekranda tam genişlik davranabilir
- aksiyonlar mobilde erişilemez hale gelmez

---

## 10. Delivery Requirement

Yeni veya ciddi değişen her CRUD ekranı şunları açıklar:

1. liste giriş modeli
2. filtre modeli
3. yoğunluk kararı: `compact` / `comfortable`
4. create/edit/delete giriş noktaları
5. detail surface türü: page / drawer / modal
6. tab/section permission özeti
7. standarda aykırı karar varsa override gerekçesi
