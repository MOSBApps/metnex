---
id: EPIC-005
title: Metnex Operasyon Merkezi, MOSEDAŞ Entegrasyonu, Laboratuvar ve İşletme
status: planned
srs_refs: [FEAT-023, FEAT-024, FEAT-025, FEAT-026, FEAT-027, FEAT-028, FEAT-029]
updated_at: 2026-09-28
---

# EPIC-005: Metnex Operasyon Merkezi, MOSEDAŞ Entegrasyonu, Laboratuvar ve İşletme

> **DEC-0017 notu (2026-09-28, TASK-029.00-R2):** Bu epic'in "üretim emri" ifadesi
> `docs/decisions/DEC-0017-…md` D-01 ile **iki ayrı bounded context**'e ayrılmıştır:
> (a) bu dosyanın orijinal kapsamı olan **enerji üretim emri** (MOSEDAŞ SoR,
> DEC-0014 değişmedi) ve (b) **Kırım Tesisi (paçal) üretim emri** (Metnex SoR,
> MOSEDAŞ'tan gelmez). Aşağıdaki "Kapsam" ve "Task planı" bu ayrımı yansıtacak
> şekilde **genişletilmiştir** (eski satırlar silinmemiştir). Ayrıca Ortak
> Laboratuvar artık kömür kabul/kantar/yığın, MOSBİO gelen biyokütle ürünü, su
> laboratuvarı ve Kırım Tesisi paçal analizini kapsar (SRS §9.2, FEAT-026–029).

## Amaç

DEC-0014 ile kararlaştırılan ürün sınırını implementation'a dönüştürmek:
MOSEDAŞ'ın üretim planı/emir SoR'u olduğu, Metnex'in operasyon yürütme ve
gerçekleşme SoR'u olduğu sınırda güvenli entegrasyon, Vardiya Operasyon Merkezi,
Laboratuvar ve İşletme modüllerini geliştirmek. DEC-0017 ile bu amaç, **Kırım
Tesisi'nin kendi (Metnex SoR'lu) üretim emri/reçete/paçal akışını** ve
**laboratuvarın kömür/kantar/gelen ürün/su alt alanlarını** da kapsayacak şekilde
genişlemiştir.

## Kapsam

- MOSEDAŞ external-system B2B sözleşmesi ve allowlist (yalnız enerji üretim emri).
- Tesis/makine referansları ve Metnex operasyonel kapasite snapshot'ları.
- Vardiya Operasyon Merkezi (DEC-0017 D-08: bağımsız varlık değil, zaman/sorumluluk
  boyutu; D-09: Kömür Kazanı ve Kırım Tesisi kendi tenant'ları altında operasyon
  merkezi).
- Enerji üretim emri kabul, yürütme, olay ve gerçekleşme geri bildirimi (MOSEDAŞ SoR).
- **Kırım Tesisi üretim emri, reçete/reçete sürümü, kova ölçümü ve paçal analizi
  (Metnex SoR; DEC-0017 D-01, D-07, D-09, D-17, D-18) — yeni.**
- **MOSB ENERJİ kömür kabul, kantar (geçici Netsis SoR — D-05), yığın, kazan külü
  — yeni.**
- **MOSBİO gelen biyokütle ürünü analizi — yeni.**
- **Su laboratuvarı (MOSB Enerji / MOSBİO), Online Drum/Steam manuel giriş — yeni.**
- Parametrik Laboratuvar modülü (karma yaşam döngüsü: DEC-0017 D-02; ortak ekip
  çoklu tenant üyeliği: D-03, D-03a).
- Ayrı parametrik İşletme modülü.

## Kapsam dışı

- Wave 2 Bakım/Arıza.
- Wave 3 DÖF.
- BEAM/ERP ana veri sahipliğinin Metnex'e taşınması.
- MOSEDAŞ'ın pazar, fiyat, optimizasyon ve tedarikçi planlama fonksiyonları.
- Genel amaçlı BPMN/script/user-defined SQL/low-code platformu.
- Nihai paçal üretim miktarının ayrıca ölçülmesi (DEC-0017 D-18, ileride
  değerlendirilecek).
- Netsis/kepçe cihazı gerçek entegrasyon sözleşmesi (dış doğrulama bekliyor —
  DEC-0017 D-05, D-11).
