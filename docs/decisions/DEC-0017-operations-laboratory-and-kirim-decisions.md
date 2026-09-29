# DEC-0017 — Operasyon, Laboratuvar ve Kırım Tesisi Karar Kapanışları (BRIF2)

**Date:** 2026-09-28
**Status:** Accepted — Product Owner kararlarıyla (bağlayıcı; öneri değildir)
**Deciders:** Product Owner, AI1 (Product Governance Agent)
**Kapsam:** `docs/discovery/METNEX_AI1_DISCOVERY_BRIF2_EVALUATION.md` §J karar masası D-01–D-22 (D-05, D-11, D-12 kısmen, D-13, D-18, D-20 hariç — bunlar açık kalır)
**İlgili:** DEC-0014, DEC-0015, DEC-0016, EPIC-005, `backlog/TASK-029-00-operations-laboratory-task-plan.md`, `METNEX_AI1_DISCOVERY_BRIF2.md`

## Context

TASK-029.00-R1, Product Owner'ın BRIF2 görüşme kararlarını (`METNEX_AI1_DISCOVERY_BRIF2.md`) mevcut Discovery/SRS/domain/DEC-0014 ile karşılaştırıp 9 çelişki ve 22 kararlık bir karar masası (D-01–D-22) üretti (`docs/discovery/METNEX_AI1_DISCOVERY_BRIF2_EVALUATION.md`). Bu karar kaydı, o masadaki kararların **resmi kapanışıdır**. **Hiçbir eski karar dosyası silinmemiştir**; bu belge DEC-0014'ü genişletir/açıklığa kavuşturur, onun tenant/varlık/BEAM/ERP sınırlarını değiştirmez.

## Decisions

### D-01 — "Üretim emri" iki ayrı bounded context
İki ayrı, birbirine karıştırılmayan üretim emri kavramı vardır:
1. **Enerji üretim emri** — DEC-0014 kapsamındadır, SoR'u **MOSEDAŞ**'tır; Metnex teknik/operasyonel doğrulama, kabul/ret, `PAUSED`/`EXECUTION_BLOCKED`, gerçekleşme geri bildirimi yapar (DEC-0014 karar 1, 5). **Değişmedi.**
2. **Kırım Tesisi (paçal) üretim emri** — **yeni, ayrı bounded context**; SoR'u **Metnex**'tir; MOSEDAŞ'tan **gelmez**; reçeteyi hazırlayan yetkili kişi açar; vardiya sorumlusu yürütür/tamamlar (BRIF2 §6.1).
Bu iki emir türü **aynı tabloda, aynı durum makinesinde veya aynı entegrasyon sözleşmesinde birleştirilemez**. "Üretim emri" terimi doküman ve kodda geçtiğinde hangi türden bahsedildiği açıkça belirtilmelidir.

