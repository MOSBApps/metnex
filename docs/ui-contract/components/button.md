# metnex — Button Contract

Bu repo için buton kararı yoğunluk ve öncelik kararıdır.

---

## Resmi Sınıflar

Skeleton’ın bağlayıcı button ailesi:

- `app-button-primary`
- `app-button-primary-dense`
- `app-button-outline`
- `app-button-outline-dense`

Ek yardımcı kullanım:

- düşük öncelikli inline aksiyonlar
- icon-only row actions

---

## Yoğunluk

### Comfortable

- dashboard
- geniş action bar
- ana create/save aksiyonları

### Dense

- filter toolbar
- row action bar
- dense detail footer
- compact CRUD header

Hedef yükseklik:

- dense: yaklaşık `32-36px`

---

## Öncelik Kuralı

- bir yüzeyde tek baskın primary action
- diğerleri outline/secondary
- destructive action primary ile görsel olarak karışmaz

---

## Loading

Kurallar:

- buton disable olur
- loading durumu görünür olur
- aynı aksiyon tekrar basılamaz

---

## İkon Kullanımı

- ikon tek başına ise `aria-label` gerekir
- ikon metne yardımcıdır, metnin yerine geçmez
- dense toolbar’da ikon-only kabul edilebilir

---

## Yasaklar

- aynı görünüm alanında birden fazla eşit öncelikli primary button
- destructive aksiyonu primary save ile aynı tonda göstermek
- dense toolbar’da iri butonlar kullanmak
