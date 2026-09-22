# metnex — Spacing ve Yoğunluk Sistemi

Bu repo için spacing kararı yalnız estetik değil, bilgi yoğunluğu kararıdır.

---

## Temel Birim

Temel grid `4px`’tir.

Ancak asıl karar, spacing token’larının hangi yüzeyde kullanılacağıdır.

---

## Yoğunluk Katmanları

### Comfortable

Kullanım:

- dashboard
- overview
- usage card
- module landing

Tipik değerler:

- ana section gap: `gap-4` / `gap-6`
- panel padding: `p-4` / `p-5`
- modal içerik: `p-5` / `p-6`

### Compact

Kullanım:

- CRUD/list
- filter toolbar
- dense detail panel
- table-heavy screen

Tipik değerler:

- ana section gap: `gap-3` / `gap-4`
- panel padding: `p-3` / `p-4`
- dense card padding: `px-3 py-2.5`
- compact modal/detail padding: `p-4`

---

## Page Scaffold

Skeleton’daki fiili shell kararları:

- sidebar genişliği: `w-60` veya `w-64`
- main content: `flex-1 overflow-auto`
- sayfa padding: çoğu yüzeyde `p-6`

Kural:

- büyük tablolar için içerik tam genişliği kullanabilir
- içerik zorunlu olarak merkeze sıkıştırılmaz
- dense ekranlarda iç container yerine bilgi ekonomisi önceliklidir

---

## Toolbar Spacing

Filter / action toolbar için:

- compact toolbar: `gap-2`
- ikinci seviye aksiyon varsa `gap-1.5` kabul edilir
- toolbar dikeyde şişmemelidir

Kural:

- CRUD toolbar’ı kart görünümünde olabilir ama dashboard kartı gibi davranmaz

---

## Table Spacing

Dense tablo hedefi:

- header padding yaklaşık `px-3 py-2`
- body padding yaklaşık `px-3 py-2`
- satır yüksekliği yaklaşık `36-40px`

Kural:

- çok dar satır yasak
- çok ferah satır da dense CRUD’da yasak

---

## Detail Panel / Modal Spacing

Compact detail surface:

- header: `px-4 py-3`
- body: `px-4 py-4`
- footer: `px-4 py-3`

Comfortable detail surface:

- header: `px-6 py-4`
- body: `px-6 py-6`
- footer: `px-6 py-4`

---

## Bilgi Blokları

Detail panel içinde:

- section arası `space-y-4`
- blok içi satırlar `space-y-2`
- bilgi grid’leri çoğu durumda iki kolonlu düşünülür

Amaç:

- tek ekranda daha fazla okunabilir bilgi sığdırmak

---

## Yasaklar

- rastgele inline pixel değerleri
- gereksiz büyük boş alanla veri yoğunluğunu öldürmek
- dense ekranda `p-6`/`gap-6`’yı varsayılan kullanmak
- spacing hack için açıklamasız negatif margin
