# METNEX — AI1 Discovery Brifi

**Durum:** AI0 görüşme brifi / karar aktarımı; onaylı SRS, teknik mimari veya implementasyon talimatı değildir.  
**Kapsam:** Bu görüşmede ayrıntılandırılan kömür ve yakıt operasyonu, ortak laboratuvar, MOSBİO biyokütle ürün analizleri, paçal ve Kırım Tesisi. Diğer Metnex modülleri için önceki Discovery kaynakları ayrıca incelenmelidir.  
**Hedef okur:** AI1 — Product Governance Agent.  
**Kaynak önceliği:** Kullanıcının bu görüşmede verdiği kesin kararlar; kaynak Excel'lerin doğrulanmış içeriği; önceki Discovery/SRS belgeleri. Çelişkide AI1 tek taraflı karar vermez, AI0/Product Owner'a geri döner.

## 1. AI1'e devir talimatı

- Bu brif, görüşmelerde alınmış **iş kararlarının** aktarımıdır. AI1 bunları mimari veya kodlama kararı olarak yorumlamamalı; AI2'ye doğrudan implementasyon emri üretmeden önce Discovery ve SRS ile tutarlılığını kontrol etmelidir.
- Önceki belgelerdeki TBD veya eski varsayımlar, aşağıdaki yeni kararlarla çelişiyorsa sessizce birleştirilmemelidir. Farklar görünür bir karar/çelişki listesinde tutulmalıdır.
- Belgeler hazırlanırken iş gereksinimi icat edilmemeli; eksik bilgi **TBD**, dış ekip doğrulaması veya test doğrulaması olarak işaretlenmelidir.
- Kullanıcı bu görüşme boyunca ara doküman güncellemesi istememiştir; bu dosya özel olarak istenen AI1 devir brifidir. Henüz nihai Discovery/SRS oluşturma talimatı değildir.

## 2. Genel organizasyon ve yetki sınırları

- Ortak laboratuvar ekibi MOSB ENERJİ ve MOSBİO için çalışır. Laboratuvar çalışanı önce işletme seçer, seçili işletmenin laboratuvar alanında çalışır.
- İşletme bazında **görüntüleme** ve **veri girişi** yetkileri ayrı tanımlanır. Ortak ekip, bütün kullanıcılara otomatik çapraz işletme erişimi verildiği anlamına gelmez.
- Laboratuvar performansı hem işletme bazında hem ortak ekip toplamında raporlanır. Bir ortak analiz sonucu birden fazla kayda uygulanıyorsa bu, yapıldığı analiz sayısını çoğaltmaz.
- Parametre, numune noktası ve referans tanımı yönetiminde laboratuvar yetkilisi ve sistem yöneticisinin yetkileri; ilgili işletme sınırları ve önceki görüşme kararları gözetilir.
- İşlem ve değişiklik geçmişi, karar verilen alanlarda önceki değer/ilişki, yeni değer/ilişki, kullanıcı ve zaman bilgileriyle korunur.

## 3. MOSB ENERJİ — kömür kabul, stok, tüketim ve analiz

### 3.1 Araç/kantar ve Netsis ilişkisi
- Metnex normal kantar kullanıcı arayüzüdür; Netsis ile entegrasyon söz konusudur. İlgili kayıt Netsis'te oluşup eşleşmeden Metnex işlemi kesinleşmiş kabul edilmez.
- Yetkili kantar operatörünün istisnai manuel Netsis girişi mümkün olabilir: önce otomatik ilişkilendirme denenir, gerekirse yetkili manuel eşleştirme yapılır; çift kayıt önlenir.
- Araç sevkiyatı, tartım bilgisi ve boşaltıldığı **fiziksel kömür yığını** birbirine bağlanır. Aynı tedarikçiye ait birden fazla ayrı yığın olabilir; tedarikçi listesi sabit kodlanmaz.
- Kesin Netsis entegrasyon anahtarları/veri sözleşmesi TBD'dir.