- MOSB/MOSB ENERJİ/MOSBİO tenant dilinin kod ile hizalanması (DEC-0017 D-04 —
  **ayrı, henüz `ready` olmayan bir uyum task'ıdır**, bu epic'in parçası değildir).

## Task planı

| Sıra | Task | Amaç | Durum |
|---:|---|---|---|
| 1 | TASK-029.01 | Domain, tenant, operasyon merkezi ve external reference sözleşmesi (DEC-0017: D-03/D-03a çoklu tenant üyeliği, D-08/D-09 operasyon merkezi kavramı, D-16 rol modeli genişletmesi dahil) | done |
| 2 | TASK-029.02 | MOSEDAŞ B2B güvenlik ve mesaj sözleşmesi (yalnız enerji üretim emri; Kırım emri bu sözleşmeye girmez — D-01) | done |
| 3 | TASK-029.03 | Kapasite, bakım/duruş etkisi ve snapshot modeli | planned |
| 4 | TASK-029.04 | Enerji üretim emri lifecycle, versiyon ve idempotency (D-01: yalnız MOSEDAŞ SoR'lu emir; Kırım Tesisi emri bu task'a girmez, bkz. 029.07) | planned |
| 5 | TASK-029.05 | Vardiya Operasyon Merkezi API/domain (D-08: vardiya = zaman/sorumluluk boyutu, ayrı zorunlu entity değil) | planned |
| 6 | TASK-029.06 | Vardiya Operasyon Merkezi ilk ekranları | planned |
| 7 | TASK-029.07 | Laboratuvar parametre ve analiz domain'i — **genişletildi:** karma yaşam döngüsü (D-02), Kırım Tesisi reçete/emir/kova/paçal (D-01, D-07, D-17, D-18; kepçe cihazı D-11 açık), MOSB ENERJİ kömür/kantar/yığın (D-05 açık, D-10 sayaç), MOSBİO gelen ürün, su laboratuvarı (Q-023 açık), Online Drum/Steam manuel (D-19); SRS §9.2 FEAT-026–029 taslakları bu task'ta kesinleşir | planned |
| 8 | TASK-029.08 | Laboratuvar ilk ekran grubu (kömür/gelen ürün/su/paçal raporları dahil; rapor kolonları/Jasper şablonu D-20 açık) | planned |
| 9 | TASK-029.09 | İşletme parametrik form domain'i | planned |
| 10 | TASK-029.10 | İşletme ilk ekran grubu | planned |
| 11 | TASK-029.11 | Entegrasyon olay/retry/DLQ ve acceptance — **genişletildi:** ortak notification service (D-15) su/gelen-ürün/paçal bildirimleri için de kullanılır | planned |
| 12 | TASK-029.12 | Epic güvenlik, tenant isolation ve uçtan uca kabul — **genişletildi:** ortak lab çoklu tenant izolasyonu (D-03), audit asgari kullanıcı kimliği (D-21), tenant data-plane yerleşimi ön koşulu (D-14) | planned |

## Başlatma kuralı

Task'lar `planned` durumundadır. SRS/Discovery güncellemesi ve ilgili task'ın
ön koşulları Product Owner/AI1 tarafından ayrıca gözden geçirilmeden AI2
implementation task'ı `ready` durumuna alınmayacaktır. **TASK-029.00-R2 (DEC-0017)
bu kararı değiştirmez: hiçbir 029.xx task'ı bu dokümantasyon turuyla `ready`
yapılmamıştır; ilk `ready` implementation task'ı ayrıca TASK-029.01 olarak
verilecektir.**

## Yeni blocker'lar (DEC-0017 ile eklenen, kapatılmamış)

| Blocker | İlgili task | Kaynak |
|---|---|---|
| Netsis entegrasyon anahtarları/veri sözleşmesi | 029.01, 029.07 | DEC-0017 D-05, Q-024 |
| Kepçe ölçüm cihazı entegrasyonu | 029.07 | DEC-0017 D-11, TBD-K01–K04 |
| `KALORI HESAP.xlsx` tam formül doğrulaması | 029.07, 029.08 | DEC-0017 D-12, TBD-L02 |
| Ürün/parametre bazlı başlangıç kalite limitleri | 029.07 | DEC-0017 D-13, TBD-L04, Q-023 |
| Rapor kolonları / Jasper şablon içeriği | 029.08 | DEC-0017 D-20, TBD-L01 |
| Data-plane altyapısı (fan-out runner, registry↔şema kontrolü) eksik | 029.01, 029.07, 029.09 | DEC-0017 D-14, DEC-0010 Faz 5 |
| MOSB/MOSB ENERJİ/MOSBİO tenant dili uyumu | 029.01 (ön koşul, ayrı task) | DEC-0017 D-04 |
| Kırım Tesisi ↔ `MOSBİO KIRIM DEPO` eşdeğerliği | 029.05, 029.07 | DEC-0017 D-09 notu |

