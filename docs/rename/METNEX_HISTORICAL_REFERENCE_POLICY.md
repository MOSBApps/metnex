# Metnex Rename — Tarihsel Referans Politikası (TASK-024.1-R1)

> **Durum: Politika/envanter düzeltmesi — kod/veri/dosya adı değişikliği içermez.**
> Bu belge, `docs/rename/METNEX_RENAME_INVENTORY.md`'deki (TASK-024.1) istisna listesini
> AI1'in "aktif repository içeriğinde eski isim kalmayacak" kesin kararı doğrultusunda
> yeniden sınıflandırır. Gerçek rename işlemleri TASK-024.2 ve sonrasında yapılacaktır.

**Tarih:** 2026-09-17
**Hazırlayan:** AI2 (Engineering Executor)
**Kaynak talep:** AI1'in TASK-024.1 inceleme kararı — "İstisna listesini kaldırmalı veya açık
Product Owner kararıyla yeniden sınıflandırmalı."

> **Terim notu (TASK-024.2 düzeltmesi, 2026-09-17):** AI1 kararı gereği bu belgenin açıklama
> metinlerinde eski marka/slug adı literal olarak yazılmaz. Bu belgede eski slug `eski-ad`, eski
> büyük-harf biçimi `ESKI-AD`, eski ürün adı `EskiAd` placeholder'larıyla anılır. Yalnızca §5'teki
> **gerçek tarama komutu** — tekrar üretilebilirlik için — orijinal string'i literal içerir.

---

## 1. AI1'in kararı ve önceki tutarsızlık

TASK-024.1 tesliminde, önceki oturumda kurulan "DEC-\* ve PROGRESS_LOG.md geçmiş kayıtları
değiştirilemez" governance kuralı, hiç sorgulanmadan Metnex rename kapsamına da uygulanmış ve
9 kalem "DEĞİŞTİRİLMEYECEK" olarak işaretlenmişti. AI1 bunu haklı olarak reddetti: bu kural
*rename'den önce* ve *farklı bir bağlamda* (geçmiş mühendislik kararlarının içeriğinin
bozulmaması için) konulmuştu; AI1'in son kararı ("eski-ad diye bir adlandırma kalmayacak")
daha yeni ve daha spesifiktir, ve iki kural doğrudan çakışıyordu. AI2 bu çakışmayı AI1'e
taşımadan sessizce eski kuralı uygulamış olması hatalıydı.

Bu belge her kalemi tek tek yeniden değerlendirir ve **iki farklı riski birbirinden ayırır**:

- **Ürün adı/marka riski** ("eski-ad" bir ürün adı olarak geçiyor) → rename kapsamına
  girmemesi için hiçbir geçerli gerekçe yok, çünkü ürünün ismini değiştirmek kararın **içeriğini**
  bozmaz, yalnızca **referans ettiği ürünün güncel adını** kullanır.
- **Kayıt bütünlüğü riski** (bir logun, o anda gerçekten var olan bir sistem durumunu birebir
  kaydetmesi — ör. "eski-ad-postgres-dev container'ı yeniden başlatıldı") → burada isim
  değişikliği, kaydın *o anki gerçekliği* yanlış yansıtmasına yol açabilir. Bu tek gerçek
  gerilim noktasıdır ve yalnızca `PROGRESS_LOG.md`'nin geçmiş girdilerinde ortaya çıkar.

---

## 2. Kalem bazlı yeniden sınıflandırma

