# Requirements Discovery and SRS Runbook

## 1. Amaç ve Kapsam

Bu runbook, müşteri görüşmelerinden başlayarak onaylı bir Software Requirements
Specification (SRS) üretimine kadar kullanılacak standart dokümanların ve sürecin
nasıl işletileceğini tanımlar.

Standartlaştırılan yaşam döngüsü:

```text
Müşteri Görüşmesi
  → Discovery Dokümanı
  → Eksiklerin ve açık soruların netleştirilmesi
  → SRS üretimi
  → İnsan gözden geçirmesi
  → Onaylı SRS
  → Epic / Feature / Story / Task üretimi
  → Geliştirme
```

Bu runbook, müşteri gereksinimlerinin süreç içinde kaybolmasını, yanlış
yorumlanmasını veya AI tarafından uydurulmasını (hallucination) engellemek
amacıyla kullanılır. Her aşamada kaynak, izlenebilir ve doğrulanabilir olmalıdır.

---

## 2. Dokümanların Rolleri

### `DISCOVERY_TEMPLATE.md`

Müşteri görüşmesi sırasında kullanılan standart ihtiyaç toplama şablonudur.

- Müşteri diliyle doldurulur; yazılım tasarım dokümanı değildir.
- Müşterinin problem tanımı, beklentileri, feature talepleri, kararları,
  kısıtları ve açık sorularını içerir.
- İlk görüşmede her alanın doldurulması zorunlu değildir.
- Eksik bilgi tahmin edilmez; eksik kalır veya açık soru olarak işaretlenir.

### `DISCOVERY_EXAMPLE.md`

`DISCOVERY_TEMPLATE.md` dosyasının nasıl doldurulacağını gösteren referans
dokümandır.

- Yalnızca referans amaçlıdır.
- Yeni projelerde kopyalanıp temel olarak kullanılmaz.
- İçerdiği örnek şirket, müşteri, feature ve karar bilgileri başka projelere
  taşınmaz.
- Tek amacı, beklenen detay seviyesini ve yazım biçimini göstermektir.

### `SRS_TEMPLATE.md`

Discovery çalışması tamamlandıktan sonra SRS üretmek için kullanılan standart
şablondur.

- Doğrudan müşteri görüşmesinde doldurulmaz.
- İçeriği Discovery dokümanından türetilir.
- AI0 tarafından doldurulabilir.
- İnsan incelemesi ve onayı olmadan geliştirme kaynağı olarak kabul edilmez.

---

## 3. Proje Başlangıcında Yapılacaklar

Yeni bir proje başladığında:

1. `DISCOVERY_TEMPLATE.md` dosyasını referans al.
2. Projeye özel yeni bir Discovery dokümanı oluştur.
3. Template dosyasının kendisini değiştirme.
4. Projeye özel dosya için anlamlı bir isim kullan, örneğin:

   ```text
   docs/requirements/DISCOVERY.md
   ```

   veya proje yapısına uygun başka bir requirements klasörü.

**Template dosyası ile projeye özel doküman birbirinden ayrı tutulmalıdır.**
Template dosyası her projede aynı kalmalı, proje dokümanı ise o projeye özel
içerikle yaşamalıdır.

---

## 4. Müşteri Görüşmesi Sırasında Kullanım

Görüşme sırasında not alırken uyulacak kurallar:

- Müşterinin söylediği bilgi, mümkün olduğunca kendi anlamı korunarak yazılır.
- Müşterinin söylemediği bir gereksinim eklenmez.
- Teknik çözüm, müşteri ihtiyacı gibi yazılmaz.
- Belirsiz bilgiler açık soru olarak kaydedilir.
- Çelişkili ifadeler silinmez; çelişki olarak kayıt altına alınır.
- Modül yapısı ilk görüşmede kesin olmak zorunda değildir.
- Bir feature henüz bir modüle bağlanamıyorsa "Belirlenmedi" olarak kalabilir.
- Yeni talepler benzersiz `F-xxx` kimliğiyle kaydedilir.
- Kararlar `D-xxx` kimliğiyle tutulur.
- Açık sorular `Q-xxx` kimliğiyle tutulur.
- Varsayımlar açıkça varsayım olarak işaretlenir.

---

## 5. Discovery Dokümanının Yaşayan Doküman Olarak Kullanımı

