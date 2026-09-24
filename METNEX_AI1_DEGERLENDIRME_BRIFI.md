# Metnex — AI1 Ürün Vizyonu Değişikliği ve Mimari Etki Değerlendirme Brifi

**Tarih:** 22.09.2026  
**Hazırlayan rol:** AI0 / Product Owner görüşme çıktılarının aktarımı  
**Muhatap:** AI1 — Product Governance Agent  
**Durum:** Tartışma girdisi; onaylanmış SRS veya AI2 implementation task'ı değildir.  
**Kaynak temel:** Product Owner'ın paylaştığı `DISCOVERY(2).md` (§2–§26); yeni iş bilgileri Product Owner ile AI0 görüşmeleri; repository içinde gerçek güncel dosyalar ayrıca doğrulanacaktır.

> **AI1 için talimat:** Bu belgeyi bir implementation emri değil, eski Discovery ile yeni iş kararları arasında **kanıtlı fark analizi, domain sınırı, entegrasyon, tenant izolasyonu ve SDLC etki incelemesi** talebi olarak ele al. Mevcut repo ile çelişenleri sessizce düzeltme. Product Owner onayından önce SRS'yi kesinleştirme, AI2 task'ı başlatma, kod/migration/UI yazma, commit/push yapma.

## 1. AI1'in okuması gereken belgeler ve yetki sınırı

`docs/README.md`, `docs/AI_Governance/AGENT_BOOTSTRAP.md`, `AI_ROLES.md`, `ARCHITECTURE_RULES.md`, `REPOSITORY_DISCOVERY_RULES.md`, `AI_ENGINEERING_TASK_TEMPLATE.md`, `QUALITY_GATES.md`, `CRUD_SCREEN_STANDARD.md`, `MODULE_DASHBOARD_STANDARD.md`, `DROPDOWN_DYNAMIC_LOADING_POLICY.md`, `docs/security/APPLICATION_SECURITY_ARCHITECTURE.md`, ilgili `docs/domain/DOMAIN_MODEL.md`, `DB_META.md`, `docs/decisions/`, mevcut Discovery/SRS, migration ve backlog kayıtlarını repository'deki **gerçek konumlarıyla** oku. UI etki analizi yapacaksan UI Contract'ı da incele. Var olmayan dosyaya dayanma. Kontrattaki role boundary ve raporlama kurallarını uygula. Bu aşamada yalnızca inceleme ve öneri sun; doküman mutasyonları için PO onayı iste.

## 2. Başlangıç noktasının doğrulanması — eski Discovery

Aşağıdaki referanslar Product Owner'ın sağladığı `DISCOVERY(2).md` sürümünedir; repo güncel sürümünün aynı olduğunu varsayma:

- §2.2–2.3: Next.js/NestJS/Drizzle/PostgreSQL, SCADA/DMS SQL Server read-only, MİP root → MOSB/MOSEDAŞ/MOSBİO tenant ağacı.
- §4 ve §6 F-006: BOTC vardiya ve arşiv migration adayı; Bakım/Arıza, DÖF doğrudan migration dışı.
- §7 D-005: eski tenant kararı; §7 Q-005 vardiya ilk migration kapsamı açık.
- §8–§10: Metnex kimliği ve mevcut sistem sahipliği; §10 **üretim planlamasının Metnex'e ait olduğu eski karar**.
- §11.5 Wave 4: lokasyon bazlı vardiya raporu, taslak/tamamlandı/kilit, arşiv, e-posta. Envanter/mapping çalışmaları ve 5 doğrulanmış lokasyon; MOSEDAŞ vardiya kaynak kodu kanıtı yok.
- §11.6 Wave 5: Reporting/SCADA/DMS, saatlik analiz ve veri sunumu.
- §21.1: üretim siparişinden kaynak planına kadar planlama Metnex'te, Netsis entegrasyonu; **yeni karar bu sahipliği değiştiriyor**.
- §22–§23: laboratuvar manuel giriş ve hafif no-code gelecekteki aday alanlar; bu görüşmenin otomatik kapsamı değildir.

Eski karar, yeni iş bilgisi, AI0 önerisi ve TBD'yi dört ayrı statüde göster.

## 3. Yeni iş bilgileri — Product Owner görüşmesi

### 3.1 Kurumsal ve fiziksel model