| # | Kalem | TASK-024.1'deki sınıf | Yeni sınıf | Gerekçe |
|---|---|---|---|---|
| 1 | `docs/decisions/DEC-0007-eski-ad-db-locale-and-collation.md` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** | Karar metninin *özü* (locale/collation kararı, tarih, karar ID'si `DEC-0007`) değişmez; yalnızca metin içinde ürünü adlandıran "eski-ad"/"ESKI-AD" dizesi "Metnex"/"METNEX" olur. Dosya adı da `DEC-0007-metnex-db-locale-and-collation.md` olarak yeniden adlandırılmalı (slug, karar kimliğinin parçası değil, konu özetidir). |
| 2 | `docs/decisions/DEC-0008-...md` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** | Aynı gerekçe — madde 1. |
| 3 | `docs/decisions/DEC-0009-...md` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** | Aynı gerekçe — madde 1. |
| 4 | `docs/decisions/DEC-0012-demo-operations-removal.md` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** | Aynı gerekçe — madde 1 (dosya adında "eski-ad" geçmiyor, yalnızca içerik güncellenir). |
| 5 | `docs/decisions/DEC-0013-jasper-renderer-service.md` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** | Aynı gerekçe — madde 1. |
| 6 | `docs/AI_Governance/DEPRECATED_MODULES.md` — `demo.admin@eski-ad.local` | DEĞİŞTİRİLMEYECEK | **KAPSAMA ALINDI** | Bu, gerçek bir tarihi olayın birebir logu değil; kaldırılmış Demo Operations modülünün **sentetik/placeholder** seed-veri örneğidir. Domain kısmını `metnex.local` yapmak, belgelenen olgunun (bu alanların hangi amaçla kullanıldığının) doğruluğunu bozmaz. |
| 7 | `ODC_AI2_ONBOARDING_PROMPT.md` | DEĞİŞTİRİLMEYECEK (hatalı sınıflandırma) | **KAPSAMA ALINDI** | Bu bir tarihi kayıt değil, **canlı/aktif** bir onboarding talimatıdır — her yeni AI2 oturumu bunu okuyabilir. `"EskiAd"` → `"Metnex"` güncellenmeli. `repository doganzorlu/eski-ad` referansı ayrı ele alınır (bkz. §3, açık soru — kör rename edilemez çünkü gerçek hedef repo adı bilinmiyor). |
| 8 | `docs/opendevcon/PROGRESS_LOG.md` — **geçmiş girdiler** | DEĞİŞTİRİLMEYECEK | **KISMİ İSTİSNA — mekanizma ile çözülüyor, aşağıda madde 3** | Gerçek gerilim noktası; append-only bütünlük kuralı ile zero-tolerance hedefi doğrudan çakışıyor. Kör olarak "kapsama alındı" diyemem çünkü bu, `AGENT_BOOTSTRAP.md`'nin append-only kuralını ihlal eder — bu kural AI1 tarafından ayrıca teyit edilmeden AI2'nin tek taraflı bozabileceği bir kural değil. |
| 9 | `apps/api/drizzle/migrations/0002_thick_earthquake.sql` — `AIS_DEMO_PACKAGE` | (TASK-024.1'de ayrı bir "dokunulmaz" not olarak geçti, ama "eski-ad" değil "AIS" prefix'i) | **DEĞİŞMEDEN KALIYOR (gerçek istisna)** | Bu, "eski-ad" markasıyla ilgili değil: (a) SQL migration dosyaları zaten proje genelinde immutable kabul ediliyor (uygulanmış/uygulanabilir migration'lar değiştirilemez — veritabanı tutarlılığı riski), (b) `AIS_DEMO_PACKAGE` zaten kaldırılmış Demo Operations'a ait, kullanılmayan bir sabit; yeniden adlandırmanın hiçbir işlevsel faydası yok, sadece migration bütünlüğünü riske atar. Bu tek gerçek kalan istisnadır. |

**Sonuç:** 9 kalemden 8'i artık **kapsama alındı** (AI1'in zero-tolerance kararına uygun); yalnızca
1 kalem (migration SQL dosyası, "eski-ad" değil "AIS" prefix'i taşıyor ve markayla ilgisiz) gerçek
bir istisna olarak kalıyor — o da isim politikasından değil, **migration immutability**
kuralından kaynaklanıyor.

---

## 3. `PROGRESS_LOG.md` için somut mekanizma önerisi

Append-only kural (`AGENT_BOOTSTRAP.md`, Reporting Rule) şunu söylüyor: geçmiş girdiler
düzenlenemez/silinemez, yalnızca yeni girdi eklenebilir. Bu kural, PROGRESS_LOG'un bir **denetim
izi (audit trail)** olarak güvenilirliğini korumak için var — geçmişte gerçekten ne yapıldığının
sonradan "düzeltilemeyeceği" garantisi. Bu, AI1'in zero-tolerance kararıyla gerçek bir
governance çakışmasıdır ve AI2'nin tek taraflı çözebileceği bir şey değildir. Bu yüzden burada
**iki somut seçenek** sunuyorum; AI1'in bunlardan birini seçmesi gerekiyor (TASK-024.2'de
uygulanacak):

### Seçenek A — Append-only bütünlüğünü koru, "cutover" girdisiyle ileriye dönük sıfırla (önerilen)

- Geçmiş girdiler **hiç değiştirilmez** — onlar, o tarihte gerçekten `eski-ad-postgres-dev` gibi
  isimlerin var olduğunun doğru bir kaydıdır (tıpkı bir şirketin eski adıyla imzaladığı geçmiş
  sözleşmelerin, isim değişikliğinden sonra yeniden yazılmaması gibi).
- Rename programının uygulanacağı task'ta (örn. TASK-024.2 veya son rename task'ı), dosyanın
  sonuna tek bir **"Rename Cutover"** girdisi eklenir: "Bu tarihten itibaren PROGRESS_LOG.md'deki
  tüm yeni girdiler Metnex adını kullanır; bu tarihten önceki girdilerdeki `eski-ad`/`ESKI-AD`/
  `EskiAd` referansları, o anda gerçekten var olan sistem durumunun tarihi kaydıdır ve
  append-only bütünlüğü gereği değiştirilmemiştir."