### D-02 — Laboratuvar yaşam döngüsü: karma model
DEC-0014 karar 9'daki "taslak → onay → kilit → revizyon" **tek başına yeterli değildir**; BRIF2'nin kısmi kayıt/esas-sonuç modeliyle **karma** olarak uygulanır:
- Bir analiz kaydı **eksik parametrelerle açılabilir ve tamamlanabilir** (taslak kavramı yerine "açık/tamamlanmış" durumu); eksik parametre sonradan **aynı kayda** eklenebilir.
- Her parametre için **esas sonuç** laboratuvar yetkilisi tarafından seçilir; önceki/yeni seçim, kullanıcı ve zaman korunur.
- **Referans/kriter tanımları** ve **analiz türü/parametre tanımları** (BRIF2'nin "onay" ile kastettiği taraf) laboratuvar domain yöneticisinin **onayına** tabidir ve versiyonludur (DEC-0014 karar 9 bu kısımda korunur).
- Tamamlanmış bir analiz kaydı **kilitlenir** (sunucu tarafında salt-okunur); düzeltme **yeni revizyon** (eski/yeni değer, talep eden, düzelten, zaman) ile yapılır — bu, "tekrar analiz" (yeni bağımsız numune/analiz) ile **aynı işlem değildir**.
Özet: **tanım/referans katmanı** onay+versiyon; **sonuç/analiz katmanı** kısmi-kayıt+esas-sonuç+kilit-sonrası-revizyon.

### D-03 — Ortak laboratuvar: çoklu tenant üyeliği
Ortak laboratuvar ekibi, mevcut `tenantMemberships` mekanizmasıyla **her iki işletme tenant'ına (MOSB Enerji, MOSBİO) ayrı üyelik** alır; görüntüleme ve veri girişi yetkisi **her üyelikte ayrı ayrı** (mevcut permission modeliyle) tanımlanır. **Yeni bir "ortak ekip" tenant'ı veya ortak scope mekanizması açılmaz.** Bir kullanıcının iki üyeliği olması, tenant izolasyonunu (BR-001A) bozmaz; her istek hâlâ tek bir aktif tenant kapsamında değerlendirilir.

### D-03a — Ortak laboratuvar performansı ve operasyon merkezi kapsamı
Laboratuvar performans raporu (işletme bazında + ortak toplam) **Vardiya Operasyon Merkezi** (FEAT-023) kapsamına dahil değildir; laboratuvar kendi domain'inde ayrı raporlanır (DEC-0014 karar 10 ile tutarlı: Laboratuvar ve İşletme ayrı altyapı/domain/permission/audit sınırına sahiptir). Ortak toplam rapor, kullanıcının üye olduğu **her iki tenant'ın** kendi yetkili kapsamındaki verilerinin toplamıdır — yeni bir aggregate/root mekanizması **değildir**, `canAggregateChildren` mekanizmasının bir alternatifidir, yerine geçmez.

### D-04 — MOSB / MOSB ENERJİ / MOSBİO tenant dili: ayrı uyum task'ı
Discovery/SRS/mapping belgelerindeki "MOSB", "MOSEDAŞ" tenant ifadeleri ve `apps/api/src/migration/botc-identity/tenant-mapping.ts:8` (`KNOWN_TENANT_SLUGS = ['MOSB','MOSEDAS','MOSBIO']`) ile DEC-0014 (MOSEDAŞ/MOSB operasyon tenantı değildir; MOSB Enerji + MOSBIO ayrı operasyon tenantlarıdır) arasındaki tutarsızlık **bu kararla düzeltilmez**. Ayrı bir **uyum task'ı** (kimlik migration slug kümesi, tenant adlandırma, mapping belgeleri) açılacaktır; bu task **implementation** içerdiğinden Product Owner'ın ayrıca `ready` yapması gerekir (bu DEC-0017 onu `ready` yapmaz).

### D-05 — Kantar: **geçici olarak** Netsis system of record (kısmen açık)
Kantar/tartım kaydının SoR'u **geçici olarak Netsis** kabul edilir: Netsis'te oluşup eşleşmeden Metnex kantar işlemi kesinleşmiş sayılmaz (BRIF2 §3.1). Metnex kantar kullanıcı arayüzüdür, kayıt **yazmaz**, okur/eşler; istisnai yetkili manuel eşleştirme mümkündür. **"Geçici"nin anlamı:** Netsis entegrasyon anahtarları/veri sözleşmesi netleşene kadar geçerli bir çalışma varsayımıdır; kesin teknik sözleşme **hâlâ açıktır**. **D-05 (teknik doğrulama) kapatılmamıştır** — bkz. Açık Statüler.

### D-06 — Paçal bildirimi: rutin yok, sonradan-sonuç bildirimi var
Paçal analizinde **hedef dışı sonuç için rutin/otomatik bildirim yoktur** — yalnız işaretlenip raporlanır. **Tamamlanmış bir paçal analiz kaydına sonradan parametre sonucu eklendiğinde veya esas sonuç değiştiğinde güncel analiz yeniden bildirilir**; önceki bildirim korunur. Bu, TBD-G01'in kapanışıdır: iki kural birbiriyle **çelişmez**, birbirini **tamamlar** (biri "tetikleyici yok", diğeri "tetiklendiğinde ne olur").

### D-07 — Toplu kalite özeti: reçete sürümü bazında
Reçete sürümüne ait toplu kalite özeti (nem, kalori, kül) **reçete sürümü bazında** hesaplanır ve güncel esas sonuçlara göre yeniden hesaplanır; eski değerlendirmeler korunur (BRIF2 §6.2). Emir toplamı ayrıca, sürüm özetlerinin görünümü olarak gösterilir — emir düzeyinde **ayrı bir birincil hesap yoktur**.

### D-08 — Vardiya: bağımsız ana varlık değil, zaman/sorumluluk boyutu
Vardiya, kendi başına bağımsız bir operasyon kaydı (ayrı zorunlu "vardiya operasyonu" entity'si) **değildir**; üretim emri, kova ölçümü, olay ve rapor kayıtlarının **zaman ve sorumluluk boyutu**dur (BRIF2 §6.1/§6.4, "ayrı zorunlu vardiya operasyon kaydı açılmaz"). Vardiya sorumlusu bir **rol**dür (izin kataloğuna eklenecek — D-16); "vardiya" bir **filtre/gruplama** alanı olarak modellenir, üretim emri veya reçete sürümünün **içine gömülmez** (FEAT-023 ile tutarlı — Vardiya Operasyon Merkezi ekranları bu boyutu sunar, ayrı bir vardiya entity'si üretmez).

### D-09 — Kömür Kazanı ve Kırım Tesisi: kendi tenant'ları altında operasyon merkezleri
Kömür Kazanı, **MOSB Enerji** tenant'ı altında; Kırım Tesisi, **MOSBİO** tenant'ı altında birer **operasyon merkezi / tesis-ünite referansı**dır (DEC-0014 karar 2 ile tutarlı: Kömür Kazanı MOSB Enerji altında tesis/ünite). **Ayrı tenant açılmaz.** Bu, Q-T01/Q-V01'in Kömür Kazanı/Kırım Tesisi'ne özgü kısmını kapatır: `MOSBİO KIRIM DEPO` ve `KÖMÜR KAZANI` lokasyonları (Vardiya kaynak envanteri) **operasyonel olarak** sırasıyla MOSBİO ve MOSB Enerji altındaki bu operasyon merkezlerine karşılık gelir — **ancak Kırım Tesisi ile `MOSBİO KIRIM DEPO`'nun aynı fiziksel/işletme birimi olup olmadığı dış doğrulama gerektirir** (Discovery/SRS'e TBD olarak işlenir, bu DEC'te varsayılmaz).

### D-10 — Kazan sayacı: SCADA ana kaynak, manuel giriş istisna
Kazan besleme sayaç değeri için **ana kaynak SCADA** (Wave 5 read-only zinciri, ör. `komur_endeksler` kataloğu) kabul edilir. **Manuel operatör girişi yalnızca istisna** (SCADA verisi yoksa/arızalıysa) olarak kullanılır ve **açıkça manuel/istisna olarak işaretlenir**; iki kaynak birleştirilip "tek gerçek" gibi sunulmaz. Bu karar, Wave 5'in **read-only** SCADA sınırını (DEC-0015) değiştirmez: kazan/yığın/lab domain'i SCADA'ya **yazmaz**, yalnız okur; SCADA katalog/adapter kodu bu yeni domain'e taşınmaz veya genişletilmez — ayrı bir okuma entegrasyonu olarak tasarlanır.

### D-11 — Kepçe cihazı: açık (dış doğrulama bekliyor)
**Kapatılmadı.** TBD-K01–K04 (`docs/discovery/…EVALUATION.md` §J) geçerliliğini korur.

### D-12 — Kalori: G6 üst kalori girdi, G7 alt kalori esas sonuç (kısmen kapandı)
**Kullanım kararı kapandı:** `KALORI HESAP.xlsx`'te kullanıcıya göre esas alınan sonuç, **G6'ya girilen üst kalori değerinden G7'de hesaplanan alt kalori değeridir** (BRIF2 §7). Bu, kömür, gelen biyokütle ürünü ve paçal analizlerinde **kullanılan** sonuçtur; diğer kalori değerleri **silinmez**, ayrı kolonlarda saklanır. **Kapanmadı:** formülün tam giriş/formül/birim eşleştirmesi ve test senaryoları (TBD-L02) — bkz. Açık Statüler (D-12 dış doğrulama parçası).

### D-13 — Kalite limitleri: açık (laboratuvar kaynağından beklenecek)
**Kapatılmadı.** Ürün/parametre bazlı başlangıç sayısal kalite sınırları laboratuvarın mevcut kriterlerinden (kaynak veri) beklenir; icat edilmez (TBD-L04, Q-023 geçerliliğini korur).

### D-14 — Domain kayıtları: tenant data-plane'de
Laboratuvar, kantar/yığın, Kırım Tesisi (reçete/emir/kova) ve operasyon merkezi kayıtları **tenant data-plane şemasında** tutulur (`public` şema değil) — DEC-0010'un Faz 5 hedefiyle uyumlu ilk gerçek data-plane tüketicisi bu domain olur. Bu karar, data-plane altyapısının (fan-out runner, registry↔fiziksel-şema kontrolü) **henüz var olmadığı** gerçeğini değiştirmez (`docs/domain/DB_META.md` "Known gap"): altyapı hazır olmadan bu domain'in implementation'ı **başlayamaz** — bkz. §I.5 teknik altyapı bağımlılığı.

### D-15 — Bildirim: ortak notification service
Su laboratuvarı, gelen biyokütle ürünü ve paçal (D-06 kuralı dahil) bildirimleri **ortak bir notification service** üzerinden (uygulama içi + e-posta) gönderilir; her domain kendi bildirim mantığını ayrı ayrı icat etmez. Vardiya modülünün mevcut e-posta dağıtımı (Q-V05, TASK-027.28) ile **aynı alt yapı** kullanılabilir olup olmadığı implementation task'ında (029.11 kapsamı genişletilerek) değerlendirilir; bu DEC yeni bir servis mimarisi **buyurmaz**, yalnız "ayrı ayrı icat etme" ilkesini koyar.

### D-16 — Rol modeli: mevcut model genişletilir
Yeni roller (laboratuvar yetkilisi, reçete yetkilisi, Kırım Tesisi sorumlusu, vardiya sorumlusu, kantar operatörü) **yeni bir yetki sistemi değil**, mevcut `tenantRoles`/`permissions`/`RequirePermission` modelinin **domain permission'larla genişletilmesiyle** (ve D-08'deki operasyon merkezi kapsamıyla) tanımlanır. **Bu DEC hiçbir yeni permission kodu veya rol oluşturmaz** — yalnız genişletme yönteminin mevcut modelin devamı olacağını, paralel bir yetki sistemi olmayacağını karara bağlar. Gerçek permission kodları 029.01/029.07/029.09 implementation task'larında tanımlanır.