- MOSB ENERJİ ortak kampüs bağlamında faaliyet gösterir. Fiziksel kampüs, şirket, tenant, varlık sahibi, işletmeci ve ERP sahibi birbirinden farklı kavramlardır.
- MOSB'ye ait gaz türbinlerinin varlık/hammadde/ürün sahipliği MOSB'dedir; operasyonu MOSB ENERJİ yürütür; MOSB ENERJİ, MOSB'ye işletmecilik hizmet faturası keser.
- MOSBİO aynı kampüste kendi varlıkları, hammaddesi, üretimi ve operasyonuyla ayrı bir işletmedir.
- BEAM'de varlıklar **sahip olan şirketin kendi yapısı altında** tanımlanacaktır. Metnex işletmecilik ilişkisi kurarken varlık mülkiyetini taşımaz/çiftlemez.
- MOSB ENERJİ ile MOSBİO için ayrı Metnex tenant'ları hedefleniyor. Ortak kampüs ortak tenant veya ortak mülkiyet anlamına gelmez.
- Kömür Kazanı kendi ekibiyle çalışır; üretim emri/talimatını MOSB ENERJİ vardiya yöneticisi iletir. Kömür Kazanı'nın hukuki varlık/ürün/hammadde sahipliği ve ayrı tenant gerekliliği **TBD**.

### 3.2 Ayrı MOSEDAŞ üretim planlama uygulaması — kritik karar değişikliği

- Henüz ürün adı konulmamış **ayrı bir MOSEDAŞ uygulaması** geliştirilecektir; Metnex'in içinde üretim planlama modülü değildir.
- MOSEDAŞ müşteri ve piyasa koşullarına göre **günlük, haftalık, aylık** üretim planı yapar.
- MOSEDAŞ, üretim yaptırdığı ve Metnex kullanan **tüm tedarikçilerini** kendi uygulamasında tanımlayabilir; tedarikçi başına entegrasyon bilgisini tanımlar.
- MOSEDAŞ uygulaması entegrasyonla Metnex'ten tesis/makine bazlı kapasite, emre amadelik, amade olduğunda toplam kapasite, vardiya, planlı bakım ve planlı duruş bilgilerini çevrim içi alır.
- Her makinenin ilgili planlama dönemi içindeki bakım/duruş zamanları emir oluşturulurken hesaba katılır. Bütün bakımın otomatik sıfır kapasite anlamına geldiği varsayılmaz.
- MOSEDAŞ **hedef tedarikçi tenant + üretim tesisi + üretim makinesi** bazında üretim emri oluşturur ve hedef Metnex'e çevrim içi gönderir.
- Üretim **planının ve plan kaynaklı emrin system of record'u MOSEDAŞ uygulamasıdır**. Metnex kapasite/vardiya/operasyon verisinin kaynağı ve alınan emrin saha operasyonu bağlamındaki yürütme sistemidir.
- Emir durum/gerçekleşen üretim bilgisinin MOSEDAŞ'a geri akması anlamlı **öneridir**, henüz onaylı gereksinim değildir. Revizyon/kabul/red/iptal/yeniden planlama kuralları **TBD**.
- Ayrı MOSEDAŞ uygulamasının kendi Discovery/SRS'si hazırlanacaktır. Onun piyasa, fiyatlama, plan optimizasyonu ve tedarikçi yönetimi işlevleri Metnex SRS'sine kopyalanmamalıdır.

### 3.3 Vardiya Operasyon Merkezi — kapsam genişlemesi

Mevcut metin raporu ve arşiv modelinin ötesinde vardiya, **tenant/işletmeci + tesis/lokasyon + zaman aralığı + sorumlu ekip** bağlamında operasyonu birleştiren merkez olarak düşünülüyor:

- Fiilî personel, devir-teslim, kiminle değiştiği, çalışma süresi (kesintisiz çalışma hesabının kesin kaynağı TBD).
- Önceki vardiyadan kalan ve sonrakine devredilen açık konular.
- MOSEDAŞ'tan gelen tesis/makine bazlı üretim emirleri ve o vardiyaya denk gelen program.
- Planlanan/gerçekleşen üretim ve sapmalar; SCADA/DMS vb. kaynaklardan vardiya bazlı analiz özetleri.
- Olay, arıza, bakım, duruş/duruş nedeni, kaza, acil durum ve bilgilendirme izi.
- Vardiya kapanışı, raporu ve arşivi; rapor mümkün olduğunca ilişkili kayıtların özeti olmalı.
- Üretim emri birden çok vardiyayı kapsayabilir; **emir tek bir vardiya raporu içine gömülmemeli**.
- MOSB ENERJİ vardiya yöneticisinin genel koordinasyonu ile Kömür Kazanı'nın kendi ekibinin operasyonu ayrılmalıdır.
- BEAM bakım/arıza ana kaydı tekrarlanmayacak; mevcut Wave 5 analizi yeniden kullanım açısından değerlendirilecek.

Bu uzun vadeli vizyondur. Tüm maddeler otomatik MVP veya onaylı FR değildir.

## 4. Ön inceleme — beklenen temel farklar

