# metnex — Input Contract

Bu repo için input kararı form yoğunluğu ve taranabilirlik kararıdır.

---

## Resmi Sınıflar

- `app-input`
- `app-input-dense`

Kural:

- dense CRUD/filter yüzeylerinde `app-input-dense`
- comfortable form alanında `app-input`

---

## Yükseklik Kuralı

Hedef:

- dense input: yaklaşık `32px`
- normal input: yaklaşık `36px`

Amaç:

- form ve filtre alanını dikeyde sıkıştırmak

---

## Label ve Placeholder

- label zorunludur
- placeholder yardımcıdır
- placeholder tek başına alan anlamını taşımaz

Arama alanı istisna olabilir; o durumda erişilebilir isim gerekir.

---

## Numerik / Kod Alanları

Şu alanlarda daha disiplinli görünüm zorunludur:

- para
- kota
- yüzde
- ID
- slug
- kod

Kural:

- `tabular-nums`
- gerektiğinde mono destek

---

## Error / Disabled / Readonly

- error görünürlüğü açık olmalı
- disabled alan gerçekten pasif görünmeli
- readonly alan disabled ile karıştırılmamalı

---

## Yasaklar

- dense filtre toolbar’da standart büyük input kullanmak
- label’sız input
- numerik alanı düz metin alanı gibi bırakmak