## TASK-029.01 teslimi (2026-09-28, `done` — AI1 onayı) — bağımlılık güncellemesi

`apps/api/src/operations/domain/` altında saf TypeScript domain/reference sözleşmesi teslim
edildi (API/UI/DB/migration yok, hiçbir NestJS modülüne bağlanmadı): `OperationCenter` +
`OperationCenterOwnerRole` (Kömür Kazanı yalnız `MOSB_ENERJI`, Kırım Tesisi yalnız `MOSBIO`
rolüne atanmış tenant altında çözülür — D-09), `FacilityReference`/`MachineReference`,
`ExternalSystemReference` (`BEAM|NETSIS|MOSEDAS|SCADA_DMS`, MOSEDAŞ yalnız sistem adı, asla
tenant), `AssetOwnershipReference`/`OperatorReference` + geçerlilik dönemi bazlı çözümleme,
`TenantOperationScope`/`UserOperationCenterScope` (tenant+operationCenter birlikte kapsam
anahtarı, `operationCenterId` tek başına asla yetki vermez, `VIEW`/`DATA_ENTRY`/`APPROVAL`/
`CORRECTION`/`MANAGEMENT` ayrı kapsamlar). Bağımlılık zinciri (`029.01 → 029.02/029.03 → 029.04
→ 029.05 → 029.06`, `029.01 → 029.07 → 029.08`, `029.01 → 029.09 → 029.10`) **değişmedi**; bu
teslim yalnız 029.01'in kendi çıktısını somutlaştırdı. D-04 (MOSB/MOSB ENERJİ/MOSBİO tenant
dili) bu task'ta **otomatik düzeltilmedi**, yalnız blocker olarak raporlandı (yukarıdaki tablo).
Ayrıntı ve 029.02–029.12 etki notları: `backlog/TASK-029-00-…md` ve
`backlog/TASK-029-01-domain-tenant-operation-center-reference-contract.md`.

## TASK-029.02 teslimi (2026-09-28, `done` — AI1 onayı) — bağımlılık güncellemesi

MOSEDAŞ B2B güvenlik/mesaj karar paketi (`docs/migration/METNEX_MOSEDAS_B2B_SECURITY_DECISION_PACKAGE.md`)
+ saf TypeScript sözleşmesi `apps/api/src/operations/domain/mosedas/` altında teslim edildi
(API/worker/migration yok). DEC-0014 karar 7/8 (birleşik mTLS+OAuth2, tenant/tesis/makine
allowlist) **yeniden tartışılmadı, doğrudan uygulandı**. Altı mesaj türü
(`PRODUCTION_PLAN/_ORDER/_ORDER_REVISION/CANCELLATION/STATUS_CHANGE/REALIZED_PRODUCTION_FEEDBACK`)
— Kırım Tesisi emri **bu sözleşmede yoktur** (D-01). Idempotency/revizyon, 8 retry kategorisi
(yalnız `TRANSIENT_INFRASTRUCTURE_ERROR` retryable), audit/redaction sözleşmesi (yasak anahtar
kapısı) tanımlandı; **hiçbir sayısal retry/backoff/DLQ eşiği icat edilmedi**. Bağımlılık zinciri
(`029.01 → 029.02/029.03 → …`) değişmedi. 9 açık soru (D-B01–D-B09) kapatılmadı — sertifika/secret
sahipliği, allowlist yönetim ekranı, `schemaVersion` stratejisi, retention, DLQ eşiği, audit
action adı, gerçek MOSEDAŞ payload'ı, mTLS/OAuth2 sağlayıcısı, imzalı mesaj ihtiyacı. 178 yeni
test, API toplamı 3469→3553, `check.sh --skip-docker` yeşil. TASK-027.58/58-R1 MOSEDAŞ statik
kilidi yine genişletildi (gerekçeli, karar değişmedi).

