# Module Dashboard Standard

Bu doküman yeni modül giriş yüzeyleri için bağlayıcı dashboard standardını tanımlar.

Detaylı UI karşılığı:

- `../ui-contract/patterns/dashboard.md`
- `../ui-contract/patterns/layout.md`
- `CRUD_SCREEN_STANDARD.md`

---

## Amaç

Dashboard, çalışma ekranı değildir.
Görevi:

- hızlı durum okuması
- ana metrikleri gösterme
- kullanıcıyı doğru operasyon yüzeyine yönlendirme

Modülün ilk menü girdisi, aksi belgelenmedikçe dashboard olmalıdır.

---

## 1. Zorunlu Entry Rule

Varsayılan sıra:

1. dashboard
2. list / queue / CRUD
3. detail / report / setup alt yüzeyleri

İstisna ancak şu durumlarda kabul edilir:

- modül setup-only
- modül wizard/flow tabanlı
- modül first-class navigasyon yüzeyi değil

---

## 2. Dashboard ve CRUD Ayrımı

Dashboard:

- `comfortable` yoğunluk varsayılanıdır
- yönlendirici ve özetleyicidir
- kart ve grafik bazlı okunur

CRUD/list:

- `compact` yoğunluk varsayılanıdır
- doğrudan çalışma yüzeyidir
- veri yoğunluğu baskındır

Bu ayrım bozulmamalıdır.

---

## 3. Canonical Layout

Dashboard tipik olarak şu katmanları içerir:

- üst bölüm: giriş açıklaması + hızlı aksiyon
- ilk sıra: info / KPI kartları
- ikinci sıra: trend / dağılım / operasyonel grafik kartları
- opsiyonel üçüncü sıra:
  - recent activity
  - pending actions
  - exceptions
  - quick links

---

## 4. Info Card Standardı

Kartlar şu soruyu cevaplamalıdır:

- şu anda ne durumdayız?

Kurallar:

- operasyonel anlamı olmayan dekoratif metrik yasak
- boş modül için de dürüst zero-state gösterilir
- birincil metrikler önce gelir
- kartlar kısa ve hızlı taranabilir olmalı

Dashboard kartları CRUD stat-card’larıyla aynı yoğunlukta olmak zorunda değildir.

---

## 5. Graph / Distribution Alanı

Grafikler yalnız anlamlı operasyon sorularına cevap veriyorsa kullanılır:

- trend
- durum dağılımı
- yaş/backlog kırılımı
- kategori/owner yoğunluğu

Kurallar:

- fake chart yasak
- veri yoksa explicit placeholder gösterilir
- grafik kartı dashboard’ın tamamını işgal etmez; liste ekranı yerine geçmez

---

## 6. Quick Actions

İzin verilen hızlı aksiyonlar:

- yeni kayıt oluştur
- kritik kuyruk aç
- ön tanımlı filtreye git

Kurallar:

- quick action dashboard’ın ana amacı olamaz
- dashboard içinde doğrudan yoğun CRUD formu açılmaz

---

## 7. Permission Model

Kurallar:

- dashboard görünürlüğü ile alt CRUD yetkileri ayrı değerlendirilir
- kart üzerinde gösterilen hassas veri için ilgili view yetkisi gerekir
- kullanıcı görebildiği karttan gideceği yüzeyde permission duvarına çarpmamalıdır; gerekiyorsa kart görünürlüğü daraltılır

---

## 8. Responsive Davranış

Kurallar:

- info card’lar temiz stack olmalı
- grafik alanı yatay taşmamalı
- mobilde dashboard hâlâ overview olarak kalmalı, kırık veri duvarına dönüşmemeli

---

## 9. Delivery Requirement

Yeni modül / yeni first-class dashboard işi şunları belirtir:

1. dashboard route
2. info card seti
3. alt grafik/dağılım alanı
4. quick action seti
5. yoğunluk kararı
6. CRUD yüzeyiyle ilişki
7. varsa istisna gerekçesi