### D-17 — Ağırlıklı ortalama: veri gelene kadar hesaplanmaz
Toplu kalite özeti (D-07) **yalnızca aritmetik ortalama** ile hesaplanır. Miktara göre ağırlıklı ortalama seçeneği, her numunenin temsil ettiği miktar verisi (TBD-L03) güvenilir biçimde erişilebilir olmadan **uygulanmaz**; sahte/varsayılan ağırlık üretilmez. Bu karar Q-W... (Wave 5) istatistik kararlarından bağımsızdır ve yalnız laboratuvar/Kırım kalite özetini kapsar.

### D-18 — Nihai paçal miktarı: kapsam dışı (şimdilik)
**Kapatılmadı, kapsam dışı bırakıldı.** Nihai paçal üretim miktarının ayrıca ölçülmesi (yüklenen malzeme toplamından bağımsız) ileride değerlendirilecek bir konudur (TBD-G02); bu faz raporlarında **yüklenen malzeme miktarı nihai paçal üretim miktarı yerine asla gösterilmez** (BRIF2 §6.3, kesin kural — bu kısıtlama karardır, ölçüm yöntemi değildir).

### D-19 — MOSBİO Online Drum / Online Steam: ilk fazda manuel
Online Drum/Steam verileri **ilk fazda laboratuvar personeli tarafından manuel girilir**; laboratuvar sonuçlarıyla aynı numune kaydında ayrı kolonlardır, ayrı bir "online zaman" alanı yoktur (BRIF2 §4). Verinin gerçek kaynağının (otomatik cihaz/entegrasyon) ne zaman devreye gireceği **açık kalır** (dış doğrulama).

