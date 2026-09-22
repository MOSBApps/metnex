# metnex — Table Pattern

Bu repo için tablo kararı library-temelli değil, davranış-temellidir.

Amaç:

- dense ERP çalışma yüzeyi
- hızlı scan
- disiplinli kolon ekonomisi

---

## Temel Kurallar

Tablo:

- compact CRUD’da varsayılan sonuç yüzeyidir
- yatay scroll kabul eder
- header/cell spacing sıkıdır
- status ve yardımcı alanlar kontrollü yer kaplar

---

## Kolon Ekonomisi

Kolonlar şu düzende düşünülür:

- ana iş alanı
- status/type
- sayısal alan
- zaman
- row action

Kural:

- her kolon kendini justify etmeli
- yardımcı bilgi hücre içinde ikinci satır olabilir ama kalabalıklaştırmamalıdır
- row action kolonu küçük ve öngörülebilir kalır

---

## Hizalama

- metin: sol
- sayı/tutar/kota: sağ veya en az tabular hizalı
- kod/ID/slug: mono veya tabular yaklaşım
- aksiyon: sağ

Kural:

- numerik alanlar hizasız bırakılmaz

---

## Dense Satır Kuralı

Dense tablo için hedef:

- bir ekrana daha fazla satır sığması
- satır yüksekliğinin gereksiz büyümemesi
- hover/selected durumu görünür ama bağırmayan olması

Kural:

- satır içerikleri sıkıştırılır ama tiny/legacy görünüme düşülmez

---

## Sorting

Server-side sorting varsayılandır.

Buton/başlık dili:

- hangi kolonun aktif sıralandığı açık görünmeli
- icon/arrow yardımcıdır

Client-side sorting ancak küçük veri setinde ve bilinçli kararla seçilir.

---

## Pagination

Büyük veri setinde:

- server-side pagination varsayılan
- toplam kayıt sayısı görünür
- mevcut sayfa ve hareket butonları açık olmalı

Kural:

- pagination footer tabloyla aynı görsel ailede kalmalı
- sonsuz scroll varsayılan değildir

---

## Loading / Empty / Error

Tablo şu state’leri açıkça gösterir:

- loading rows / skeleton
- empty state
- error banner veya retry alanı

Sessiz boş tablo kabul edilmez.

---

## Responsive

- `overflow-x-auto` kabul edilir
- küçük ekranda ikincil kolonlar azaltılabilir
- ana iş kolonu ve kritik aksiyonlar korunur

---

## Yasaklar

- dashboard estetiğiyle ferahlatılmış tablo
- numerik alanları düz metin gibi bırakmak
- çok sayıda badge ile satırı gürültülü hale getirmek
- satıra sürpriz navigasyon yüklemek