### 3.2 Gelen kömür analizleri
- Her araçtan yığının dört noktasında alınan numunelerle tek araç numunesi oluşturulur. Araç bazında nem ve üst kalori ölçülür; alt kalori Metnex'te hesaplanır.
- Kül (%) ve uçucu madde (%) için tedarikçi bazında seçilen sabah araç numunelerinden **günlük ortak numune** oluşturulur. Analiz yaklaşık beş saat sürer; sonuç o tedarikçinin aynı gün gelen ilgili araçlarına, numuneye fiilen katılmamış öğleden sonraki araçlar dahil uygulanır.
- **Ortak numuneyi oluşturan araçlar** ile **sonucun uygulandığı araçlar** ayrı ilişkiler olarak izlenir. Bir analiz sonucunun birden fazla araçta görünmesi, birden fazla ayrı test demek değildir.
- Tekrar ortak analizde yeni numune kullanılabilir; laboratuvar yetkilisi geçerli sonucu ve uygulanacağı araçları belirler; önceki sonuçlar korunur.
- Kalori formülünün Excel'deki kullanımı için bu brifin §8'ine bakılmalıdır; ürün/rapor bağlamındaki hesap esasları dış doğrulama bekler.

### 3.3 Kazan beslemesi, stok ve yanma sonrası kül
- Kazan beslemesinde yığın geçişi operatör tarafından kaydedilir; başlangıç/geçiş zamanı ve sayaç bilgisi tutulur. Önceki kömürün bunker/hat üzerinden tamamen çıkış anındaki **kümülatif sayaç değeri**, önceki yığının nihai tüketimini belirler.
- Yığın tüketimi ilgili sayaç farkından; giriş toplamı ile tüketim arasındaki fark ayrı gösterilir. Fark otomatik olarak fire/kayıp diye sınıflandırılmaz; tolerans uydurulmaz.
- Yanma sonrası kazan külü, gelen kömürün laboratuvar kül yüzdesinden farklı bir analizdir. Her vardiyada, gerekirse birden çok kez numune alınabilir; külün kalori sonucu takip edilir. Tüm testler kendi başlarına geçerli kayıtlardır.
- Yanma sonrası kül numunesi operatör/saha tarafından laboratuvara teslim edilir. Laboratuvar tek numune kabul zamanını ve teslim edeni girer; her sonuç giriş zamanı sistemce tutulur; kabul-sonuç süresi takip edilir.
- Kül numunesinin yığın ilişkisi değişim dönemlerinden önerilir; laboratuvar personeli teslim edenin bilgisiyle düzeltebilir. Geçiş numunesi önceki yığın/tedarikçiye aittir. Kabul zamanı ile fiilî alma zamanı farklı olabileceğinden otomatik öneri mutlak doğruluk sayılmaz.
- Yığın kapatmasını operatör yapar; uzman kapanış raporunu inceleyip “İncelendi” olarak işaretleyebilir, not ekleyebilir. Yetkili tarihsel düzeltmelerde önceki değerler korunur.
- Ana kömür raporu mevcut Excel'deki özgün kolon ve formülleri esas alır; satırdan yığın/araç/analiz detayına gidilir; Excel/PDF/yazdırma çıktıları hedeflenir. Kaynak Excel'in kesin alanları ve birimleri ayrıca doğrulanmalıdır.

## 4. Su laboratuvarı — MOSB ENERJİ / MOSBİO