### D-20 — Rapor kolonları ve Jasper şablonları: açık (dış doğrulama bekliyor)
**Kapatılmadı.** Ana kömür raporu, gelen ürün raporu, paçal kalite raporu ve laboratuvar raporlarının kesin Excel kolonları/formülleri ve bunlara karşılık gelecek Jasper allowlist şablonları, kaynak Excel'lerin ve laboratuvar/Kırım Tesisi sorumlusunun doğrulamasını bekler (TBD-L01, TBD-L02, BRIF2 §7, §9). Mevcut Reporting Foundation ve Jasper allowlist mekanizması (DEC-0013, TASK-027.74) **değişmeden yeniden kullanılır**; yeni renderer veya genel amaçlı şablon motoru açılmaz.

### D-21 — Audit: minimum kullanıcı kimliği
Yeni domain'lerin (laboratuvar, kantar, Kırım Tesisi, operasyon merkezi) audit kayıtlarında **yalnızca işlemi yapan kullanıcının asgari kimlik bilgisi** (kullanıcı id + görünen ad, mevcut `platform_audit_logs` actor snapshot deseniyle aynı) tutulur; çalışanların ek kişisel verisi (TC kimlik, iletişim bilgisi vb.) audit metadata'sına **eklenmez**. Serbest metin alanlarında (ör. "ikinci operatör adı", "teslim eden") geçebilecek kişisel veri, mevcut `scrubSecrets` redaksiyon mantığının kapsamına **girmez** (o yalnız credential-şekilli alanlar içindir) — bu nedenle bu tür serbest metin alanlarının rapor/audit görünürlüğü implementation task'ında ayrıca ele alınmalıdır (bu DEC bunu bir kısıtlama olarak not eder, çözümü tasarlamaz).