Discovery dokümanı yalnızca ilk toplantı tutanağı değildir; proje boyunca
güncellenen yaşayan bir dokümandır.

Yeni müşteri görüşmelerinde:

- Mevcut dosya güncellenir, yeni bir dosya oluşturulmaz.
- Yeni feature talepleri yeni `F-xxx` ID ile eklenir.
- Daha önce kullanılmış ID'ler yeniden kullanılmaz.
- Açık sorular cevaplandığında cevap ve durum güncellenir.
- Bir karar değişmişse eski karar iz bırakmadan silinmez; değişiklik geçmişi
  veya ilgili not korunur.
- Kapsam dışına alınan talepler silinmez; sadece durumları değiştirilir.

Gereksinim geçmişi korunmalıdır; bir gereksinimin neden değiştiğini veya neden
kapsam dışı kaldığını geriye dönük takip edebilmek gerekir.

---

## 6. Discovery Tamamlanma Kontrolü

SRS üretimine geçmeden önce aşağıdaki minimum kontrol listesi gözden
geçirilmelidir:

- Projenin amacı anlaşılır mı?
- Kapsam dahilinde ve kapsam dışında kalan konular belli mi?
- Temel kullanıcı / paydaş grupları belli mi?
- Bilinen feature talepleri kayıtlı mı?
- Kritik iş kuralları not edilmiş mi?
- Açık sorular listelenmiş mi?
- Varsayımlar ayrıştırılmış mı?
- Entegrasyon ihtiyaçları biliniyor mu veya açık soru olarak işaretli mi?
- Güvenlik / yetkilendirme konusunda bilinen beklentiler kaydedilmiş mi?
- MVP ve sonraki faz ayrımı yapılabiliyor mu?

Tüm soruların cevaplanmış olması zorunlu değildir. Ancak cevaplanmamış
konular dokümanda açıkça görünür olmalıdır (örn. `Q-xxx` statüsü "Açık").

---

## 7. AI0 ile SRS Üretimi

AI0'a en az şu iki dosya verilmelidir:

- Projeye ait doldurulmuş Discovery dokümanı (örn. `docs/requirements/DISCOVERY.md`)
- `docs/runbooks/SRS_TEMPLATE.md`

AI0'ın görevi, Discovery içeriğini analiz ederek `SRS_TEMPLATE.md` yapısına
uygun bir SRS üretmektir.

AI0 için geçerli kurallar:

1. Discovery, ana iş gereksinimi kaynağıdır.
2. Müşteri tarafından belirtilmeyen iş gereksinimleri uydurulmaz.
3. Eksik bilgiler `TBD` olarak işaretlenir.
4. Her `TBD` için açık soru oluşturulur.
5. Çelişkiler AI tarafından otomatik çözülmez.
6. Her fonksiyonel gereksinim benzersiz `FR-xxx` ID alır.
7. İş kuralları `BR-xxx` ID alır.
8. Gereksinimler mümkün olduğunca kaynak `F-xxx` kaydına bağlanır.
9. Kabul kriterleri test edilebilir olmalıdır.
10. Fonksiyonel olmayan gereksinimler ölçülebilir olmalıdır.
11. Müşteri tarafından belirtilmemiş teknik kararlar müşteri gereksinimi
    olarak yazılmaz.
12. Böyle kararlar `Proposed Technical Decision` / `Önerilen Teknik Karar`
    olarak işaretlenir.
13. MVP ile sonraki fazlar ayrılır.
14. SRS sonunda açık sorular, varsayımlar, çelişkiler, eksik gereksinimler ve
    önerilen teknik kararlar ayrıca raporlanır.

---

## 8. AI0 İçin Örnek Prompt

> Projeye ait Discovery dokümanını incele.
> `docs/runbooks/SRS_TEMPLATE.md` dosyasını hedef şablon olarak kullan.
>
> Discovery dokümanında bulunmayan iş gereksinimlerini uydurma.
> Eksik bilgileri TBD olarak işaretle ve Açık Sorular bölümüne ekle.
> Çelişkileri kendi kararınla çözme.
>
> Discovery'deki feature kayıtları ile SRS gereksinimleri arasında
> izlenebilirliği koru.
> Her fonksiyonel gereksinime benzersiz FR ID, her iş kuralına benzersiz BR ID
> ver.
>
> Kabul kriterlerini test edilebilir biçimde yaz.
>
> Müşteri tarafından belirtilmeyen ancak teknik açıdan önerdiğin kararları
> müşteri gereksinimi olarak değil, Önerilen Teknik Karar olarak belirt.
>
> SRS üretiminin sonunda ayrıca:
>
> - Open Questions
> - Assumptions
> - Conflicts
> - Missing Requirements
> - Proposed Technical Decisions
>
> listesini oluştur.