- Numuneleri laboratuvar personeli farklı numune noktalarından toplar ve analiz eder. Tek zaman alanı **laboratuvar numune kabul tarihi/saati**; oturum açmış çalışan bilgisiyle tutulur.
- Parametreler kısmi kaydedilebilir; eksik parametrelerle analiz tamamlanabilir. Eksikler ayrı gösterilir. Daha sonra gelen sonuç aynı analiz kaydına eklenebilir; işlem geçmişi korunur.
- Mevcut günlük/haftalık/aylık sıklıklar korunur; sistem otomatik görev ya da gerçekleşmemiş analiz kaydı üretmez. Yalnızca elle açılmış kayıtlar ve gerektiğinde “Ertelendi”/“Yapılamadı” durumları raporda bulunur.
- Referanslar işletme + sistem + numune noktası + parametre bağlamında tanımlanır. Geçmiş sürümler, ölçüm anındaki değerlendirmeyle korunur. Referans değişikliğinde eski/yeni değer, kullanıcı, zaman saklanır; zorunlu açıklama yoktur.
- Referansı olmayan sonuç kaydedilir, “Referans tanımlı değil” gösterilir ve limit değerlendirmesi yapılmaz.
- Limit dışı sonuç kaydedilir. Bildirim yalnızca numune kaydı tamamlandığında (kısmi sonuçla tamamlanmış olsa da) tanımlı işletme/nokta alıcılarına uygulama içi ve e-posta ile gönderilir; zorunlu onay/aksiyon yoktur.
- Tekrar su analizleri aynı veya yeni numuneyle yapılabilir; her analiz bağımsız geçerli kayıttır. Tekrar sonuç da operasyon personeline bildirilir, önceki bildirim korunur.
- MOSBİO Online Drum / Online Steam ilk fazda laboratuvar personeli tarafından manuel girilir; laboratuvar sonuçlarıyla aynı numune kaydında ayrı kolonlardır; ayrı online zaman yoktur. Verinin bugün geldiği gerçek kaynak TBD'dir.
- Raporlar işletme/sistem/nokta/tarih filtreli; Excel/PDF; detayda analiz ve audit geçmişi. Mevcut Excel içerikleri kaynak olarak kullanılacaktır.

## 5. MOSBİO gelen biyokütle ürünleri

### 5.1 Ürün ve numune akışı
- Ürün türleri laboratuvarın ilettiği liste üzerinden yönetilir; ürün/grup/işlem tanımı karışıklıkları (ör. “ince kırım işçiliği”) kaynak sahibiyle doğrulanmadan otomatik eşitlenmez.
- Araç bazlı tartım kaydı oluşur. Dış saha personeli, boşaltılan malzeme yığınının altı noktasından numune alıp laboratuvara teslim eder. Laboratuvar çalışanı mevcut tartım kayıtlarından ilgili aracı seçer.
- Her aracın kendi analiz kaydı vardır. Ürünler türüne göre ortak stokta tutulduğu için **araç/sevkiyat → belirli paçal üretimi** düzeyinde izlenebilirlik iddia edilmez.
- Tek zaman alanı laboratuvar kabul tarihi/saati. Nem, kalori, kül analizi yapılır; farklı kül analiz koşulları kaynakta tarif edilmiştir ve kesin parametreleri kaynakla testte doğrulanır.

### 5.2 Sonuçlar, kriterler, bildirim ve düzeltme
- Kısmi sonuçlarla tamamlanabilir; eksik parametre sonra aynı analize eklenir; işlem geçmişi korunur.
- Tekrar analiz ayrı kayıt olarak tutulur; laboratuvar yetkilisi **parametre bazında** esas sonucu seçer.
- Ürün türüne ve parametreye göre değiştirilebilir alt ve/veya üst kalite sınırı tanımlanabilir. Ölçüm tarihindeki kriter/değerlendirme korunur. Kriter yoksa sonuç kaydedilir, “Kriter tanımlı değil” gösterilir, uygunluk kararı verilmez.
- Kriter dışı sonuç işaretlenip bildirilir; otomatik ürün reddi veya operasyon engeli oluşturmaz.
- Analiz tamamlandığında MOSBİO gelen ürün analizleri için yönetilebilir **ortak alıcı listesine** hem uygulama içi hem e-posta bildirimi gider.
- Sonradan parametre sonucu eklenince, sonuç düzeltilince veya esas sonuç değişince güncel analiz yeniden bildirilir; önceki bildirim korunur.
- Çalışan sonuç düzeltme ve yanlış tartım eşleştirmesi düzeltme talebinde bulunur; laboratuvar yetkilisi gerçekleştirir. Sonuç düzeltmede eski/yeni değer, talep eden, düzelten ve zaman saklanır; gerekçe isteğe bağlıdır. Tartım ilişkisinin değişiklik geçmişi de korunur.