### D-22 — Tarihsel veri migration'ı: seçilmiş kapsam
Kömür/laboratuvar/Kırım Tesisi'ne ait tarihsel Excel/kağıt kayıtlarının migration'ı **tam kapsamlı değil, seçilmiş kapsamla** yapılır (hangi tarih aralığı/hangi kayıt türleri seçileceği ayrı, implementation öncesi bir karardır). Bu DEC migration'ın **yapılacağını** karara bağlamaz; yalnız yapılırsa "seçilmiş kapsam" ilkesiyle yapılacağını, "tüm geçmişin otomatik taşınması" varsayılmayacağını belirtir.

## Açık statüler (bilinçli olarak korunmuştur — bu kararla kapatılmamıştır)

| ID | Konu | Neden açık |
|---|---|---|
| D-05 (teknik kısım) | Netsis entegrasyon anahtarları, veri sözleşmesi, yön (okuma/yazma) | Dış sistem sahibi doğrulaması gerekir |
| D-11 | Kepçe ölçüm cihazı entegrasyonu (TBD-K01–K04) | Tedarikçi teknik ekip doğrulaması gerekir |
| D-12 (formül kısmı) | `KALORI HESAP.xlsx` tam formül/birim/test doğrulaması (TBD-L02) | Kaynak Excel + laboratuvar testi gerekir |
| D-13 | Ürün/parametre bazlı başlangıç kalite limitleri (TBD-L04, Q-023) | Laboratuvarın gerçek kriter verisi gerekir |
| D-18 | Nihai paçal miktarının ayrıca ölçülmesi (TBD-G02) | İleride değerlendirilecek, şimdilik kapsam dışı |
| D-20 | Rapor kolonları ve Jasper şablonlarının kesin içeriği (TBD-L01) | Kaynak Excel + laboratuvar/Kırım Tesisi doğrulaması gerekir |

## Consequences

- DEC-0014, SRS FR-067–071/§9.1 ve `backlog/EPIC-005-…md`/`TASK-029-00-…md`, D-01 ile **iki emir türü** ayrımını yansıtacak şekilde addendum/superseded notlarıyla güncellenir (bu DEC'in kendisi bu güncellemeleri yapmaz; TASK-029.00-R2 kapsamındadır).
- `docs/requirements/DISCOVERY.md` §21–22, D-002–D-22 kararlarını yansıtan addendum bölümleri alır; eski metin silinmez.
- Laboratuvar, kantar, Kırım Tesisi ve operasyon merkezi için **hiçbir tablo, permission veya endpoint bu kararla oluşturulmaz**; bunlar TASK-029.01 ve sonrasının konusudur.
- Yeni MOSB/MOSB ENERJİ/MOSBİO tenant-dili uyum task'ı (D-04) ayrıca Product Owner onayı ister; bu DEC onu açmaz.

## Explicit non-decisions

- Netsis, kepçe cihazı, kalori formülü, kalite limitleri, rapor şablonları ve nihai paçal ölçümü için **hiçbir teknik sözleşme veya sayısal değer bu kararla üretilmemiştir** (yukarıdaki Açık Statüler tablosu).
- Bu karar dosyası production kodu, migration, şema veya seed başlatmaz.
- Yeni tenant, rol veya permission kodu oluşturulmamıştır.
- TASK-029.01 veya sonraki implementation task'ları bu kararla `ready` yapılmamıştır.
