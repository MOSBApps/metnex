# metnex — CRUD / Management Screen Pattern

Bu pattern, skeleton’daki yoğun operasyon yüzeylerinin resmi UI karşılığıdır.

---

## Resmi Akış

```text
Module Dashboard
  -> CRUD/List Screen
      -> Create / Edit
      -> Detail Panel veya Detail Screen
      -> Related Sections / Tabs
```

Kural:

- dashboard ve CRUD aynı sayfa mantığında birleşmez
- operasyon girişi listeden yapılır

---

## 1. Liste Girişi

Her CRUD yüzeyi şu sıraya yakın çalışır:

1. `PageIntro`
2. kısa stat / summary alanı
3. compact filter toolbar
4. dense table / result list
5. detail panel veya create modal

Bu repo için users, tenants, audit, performance buna örnektir.

---

## 2. Yoğunluk

CRUD yüzeyinde varsayılan yoğunluk:

- `PageIntro density="compact"`
- `StatCard density="compact"`
- `Tabs density="compact"`
- `DetailPanel density="compact"`
- dense button/input class’ları

Amaç:

- dikey alanı korumak
- tek ekranda daha çok çalışma bağlamı göstermek

---

## 3. Filter Toolbar

Kural:

- toolbar kompakt kart veya yüzey içinde tutulur
- gereksiz geniş açıklama yerine kısa section description kullanılır
- çok sık kullanılan filtreler ilk satıra konur
- reset/clear aksiyonu görünür olur

Ölçüt:

- mümkünse toolbar 1-2 satırı geçmez

---

## 4. Dense Table

Dense CRUD tablosu:

- sıkı header/cell padding
- okunabilir ama kısa satır yüksekliği
- numerik alanlarda `tabular-nums`
- row action yoğunluğu kontrollü

Kural:

- status, type, lifecycle gibi alanlar badge ile kısa gösterilir
- yardımcı ikinci satır bilgi sadece gerçekten gerekliyse eklenir

---

## 5. Detail Surface Seçimi

### Detail Panel

Şu durumlarda uygundur:

- listeden bağlam kopmadan çalışmak istiyorsak
- ana tabloyu açık tutmak değerliyse
- orta karmaşıklıkta bir kaynak üzerinde çalışıyorsak

### Detail Screen

Şu durumlarda uygundur:

- form çok uzunsa
- alt kaynak ilişkileri yoğunsa
- derin çalışma / çok sekme gerekiyorsa

### Modal

Sadece:

- kısa create
- kısa confirmation
- 2-4 alanlık küçük yardımcı form

---

## 6. Section ve Tab Mantığı

Detay yüzeyinde iki yaklaşım var:

- section blocks
- domain tabs

Sekme şu durumda seçilir:

- ilişkili alan kümeleri net ayrışıyorsa
- her kümenin kendi okuma/yazma sınırı varsa

Section şu durumda seçilir:

- tüm bilgiler tek akışta anlamlıysa
- sekme sayısı artmayacaksa

---

## 7. CRUD ve Dashboard Ayrımı

CRUD yüzeyinde:

- grafik zorunlu değildir
- büyük KPI duvarı istenmez
- çalışma verisi ana odaktır

Dashboard yüzeyinde:

- yönlendirme ve durum özeti öndedir
- yoğun veri grid’i ana yapı değildir

---

## 8. Modal / Confirmation Kuralı

- destructive aksiyonlar confirmation ister
- kısa confirmation modal uygundur
- büyük edit akışını moda sıkıştırmak yasaktır

---

## 9. Responsive

- toolbar wrap olabilir
- dense table yatay scroll alabilir
- detail panel mobilde daha geniş davranabilir

Kural:

- mobilde aksiyonlar kaybolmaz

---

## 10. Delivery Notes Zorunluluğu

CRUD işi şunları açıklar:

1. yoğunluk modu
2. liste ve filtre modeli
3. detail surface seçimi
4. create/edit/delete akışı
5. tab/section permission özeti
6. varsa override