Prompt gerektiğinde iyileştirilebilir fakat anlamı korunmalıdır.

---

## 9. SRS İnsan Gözden Geçirmesi

AI0 tarafından oluşturulan SRS doğrudan geliştirmeye verilmez. Geliştirici
veya analist aşağıdakileri kontrol etmelidir:

- AI, müşteri tarafından söylenmemiş bir gereksinim eklemiş mi?
- Discovery feature'larının tamamı SRS'de karşılanmış mı?
- Her önemli FR'nin kaynağı belli mi?
- Açık sorular doğru taşınmış mı?
- Varsayımlar gereksinime dönüşmüş mü (dönüşmemeli)?
- Teknik öneriler müşteri gereksinimi gibi gösterilmiş mi?
- İş kuralları doğru ayrıştırılmış mı?
- Yetkilendirme kuralları tutarlı mı?
- Hata ve istisna durumları yeterli mi?
- Kabul kriterleri gerçekten test edilebilir mi?
- MVP kapsamı korunmuş mu?

Bu kontrol tamamlanmadan SRS "Onaylı" statüsüne geçmez.

---

## 10. Gereksinim İzlenebilirliği

Runbook, aşağıdaki zinciri standart izlenebilirlik modeli olarak tanımlar:

```text
Discovery F-xxx
  → SRS FEAT-xxx
  → FR-xxx
  → BR-xxx
  → AC-xxx
  → TC-xxx
```

Örnek:

```text
F-007 → FEAT-004 → FR-016 → BR-009 → AC-023 → TC-041
```

Her projede zincirin tamamının her gereksinimde bulunması zorunlu değildir.
Ancak bir geliştirici veya test uzmanı, bir gereksinimin neden var olduğunu
mümkün olduğunca Discovery kaynağına kadar takip edebilmelidir.

---

## 11. SRS Sonrası Geliştirme Akışı

Onaylanmış SRS; Epic üretimi, Feature ayrıştırma, User Story oluşturma,
teknik task üretimi, test case üretimi ve geliştirme planlaması için ana
kaynaklardan biridir.

Geliştirici, SRS'de olmayan yeni bir iş kuralını kendi başına üretmez.

Yeni bir müşteri ihtiyacı ortaya çıkarsa:

1. Önce Discovery güncellenir.
2. Gerekiyorsa müşteri kararı alınır.
3. SRS güncellenir.
4. Ardından backlog güncellenir.

---

## 12. Değişiklik Yönetimi

Proje başladıktan sonra müşteri yeni feature istediğinde izlenecek süreç:

```text
Müşteri yeni talep
  → Discovery'ye yeni F-xxx
  → kapsam / öncelik / faz değerlendirmesi
  → onay
  → SRS güncellemesi
  → backlog güncellemesi
  → geliştirme
```

SRS, müşteri görüşmesinden bağımsız olarak değiştirilemez; her SRS
güncellemesinin kökeninde güncellenmiş bir Discovery kaydı olmalıdır.

Teknik refactoring ve implementasyon detayları bu sürecin dışındadır; bunlar
her zaman bir Discovery güncellemesi gerektirmez.

---

## 13. Dosya Yönetimi Kuralları

Aşağıdaki dosyalar template/reference dosyalarıdır ve proje bazında
overwrite edilmez:

- `docs/runbooks/DISCOVERY_TEMPLATE.md`
- `docs/runbooks/DISCOVERY_EXAMPLE.md`
- `docs/runbooks/SRS_TEMPLATE.md`

Önerilen proje dokümanı yapısı:

```text
docs/
├── runbooks/
│   ├── DISCOVERY_TEMPLATE.md
│   ├── DISCOVERY_EXAMPLE.md
│   ├── SRS_TEMPLATE.md
│   └── REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md
│
└── requirements/
    ├── DISCOVERY.md
    └── SRS.md
```