### 5.3 Rapor
- Her araç ayrı satır; ürün, tedarikçi, tarih ve kalite sonuçlarına göre filtre. Gelen ürün analizleri kendi kayıtlarından incelenir; belirli bir paçala girmiş araç gibi gösterilmez.

## 6. MOSBİO Kırım Tesisi — reçete, üretim emri ve paçal

### 6.1 İşletme sınırı ve yaşam döngüsü
- Kırım Tesisi **MOSBİO'nun alt operasyonudur**. Üretim emri MOSEDAŞ'tan gelmez; reçeteyi hazırlayan yetkili kişi üretim emrini de açar.
- Bir reçete farklı zamanlarda yeni emirlerde tekrar kullanılabilir. Aynı vardiyada birden fazla reçete uygulanabilir. Bir üretim emri vardiyalar arasında açık kalabilir.
- Fiilî üretimi vardiya sorumlusu başlatır, başlangıç zamanı kaydedilir. Ayrı zorunlu vardiya operasyon kaydı açılmaz; emir toplam kayıtları tutulur, vardiya ayrımı raporda yapılır.
- Reçete değişikliği duruma göre mevcut emirde revizyon veya yeni emirle ele alınır. Revizyon yetkisi reçete yetkilisi ve Kırım Tesisi sorumlusundadır. Gerekçe isteğe bağlı; geçmiş her durumda korunur.
- Vardiya sorumlusu yeni sürümün **fiilen uygulanmaya başladığı zamanı** kaydeder; önceki sürüm ve uygulanma dönemi saklanır. Sürüm bazında hedefler, kullanılan ürün miktarları ve paçal analizleri ayrılır; emir toplamı ayrıca görünür.
- Üretim emrini vardiya sorumlusu tamamlar. Hedefe ulaşmadan sonlandırma mümkündür: gerçekleşen miktar ve gerekçe kaydı. Güvenilir miktar bilinmiyorsa “Miktar bilinmiyor” ve gerekçe ile tamamlanabilir.
- Tamamlanan emir üretime yeniden açılamaz; devam işi için yeni emir açılır. Ancak ilgili üretim döneminde alınmış numune sonradan eklenebilir ve analiz sonradan tamamlanabilir; bu üretim emrini açmaz.
- Tamamlanmış emrin operasyon bilgilerini Kırım Tesisi sorumlusu ve sistem yöneticisi düzeltebilir; gerekçe isteğe bağlı, eski/yeni değer geçmişi zorunludur.