| Alan | Eski Discovery'deki durum | Yeni bilgi | İnceleme sınıfı |
|---|---|---|---|
| Üretim planının sahibi | Metnex (§10, §21.1) | Ayrı MOSEDAŞ uygulaması | **Açık karar çelişkisi / supersede gerekli** |
| Üretim emri oluşturma | Metnex planlama ve Netsis tetikleme anlatısı | MOSEDAŞ ayrı tedarikçi/tesis/makine emri oluşturur, Metnex yürütür | Domain/entegrasyon sınırı değişikliği |
| Vardiya | Wave 4 rapor, arşiv, lokasyon, e-posta | Operasyon, personel, üretim, olay, devir merkezi | Kapsam genişlemesi |
| Tenant | MİP root altında MOSB/MOSEDAŞ/MOSBİO | MOSB ENERJİ ve MOSBİO bağımsız operasyonel tenant; dış MOSEDAŞ uygulaması | Mevcut tenant kararı ve isim eşlemesi gözden geçirme |
| BEAM | Varlık/bakım ana sistemi | Varlık kendi sahibinin yapısında; işletmeci başka şirket olabilir | Korunan sahiplik + yeni ilişki |
| Kapasite | İşletme rapor/analiz genel anlatısı | Makine ve dönem bazlı emre amadelik / amade kapasite / bakım kısıtı | Yeni domain/entegrasyon gereksinimi |
| Raporlama | Wave 5 saatlik analiz | Vardiya operasyon özeti için yeniden kullanım adayı | Entegrasyon/yeniden kullanım incelemesi |
| ERP | Netsis ve ilgili şirket kayıtları | Hammadde/ürün mülkiyeti ile işletmecilik hizmet faturası farklı | Korunan ana sistem + sorumluluk ayrımı |

Bu tablo **AI0 ön fark haritasıdır**; AI1 gerçek repo kanıtıyla düzeltmeli ve genişletmelidir. Kodda uygulanmış olma durumunu belge varsayımından ayrı raporlamalıdır.

## 5. AI1'den beklenen değerlendirme soruları

1. Mevcut tenant ağacı ve MİP root aggregate modeli bu senaryoda hangi şirketleri, hangi yetki türleriyle temsil ediyor? MOSB ENERJİ ismi/eski MOSB tenant eşlemesi nedir? MOSEDAŞ'ın dış uygulama oluşu mevcut MOSEDAŞ tenant'ını otomatik silmeyi gerektirir mi? **Hayır, kanıt/karar iste.**
2. Üretim makinesi, BEAM varlık ID'si, işletmeci, sahip şirket, tesis, tenant ve ERP şirketi hangi mevcut domain'lerde bulunuyor? Çift kayıt açmadan ilişki nasıl kurulabilir? Zaman içindeki sahiplik/işletmeci değişimi nasıl ele alınmalı?
3. Kapasite bilgisinin iş sahibi, veri kaynağı ve zaman boyutu nedir? Nominal/amade/kullanılabilir kapasiteyi teknik varsayımla eşitleme.
4. Planlı bakım/duruş BEAM ve diğer kaynaklardan nasıl geliyor? Bakım takvimi ile üretim emrinin çakışması, tarih revizyonu ve veri gecikmesi nasıl ele alınmalı?
5. Dış MOSEDAŞ uygulamasının her tedarikçi Metnex tenant'ına yetkili entegrasyonu nasıl sınırlandırılır? Tedarikçi tenant izolasyonu, erişim iptali, tenant/tesis/makine allowlist, secret yaşam döngüsü ve audit risklerini değerlendir.
6. Emir inbound entegrasyonunda kaynağın kimliği, hedef tenant/tesis/makine doğrulaması, tekrar gelen emir, revizyon, yarış durumu, kesinti, hata/yeniden deneme ve izlenebilirlik için hangi sözleşme kararları gerekir? Bunları henüz onaylı iş kuralı ilan etme.
7. MOSEDAŞ emri ile MOSB ENERJİ vardiya yöneticisinin Kömür Kazanı'na ilettiği operasyon talimatı mevcut modelde aynı mı, ayrı mı olmalı? Önce iş tanımını netleştir.
8. Vardiya zaman aralığı, üretim emri geçerlilik dönemi, tesis ve makine ilişkileri mevcut veri modellerini nasıl etkiler? Legacy vardiya ve arşiv mapping'i geriye dönük bozulmadan nasıl korunur?
9. Yeni vardiya modülü bakım, İSG, ERP, planlama veya başka bounded context'leri istemeden içine alıyor mu? Existing module extension mı, yeni domain mi? Kontratın modül tekrarını önleme ilkesini uygula.
10. Wave 4 / Wave 5 ve ilgili Feature/SRS/decision/backlog kayıtlarının hangileri etkileniyor? Bugün uygulanmış kod ile yalnızca dokümanda olanları ayrı göster.
11. Gerekli kaynak verinin saatlik raporlama/SCADA adapter'larından tekrar kullanılabilme sınırı nedir? Veri doğruluğu ve timestamp eşleşmesi risklerini işaretle.
12. Eski üretim planlama kararının hangi ADR/DEC, SRS ve domain kayıtlarını etkilediğini ve nasıl supersede edileceğini kanıtla.

