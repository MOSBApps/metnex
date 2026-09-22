# metnex — Badge Contract

Badge, kısa durum ve sınıflandırma göstergesidir.
Aksiyon taşımaz.

---

## Kullanım Alanları

- status
- type
- measurement state
- kısa category etiketi

Skeleton örnekleri:

- `StatusBadge`
- `Badge`
- usage state label (`REAL`, `APPROXIMATE`, `UNSUPPORTED`)

---

## Yoğunluk

Badge’ler varsayılan olarak compact davranır.

Kural:

- küçük ama okunabilir
- tek satır
- kısa etiket

---

## Renk Kuralı

Renk anlam taşır ama tek başına kullanılmaz.

Bu yüzden:

- metin zorunlu
- gerekirse ikon yardımcı olabilir

---

## Metin Kuralı

- 1-2 kelime tercih edilir
- çok uzun badge etiketi yasak
- status mapping bilinçli yapılır

---

## Yasaklar

- clickable badge
- sırf süs için badge
- aynı satırda fazla badge gürültüsü