### 6.2 Paçal numunesi ve kalite
- Paçal numunesinde yalnızca **laboratuvar kabul zamanı** kaydedilir. Metnex vardiya/zamana göre emir ve reçete sürümü önerir; laboratuvar çalışanı numunenin fiilen temsil ettiği üretim dönemine göre doğrular. Geçiş numunesinde zaman önerisi kesin hüküm değildir.
- Laboratuvar yetkilisi hatalı emir/sürüm eşleştirmesini düzeltebilir; önceki ilişki korunur.
- Paçal analizleri ilgili reçete sürümünün üretim emri detayında gösterilir. Gelen araç analizleri kendi kayıtlarında kalır.
- Hedef kalite parametreleri ürün/reçeteye göre esnektir; her parametre zorunlu değildir. Parametre bazında alt ve/veya üst sınır tanımlanır. Her sürümün hedefleri ve değerlendirmeleri tarihsel olarak korunur.
- Hedef dışı paçal analizi işaretlenip raporlanır; otomatik bildirim, zorunlu onay veya aksiyon başlatmaz. **Bununla birlikte** tamamlanmış kayda sonradan parametre sonucu eklendiğinde güncel analiz yeniden bildirilir ve eski bildirim korunur yönünde sonraki genel karar vardır. AI1 bu iki kararın bildirim kapsamını AI0/Product Owner ile netleştirmeden paçal için rutin hedef dışı bildirim varsaymamalıdır.
- Eksik parametreyle analiz tamamlanabilir; sonradan sonuç aynı kayda eklenir. Tekrar analiz ayrı kayıttır. Laboratuvar yetkilisi her parametre için ayrı esas sonuç seçebilir; önceki/yeni seçim, kullanıcı ve zaman korunur.
- Her analiz ayrı gösterilir. Reçete sürümüne ait **toplu kalite özeti** güncel esas sonuçlara göre yeniden hesaplanır; eski değerlendirmeler saklanır. Eksik parametrelerin mevcut sonuçları ilgili parametre hesabına dahil olur; boş parametre hesaplanmaz.
- Toplu kalite yöntemi olarak **aritmetik ortalama veya miktara göre ağırlıklı ortalama tercih edilebilir**; nem, kalori ve kül için aynı yöntem uygulanır. Ağırlıklandırmada her numunenin hangi miktarı temsil ettiği henüz doğrulanmamıştır; bu veri olmadan sahte ağırlıklı ortalama üretilmemelidir.

### 6.3 Kova ölçümü ve gerçekleşen miktarlar
- Fiziksel geliştirme yükleme kepçesinin kovasındaki malzeme miktarını ölçecek. Operatör yüklediği ürünü aktif reçetedeki ürünler arasından seçer.
- Her kova yüklemesi ayrı ölçüm kaydıdır. Fiilî yükleme zamanı, ürün, üretim emri ve geçerli reçete sürümü için esastır; verinin Metnex'e sonradan ulaşması sürümü değiştirmez.
- Ürün bazında kullanılan miktar, reçete sürümü miktarı ve emir toplamı izlenir. Ton/kg ile reçetedeki kepçe/kova birimleri ayrı anlamlarıyla korunur; kepçe/kova sayısı kendiliğinden doğrulanmış ağırlık sayılmaz.
- **Toplam yüklenen malzeme miktarı**, ayrıca ölçülmeyen **nihai paçal üretim miktarı** değildir; raporda eşitmiş gibi gösterilemez.
- Fiziksel sistem devreye girmeden mevcut yöntemle tahmini miktar girişi olabilir; tahmin açıkça işaretlenir. Sistem devreye girdikten sonra normalde tahmini giriş yapılmaz. Cihaz arızasında vardiya sorumlusu veya Kırım Tesisi sorumlusu tahmini miktar girebilir; kayıt zamanı, arıza başlangıç/bitiş dönemi ve ilişki saklanır.
- Ölçülmüş, tahmini ve birleşik toplam ayrı gösterilir; birleşik toplam tahmin içeriyorsa açıkça belirtilir.
- Tahmin sonradan doğrulanırsa doğrulanmış değer güncel toplamda tahminin yerini alır, eski tahmin geçmişte kalır; aynı yükleme iki kez sayılmaz.
- Arıza döneminden sonradan gelen bütün ölçümleri Kırım Tesisi sorumlusu kontrol eder. Kontrol öncesi geçici toplamda görünebilir; kesin toplam diye sunulmaz.
- Açık emirde miktar düzeltme yetkisi vardiya sorumlusu + Kırım Tesisi sorumlusu; tamamlanan emirde Kırım Tesisi sorumlusu + sistem yöneticisi. Yanlış ürün/sürüm eşleştirmesini Kırım Tesisi sorumlusu düzeltebilir; geçmiş korunur.

