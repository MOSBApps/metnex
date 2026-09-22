# metnex — Typography Sistemi

Bu repo için tipografi kararı “okunabilir küçük ölçek”tir.

Amaç:

- yoğun ekranda daha çok bilgi göstermek
- metni küçültürken okunabilirliği kaybetmemek
- kod, ID ve numerik değerleri disiplinli ayırmak

---

## Resmi Font Rolleri

Skeleton içinde zorunlu font paketi tanımlı değildir.
Bu yüzden kontrat font ailesi değil, rol tanımlar:

- UI metni: proje sans fontu
- numerik/kod alanı: mono veya tabular yaklaşım

Kural:

- numerik kolonlar, ID’ler, slug/kod alanları ve para değerleri `tabular-nums` kullanmalıdır
- gerekirse `font-mono` yardımcı olarak kullanılabilir

---

## Boyut Hiyerarşisi

### Dense / operasyon yüzeyi

- yardımcı metin: `10-12px`
- varsayılan tablo/form metni: `12-14px`
- panel iç başlığı: `14-16px`
- sayfa başlığı: `20px` civarı

### Comfortable / overview yüzeyi

- yardımcı metin: `12px`
- varsayılan açıklama: `14px`
- metric değer: `18-24px`
- sayfa başlığı: `20-24px`

Kural:

- dashboard dışında `text-2xl+` kullanımını abartma
- CRUD’da büyük metin blokları operasyon yoğunluğunu bozmamalı

---

## Ağırlık Sistemi

- `font-normal`: gövde metin
- `font-medium`: yardımcı vurgu, label
- `font-semibold`: başlık, önemli değer
- `font-bold`: sınırlı metric vurgusu

`font-black` ve aşırı kalın stiller yasaktır.

---

## Satır Yüksekliği

- tablo/dense cell: sıkı
- form label/value: normal
- açıklama paragrafı: rahat ama kısa

Kural:

- yoğun yüzeyde uzun açıklama paragrafı yerine kısa yardımcı satır kullan

---

## Türkçe Locale ve Sayısal Gösterim

- sıralama: `localeCompare('tr')` veya `localeCompare('tr-TR')`
- sayı gösterimi: `toLocaleString('tr-TR')`
- tarih: Türkçe locale
- para ve numerik alanlarda hizalama kararlı olmalı

---

## Metin Stili Kuralları

- tablo ve formda gereksiz uzun açıklama kullanma
- uppercase yardımcı label’lar kısa olmalı
- badge metni 1-2 kelimeyi geçmemeli
- yoğun tabloda ikinci satır bilgi yalnız gerçekten gerekli ise açılmalı

---

## Yasaklar

- dense CRUD yüzeyinde `16px` gövde metni varsayılan yapmak
- numerik alanları oransal karakterlerle hizasız bırakmak
- görsel gösteriş için aşırı büyük başlıklar kullanmak
