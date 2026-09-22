# metnex UI Contract

> Bu doküman ve altındaki dosyalar bağlayıcı source-of-truth’tur.
> Yeni ekran, refactor, component varyantı veya yoğunluk kararı bu kontrata göre verilmelidir.

---

## Amaç

`metnex` artık şu yönleri aynı anda taşır:

- SaaS foundation
- dense ERP operasyon yüzeyleri
- platform ops / audit / performance
- customer-admin ve platform-admin yüzeyleri

Bu yüzden UI kararları artık "güzel görünüm" üzerinden değil, operasyonel yoğunluk ve tutarlılık üzerinden yönetilmelidir.

Ana ilke:

- Dashboard yüzeyleri: özet ve yönlendirme
- CRUD / yönetim yüzeyleri: yoğun, hızlı taranabilir, veri-ekonomik
- Form ve modal kararları: minimum bağlam kaybı

---

## Kontrat Hiyerarşisi

```text
UI_CONTRACT.md
  foundations/
  patterns/
  components/
  governance/
```

Öncelik sırası:

1. `foundations/`
2. `patterns/`
3. `components/`

Alt katman üst katmanla çelişemez.

---

## Skeleton İçin Resmi UI Yönü

Bu repo için resmi görsel yön:

- Premium ama yoğun
- Dashboard-marketing değil, operasyon masası
- Ferah ama boşluk israfı yapmayan
- Tablo, filtre ve detail panel’de veri yoğunluğu öncelikli
- Platform ve customer-admin yüzeylerinde aynı görsel dil

Bu kararın sonucu:

- CRUD ekranlarında `compact` yoğunluk varsayılandır
- Dashboard/modül overview ekranlarında `comfortable` varsayılandır
- Aynı modül içinde overview ile çalışma ekranı aynı yoğunlukta olmak zorunda değildir

---

## Resmi Primitive Set

Skeleton’da resmi primitive set:

- CSS semantic classes: `app-*`
- Ortak React primitive’leri: `apps/web/src/components/platform-admin-ui.tsx`
- Sayfa yapısı: app shell + sidebar + content

Bu repo için bağlayıcı isimler:

- `app-card`, `app-card-dense`
- `app-input`, `app-input-dense`
- `app-button-primary`, `app-button-primary-dense`
- `app-button-outline`, `app-button-outline-dense`
- `app-table`
- `PageIntro`, `StatCard`, `DetailPanel`, `Modal`, `Tabs`, `Badge`, `StatusBadge`

`shadcn/ui`, `TanStack Table` veya başka primitive setler skeleton kontratında zorunlu değildir.
Kullanım kararı ancak mevcut primitive set yetersiz kalırsa ve override ile mümkündür.

---

## Yoğunluk Modları

### `compact`

Kullanım alanı:

- platform users / tenants / roles
- customer-admin users / tenants
- audit / performance
- liste, filtre, detail panel, sekme, tablo, toolbar

Hedef:

- kontrol yüksekliği yaklaşık `32-36px`
- satır yüksekliği yaklaşık `36-40px`
- daha çok görünür kayıt
- daha kısa yardımcı metin

### `comfortable`

Kullanım alanı:

- module dashboard
- tenant overview
- platform overview
- kullanım kartları, durum kartları, yüksek seviyeli özetler

Hedef:

- daha rahat tarama
- daha az işlem baskısı
- açıklama ve yönlendirme için biraz daha geniş alan

Kural:

- CRUD içinde `comfortable` kullanımı istisnadır
- Dashboard içinde `compact` kullanımı sadece veri yoğunluğu baskınsa gerekçelendirilir

---

## Genel Kurallar

### 1. Önce pattern, sonra ekran

Ekran tasarımı sıfırdan kurulmaz.
Önce ilgili pattern dosyası seçilir:

- CRUD/list/detail ise `patterns/crud-screen.md`
- module entry/overview ise `patterns/dashboard.md`
- yoğun data grid ise `patterns/table.md`
- form ise `patterns/form.md`

### 2. Loading / Error / Empty zorunlu

Her veri yükleyen yüzey şu state’leri açıkça ele alır:

- `loading`
- `error`
- `empty`

Sessiz boş ekran kabul edilmez.

### 3. Sahte kesinlik ve sahte yoğunluk yasak

- placeholder veri gerçek gibi sunulmaz
- kompaktlık readability’yi bozacak kadar küçültülmez
- yoğunluk uğruna bilgi hiyerarşisi yok edilmez

### 4. Türkçe locale zorunlu

- sıralama: `localeCompare('tr')` veya `localeCompare('tr-TR')`
- sayı/tutar/tarih gösterimi Türkçe locale ile yapılır
- ID, kod, tutar ve sayısal kolonlarda `tabular-nums` tercih edilir

### 5. Permission görünürlüğü bilinçli olmalı

- Menü görünürlüğü ve API yetkisi ayrı katmandır
- UI görünürlüğü yine de role/permission ile bilinçli yönetilmelidir
- “nasıl olsa API kapalı” diyerek link gösterimi bırakılmaz

### 6. Responsive davranış degrade etmeli

- Masaüstü yoğunluğu mobilde kırılamaz
- yatay scroll kabul edilebilir
- kritik aksiyon ve ana filtreler mobilde erişilebilir kalmalıdır

---

## Doküman İndeksi

### Foundations

- `foundations/colors.md`
- `foundations/typography.md`
- `foundations/spacing.md`
- `foundations/motion.md`

### Patterns

- `patterns/layout.md`
- `patterns/crud-screen.md`
- `patterns/dashboard.md`
- `patterns/form.md`
- `patterns/table.md`
- `patterns/modal-drawer.md`
- `patterns/empty-state.md`

### Components

- `components/button.md`
- `components/input.md`
- `components/dropdown.md`
- `components/badge.md`

### Governance

- `governance/override-rules.md`
- `governance/deviation-log.md`

---

## Agent Başlangıç Protokolü

UI içeren her task için:

1. Bu dosyayı oku
2. Etkilenen pattern dosyasını oku
3. Gerekli component dosyasını oku
4. Yoğunluk kararını açık seç
5. Var olan primitive set ile uygula
6. Gerekirse override annotation + deviation log kullan

Bu akış atlanırsa UI işi governance açısından eksik kabul edilir.