### 6.4 Kırım Tesisi raporu
- Vardiya raporu fiilî yükleme zamanına göre o vardiyanın ürün bazlı miktarını ve emrin birikmiş toplamını birlikte gösterir; ayrı zorunlu vardiya operasyon kaydı yoktur.
- Reçete sürümünde ürün bazında hedef, gerçekleşen ve fark; üretim emrinde toplamlar ayrıca gösterilir.
- Sonradan gelen/düzeltilen miktarla güncel vardiya toplamları yeniden hesaplanır, eski rapor değerleri ve değişiklik geçmişi korunur.
- Ekran, Excel, PDF çıktıları vardır. Ölçülmüş/tahmini/geçici ayrımı korunur.

## 7. Kalori, kül ve laboratuvar raporları — görüşme sonu kararları

- `KALORI HESAP.xlsx` kömür, gelen biyokütle ürünü ve paçal analizlerinde kullanılır. Kullanıcıya göre **G6'ya girilen üst kalori değerinden G7'de oluşan alt kalori değeri** kullanılan sonuçtur. Dosyadaki diğer hesaplamaların farklı amaçları olduğu belirtilmiştir; kullanım yerleri laboratuvar sorumlusuyla doğrulanacaktır.
- Hesaplama girdisi değişince bağlı sonuçlar yeniden hesaplanır. Önceki ham girdiler ve önceki hesaplanan sonuçlar geçmişte tutulur. Tekrar analiz (yeni ölçüm) ile girdi düzeltmesi (mevcut ölçüm revizyonu) ayrı işlemlerdir.
- Kül için boş kroze, ürün, kül+kroze ham ağırlıkları girilir: `kül ağırlığı = (kül+kroze) - boş kroze`; `kül % = kül ağırlığı / ürün ağırlığı × 100`. Eksik/sıfır bölen varsa geçerli bir sonuç gibi gösterilmemelidir; kesin validasyon testi TBD.
- Ana laboratuvar raporunda **bütün kalori değerleri ayrı kolonlarda** gösterilir. Ekran ana raporunda **ilk değer ve güncel değer** birlikte; ara düzeltmeler detay geçmişinde bulunur. Ana Excel/PDF çıktısında **yalnızca güncel değer** gösterilir; ayrıntılı geçmiş ayrı rapor olarak alınır.
- Gelen ürün raporu: araç başına satır; ürün/tedarikçi/tarih/kalite filtreleri. Paçal kalite raporunda reçete sürümü ana düzey, üretim emri toplamı ayrıca. Laboratuvar raporları ekran/Excel/PDF.
- Sayısal kalite sınırları değiştirilebilir yapıdadır; mevcut gerçek ürün bazlı değerler kaynaklardan alınmalıdır. Ölçüm tarihindeki kriter/değerlendirme korunur.

## 8. Açık doğrulamalar ve kaynak ihtiyaçları

| ID | Konu | Sorumlu / kaynak | Durum |
|---|---|---|---|
| TBD-L01 | G7 esas alt kalori sonucunun, diğer kalori sonuçlarının ve farklı hesaplama esaslarının rapor/operasyon bazındaki kullanım anlamları | Laboratuvar sorumlusu | Doğrulama bekliyor |
| TBD-L02 | `KALORI HESAP.xlsx` tüm giriş/formül/birim eşleştirmesi, nem/kalori/kül test senaryoları | Excel + laboratuvar testleri | Testte doğrulanacak |
| TBD-L03 | Reçete sürümü toplu kalite ortalaması seçimi ve ağırlıklı hesap için numuneye atanacak miktarın tanımı/erişilebilirliği | Laboratuvar + Kırım Tesisi | Kısmen kararlı, girdi TBD |
| TBD-L04 | Ürün türleri için başlangıç sayısal kalite sınırları | Laboratuvarın mevcut kriterleri | Veri beklenecek |
| TBD-K01 | Kepçe ölçüm cihazının Metnex'e veri aktarım olanağı/yöntemi | Teknik servis | TBD |
| TBD-K02 | Cihazın her yükleme için verdiği miktar, birim, fiilî zaman, tekil kimlik ve diğer alanlar | Tedarikçi teknik ekip | TBD |
| TBD-K03 | Kesinti sonrası veri geri aktarımı ve sonradan gelen ölçümü arıza tahminiyle eşleştirmenin uygulanabilir yöntemi | Tedarikçi teknik ekip + Kırım Tesisi | TBD |
| TBD-K04 | Cihazın sağladığı zamanın gerçek fiilî yükleme anını temsil edip etmediği; vardiya ve reçete geçişi için doğrulama | Tedarikçi teknik ekip | TBD-K02 ile birlikte doğrulanacak |
| TBD-G01 | Paçal sonradan sonuç bildirim kuralının, rutin hedef dışı bildirim istememe kararıyla kapsamı | AI0 / Product Owner | Karar ayrımı netleştirilecek |
| TBD-G02 | Nihai paçal miktarının ileride ayrıca ölçülmesi planlanıyorsa yöntemi; bugünkü yükleme toplamından ayrı kalması | Kırım Tesisi | İleride doğrulanacak |

