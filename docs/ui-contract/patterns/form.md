# metnex — Form Pattern

Bu repo için form tasarımı, “boş alanı bol form” değil, kontrollü yoğunluk yaklaşımını izler.

---

## Form Yoğunluğu

Varsayılan:

- CRUD detail içinde `compact`
- dashboard/setup odaklı yüzeyde gerekirse `comfortable`

Hedef:

- alanları okunur tutmak
- dikey alanı verimli kullanmak
- yardımcı metni minimum ama yeterli seviyede vermek

---

## Alan Yapısı

Her form alanı açıkça şunları taşımalıdır:

- label
- control
- error alanı
- gerekiyorsa kısa helper text

Kural:

- placeholder label yerine geçmez
- error sadece toast ile çözülemez

---

## Grid Kuralı

Tipik düzen:

- dar form: tek kolon
- detail form: iki kolon
- uzun metin / textarea / geniş alan: tam satır

Amaç:

- bilgiyi tek ekranda daha verimli yerleştirmek

---

## Numerik ve Kod Alanları

- para, yüzde, kota, sayısal alanlar hizalı olmalı
- kod/slug/ID gibi alanlar daha disiplinli görünmelidir

Kural:

- mümkünse `tabular-nums`
- gerektiğinde mono yardımcı stil

---

## Form Actions

Standart footer:

- cancel / secondary solda veya önce
- primary save sağda veya sonda

Kurallar:

- save loading state’i görünür olur
- çift submit engellenir
- dirty form çıkışı bilinçli ele alınır

---

## API / Validation Hatası

Form iki seviyede hata gösterebilir:

- field-level
- form-level

Kural:

- alan hatası altta görünür
- API submit hatası form üstünde veya action alanına yakın görünür

---

## Modal Form Kuralı

Sadece kısa formlar modal olabilir.

Uzun edit/create akışı:

- detail panel
- drawer
- detail screen

şeklinde çözülür.

---

## Responsive

- iki kolonlu form mobilde tek kolona düşebilir
- action bar erişilebilir kalır
- yoğunluk mobilde kırılma yaratmamalı

---

## Yasaklar

- label’sız alan
- yalnız placeholder ile alan anlatımı
- her formu modale sıkıştırma
- gereksiz uzun helper text duvarı
