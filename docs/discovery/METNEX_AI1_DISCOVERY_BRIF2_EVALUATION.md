# METNEX AI1 Discovery Brif 2 — Reconciliation ve Etki Değerlendirmesi

**Task:** TASK-029.00-R1 · **Üst epic:** EPIC-005 · **Tür:** Denetim / keşif / karar hazırlığı · **Durum:** `review`
**Tarih:** 2026-09-25 · **Hazırlayan:** AI2 (Engineering Executor) · **Karar sahibi:** Product Owner / AI0 (AI1 üzerinden)

> **Bu rapor bir onay, SRS, domain modeli veya implementation talimatı değildir.** Canonical Discovery/SRS/domain/DB belgeleri, karar kayıtları, backlog, kod, API, UI, migration ve şema **değiştirilmemiştir**; gerçek veritabanına, Docker'a, credential'a veya production verisine dokunulmamıştır. Yeni tenant, rol, permission ve task oluşturulmamıştır. Aşağıdaki her öneri **[AI2 ÖNERİSİ]** etiketlidir ve Product Owner kararı bekler.

**Etiketler.** **[ESKİ KARAR]** = repo'daki mevcut hüküm · **[YENİ İŞ BİLGİSİ]** = `METNEX_AI1_DISCOVERY_BRIF2.md` (PO görüşme kararı aktarımı) · **[AI2 ÖNERİSİ]** = bu raporun önerisi · **[TBD]** = kaynakta açık bırakılmış.
**Durum sınıfları.** `CONFIRMED` · `CONFLICT` · `TBD` · `EXTERNAL_VALIDATION_REQUIRED` · `PROPOSED_ONLY` · `OUT_OF_SCOPE`.
**Kısaltmalar.** `BRIF2` = `METNEX_AI1_DISCOVERY_BRIF2.md` (repo kökü, 165 satır, izlenmeyen dosya); `DISC` = `docs/requirements/DISCOVERY.md`; `SRS` = `docs/requirements/SRS.md`; `DEC14` = `docs/decisions/DEC-0014-…md`; `E5` = `backlog/EPIC-005-…md`; `T29` = `backlog/TASK-029-00-…md`; `DM` = `docs/domain/DOMAIN_MODEL.md`; `DBM` = `docs/domain/DB_META.md`; `BRIF1` = `METNEX_AI1_DEGERLENDIRME_BRIFI.md` (22.09.2026, DEC-0014'ün girdisi).

**Kanıt sınırları (dürüstlük notu).** (1) BRIF2'nin dayandığı Excel'ler (`KALORI HESAP.xlsx` vb.) repo'da **yoktur** (`find -iname *.xlsx` sonuçsuz); formül/birim iddiaları doğrulanamaz. (2) Netsis, kepçe ölçüm cihazı ve dış MOSEDAŞ uygulaması için teknik sözleşme kaynağı repo'da yoktur. (3) `BRIF2` yaklaşık 2026-09-25 tarihlidir; DEC-0014 (2026-09-22) sonrasında gelen yeni bilgidir — DEC-0014'ü supersede etmez, ondan **sonra** ve onun **dışındaki** alanları genişletir.

---

## A. Yönetici özeti

### A.1 En önemli yeni iş kararları (BRIF2)
1. **Ortak laboratuvar** MOSB ENERJİ ve MOSBİO için tek ekip; işletme seçerek çalışır; görüntüleme ve veri girişi yetkileri **işletme bazında ayrı**; ortak ekip erişimi otomatik çapraz yetki değildir (BRIF2 §2, s.15–21).
2. **MOSB ENERJİ kömür kabulü:** Netsis'le eşleşmeden Metnex kantar işlemi kesinleşmez; araç → tartım → **fiziksel yığın** zinciri; **ortak numune** (günlük, tedarikçi bazlı) ile **sonucun uygulandığı araçlar** ayrı ilişki; kazan külü ayrı analiz; yığın tüketimi sayaç farkından, fark otomatik fire sayılmaz (§3, s.25–45).
3. **Su laboratuvarı:** tek zaman alanı = numune kabul tarihi/saati; kısmi kayıt; referans yoksa "Referans tanımlı değil"; limit dışı bildirim yalnız numune kaydı **tamamlandığında**; otomatik görev üretilmez (§4, s.49–57).
4. **MOSBİO gelen biyokütle:** araç başına analiz; ürün/parametre bazlı kriter; parametre bazında **esas sonuç** seçimi; ortak alıcı listesine bildirim; **paçala araç izlenebilirliği iddia edilmez** (§5, s.61–77).
5. **Kırım Tesisi (MOSBİO alt operasyonu):** üretim emrini **reçeteyi hazırlayan** açar (**MOSEDAŞ'tan gelmez**); reçete sürümü + fiilî uygulanma zamanı; kova ölçümü; **yüklenen malzeme ≠ nihai paçal üretim miktarı**; ölçülmüş/tahmini/kontrol-bekleyen miktar ayrımı; tamamlanan emir yeniden açılmaz (§6, s.81–116).
6. **Kalori/kül:** kullanılan alt kalori = `KALORI HESAP.xlsx` G6→G7; girdi revizyonu ile yeni ölçüm ayrı işlem; ana raporda ilk+güncel (ekran), yalnız güncel (Excel/PDF) (§7, s.120–125).

### A.2 Mevcut tasarımla farklar (özet)
- Repo'daki **tek** "üretim emri" kavramı, MOSEDAŞ'tan gelen dış emirdir (DEC14 karar 1/5, SRS FR-068–071, E5 029.04). BRIF2 **ikinci bir emir türü** (Kırım Tesisi iç emri) tanıtır → **terim ve SoR çakışması**.
- Repo'daki laboratuvar yaşam döngüsü **taslak → onay → kilit, düzeltme = yeni revizyon** (DISC §22.3.1 s.770-771, DEC14 karar 9, SRS FEAT-024, T29 029.07); BRIF2 **kısmi kayıt, sonradan parametre ekleme, esas-sonuç seçimi, yetkili düzeltme + eski/yeni değer geçmişi** tarif eder; "onay/kilit" hiç geçmez.
- Repo'da **hiç uygulanmış** laboratuvar, kantar, yığın, paçal, üretim emri, vardiya-operasyon, external-system, Netsis/BEAM entegrasyonu **yoktur**; yalnız belge ve karar paketleri vardır (bkz. §B "Gerçek uygulama durumu").

### A.3 Kritik çelişkiler (ayrıntı §D)
| ID | Çelişki | Öncelik |
|---|---|---|
| C-01 | "Üretim emri" SoR'u: MOSEDAŞ (DEC14) ↔ Kırım Tesisi'nde reçeteyi hazırlayan (BRIF2 §6.1) | **Critical** |
| C-02 | Laboratuvar yaşam döngüsü: onay/kilit/revizyon ↔ kısmi kayıt/append/esas-sonuç/yetkili düzeltme | **High** |
| C-03 | Kantar/araç kaydının sahibi: "Metnex adayı" (DISC §10) ↔ "Netsis'te oluşur, eşleşir" (BRIF2 §3.1) ↔ BR-016 paralel ana sistem yasağı | **High** |
| C-04 | MOSEDAŞ/MOSB tenant statüsü: DEC14 (tenant değil) ↔ DISC D-005/`tenant-mapping.ts`/`BOTC_MIP_TENANT_LOCATION_MAPPING.md` (hâlâ tenant) | **High** (kod dahil) |
| C-05 | Ortak laboratuvar ekibi ↔ tenant izolasyonu (BR-001A) | **High** |
| C-06 | Paçal bildirim kapsamı: "hedef dışı bildirim yok" ↔ "sonradan sonuç → yeniden bildir" (BRIF2 s.96; TBD-G01) | Medium |
| C-07 | Vardiya: varlık (FEAT-023/022) ↔ zaman boyutu/rapor ayrımı (BRIF2 §6.1, §6.4) | Medium |
| C-08 | Kömür Kazanı / MOSBİO KIRIM DEPO / Kırım Tesisi konumu (Q-T01, Q-V01 açık) | Medium |
| C-09 | Toplu kalite: aritmetik ↔ ağırlıklı; ağırlık verisi yok (TBD-L03) | Medium |

### A.4 Implementation'a henüz başlanamayacak konular
Laboratuvar domain'i (C-02, C-05, TBD-L01…L04), kömür kantar/yığın (C-03, Netsis sözleşmesi TBD), Kırım Tesisi emir/reçete/kova (C-01, TBD-K01…K04, TBD-L03/G02), MOSEDAŞ B2B (dış ekip sözleşmesi yok), Vardiya Operasyon Merkezi (C-07, Q-V01…V24 açık ve `shift_reports` için şema kararı yok — DBM s.233-236), her türlü bildirim kuralı (TBD-G01). Bu raporun önerdiği bağımlılık sırası §I.6'dadır; **hiçbir AI2 task'ı `ready` yapılmamıştır**.

---

## B. Kaynak ve repo kanıt tablosu

`Gerçek uygulama durumu` sütunu: **KOD** = `apps/`/`services/` altında çalışan uygulama; **BELGE** = yalnız doküman/karar paketi; **YOK** = ne kod ne belge.

### B.1 BRIF2 hükümleri ↔ mevcut belgeler

| # | Konu | Kaynak dosya | Bölüm/satır | Mevcut hüküm [ESKİ] | Yeni hüküm [BRIF2] | Gerçek uygulama durumu | Durum |
|---|---|---|---|---|---|---|---|
| B-01 | Ortak laboratuvar ekibi, işletme seçimi, ayrı görüntüleme/giriş yetkisi | BRIF2; SRS | BRIF2 s.15-21; SRS `BR-001A` (s.~52), `FR-002B` | İşletme tenant'ı başka tenant verisini göremez; root aggregate yalnız permission + `canAggregateChildren` + scope | Tek lab ekibi iki işletmeye hizmet eder; yetki işletme bazında | KOD: tenant ağacı (`tenants`, `tenant_closure`, `TenantScopeService`); lab yetkisi **YOK** (`permission-catalogue.ts` içinde LAB/SHIFT izni yok) | CONFLICT (C-05) |
| B-02 | Laboratuvar performansı işletme + ortak toplam; ortak analiz sayıyı çoğaltmaz | BRIF2 | s.19 | Lab raporu tanımı yok | Çift sayım yasağı | YOK | TBD (metrik tanımı) |
| B-03 | Kantar = Metnex UI; Netsis eşleşmeden işlem kesinleşmez; manuel Netsis girişi; çift kayıt önleme | BRIF2; DISC; SRS | BRIF2 s.25-29; DISC §10 tablo s.389-398, Q-024 s.838; SRS `BR-016`, `TBD-OPS-006` | Netsis ERP SoR; kantar/kömür "Metnex adayı, ayrı Discovery"; Netsis üretim tetikleme sözleşmesi TBD | Kantar işlemi Netsis kaydına bağlı | YOK (kod/belge sözleşmesi yok) | CONFLICT (C-03) / EXTERNAL_VALIDATION_REQUIRED |
| B-04 | Araç–tartım–fiziksel yığın; aynı tedarikçiye birden çok yığın | BRIF2 | s.28 | `FR-086` kömür kalorisi kantar kaydına bağlanabilir; brüt/dara/net TBD | Yığın ayrı nesne | YOK | TBD (anahtarlar) |
| B-05 | Günlük ortak numune (kül/uçucu) ve uygulandığı araçlar ayrı ilişki | BRIF2 | s.31-36 | Yok | Katılan araç ≠ uygulanan araç | YOK | CONFIRMED (iş kuralı) / PROPOSED_ONLY (model) |
| B-06 | Kazan besleme, yığın geçişi, sayaç farkı tüketim; fark fire sayılmaz | BRIF2; kod | BRIF2 s.38-45; `veriler/manifest/scada-fixtures.manifest.json` (komur_endeksler) | Wave 5: SCADA sayaç/rollover/kalite bayrakları (DEC-0015 Q-W501/502) | Sayaç bilgisi operatör kaydı | KOD (yalnız SCADA read-only analiz); yığın/besleme kaydı YOK | TBD (**sayaç kaynağı manuel mi SCADA mı?**) |
| B-07 | Kazan külü: vardiyada birden çok numune, tek kabul zamanı + teslim eden; yığın ilişkisi öneri+düzeltme | BRIF2 | s.41-43 | Yok | Yığın ilişkisi otomatik öneri, mutlak doğruluk değil | YOK | CONFIRMED / TBD (öneri algoritması) |
| B-08 | Yığın kapanışı operatörde; uzman "İncelendi" | BRIF2 | s.44 | Yok | İnceleme işareti | YOK | CONFIRMED |
| B-09 | Ana kömür raporu = Excel kolon/formülleri; Excel/PDF/yazdırma | BRIF2; kod | s.45; `docs/decisions/DEC-0013`, TASK-027.74 | Reporting Foundation + Jasper allowlist şablonu; export audit `REPORT_EXPORT_*` | Lab/kömür raporları | KOD: Reporting Foundation ve SCADA export (`scada-analysis-report` şablonu) — **lab şablonu yok** | TBD (Excel doğrulaması) |
| B-10 | Su lab: tek zaman = kabul; kısmi kayıt; otomatik görev yok; referans işletme+sistem+nokta+parametre; limit dışı bildirim (kayıt tamamlanınca) | BRIF2; DISC; DEC14 | BRIF2 s.49-57; DISC §22.3 s.751-770; DEC14 karar 9 | Parametrik, versiyonlu, **onay/kilit/revizyon**; Q-023 su parametreleri TBD | Kısmi + append + bildirim | YOK | CONFLICT (C-02) |
| B-11 | MOSBİO Online Drum/Steam manuel giriş, ayrı kolonlar; gerçek kaynak TBD | BRIF2; DISC | s.56; DISC s.753-762 | "Otomatik cihaz/LIMS aktarımı kapsam dışı" | Manuel ilk faz | YOK | CONFIRMED (manuel) / EXTERNAL_VALIDATION_REQUIRED (kaynak) |
| B-12 | MOSBİO gelen ürün: araç başına analiz, esas sonuç parametre bazında, kriter tarihçesi, ortak alıcı bildirimi, sonuç düzeltme talebi/gerçekleştirme | BRIF2 | s.59-77 | SRS `FR-084/085` reçete bileşen kalorisi; gelen ürün analizi tarif edilmemiş | Yeni alt modül | YOK | CONFIRMED (iş kuralı) |
| B-13 | Kırım Tesisi MOSBİO alt operasyonu; emir MOSEDAŞ'tan gelmez | BRIF2; DEC14; SRS; E5 | BRIF2 s.81-82; DEC14 karar 1,5; SRS `FR-068/069/070`, §9.1.2; E5 029.04 | "MOSEDAŞ plan/emir SoR'u; Metnex kabul/ret, PAUSED/EXECUTION_BLOCKED" | İç emir: reçeteyi hazırlayan açar | YOK | CONFLICT (C-01) |
| B-14 | Emir/reçete/sürüm yaşam döngüsü (çoklu vardiya, revizyon, hedef altı tamamlama, yeniden açılmaz, geç numune) | BRIF2; E5 | s.83-89; E5 029.04 (E5 s.42) | 029.04: "versiyon, kabul/ret, iptal/replan, idempotency" | Farklı durum makinesi | YOK | CONFLICT (C-01) |
| B-15 | Paçal numunesi: yalnız kabul zamanı; emir/sürüm önerisi + doğrulama + yetkili düzeltme | BRIF2 | s.91-94 | Yok | — | YOK | CONFIRMED |
| B-16 | Hedef kalite parametreleri esnek; hedef dışı işaretle/raporla; bildirim kapsamı belirsiz | BRIF2 | s.95-96, TBD-G01 (s.139) | Lab bildirim kuralı tanımsız | İç çelişkili ifade | YOK | TBD (C-06) |
| B-17 | Toplu kalite: aritmetik veya ağırlıklı; ağırlık verisi doğrulanmamış | BRIF2 | s.98-99, TBD-L03 (s.133) | SRS `TBD-OPS-005` hesaplanan/ölçülen | — | YOK | TBD (C-09) |
| B-18 | Kova ölçümü, fiilî zaman, birim ayrımı, yüklenen ≠ nihai paçal | BRIF2 | s.101-110, TBD-G02 | Yok | — | YOK | CONFIRMED (kural) / TBD (cihaz) |
| B-19 | Ölçülmüş / tahmini / birleşik / kontrol-bekleyen ayrımı; tahminin doğrulanınca yer değiştirmesi | BRIF2 | s.106-109 | Wave 5'te analog: SCADA `dataQuality`/`qualityFlags`, "null ≠ 0" | — | KOD (yalnız SCADA analog) | CONFIRMED (kural) |
| B-20 | Kepçe cihazı → Metnex veri aktarımı, kimlik, zaman, kesinti sonrası geri aktarım | BRIF2 | s.135-138 (TBD-K01…K04) | DISC s.759-762 lab için cihaz aktarımı kapsam dışı | Tedarikçi teknik ekip | YOK | EXTERNAL_VALIDATION_REQUIRED |
| B-21 | Kalori: G6→G7; girdi revizyonu ≠ tekrar analiz; kül formülü; ilk+güncel gösterim | BRIF2 | s.120-125; TBD-L01/L02 | Yok | Excel formülleri | YOK (Excel repo'da yok) | EXTERNAL_VALIDATION_REQUIRED |
| B-22 | Vardiya: ayrı zorunlu vardiya operasyon kaydı açılmaz; vardiya sorumlusu yetkileri; vardiya raporda boyut | BRIF2; SRS; DEC14 | BRIF2 s.84,113; SRS FEAT-022 (s.323-375), FEAT-023 (s.540-544); DEC14 karar 11 | FEAT-023 vardiya listesi/detayı ekranı; FEAT-022 vardiya raporu taslak/tamamlandı | Vardiya = zaman/sorumluluk boyutu | BELGE (10 task `done` ama **karar/blocker paketleri**; `shift_reports` şeması ve kod YOK — DBM s.233-236, `TASK-027-24…md` s.16) | CONFLICT (C-07) |
| B-23 | Netsis/BEAM/MOSEDAŞ sınırları | BRIF2 (görev metni) ↔ DEC14/SRS | DEC14 karar 3,7,8; SRS `BR-013/016`, §9.1.3 | Netsis ERP SoR; BEAM varlık/bakım SoR; MOSEDAŞ B2B mTLS+OAuth2 | BRIF2 içeriği bunlara ek bilgi getirmez (yalnız Netsis kantar bağı) | YOK | CONFIRMED (eski karar korunur) |

### B.2 Repo içi tutarsızlıklar ve gerçek uygulama kanıtı

| # | Konu | Kaynak dosya | Bölüm/satır | Hüküm | Gerçek uygulama | Durum |
|---|---|---|---|---|---|---|
| R-01 | MOSEDAŞ tenant değildir | `DEC14` karar 2 (s.23-25); `SRS` s.50, s.533-534; `DISC` s.68 | Kabul edilmiş | **KOD:** `apps/api/src/reporting/scada/catalog/tenant-guards.ts:22-31` MOSEDAŞ'a eşlemeyi reddeder ve listelemez | CONFIRMED |
| R-02 | MOSEDAŞ hâlâ tenant sayılıyor | `DISC` s.9, s.164, s.198, D-005 s.251; `docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md` §1 tablo ("MOSEDAŞ … STANDARD … Eşlenir", 2026-09-17, DEC-0014 notu yok) | Eski hüküm supersede edilmemiş | **KOD:** `apps/api/src/migration/botc-identity/tenant-mapping.ts:8` `KNOWN_TENANT_SLUGS=['MOSB','MOSEDAS','MOSBIO']`, `types.ts:49`, `tenant-coverage.ts:94` (kimlik migration'ı bu üç slug'a kullanıcı atar) | CONFLICT (C-04) |
| R-03 | Tenant ağacı gerçeği | `DM` §3 (s.60-84); `DBM` s.243-258; `apps/api/src/db/schema/platform.ts:18` | `PLATFORM_ROOT`/`ROOT`/`STANDARD`, `parentId`/`customerRootId`, `canAggregateChildren` | **KOD:** uygulanmış | CONFIRMED |
| R-04 | `DM` güncelliği | `docs/domain/DOMAIN_MODEL.md` s.1-6, s.8-19 | "Prisma ile hizalı", modül listesi yalnız Platform/Settings/SaaS/Web/Entitlements/Reporting; DEC-0014 alanları (operasyon, lab, external system, üretim emri) **yok**; DEC-0011 Drizzle | — | CONFLICT (belge bayat) |
| R-05 | Laboratuvar/üretim/vardiya tabloları | `apps/api/src/db/schema/*.ts` (`enums,operations,platform,reporting,saas,settings`); `apps/api/drizzle/migrations/0000…0005` | `pgTable` envanteri: kimlik, tenant, audit, performans, settings, rapor artifact… | **YOK**: lab/kantar/yığın/emir/vardiya/external-system tablosu yok | CONFIRMED (yalnız belge) |
| R-06 | İzin kataloğu | `apps/api/src/platform/permission-catalogue.ts` (grep LAB/SHIFT/PRODUCTION/EXTERNAL → sonuçsuz) | Vardiya izinleri (`SHIFT:REPORT:*`) Q-V07'de "eklenecek", hâlâ yok | **YOK** | CONFIRMED |
| R-07 | Vardiya task'ları | `backlog/TASK-027-21…30` (hepsi `done`) | İçerik: SRS/mapping/karar paketi/blocker; `TASK-027-24…md` s.16 "apps/ altında hiçbir kod yazılmadı" | **BELGE** | CONFIRMED |
| R-08 | Vardiya lokasyon–tenant açık soruları | `docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md` Q-T01 (s.291, s.557), Q-V01 (s.570, s.765); `docs/migration/BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE.md` §1 s.23-48 | `KÖMÜR KAZANI` → MOSB (aday, **E2 zayıf**); `MOSBİO KIRIM DEPO` → MOSBIO (aday, **E3**); `SANTRAL` aday yok (**E4**) | **BELGE**, kapatılmamış | TBD |
| R-09 | Epic/plan | `E5` (s.1-57), `T29` (s.1-64) | 12 task `planned`; başlatma kuralı: SRS/Discovery güncellemesi + PO/AI1 ön koşul incelemesi olmadan `ready` yapılmaz | **BELGE** | CONFIRMED |
| R-10 | Wave 5 | `docs/opendevcon/METNEX_STATE.md`; commit `6505818` | SCADA read-only zincir, Reporting export, dev in-memory store'lar tamam | **KOD** | CONFIRMED |
| R-11 | Audit altyapısı | `apps/api/src/audit/platform-audit.service.ts`; `apps/api/src/audit/scrub-secrets.ts` | `platform_audit_logs` (actor snapshot, `entityId` nullable, metadata JSON, secret scrub) | **KOD**; alan bazlı **eski/yeni değer geçmişi** için domain tablosu **yok** | CONFIRMED |

---

## C. Kapsam ve etki matrisi

| Konu | As-is (repo) | To-be (BRIF2) | Değişiklik türü | Etkilenen domain | Etkilenen task/epic | Karar sahibi | Durum |
|---|---|---|---|---|---|---|---|
| Üretim emri tanımı | Yalnız MOSEDAŞ dış emri | + Kırım Tesisi iç emri | Kavram genişlemesi (supersede değil) | Operasyon/üretim | E5 029.04, 029.05; SRS FR-067–071, §9.1.2 | PO/AI1 | CONFLICT |
| Reçete / reçete sürümü | SRS FEAT-019 bileşen + kalori | Sürümlü reçete, fiilî uygulanma dönemi, hedef kalite | Yeni domain | Kırım Tesisi | E5 (yeni task gerekir) | PO | PROPOSED_ONLY |
| Kova ölçümü | Yok | Ölçüm + tahmin + kontrol akışı | Yeni domain | Kırım Tesisi | Yeni | PO + tedarikçi | EXTERNAL_VALIDATION_REQUIRED |
| Laboratuvar yaşam döngüsü | Taslak→onay→kilit→revizyon | Kısmi/append/esas sonuç/düzeltme | Kural değişikliği | Laboratuvar | E5 029.07/029.08; DEC14 k.9; SRS FEAT-024 | PO | CONFLICT |
| Kömür kabul / kantar / yığın | Metnex adayı, ayrı Discovery | Kantar UI + Netsis bağı + yığın | Yeni domain + entegrasyon | Kömür/yakıt | Yeni | PO + Netsis sahibi | CONFLICT / EXTERNAL |
| Su lab | Q-023 TBD | Kısmi, referans, bildirim | Detaylandırma | Laboratuvar | 029.07 | PO + lab sorumlusu | CONFIRMED (kural) / TBD (parametreler) |
| Gelen biyokütle analizi | Yok | Araç bazlı analiz + kriter + bildirim | Yeni | Laboratuvar | 029.07 | PO | CONFIRMED |
| Tenant/işletme/yetki | MİP root → MOSB/MOSBIO; MOSEDAŞ tenant değil (DEC14); kod eski | Ortak lab, işletme başına yetki | Yetki modeli | Platform/kimlik | Wave 1 migration kodu; 029.01 | PO/AI1 | CONFLICT |
| Vardiya | Rapor + arşiv (FEAT-022) + Operasyon Merkezi (FEAT-023) | Vardiya sorumlusu rolleri; vardiya = zaman boyutu | Kavram netleştirme | Vardiya/operasyon | Wave 4 (027.21-30), 029.05/029.06 | PO | CONFLICT (orta) |
| Bildirim (uygulama içi + e-posta) | Vardiya e-postası (Q-V05 açık); lab bildirimi yok | Su + gelen ürün + paçal(TBD) | Yeni yetenek | Bildirim | 029.11 (outbox) genişlemesi | PO | TBD |
| Raporlama (Excel/PDF/ekran) | Reporting Foundation + SCADA şablonu | Lab/kömür/paçal/Kırım raporları | Yeniden kullanım + yeni şablonlar | Reporting | DEC-0013, TASK-027.74 (Q-W542) | AI1 | PROPOSED_ONLY |
| Toplu kalite yöntemi | TBD-OPS-005 | Aritmetik/ağırlıklı | Kural | Kırım/kalite | — | PO + lab + Kırım | TBD |
| Netsis | SoR; üretim tetikleme (DISC s.392) | Kantar eşleşmesi | Entegrasyon yönü | ERP | Q-024 | PO + Netsis sahibi | EXTERNAL_VALIDATION_REQUIRED |
| BEAM | Varlık/bakım SoR | Cihaz/kova sistemi varlığı | Referans | Varlık | 029.01, 029.03 | PO | TBD |
| Dış MOSEDAŞ uygulaması | B2B inbound emir + geri bildirim | Kırım emri **buradan gelmez** | Kapsam netleştirme | Entegrasyon | 029.02, 029.04, 029.11 | PO | CONFIRMED (sınır) |
| Wave 5 | Tamamlandı | Kömür sayaç/tüketim ile kesişim (B-06) | Yeniden kullanım adayı | SCADA/DMS | Wave 5 kodu değişmez | AI1 | TBD |
| Wave 4 | Kontrat/blocker düzeyi | Vardiya sorumlusu, Kırım Tesisi vardiya dilimi | Ek girdi | Vardiya | 027.24-30 blocker'ları; Q-V01/Q-T01 | PO | TBD |

---

## D. Kritik çelişkiler

### C-01 — "Üretim emri" ve System of Record (Critical)
- **Eski karar [ESKİ KARAR]:** `DEC14` karar 1: "MOSEDAŞ üretim planı ve üretim emrinin SoR'udur; Metnex emri alır, doğrular, kabul/ret eder, yürütür"; karar 5: MOSEDAŞ plan/order durumlarının sahibi; SRS `FR-068/069/070`, §9.1.2; `E5` 029.04 (versiyon, kabul/ret, `PAUSED`/`EXECUTION_BLOCKED`, iptal/replan).
- **Yeni bilgi [YENİ İŞ BİLGİSİ]:** BRIF2 s.81-89: Kırım Tesisi emri **MOSEDAŞ'tan gelmez**; reçeteyi hazırlayan açar, vardiya sorumlusu başlatır/tamamlar; revizyon ya da yeni emir; hedefsiz tamamlama ("Miktar bilinmiyor"); tamamlanan emir yeniden açılmaz; geç numune emri açmaz.
- **Etki:** DEC14 metni "üretim emri" sözcüğünü tek anlamda kullanır; SRS ve EPIC-005 029.04 yalnız dış-emir yaşam döngüsünü modeller. İki ayrı yaşam döngüsü, iki SoR (MOSEDAŞ vs Metnex) ve farklı durum kümeleri gerekir; "emir vardiya kaydına gömülmez" ilkesi (FEAT-023) iki türde de korunmalı.
- **Çözülmezse risk:** Tek tablo/tek durum makinesi altında iki anlamın birleştirilmesi; MOSEDAŞ B2B mesaj sözleşmesine iç emirlerin sızması; yanlış SoR ile audit/idempotency kuralları (mTLS/OAuth2 kapsamı) iç emirlere uygulanması; sahte "MOSEDAŞ emri kabul/ret" akışı Kırım için.
- **Karar sahibi:** Product Owner (AI0 → AI1).
- **Önerilen görüşme [AI2 ÖNERİSİ]:** DEC14'ü **supersede etmeden** "kapsam açıklaması" olarak netleştirmek: (a) *Enerji üretim emri* (MOSEDAŞ SoR) ve (b) *Kırım Tesisi paçal üretim emri* (Metnex SoR, iç) için ayrı terim ve ayrı bounded context; ortak yalnız "olay/vardiya" gözlemi. Yeni DEC (ör. "DEC-0017") önerisi PO onayıyla.

### C-02 — Laboratuvar yaşam döngüsü (High)
- **Eski [ESKİ KARAR]:** `DISC` §22.3.1 (s.770-771) "taslak → onay → kilitli; düzeltme yeni revizyonla"; `DEC14` karar 9; SRS FEAT-024 (s.546-549) ve `T29` 029.07 (taslak/onay/kilit/revizyon).
- **Yeni [YENİ İŞ BİLGİSİ]:** BRIF2 s.50, s.68-69, s.74, s.97: kısmi kayıt; eksik parametre sonra **aynı analize** eklenir; tekrar analiz ayrı geçerli kayıt; laboratuvar yetkilisi **parametre bazında esas sonucu** seçer; sonuç düzeltmede eski/yeni değer, talep eden, düzelten, zaman; **zorunlu onay/aksiyon yok**. "Kilit" ve "onay" hiç geçmez.
- **Etki:** Durum makinesi, revizyon modeli ve audit ihtiyacı farklıdır; 029.07/029.08 kapsamı ve DEC14 k.9 yeniden yazılmadan başlatılamaz. "Onay" belki yalnız *referans/kriter tanımı* için (BRIF2 s.52) korunacak mı belirsiz.
- **Çözülmezse risk:** Onay/kilit uygulanırsa BRIF2'nin kısmi/append iş akışı çalışmaz; uygulanmazsa DEC14 k.9 ile fiili çelişki; denetim izinin biçimi (revizyon vs olay geçmişi) belirsiz kalır.
- **Karar sahibi:** PO + laboratuvar sorumlusu.
- **Önerilen görüşme [AI2 ÖNERİSİ]:** "Analiz kaydı" için hangi durumların olduğu (açık/tamamlandı/…), "tamamlanma" anlamı (bildirim tetikler: BRIF2 s.54), onay/kilit **gerekli mi**, düzeltmenin kimin yetkisinde olduğu; sonra DEC14 k.9 için ek karar.

### C-03 — Kantar/araç kaydının sahibi ve Netsis (High)
- **Eski [ESKİ KARAR]:** `DISC` s.389-392 Netsis ERP SoR; s.398 kantar/kömür/operasyon kalitesi "Metnex adayı — ayrı Discovery"; Q-024 (s.838) Netsis üretim tetikleme sözleşmesi TBD; SRS `BR-016` (Netsis'te sahipliği net aktif fonksiyonlar paralel geliştirilmez), `TBD-OPS-006`.
- **Yeni [YENİ İŞ BİLGİSİ]:** BRIF2 s.25-29: Metnex "normal kantar kullanıcı arayüzüdür"; Netsis'te oluşup eşleşmeden işlem kesinleşmez; istisnai manuel Netsis girişi; otomatik ilişkilendirme → yetkili manuel eşleştirme; çift kayıt önleme; **anahtarlar TBD**.
- **Etki:** Ağırlık/tartım kaydının hangi sistemde doğduğu, Metnex'in yazar mı okuyucu mu olduğu, Netsis'e geri yazım olup olmadığı belirsiz. BR-016 ile "kantar UI" paralel ana sistem olup olmadığı tartışmalı.
- **Çözülmezse risk:** Çift kayıt/yarım eşleşme; Netsis'te doğmamış aracın yığına girmesi ya da Netsis'e yetkisiz yazım; audit sorumluluğunun iki sistem arasında kaybolması.
- **Karar sahibi:** PO + Netsis/ERP sahibi (dış).
- **Önerilen görüşme [AI2 ÖNERİSİ]:** Önce **veri sahipliği ve yön** (Netsis→Metnex okuma, eşleşme tablosu, Metnex→Netsis yazma var mı), sonra sözleşme (EXTERNAL_VALIDATION_REQUIRED).

### C-04 — MOSEDAŞ/MOSB tenant statüsü ve kod (High)
- **Eski karar:** `DEC14` karar 2 (MOSEDAŞ/MOSB operasyon tenantı yok; MOSB Enerji + MOSBIO var) vs `DISC` s.9, s.164, s.198, D-005 s.251 ve `BOTC_MIP_TENANT_LOCATION_MAPPING.md` §1 (MOSEDAŞ ve "MOSB" STANDARD tenant).
- **Yeni bilgi:** BRIF2 işletmeleri **MOSB ENERJİ** ve **MOSBİO** olarak adlandırır; MOSEDAŞ'ı Kırım emrinin kaynağı olarak dışarıda bırakır.
- **Gerçek uygulama:** `apps/api/src/migration/botc-identity/tenant-mapping.ts:8`, `types.ts:49`, `tenant-coverage.ts:94` hâlâ `MOSB|MOSEDAS|MOSBIO` slug'larını "onaylı tenant" kabul eder; `tenant-guards.ts:22-31` (Wave 5) MOSEDAŞ'ı reddeder. **Aynı repo'da iki farklı tenant tanımı.**
- **Etki:** Kimlik migration'ı MOSEDAŞ tenant'ına kullanıcı atayabilir; "MOSB" ↔ "MOSB ENERJİ" slug/isim eşlemesi (`BOTC_VARDIYA_LOCATION_TENANT_MAPPING_DECISION_PACKAGE.md` §1 satır 2) doğrulanmamış.
- **Çözülmezse risk:** Yanlış tenant'a kullanıcı/veri ataması, cross-tenant sızıntı; DEC14 ihlali.
- **Karar sahibi:** PO/AI1. **[AI2 ÖNERİSİ]:** Discovery D-005 ve mapping belgeleri için supersede notu; kimlik migration slug kümesinin DEC14 ile hizalanması **ayrı, onaylı** bir task (kod değişikliği bu raporun kapsamı dışı).

### C-05 — Ortak laboratuvar ekibi ve işletme izolasyonu (High)
- **Eski:** `SRS` `BR-001A`, `FR-002B`; `DEC-0009/0010`: tenant izolasyonu, root aggregate yalnız `canAggregateChildren` + permission + data scope.
- **Yeni:** BRIF2 s.17-19: ortak ekip iki işletmede çalışır; yetki işletme bazında; **otomatik çapraz erişim değil**; performans ortak toplam.
- **Etki:** İki kardeş tenant'ta üyelik + ayrı görüntüleme/giriş yetkisi mi, yoksa ortak bir lab kapsamı mı? Ortak toplam raporu root-aggregate mekanizmasına mı bağlı? `permission-catalogue.ts`'te lab izni yok.
- **Risk:** Lab çalışanının yanlış işletme kapsamı; aggregate raporlarda yetkisiz görünürlük.
- **Karar sahibi:** PO/AI1. **[AI2 ÖNERİSİ]:** Mevcut membership + permission modelini genişletmeden önce "ortak ekip" nasıl temsil edilir (kullanıcı çoklu tenant üyeliği vs ortak rol) kararı.

### C-06 — Paçal bildirim kapsamı (Medium)
- BRIF2 s.96: hedef dışı paçal **otomatik bildirim başlatmaz**; aynı zamanda tamamlanmış kayda sonradan parametre eklenince güncel analiz **yeniden bildirilir** (genel karar). BRIF2 s.139 (TBD-G01) ve s.163 bunu açık soru olarak işaretler. Su (s.54) ve gelen ürün (s.71-73) için bildirim kesin. **[AI2 ÖNERİSİ]:** Paçal için bildirim alıcıları/tetikleyicileri PO kararına kadar **hiç varsayılmamalı**.

### C-07 — Vardiya: varlık mı, boyut mu (Medium)
- Eski: FEAT-022 (vardiya raporu taslak/tamamlandı, lokasyon bazlı); FEAT-023/`DEC14` k.11 "vardiya listesi/detayı" ekranı. Yeni: BRIF2 s.84, s.113: **ayrı zorunlu vardiya operasyon kaydı açılmaz**; vardiya ayrımı raporda; vardiya sorumlusu fiilî üretimi başlatır/tamamlar/sürüm zamanını girer.
- Belirsizlik: vardiya sınırlarını kim/nasıl tanımlar (BOTC `vardiya kodu` mu, saat aralığı mı), "vardiya sorumlusu" bir rol mü (izin kataloğunda yok, Q-V07/V08 açık). **Karar sahibi:** PO.

### C-08 — Kömür Kazanı / KIRIM DEPO / Kırım Tesisi konumu (Medium)
- Eski: `DEC14` k.2 ve DISC s.688: Kömür Kazanı MOSB Enerji altında tesis/ünite; ancak Vardiya lokasyon paketi (`…DECISION_PACKAGE.md` §1) `KÖMÜR KAZANI` → "MOSB (aday) E2 zayıf", `MOSBİO KIRIM DEPO` → "MOSBIO (aday) E3"; Q-T01/Q-V01 **kapatılmamış** (`BOTC_MIGRATION_OPEN_QUESTIONS.md` s.291, 557, 570, 765).
- Yeni: BRIF2 Kırım Tesisi = MOSBİO alt operasyonu; kömür kabul/kazan külü = MOSB ENERJİ. **"Kırım Tesisi" ile "MOSBİO KIRIM DEPO" aynı fiziksel/işletme birimi mi?** — kaynak yok → EXTERNAL_VALIDATION_REQUIRED. **Karar sahibi:** PO.

### C-09 — Toplu kalite yöntemi (Medium)
- BRIF2 s.99: aritmetik **veya** miktara göre ağırlıklı ortalama "tercih edilebilir"; nem/kalori/kül için aynı yöntem; ağırlık (numunenin temsil ettiği miktar) doğrulanmamış; s.161 "doğrulanmamış ağırlıklarla yapma". Kimin, hangi kapsamda (emir mi, reçete sürümü mü) seçtiği belirsiz. **Öneri:** yöntem seçimi ile ağırlık verisi erişilebilirliği birlikte karara bağlanana kadar yalnız aritmetik-ortalama **seçeneği** ve "ağırlıklı: veri yok" durumu tasarlanabilir; bu bir karar değil, **[AI2 ÖNERİSİ]**.

### Alt konular (çelişki değil, açıklık gereken)
- **Yüklenen ≠ nihai paçal miktarı:** BRIF2 s.105, s.140 (TBD-G02) net → `CONFIRMED`; raporlarda eşitleme yasağı test edilebilir kural olarak kaydedilmeli.
- **BEAM varlık sahipliği:** DEC14 k.3 değişmedi; BRIF2 yeni bilgi vermez. Kova ölçüm cihazı/tesis-makine referansı BEAM'de olacaksa kimlik eşlemesi TBD (029.01).
- **Sayaç kaynağı (B-06):** Kazan besleme sayaç bilgisi operatör girişi mi, `komur_endeksler` SCADA sayacı mı (Wave 5: `KK1_KOMUR_TUK_TON`, `veriler/manifest/scada-fixtures.manifest.json`)? İkisi de olabilir; hangisi "esas" TBD. Wave 5'in sayaç sıfırlama/rollover ve "null ≠ 0" kuralları yeniden kullanım adayıdır ama **SCADA read-only (DEC-0015), lab/yığın verisi PostgreSQL yazma domain'idir** — aynı katalog/adaptera bağlanmamalıdır.

---

## E. Domain sınırları

**İlke.** BRIF2 s.157 (kontrol listesi 1): gelen ürün/araç analizi ≠ paçal analizi ≠ Kırım Tesisi üretim emri ≠ kömür yığını/kazan külü ≠ su numunesi. Aşağıdaki tanımlar BRIF2'den derlenmiştir; **veri modeli önerisi değildir** (anahtar/alan yok).

| Nesne | Ne olduğu (BRIF2) | Neden ayrı | Diğerleriyle ilişki (BRIF2) | Sahip/rol | Durum |
|---|---|---|---|---|---|
| **Araç** | Sevkiyatı taşıyan araç (kantar operatörü, laboratuvar çalışanı seçer) | Tartım ve analiz kaydından bağımsız kimlik | Sevkiyat ve kantar kaydı ile ilişkili | Kantar operatörü | TBD (anahtar) |
| **Sevkiyat** | Araç bazlı teslimat (tedarikçi bağlamı) | Tedarikçi listesi sabit değil | Kantar kaydı + yığın | Kantar/Netsis | EXTERNAL_VALIDATION_REQUIRED |
| **Kantar kaydı** | Tartım bilgisi; Netsis'te doğar/eşleşir | Netsis ile eşleşmeden kesin değil | Araç ↔ yığın; MOSBİO'da laboratuvar "mevcut tartım kayıtlarından aracı seçer" | Kantar operatörü (manuel Netsis istisnası yetkili) | CONFLICT (C-03) |
| **Kömür yığını** | Fiziksel yığın; aynı tedarikçiden birden çok olabilir | Araçtan farklı; tüketim sayaç farkıyla kapanır | Araç → yığın; kazan külü numunesi yığına önerilir | Operatör (kapanış); uzman (İncelendi) | CONFIRMED |
| **Numune** | Araç numunesi (4 nokta; MOSBİO'da 6 nokta), günlük ortak numune, kazan külü numunesi, su numunesi (numune noktası), paçal numunesi | Farklı türler farklı zaman ve ilişki kuralları | Türe göre farklı bağlar | Laboratuvar | CONFIRMED |
| **Analiz** | Bir numunenin analiz kaydı; tekrar analiz ayrı geçerli kayıt; esas sonuç yetkili seçer | Numune ↔ sonuç ↔ esas sonuç ayrımı | Numune 1 → n analiz | Laboratuvar / yetkili | CONFLICT (C-02) |
| **Parametre sonucu** | Analizin parametre düzeyi değeri; sonradan eklenebilir; parametre bazında esas sonuç | Kısmi analiz için birim | Analiz 1 → n sonuç | Laboratuvar | CONFIRMED |
| **Ortak numune** | Tedarikçi bazlı **günlük**; kül/uçucu için | Katılan araçlar ≠ uygulanan araçlar; tek analiz çok araca uygulanır (sayı çoğalmaz) | İki ilişki türü (katılım, uygulama) | Laboratuvar yetkilisi (geçerli sonuç + araçlar) | CONFIRMED (kural) |
| **Üretim emri (Kırım)** | Reçeteyi hazırlayanın açtığı iç emir; vardiyalar arası açık; yeniden açılmaz | MOSEDAŞ emrinden ayrı | Reçete sürümleri, kova ölçümleri, paçal analizleri | Reçete yetkilisi/Kırım sorumlusu/vardiya sorumlusu | CONFLICT (C-01) |
| **Reçete** | Ürün bileşim tanımı; farklı zamanlarda yeniden kullanılır | Emirden bağımsız yaşar | Emir → reçete sürümü | Reçete yetkilisi | CONFIRMED |
| **Reçete sürümü** | Revizyon; **fiilen uygulanmaya başlama zamanı** vardiya sorumlusundan; hedefler, ürün miktarları, analizler sürüm bazında | Zaman aralığı ve hedef seti | Emir 1 → n sürüm; kova ölçümü fiilî zamana göre sürüme bağlanır | Reçete yetkilisi + Kırım sorumlusu | CONFIRMED |
| **Paçal analizi** | Paçal numunesi analizi; laboratuvar kabul zamanı; emir/sürüm önerisi + doğrulama | Gelen ürün analizinden ayrı; sürümün detayında görünür | Sürüm → analizler → toplu kalite özeti | Laboratuvar | CONFIRMED |
| **Kova ölçümü** | Her kepçe yüklemesi ayrı ölçüm; fiilî zaman, ürün, emir, sürüm; ölçülmüş/tahmini/kontrol-bekleyen | Cihaz kaynaklı; kova/kepçe sayısı ağırlık değil | Emir/sürüm toplamlarına girer; **nihai paçal miktarı değil** | Operatör; vardiya/Kırım sorumlusu (tahmin) | EXTERNAL_VALIDATION_REQUIRED (cihaz) |
| **Vardiya** | Zaman ve sorumluluk boyutu; vardiya sorumlusu üretimi başlatır/tamamlar; rapor fiilî yükleme zamanına göre | Ayrı zorunlu operasyon kaydı yok | Emir toplamı ↔ vardiya dilimi (raporda) | Vardiya sorumlusu | CONFLICT (C-07) |

---

## F. Entegrasyon sınırları

Sütunlar BRIF2 + eski kararlar (DEC14, SRS §9.1, IR-003/004, DISC §10, DEC-0013/0015). Boş hücreler kaynak yokluğu demektir (**TBD**), uydurulmadı.

| Sistem | Veri sahibi | Veri okuyucu | Veri yazarı | Kimlik modeli | Tenant kapsamı | Audit sorumluluğu | Retry/idempotency ihtiyacı | Secret sınırı |
|---|---|---|---|---|---|---|---|---|
| **Metnex** | Operasyon yürütme, gerçekleşme, kapasite, lab/Kırım/kantar-Metnex tarafı kayıtları (DEC14 k.4; BRIF2) | Kendi kullanıcıları (JWT+MFA+tenant+permission) | Yetkili kullanıcılar; entegrasyonlar ayrı kimlikle | Kullanıcı JWT'si B2B kimliği değildir (DEC14 k.7) | MİP root → MOSB Enerji + MOSBIO (DEC14 k.2); lab ortak ekip **C-05** | `platform_audit_logs` + domain geçmişi (**BRIF2 eski/yeni değer geçmişi** için domain tablosu gerekir) | Outbox/idempotent gönderim (DEC14 k.6) | Uygulama secret'ları env; raporlara yazılmaz |
| **Dış MOSEDAŞ uygulaması** | Üretim planı ve **enerji üretim emri** (DEC14 k.1); **Kırım emri değil** (BRIF2 s.82) | Metnex emir okur (allowlist) | MOSEDAŞ emri yazar; Metnex durum/gerçekleşme/olay geri bildirir | mTLS + OAuth2 client credentials (DEC14 k.7); her sistem kendi credential'ını yönetir | Hedef tenant + tesis + makine allowlist (DEC14 k.8; BRIF1 s.48) | İki taraf: Metnex kalıcı olay kaydı; MOSEDAŞ tarafı dış | Versiyonlu, idempotent emir; teknik alındı/işleme sonucu ayrımı (SRS §9.1.2) | Credential/sertifika taraf sorumluluğu (SRS §9.1.3) |
| **BEAM** | Varlık ana verisi, sahiplik, bakım (DEC14 k.3; SRS BR-013) | Metnex referans/snapshot | BEAM sahibi | Sahibin yapısı altında varlık (BRIF1 s.37) | Sahip şirket ≠ tenant | Metnex yalnız referans değişimini audit eder | Nominal veri gecikmesi/revizyon TBD | TBD (sözleşme yok) |
| **ERP / Netsis** | ERP süreçleri, ERP kaydı, maliyet (DISC s.389-392); **kantar kaydının eşleştiği ERP kaydı** (BRIF2 s.26) | Metnex eşleşme için okur (TBD) | Netsis; Metnex'in yazıp yazmadığı **TBD** (C-03) | TBD | TBD | Eşleşme/manuel giriş için Metnex audit + Netsis kendi | Çift kayıt önleme (BRIF2 s.27); anahtarlar TBD | TBD |
| **SCADA/DMS** | Kaynak sistemler (DISC s.391) | Metnex read-only adapter (DEC-0015) | Yok (INSERT/UPDATE/DELETE yasak, DISC s.55-56) | Servis hesabı env; catalog/allowlist | Katalog + tenant mapping; MOSEDAŞ eşlenmez (`tenant-guards.ts`) | `SCADA_QUERY_*` audit (TASK-027.64-R2) | Sorgu bazlı; export audit | Bağlantı dizesi yalnız env; raporlara yazılmaz |
| **Kepçe ölçüm cihazı (tedarikçi)** | Cihaz/tedarikçi (BRIF2 s.135-138) | Metnex (yöntem TBD-K01) | Cihaz | Tekil ölçüm kimliği TBD-K02 | TBD | Geri aktarım/arıza eşlemesi TBD-K03 | Kesinti sonrası geri aktarım (TBD-K03) | TBD |

---

## G. Güvenlik ve SDLC riskleri

| Risk | Senaryo (BRIF2/yeni kapsamdan) | Mevcut kontrol (kanıtlı) | Boşluk | Önerilen negatif test başlığı [AI2 ÖNERİSİ] |
|---|---|---|---|---|
| Cross-tenant erişim | Lab kullanıcısı iki işletmede; Kırım/kömür verisi | `TenantMembershipGuard`, `TenantScopeService`, `BR-001A` | Lab/kömür/Kırım tabloları, izinleri yok; ortak toplam raporu | Tenant A lab kaydı Tenant B'de görünmez; toplam rapor yalnız yetkili kapsam |
| Ortak lab kullanıcısı yanlış kapsam | "İşletme seç" akışı (BRIF2 s.17) | Aktif tenant header + membership | İşletme seçimi tenant seçimi mi? Çift üyelik izin modeli | Seçili işletme dışı kayıt oluşturma/okuma reddi |
| B2B entegrasyon yetkisi | MOSEDAŞ inbound emir | DEC14 k.7/8 (mTLS+OAuth2+allowlist) — **yalnız belge** | external-system registry kodu yok | Kullanıcı JWT'si/`isSystemAdmin` B2B uçta reddedilir; allowlist dışı tesis/makine reddi |
| Replay ve çift emir | MOSEDAŞ emri; Kırım emri; kantar çift kayıt | DEC14 k.5 (versiyonlu, idempotent) | Idempotency anahtarı sözleşmesi yok; Netsis anahtarları TBD | Aynı emir/versiyon iki kez → tek etki; aynı kantar kaydı iki eşleşme → reddi |
| Secret yaşam döngüsü | Netsis/MOSEDAŞ/cihaz credential'ları | AI key rotation runbook, `scrubSecrets`, connection security specs | Yeni entegrasyon secret'larının sahibi ve döndürme kuralı yok | Audit/log/yanıtta credential yok; rotation sonrası eski credential reddi |
| Audit redaction | Lab sonuçları, kişisel adlar, cihaz alanları | `scrub-secrets.ts` anahtar-adı bazlı redaksiyon | Domain alan-düzeyi eski/yeni değer geçmişi ve okuma yetkisi tanımsız | Audit metadata'sında ham ölçüm/kişisel veri yok; geçmiş yalnız yetkili okur |
| Tarihsel düzeltme | Sonuç/miktar/eşleştirme düzeltmeleri (BRIF2 s.44, 74, 89, 110) | `platform_audit_logs` (yalnız olay) | Değişmez geçmiş tablosu, düzeltme yetki matrisi | Düzeltme eski değeri silmez; yetkisiz düzeltme reddi; tamamlanmış emirde yetki farkı |
| Ölçülen/tahmini/geçici karışması | Kova ölçümü, kontrol-bekleyen (s.106-109) | Wave 5 kalite bayrakları (analog) | Ayrı alan/durum yok | Birleşik toplam tahmin içeriyorsa işaretli; aynı yükleme iki kez sayılmaz; yüklenen ≠ paçal |
| Kişisel veri | Çalışan adı (teslim eden, numune alan, vardiya sorumlusu) | Kullanıcı kimliği; PII politikası dağınık | Serbest metin isimler (SRS FR-097 ikinci operatör serbest metin) | PII audit/rapor çıktısında yetkisiz görünmez |
| Arşiv/migration riski | Tarihsel kömür/lab Excel'leri; vardiya arşivi | Vardiya arşiv migration paketleri (belge) | Excel kaynak formatı repo'da yok; retention Q-V02 | Migration idempotent, geri alınabilir; ham Excel commit edilmez |
| Bildirim suistimali | Yeniden bildirim, alıcı listesi (BRIF2 s.72-73) | Vardiya e-postası kararı Q-V05 açık | E-posta hata politikası, alıcı yönetimi | Alıcı listesi tenant sınırında; bildirim önceki bildirimi silmez |
| Formül doğruluğu | Kalori/kül formülleri (BRIF2 s.120-122) | Wave 5 sanal kolon allowlist DSL (analog) | Excel doğrulanmadı | Sıfır bölen/eksik girdi "geçerli sonuç" değil; formül sürümü ve girdi geçmişi |
| Yeni permission/rol çoğalması | Vardiya sorumlusu, reçete yetkilisi, Kırım sorumlusu, lab yetkilisi | `permission-catalogue.ts` | Hiçbiri kayıtlı değil (Q-V07/V08 açık) | Yeni izin katalog testi; least privilege matrisi |
| Wave 5 regresyonu | Lab/kömür SCADA sayacını okursa | Read-only zorlaması (DEC-0015) | — | SCADA katalog/adapter'ı lab yazma domain'inden ayrı; DEC-0014 MOSEDAŞ guard'ı korunur |

---

## H. Belge değişikliği planı (yalnız liste — hiçbiri değiştirilmedi)

| Belge | Önerilen güncelleme [AI2 ÖNERİSİ] | Ön koşul |
|---|---|---|
| `docs/requirements/DISCOVERY.md` | Addendum: §22'ye "Ortak laboratuvar / kömür kabul / gelen biyokütle / Kırım Tesisi" bölümleri; §2.3/§4/§10/D-005'e DEC-0014 supersede notu (MOSEDAŞ/MOSB tenant ifadeleri); Q-022/Q-023/Q-024'ün BRIF2 ile kısmi cevaplanması; yeni Q listesi (§J karar ID'leri) | PO kararları D-01…D-06 |
| `docs/requirements/SRS.md` | FEAT-019/020/021'in yeniden yazımı (paçal, gelen ürün, kömür, lab kısmi/append); FEAT-024 yaşam döngüsü; FR-067–071 için "enerji üretim emri" ifadesi; yeni FEAT (Kırım emri, kova ölçümü) — **TBD'ler `TBD` olarak kalarak**; `TBD-OPS-005/006/007` güncellemesi | C-01, C-02 kararı |
| `docs/domain/DOMAIN_MODEL.md` | Bayat Prisma ifadesi ve modül listesi (R-04) düzeltilmeli; operasyon/lab/Kırım/kömür domain'leri "planned" olarak; `MOSEDAŞ`/`MOSB` tenant dili DEC14 ile hizalı | Domain sınırları onayı (§E) |
| `docs/domain/DB_META.md` | Yeni tablolar **yalnız implementation task'ı onaylandıktan sonra**; data-plane vs `public` yerleşim kararı (DEC-0010 Faz 5, DBM s.233-236 ile birlikte) | Yerleşim kararı |
| `docs/decisions/` | Önerilen yeni kayıtlar (numaralar PO'da): (a) DEC14 kapsam açıklaması — iki emir türü; (b) Laboratuvar yaşam döngüsü ve yetki modeli (DEC14 k.9 ile ilişkisi); (c) Netsis/kantar sahipliği; (d) MOSEDAŞ/MOSB tenant dilinin ve `tenant-mapping.ts` slug kümesinin hizalanması. **Mevcut DEC dosyaları silinmez/yeniden yazılmaz** (supersede izi) | PO onayı |
| `backlog/EPIC-005-…md` | Kapsama lab alt alanları (kömür/gelen ürün/paçal/su), Kırım Tesisi ve kantar ekleme **veya** yeni epic (EPIC-006/007) önerisi; "Kapsam dışı"ya BRIF2'nin dış-ekip bağımlılıkları | PO faz kararı (§I) |
| `backlog/TASK-029-00-…md` | 029.04 emir tanımının iki tür olarak ayrılması; 029.07 lab yaşam döngüsünün C-02 sonrası yeniden yazımı; bağımlılık sırası (§I.6) | C-01, C-02 |
| Vardiya task planı (`TASK-027-21…30`, 029.05/029.06) | Q-V01/Q-T01 ile Kömür Kazanı/KIRIM DEPO; vardiya sorumlusu rolü; vardiya = zaman boyutu C-07; Wave 4 blocker'larının BRIF2 ile ilişkisi | C-07, C-08 |
| Laboratuvar task planı (029.07/029.08 + yeni) | Alt görevler: numune/analiz/parametre sonucu, referans/kriter sürümü, esas sonuç seçimi, bildirim, raporlar, yetki matrisi — **kaynak Excel doğrulamasına bağlı** | C-02, C-05, TBD-L01…L04 |
| İşletme task planı (029.09/029.10) | BRIF2 İşletme modülü hakkında bilgi vermez → **değişiklik gerekmez**; yalnız "Lab ayrı domain" sınırının korunduğu not edilir | — |
| `docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md`, `BOTC_VARDIYA_*` | Supersede notu (MOSEDAŞ tenant satırı) | C-04 |
| `docs/security/threat-models/`, `risk-register.md` | Şu an şablon/TODO; §G riskleri mini threat-model başlıkları olarak kaydedilebilir | PO onayı |

---

## I. Faz önerisi (tümü **[AI2 ÖNERİSİ]** — PO onayı bekler)

### I.1 MVP adayı (önce karar, sonra kod)
- Karar paketi: C-01, C-02, C-04, C-05, tenant/işletme/yetki modeli (029.01 ön koşulu).
- **Laboratuvar çekirdeği** (kısmi kayıt + append + esas sonuç + referans/kriter sürümü + audit geçmişi) — **yalnız C-02 sonrası**. En düşük dış bağımlılıklı dilim: **su laboratuvarı** (BRIF2 §4; kantar/Netsis/cihaz yok). Parametre listesi ve limitler kaynaktan gelecek (Q-023).
- **Gelen biyokütle ürün analizi** (BRIF2 §5; araç seçimi için mevcut tartım kaydı erişimi gerekir → C-03'e bağlı; tartım kaydı kaynağı çözülmeden yalnız "araç referansı" sözleşmesi).

### I.2 Sonraki faz
- Kömür kabul/yığın/kazan külü (Netsis eşleşmesi ve sayaç kaynağı kararlarından sonra).
- Kırım Tesisi reçete/emir/paçal/kova ölçümü (C-01, TBD-L03; cihazsız ilk faz için tahmini-giriş akışı BRIF2 s.106'da tarif edilmiştir ama kararı yine PO'ndur).
- Toplu kalite raporu ve ağırlıklı ortalama (ağırlık verisi gelince).
- Lab/kömür raporları (Excel/PDF): Reporting Foundation + yeni allowlist şablonları (TASK-027.74 deseni; Java/şablon onayı Q-W542 emsali).
- Vardiya Operasyon Merkezi ekranları (FEAT-023).

### I.3 Ayrı MOSEDAŞ uygulaması
- Enerji üretim planlama, tedarikçi/tesis/makine emir üretimi, pazar/fiyat/optimizasyon **Metnex'e kopyalanmaz** (DEC14 Consequences; BRIF1 s.51). Bu repo'da modül açılmaz; kendi Discovery/SRS'si ayrı.

### I.4 Dış ekip doğrulaması bekleyen
Netsis veri sözleşmesi ve anahtarları (B-03); kepçe cihazı TBD-K01…K04; `KALORI HESAP.xlsx` ve tüm kalori/kül formülleri (TBD-L01/L02); MOSBİO Online Drum/Steam gerçek kaynağı (B-11); mevcut kalite kriter değerleri (TBD-L04); Kırım Tesisi ↔ KIRIM DEPO eşdeğerliği (C-08).

### I.5 Teknik altyapı bekleyen
Bildirim altyapısı (uygulama içi + e-posta, Q-V05 ve 029.11 outbox); domain tabloları için data-plane/`public` yerleşimi (DEC-0010 Faz 5, DBM s.221-287); yeni izin kataloğu (Q-V07/V08); external-system registry (029.01/029.02); değişmez geçmiş/olay tablosu deseni; Reporting şablon allowlist genişlemesi.

### I.6 Önerilen bağımlılık sırası (AI2 task'ı oluşturulmadı)
`Karar D-01…D-06` → `029.01 (domain/tenant/yetki/reference)` → `Lab çekirdeği (su)` → `Gelen biyokütle` → `Kömür/Netsis` → `Kırım Tesisi` → `Raporlar/bildirim` → `Vardiya Operasyon Merkezi ekranları`. 029.02/029.03/029.04/029.11 (MOSEDAŞ B2B, kapasite, dış emir, outbox) **BRIF2'den bağımsız** ilerleyebilir ama 029.04 önce C-01 netleşmelidir.

---

## J. Karar masası

| Karar ID | Soru | Neden önemli | Seçenekler | Önerilen görüşme sırası | Karar sahibi | Durum |
|---|---|---|---|---:|---|---|
| D-01 | "Üretim emri" iki tür mü (MOSEDAŞ enerji emri / Kırım iç emri)? DEC-0014 kapsam açıklaması mı, supersede mi? | Tüm epic sınırı, SoR, B2B kapsamı | (A) İki ayrı kavram/context, DEC14 açıklama notu · (B) Tek emir modeli, Kırım MOSEDAŞ'a raporlanır · (C) Kırım emri Metnex-dışı | 1 | PO | CONFLICT |
| D-02 | Laboratuvar analiz yaşam döngüsü: onay/kilit gerekli mi; "tamamlandı" ne demek? | Durum makinesi, bildirim tetikleyicisi, audit biçimi | (A) BRIF2 modeli, onay/kilit yok · (B) DEC14 modeli + BRIF2 esas-sonuç · (C) Karma (yalnız referans/kriter onaylı) | 2 | PO + lab sorumlusu | CONFLICT |
| D-03 | Ortak lab ekibi tenant modelinde nasıl temsil edilir? | Cross-tenant risk, izin sayısı | (A) Çoklu tenant üyeliği + işletme bazlı izin · (B) Ortak rol/scope · (C) Ortak lab tenant'ı | 3 | PO/AI1 | CONFLICT |
| D-04 | MOSEDAŞ/MOSB tenant dili ve `tenant-mapping.ts` slug kümesi DEC14 ile nasıl hizalanır? "MOSB" ↔ "MOSB ENERJİ" slug? | Kimlik migration doğruluğu | (A) Yeni ayrı task + supersede notları · (B) Yalnız belge notu | 4 | PO/AI1 | CONFLICT |
| D-05 | Kantar kaydı SoR ve yön: Netsis mi Metnex mi; Metnex yazıyor mu? | Çift kayıt, BR-016 | (A) Netsis SoR, Metnex okur/eşler · (B) Metnex kantar SoR, Netsis'e yazar · (C) İkisi de kendi kaydı + eşleme tablosu | 5 | PO + Netsis sahibi | EXTERNAL_VALIDATION_REQUIRED |
| D-06 | Paçal için hedef dışı/sonradan-sonuç bildirimi kapsamı (TBD-G01) | Bildirim gürültüsü/uyumluluk | (A) Rutin yok; yalnız sonradan sonuç · (B) Hem hedef dışı hem sonradan · (C) Hiç bildirim | 6 | PO | TBD |
| D-07 | Toplu kalite yöntemi kim/ne kapsamda seçer; ağırlık tanımı | Kalite raporu doğruluğu | (A) Reçete sürümü bazında seçim · (B) Emir bazında · (C) Sistem sabit aritmetik (ağırlık gelene dek) | 7 | PO + lab + Kırım | TBD (TBD-L03) |
| D-08 | Vardiya: entity mi, zaman boyutu mu? Vardiya sınırlarını kim tanımlar? | FEAT-022/023 modeli | (A) Sadece zaman/sorumluluk boyutu · (B) Entity + operasyon merkezi · (C) İkisi | 8 | PO | CONFLICT |
| D-09 | Kömür Kazanı ve Kırım Tesisi/KIRIM DEPO'nun tenant/tesis konumu (Q-T01/Q-V01) | Yetki ve raporlama kapsamı | (A) Tesis/ünite (MOSB Enerji / MOSBIO altında) · (B) Ayrı tenant · (C) Veri alanı | 9 | PO | TBD |
| D-10 | Kazan besleme sayacı kaynağı: operatör girişi mi, SCADA (`komur_endeksler`) mı? | Wave 5 yeniden kullanım, çift kaynak | (A) Operatör · (B) SCADA · (C) İkisi + fark raporu | 10 | PO + işletme | TBD |
| D-11 | Kova ölçüm cihazı entegrasyon yöntemi ve fiilî zaman (TBD-K01…K04) | Kova↔sürüm eşlemesi doğruluğu | Tedarikçi bilgisi bekleniyor | 11 | Tedarikçi + Kırım | EXTERNAL_VALIDATION_REQUIRED |
| D-12 | Kalori/kül formülleri, G6→G7, birimler (TBD-L01/L02) | Yanlış hesap riski | Excel + lab testi | 12 | Lab sorumlusu | EXTERNAL_VALIDATION_REQUIRED |
| D-13 | Başlangıç kalite/limit değerleri (TBD-L04, Q-023) | Kriter/limit tanımı | Lab kaynak verisi | 13 | Lab sorumlusu | TBD |
| D-14 | Domain tabloları data-plane mi `public` mı? | DEC-0010 Faz 5 ile bağ | (A) Data-plane · (B) `public` + tenantId | 14 | AI1/PO | TBD |
| D-15 | Bildirim altyapısı ve alıcı yönetimi (uygulama içi + e-posta, hata politikası Q-V05) | Lab/gelen ürün bildirimi | Vardiya e-posta kararıyla birleşik/ayrı | 15 | PO | TBD |
| D-16 | Yeni roller/izinler (lab yetkilisi, reçete yetkilisi, Kırım sorumlusu, vardiya sorumlusu) | Least privilege; katalog çoğalması | Mevcut rol şablonları genişlet / yeni | 16 | PO/AI1 | PROPOSED_ONLY |
| D-17 | Ağırlıklı ortalama için "numunenin temsil ettiği miktar" veri kaynağı (TBD-L03) | Sahte ağırlık riski | Kova toplamı/araç miktarı/manuel | 17 | Lab + Kırım | TBD |
| D-18 | Nihai paçal miktarı ileride ölçülecek mi (TBD-G02) | Yüklenen≠üretilen | İleri karar | 18 | Kırım Tesisi | OUT_OF_SCOPE (şimdilik) |
| D-19 | MOSBİO Online Drum/Steam gerçek veri kaynağı | Entegrasyon planı | Manuel devam / kaynak keşfi | 19 | Teknik servis | EXTERNAL_VALIDATION_REQUIRED |
| D-20 | Lab/kömür raporları için Excel orijinal kolonlarının doğrulanması ve şablon onayı | Rapor uyumu | Kaynak Excel + Jasper allowlist | 20 | Lab + AI1 | EXTERNAL_VALIDATION_REQUIRED |
| D-21 | Kullanıcı ve çalışan bilgisi (PII) saklama ve rapor görünürlüğü | KVKK/audit | Politika kararı | 21 | PO/güvenlik | TBD |
| D-22 | Tarihsel Excel/kağıt verisi migration kapsamı | Arşiv riski | Yok/seçili/tam | 22 | PO | TBD |

**Önerilen açılış:** önce D-01 → D-02 → D-03 → D-04 (mevcut belgelerde çelişki üreten ve implementation'ı bloklayan dört karar); D-05'i Netsis sahibinin katılımıyla ayrı görüşme olarak planlamak **[AI2 ÖNERİSİ]**.

---

## K. Ek: BRIF2 sınıflandırma özeti

| BRIF2 alanı | Durum |
|---|---|
| §2 yetki sınırları (s.15-21) | CONFIRMED (iş kuralı) · CONFLICT (C-05, tenant modeli) |
| §3.1 kantar/Netsis (s.25-29) | CONFLICT (C-03) · EXTERNAL_VALIDATION_REQUIRED |
| §3.2 ortak numune (s.31-36) | CONFIRMED (kural) · PROPOSED_ONLY (model) |
| §3.3 kazan/yığın/kül (s.38-45) | CONFIRMED · TBD (sayaç kaynağı, öneri algoritması) |
| §4 su lab (s.49-57) | CONFIRMED (kural) · CONFLICT (C-02) · TBD (parametreler) |
| §5 gelen biyokütle (s.61-77) | CONFIRMED |
| §6.1 emir yaşam döngüsü (s.81-89) | CONFLICT (C-01) |
| §6.2 paçal (s.91-99) | CONFIRMED · TBD (C-06, C-09) |
| §6.3 kova ölçümü (s.101-110) | CONFIRMED (kural) · EXTERNAL_VALIDATION_REQUIRED (cihaz) |
| §6.4 Kırım raporu (s.112-116) | CONFIRMED |
| §7 kalori/kül/rapor (s.118-125) | EXTERNAL_VALIDATION_REQUIRED (formüller) · CONFIRMED (gösterim) |
| §8 TBD-L01…G02 (s.129-142) | TBD / EXTERNAL_VALIDATION_REQUIRED (tablo ile aynen) |
| §9 diğer Metnex kapsamı (s.144-153) | OUT_OF_SCOPE (bu brif) — mevcut belgelerdeki TBD'ler açık bırakıldı |
| §10 kontrol listesi (s.155-165) | Bu raporun §E/§G/§J ile karşılandı |

---

## L. Bu görevin sınırı ve doğrulama

- **Değiştirilen dosya:** yalnız bu rapor (`docs/discovery/METNEX_AI1_DISCOVERY_BRIF2_EVALUATION.md`, yeni dizin `docs/discovery/`) ve teslim kayıtları (`backlog/TASK-029-00-R1-…md`, `docs/opendevcon/METNEX_STATE.md`, `PROGRESS_LOG.md` append). Canonical Discovery/SRS/domain/DB/karar/EPIC-005 belgeleri ve tüm kod **değişmedi**.
- **Kod değişmediği için** davranış değişikliği beklenmez; teslimde mevcut testlerin durumu ayrıca raporlanır.
- **Git commit/push yapılmadı.**