- Bu, dosyanın **aktif/güncel içeriğinde** (yeni girdilerde) hiç "eski-ad" bırakmaz; yalnızca
  değişmezliği zorunlu olan geçmiş kayıtlarda kalır — bu da governance'ın kendi kuralının bir
  sonucudur, bir istisna değil.

### Seçenek B — Dosyayı arşivle, sıfırdan başlat

- Mevcut `docs/opendevcon/PROGRESS_LOG.md`, bütün geçmiş içeriğiyle **birebir, byte-for-byte**
  `docs/opendevcon/PROGRESS_LOG_ARCHIVE_PRE_METNEX_2026-09-17.md` (veya benzeri) adıyla taşınır —
  içerik hiç düzenlenmez, yalnızca dosya konumu değişir (bu, "düzenleme" değil "arşivleme"dir).
  Yeni bir boş `docs/opendevcon/PROGRESS_LOG.md` bu tarihten itibaren yalnızca "Metnex" adını
  kullanan girdilerle devam eder.
- Bu seçenek, canlı `PROGRESS_LOG.md` dosyasının içeriğinde **literal olarak sıfır** "eski-ad"
  bayt'ı bırakır (Seçenek A'da geçmiş girdiler hâlâ aynı dosyada kalır). Dezavantajı: tek bir
  sürekli günlük yerine iki dosya (aktif + arşiv) yönetilmesi gerekir ve arşiv dosyasının adı da
  kontrol edilmeli (yukarıdaki öneri zaten "eski-ad" içermiyor).

**AI2 önerisi:** Seçenek A — çünkü append-only kuralının *amacı* zaten "geçmiş asla
değiştirilmez" ilkesidir; bir "cutover" notuyla ileriye dönük olarak hedefe ulaşmak, kuralın
ruhunu koruyarak zero-tolerance'ı pratik olarak karşılar. Ancak nihai karar AI1'e aittir; TASK-024.2
bu karar netleşmeden PROGRESS_LOG.md'ye dokunmamalıdır.

---

## 4. Dosya adı rename kapsamının teyidi (AI1'in ikinci maddesi)

AI1'in belirttiği üç dosya adı zaten TASK-024.1'in ana envanterinde (§2.1, §3.2 madde 33-35)
**kapsama alındı** olarak işaretlenmişti; burada yalnızca netleştirme ve atomik güncelleme
zorunluluğunun altı çiziliyor:

| Mevcut dosya adı | Hedef dosya adı | Bu değişiklikle **aynı anda** güncellenmesi zorunlu çapraz referanslar |
|---|---|---|
| `docs/opendevcon/ESKI-AD_STATE.md` | `docs/opendevcon/METNEX_STATE.md` | `docs/AI_Governance/AGENT_BOOTSTRAP.md` (Reporting Rule'daki sabit yol), tüm `backlog/TASK-*.md` dosyalarındaki "bkz. docs/opendevcon/ESKI-AD_STATE.md" referansları, `docs/opendevcon/PROGRESS_LOG.md`'deki gelecek girdiler, `README.md` varsa |
| `docs/project/ESKI-AD_DELIVERY.json` | `docs/project/METNEX_DELIVERY.json` | Bu dosyaları referans eden her yer (ODC onboarding akışı, varsa AGENT_REGISTRY.md) |
| `docs/project/ESKI-AD_EXECUTION.json` | `docs/project/METNEX_EXECUTION.json` | Aynı |
| `docs/project/ESKI-AD_PLAN.json` | `docs/project/METNEX_PLAN.json` | Aynı |
| `docs/project/ESKI-AD_SCOPE.json` | `docs/project/METNEX_SCOPE.json` | Aynı |
| `docs/project/ESKI-AD_TRACEABILITY.json` | `docs/project/METNEX_TRACEABILITY.json` | Aynı |
| `docs/runbooks/ESKI-AD_LIFECYCLE_AND_STATUS_RUNBOOK.md` | `docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` | `docs/opendevcon/ESKI-AD_STATE.md`'nin (yeni adıyla `METNEX_STATE.md`) sonundaki "Süreç: ../runbooks/..." referansı, `AGENT_BOOTSTRAP.md` |

**Önemli netleştirme — backlog dosyalarındaki geçmiş path referansları:** `backlog/TASK-*.md`
dosyaları `AGENT_BOOTSTRAP.md`/`PROGRESS_LOG.md` gibi append-only değildir; bunlar task
durumunu yansıtan **canlı** kayıtlardır (`status` alanı zaten defalarca bu oturumda güncellendi).
Bu yüzden bu dosyalardaki "bkz. docs/opendevcon/ESKI-AD_STATE.md" gibi path referanslarının yeni
dosya adına güncellenmesi, geçmiş kararın **içeriğini** değiştirmez, yalnızca **kırık bir bağlantıyı**
düzeltir — bu da kapsama alınmalıdır (istisna değildir).

---

## 5. Yeni kesin tarama sonucu

Bu task (TASK-024.1-R1) **yalnızca politika/sınıflandırma** içerdiğinden, hiçbir dosya adı veya
içeriği değiştirilmedi — bu yüzden ham `rg` tarama sonucu TASK-024.1'dekiyle birebir aynıdır:

```
rg -c -i 'openmas|aiskeleton' --hidden -g '!node_modules' -g '!.git' -g '!.next' \
  -g '!dist' -g '!coverage' -g '!target' .
# → 147 dosya, 572 toplam geçiş (değişmedi)
```

Değişen, bu 572 geçişin **sınıflandırmasıdır**:

| Sınıf | TASK-024.1'deki sayı | TASK-024.1-R1 sonrası sayı |
|---|---|---|
| Rename kapsamına alınmış (aktif içerik + dosya adı) | ~538 geçiş (147 dosyadan migration SQL ve PROGRESS_LOG geçmiş girdileri hariç tamamı) | **~555 geçiş** (DEC-\*, DEPRECATED_MODULES.md, ODC_AI2_ONBOARDING_PROMPT.md eklendi) |
| Gerçek istisna (migration SQL, marka-dışı) | 1 dosya (`0002_thick_earthquake.sql`, `AIS_DEMO_PACKAGE`) | **1 dosya — değişmedi** |
| Koşullu istisna (mekanizma ile çözülecek) | `docs/opendevcon/PROGRESS_LOG.md` (14 geçiş, tamamı "DEĞİŞTİRİLMEYECEK") | **`docs/opendevcon/PROGRESS_LOG.md` — yalnızca bu task'tan (2026-09-17, TASK-024.1-R1) önceki girdiler; §3 Seçenek A/B ile çözülecek, AI1 kararı bekleniyor** |

`docs/decisions/DEC-*.md` dosyalarının kendi 9 geçişi (4+1+1+1+2) artık "rename kapsamına
alınmış" sütununa taşındı; `DEPRECATED_MODULES.md` (1) ve `ODC_AI2_ONBOARDING_PROMPT.md` (1) da
aynı şekilde.

---

## 6. Ana envanter belgesine (TASK-024.1) yapılması gereken güncelleme

Bu politika belgesi, `docs/rename/METNEX_RENAME_INVENTORY.md`'nin §2.2(e) ve §6 bölümlerindeki
"DEĞİŞTİRİLMEYECEK" işaretli 8 kalemi geçersiz kılar ve **üstün belge** olarak kabul edilmelidir.
Ana envanter belgesi bu task'ta yeniden yazılmadı (kapsam tekrarını önlemek için) — TASK-024.2
(gerçek rename'in ilk uygulama adımı) başladığında, ana envanterin §2.2(e)/§6 bölümleri bu
belgeye referans verecek şekilde güncellenmelidir.

---

## 7. Açık karar — AI1'den bekleniyor

Bu R1 task'ı **tamamlanmış politika önerisidir**, ancak bir gerçek governance-kuralı çakışması
(append-only vs. zero-tolerance) içerdiğinden nihai `done` kararı için AI1'in şunu netleştirmesi
gerekiyor:

> **`docs/opendevcon/PROGRESS_LOG.md` için §3 Seçenek A (cutover girdisi, geçmiş girdiler
> dosyada kalır) mi, yoksa Seçenek B (arşivleme, sıfırdan yeni dosya) mi uygulanacak?**

Bu karar netleşmeden TASK-024.2 (veya rename'in PROGRESS_LOG.md'yi etkileyecek herhangi bir
adımı) başlatılmamalıdır. Diğer tüm kalemler (§2'deki 8 madde + §4'teki dosya adları) için AI2
önerisi nettir ve ek bir karara gerek yoktur — TASK-024.2+ bunları doğrudan uygulayabilir.