**Önemli:** Son üç satır, önceki “7 ana doğrulama” sayımına ek olarak AI1'in fark etmesi gereken alt ayrım/karar çatışması niteliğindedir; yeni doğrulanmış iş gereksinimi sayılmaz.

## 9. Diğer Metnex kapsamı — bu brifin dışında, sonraki Discovery

Önceki proje kapsamından gelen ancak bu görüşmede ayrıntılı kapanmayan alanlar:
- Elektrik üretim talebi ve planlaması, üretim kaynaklarının seçimi, onay/gerçekleşen üretim ve Netsis sonucu entegrasyonu.
- Buhar arzı, müşteri ihtiyaçları, yüksek/alçak basınç kaynakları, arz marjı ve MOSBİO desteği.
- Sıcak su üretimi, arzı, tüketim ve ölçüm süreci.
- Vardiya Operasyon Merkezi; vardiya devri, olay/duruş/arıza kayıtları ve üretim takibi.
- Saatlik analiz/raporlama, ortak platform yetkilendirmesi, veri erişimi, dışa aktarma ve entegrasyon sınırları.

Önceki Discovery/SRS belgelerinde bu başlıklara dair bilgi bulunması, bu görüşmede kesinleştirildikleri anlamına gelmez. AI1 mevcut belgeleri bu brifle karşılaştırmalı, eski TBD'leri yeni kararlarla güncellemeli ve açık kalanları açık bırakmalıdır.

## 10. AI1 için kontrol listesi

1. Modül ayrımını koru: gelen ürün/araç analizi ≠ paçal analizi ≠ Kırım Tesisi üretim emri ≠ kömür yığını/kazan külü ≠ su numunesi.
2. İşletme izolasyonunu ve görüntüleme/veri girişi yetkilerinin ayrılığını koru.
3. Reçete sürümü, fiilî uygulanma dönemi, numune eşleştirmesi ve düzeltme geçmişini kaybetme.
4. Ölçülmüş / tahmini / kontrol bekleyen miktarı karıştırma; yüklenen malzeme ile nihai paçalı eşitleme.
5. Parametre bazında esas analiz seçimini ve geçmiş sonuçları koru; toplu kalite hesabını doğrulanmamış ağırlıklarla yapma.
6. G7 kalori sonucu kullanım kararını koru; diğer kalori değerlerini silme; formülleri kaynak Excel/test dışında uydurma.
7. Bildirim kurallarını analiz türüne göre ayır; paçal bildirim kapsamındaki ayrımı açık soruya taşı.
8. Netsis, ölçüm cihazı ve önceki raporlama sistemlerinin teknik sözleşmelerini AI0 adına icat etme.
9. Yeni SRS görevlerini ancak Product Owner onaylı kapsam ve belirsizlik statülerini belirginleştirerek hazırla.