## 6. Beklenen yazılı çıktı — AI1 değerlendirme raporu

Yanıtını aşağıdaki sırayla oluştur:

### A. Yönetici özeti
- Mevcut tasarımla yeni vizyon arasındaki en önemli farkları ve hangi kararların görüşülmesi gerektiğini belirt.
- İnceleme sınırını belirt: bu rapor onay/implementation değildir.

### B. Kaynak ve repo kanıt tablosu
- Dosya/yol, başlık veya satır, eski hüküm, varsa gerçek uygulama durumu.
- `DISCOVERY(2).md` içindeki eski karar ile repo'daki güncel sürümü ayır.

### C. Kapsam ve fark matrisi
Sütunlar: `Konu | As-is | To-be iş bilgisi | Değişiklik türü | Etkilenen domain/modül | Kanıt | Karar sahibi | Durum`.

### D. Kritik çelişkiler ve etkileri
Özellikle üretim planı SoR, tenant ağacı, Netsis entegrasyon anlatısı, Wave 4 kapsamı. Öncelik: Critical/High/Medium/Low; gerekçeyle birlikte.

### E. Domain ve entegrasyon sınırları
- Metnex / ayrı MOSEDAŞ uygulaması / BEAM / ERP / SCADA-DMS / OpenMs.
- Varlık sahibi, işletmeci, tenant, tesis, makine ve vardiya ilişki haritası.
- Kaynak, okuyucu, yazma yetkisi ve audit sorumluluğu.

### F. Güvenlik ve SDLC riskleri
- Cross-tenant erişim, B2B entegrasyon, tenant + tesis + makine kapsamı, secret, replay/idempotency, audit, veri güncelliği, arşiv/migration, PII.
- Mini threat-model başlıkları ve ihtiyaç duyulan negatif testler; henüz kod yazma.

### G. Belge ve karar değişikliği planı
- Hangi Discovery bölümleri addendum/karar notu ile güncellenmeli?
- Hangi eski DEC/ADR supersede edilmeli, hangi yeni DEC önerilmeli?
- Hangi SRS gereksinimleri AI0 tarafından yeniden yazılmalı veya TBD kalmalı?
- DOMAIN_MODEL, DB_META, migration mapping ve backlog etki listesi.
- Eski geçmişi silmeden karar tarihi/versiyon/supersession izi öner.

### H. Faz ve kapsam önerisi
- Mevcut Wave 4 ve 5 yatırımlarını koruyarak olası aşamalı yol öner.
- MVP / sonraki faz / ayrı MOSEDAŞ uygulaması olarak ayır.
- Bunları Product Owner onayı bekleyen öneriler olarak işaretle; otomatik backlog veya AI2 task'ı oluşturma.

### I. Açık sorular ve karar masası
Her soru için `Soru | Neden önemli | Alternatifler | Önerilen tartışma sırası | Karar sahibi | TBD` ver. Özellikle kapasite hesaplama, amadelik kaynağı, bakım dışı duruş, emir geçerlilik/versiyon, geri bildirim, MOSEDAŞ tenant statüsü, Kömür Kazanı şirket/tesis konumu, tarihsel migration.

### J. Sonuç ve Product Owner'a karar talebi
Görüşmede tek tek onaylatılacak kararları numaralandır. **Ben onay vermeden belgeleri veya kodu değiştirme.**

## 7. AI1'in çalışma biçimi

- Önce repo discovery yap; tahmin yerine kanıt kullan.
- `AI_ROLES`, `ARCHITECTURE_RULES` ve SDLC sınırlarına uy.
- Yeni bir modül açmayı önermeden mevcut modül/domain'i incele.
- İş kuralları eksikse `TBD` de; teknik uygunluk iş kuralı icat etme yetkisi vermez.
- Dış MOSEDAŞ uygulamasını bu repository'de yeni modül olarak kendiliğinden yaratma.
- Önceki kararları silme; karar değişikliğinin tarihçesini koru.
- Yalnızca tartışma raporu üret; kullanıcı onayı olmadan SRS/DEC/backlog/AI2 task/code/commit/push yapma.

**İlk yanıtının sonunda:** "Önce karar verilmesi gereken 5 konu" başlığıyla karar masamızın gündemini çıkar ve tartışmayı oradan başlat.
