---
id: TASK-029.00
title: EPIC-005 Task Planı ve Bağımlılık Sözleşmesi
status: planned
srs_refs: [FEAT-023, FEAT-024, FEAT-025, FEAT-026, FEAT-027, FEAT-028, FEAT-029]
parent_epic: EPIC-005
updated_at: 2026-09-28
---

# TASK-029.00: EPIC-005 Task Planı ve Bağımlılık Sözleşmesi

> **DEC-0017 notu (2026-09-28, TASK-029.00-R2):** Aşağıdaki task kapsamları,
> `docs/decisions/DEC-0017-…md` (D-01–D-22) ile genişletilmiştir; eski metin
> silinmemiş, ilgili maddelere **[DEC-0017]** notu eklenmiştir. Bu güncelleme
> hiçbir task'ı `ready` yapmaz — ilk `ready` implementation task'ı ayrıca
> TASK-029.01 olarak verilecektir.

## Amaç

DEC-0014 kararlarını uygulanabilir task sırasına dönüştürmek. Bu dosya
implementation yapmaz; EPIC-005'in bağımlılık ve kabul sınırlarını tanımlar.
DEC-0017 ile bu amaç, Kırım Tesisi üretim emri/reçete/paçal ve laboratuvarın
kömür/kantar/gelen ürün/su alt alanlarını da kapsayacak şekilde genişlemiştir.

## Bağımlılık sırası

`029.01 → 029.02/029.03 → 029.04 → 029.05 → 029.06`

`029.01 → 029.07 → 029.08`

`029.01 → 029.09 → 029.10`

`029.02/029.04/029.05 → 029.11 → 029.12`

**[DEC-0017]** Kırım Tesisi (paçal) üretim emri MOSEDAŞ'tan gelmediği için
`029.02`'ye (B2B) bağımlı **değildir**; `029.07`'nin (Laboratuvar domain,
genişletilmiş kapsam) bir alt akışı olarak `029.01 → 029.07 → 029.08` zincirinde
ilerler. MOSB/MOSB ENERJİ/MOSBİO tenant dili uyum task'ı (D-04) bu bağımlılık
zincirinin **dışındadır** ve ayrıca `ready` yapılmadıkça başlamaz.

## Task kapsamları

1. **029.01 — Domain, tenant, operasyon merkezi ve external reference
   sözleşmesi:** MİP root, MOSB Enerji ve MOSBIO operasyon tenantları; MOSEDAŞ
   external system; BEAM/ERP external reference; tesis/makine referansı; Kömür
   Kazanı ilişkisi. **[DEC-0017]** Ortak laboratuvar ekibinin çoklu tenant
   üyeliği (D-03); Kömür Kazanı ve Kırım Tesisi'nin kendi tenant'ları (MOSB
   Enerji / MOSBIO) altında operasyon merkezi/tesis-ünite referansı olarak
   modellenmesi (D-09, Kırım Tesisi ↔ `MOSBİO KIRIM DEPO` eşdeğerliği **açık**);
   yeni rollerin mevcut rol/permission modelinin genişletilmesiyle tanımlanacağı
   ilkesi (D-16, permission kodları bu task'ta üretilir, bu dosyada değil).
2. **029.02 — B2B güvenlik:** mTLS + OAuth2 client credentials, credential
   sahipliği, allowlist, revocation, audit ve payload redaction. **[DEC-0017]**
   Yalnız enerji üretim emri sözleşmesini kapsar; Kırım Tesisi emri bu task'a
   girmez (D-01).
3. **029.03 — Kapasite:** Metnex-owned operational capacity model; BEAM/ERP
   referansları; bakım/duruş etkisi; dönem snapshot'ı.
4. **029.04 — Üretim emri:** Versiyon, kabul/ret, `PAUSED`/`EXECUTION_BLOCKED`,
   iptal/replan, idempotency ve çoklu vardiya ilişkisi. **[DEC-0017]** Bu task
   yalnız **enerji üretim emrini** (MOSEDAŞ SoR) kapsar (D-01). Kırım Tesisi'nin
   kendi (Metnex SoR'lu) üretim emri ayrı bir bounded context'tir ve `029.07`
   kapsamındadır.
5. **029.05 — Operasyon Merkezi API:** Vardiya, order görünümü, olay,
   gerçekleşme ve kapanış domain sınırları. **[DEC-0017]** Vardiya, ayrı zorunlu
   bir entity değil; üretim emri/kova ölçümü/olay kayıtlarının zaman ve
   sorumluluk boyutudur (D-08); "order" burada yalnız enerji üretim emridir.
6. **029.06 — İlk ekran grubu:** Özet, vardiya listesi/detayı, order
   listesi/detayı ve olay akışı.
7. **029.07 — Laboratuvar domain:** Parametrik analiz tanımı, numune, sonuç,
   taslak/onay/kilit/revizyon, domain permission ve audit. **[DEC-0017]**
   Kapsam genişletildi — karma yaşam döngüsü: tanım/referans katmanı
   taslak→onay→versiyon, sonuç katmanı kısmi-kayıt+esas-sonuç+kilit-sonrası-
   revizyon (D-02); MOSB ENERJİ kömür kabul/kantar (SoR geçici Netsis, **açık**
   — D-05)/yığın/kazan külü (kazan sayacı: SCADA ana kaynak + manuel istisna,
   D-10); MOSBİO gelen biyokütle ürünü analizi; su laboratuvarı (parametre/limit
   **açık** — Q-023); Kırım Tesisi reçete/reçete sürümü/iç üretim emri/kova
   ölçümü (kepçe cihazı **açık** — D-11; nihai paçal miktarı ölçümü kapsam dışı
   — D-18)/paçal analizi (toplu kalite reçete sürümü bazında, aritmetik yöntem,
   ağırlıklı **açık** — D-07, D-17; hedef dışı bildirim yok, sonradan-sonuç
   bildirimi var — D-06); kalori (G6→G7 kullanım kararı kapandı, formül
   doğrulaması **açık** — D-12); Online Drum/Steam ilk fazda manuel (D-19).
   Bu maddeler SRS §9.2 FEAT-026–029 taslaklarına karşılık gelir ve bu task'ta
   kesin FR'lere dönüştürülür.
8. **029.08 — Laboratuvar UI:** Tanım/parametre, numune, sonuç, onay/kilit ve
   geçmiş ekranları. **[DEC-0017]** Kömür/gelen ürün/su/paçal raporları
   (Excel/PDF/ekran) dahildir; rapor kolonları ve Jasper allowlist şablonu
   **açık** (D-20).
9. **029.09 — İşletme domain:** Ayrı parametrik form/alan tanımı, taslak/onay/
   kilit/revizyon ve domain audit.
10. **029.10 — İşletme UI:** Form/alan tanımı, veri girişi, onay/kilit ve geçmiş.
11. **029.11 — Olay delivery:** Kalıcı outbox/event, `CRITICAL/HIGH/NORMAL`,
    retry, DLQ, teknik alındı/işleme sonucu ve idempotent delivery. **[DEC-0017]**
    Su/gelen-ürün/paçal bildirimleri için de kullanılacak **ortak notification
    service** ilkesi bu task'ta değerlendirilir (D-15); ayrı ayrı bildirim
    mantığı icat edilmez.
12. **029.12 — Kabul:** Tenant izolasyonu, external-system güvenliği, audit,
    retry, redaction, ekran/API acceptance ve kalite kapıları. **[DEC-0017]**
    Ortak laboratuvar çoklu tenant izolasyonu (D-03) negatif testleri; audit'te
    yalnız asgari kullanıcı kimliği tutulduğunun doğrulanması (D-21); tarihsel
    veri migration'ının (varsa) seçilmiş kapsamla yapıldığının doğrulanması
    (D-22).

## Ortak kurallar

- Wave 2 ve Wave 3 kapsam dışıdır.
- BEAM/ERP ana verisi kopyalanmaz ve sahiplik Metnex'e taşınmaz.
- MOSEDAŞ Metnex tenantı değildir.
- Kullanıcı JWT'si veya platform admin rolü B2B kimliği değildir.
- Gerçek credential, üretim verisi ve bağlantı dizesi teslim raporlarına yazılmaz.
- Docker/DB işlemleri task talimatında ayrıca onaylanmadan çalıştırılmaz.
- Her implementation task'ı `review` teslimi, `check.sh --skip-docker`, test,
  audit/tenant etkisi ve kalan risk raporu ile kapanır.
- **[DEC-0017]** Domain kayıtları (lab, kantar/yığın, Kırım Tesisi, operasyon
  merkezi) tenant data-plane şemasında tutulacaktır (D-14); data-plane fan-out
  altyapısı bugün eksiktir — bu, ilgili task'ların implementation'ı için **ön
  koşuldur**, bu dosyada giderilmez.
- **[DEC-0017]** Ağırlıklı ortalama, kalori/kül formülü, kalite limitleri,
  Netsis sözleşmesi, kepçe cihazı ve rapor şablonları için **hiçbir sayısal
  değer veya sözleşme icat edilmeyecektir**; kaynağı gelene kadar `TBD` kalır
  (bkz. DEC-0017 "Açık statüler").

## TASK-029.01 Teslimi ve 029.02–029.12 Etki Notları (2026-09-28, `done` — AI1 onayı)

TASK-029.01 pure domain/reference sözleşmesini `apps/api/src/operations/domain/` altında teslim
etti (kod yok — API/UI/DB yok, hiçbir NestJS modülüne bağlanmadı; bkz.
`backlog/TASK-029-01-domain-tenant-operation-center-reference-contract.md`). Aşağıdaki notlar,
sonraki task'ların bu somut sözleşmeyi nasıl kullanacağını/kullanamayacağını netleştirir; hiçbiri
`ready` durumunu değiştirmez.

- **029.02 (B2B güvenlik):** `ExternalSystemReference` (`external-reference.contract.ts`) MOSEDAŞ'ı
  yalnızca bir `externalSystem` adı olarak taşır; bu task MOSEDAŞ'a **tenant kimliği değil, allowlist
  kimliği** (tesis/makine düzeyinde) tanımlayacaktır — `TenantOperationRoleAssignment` MOSEDAŞ için
  hiçbir zaman bir rol içermez (029.01 testleri bunu kanıtlar).
- **029.03 (Kapasite):** `AssetOwnershipReference` + `OperatorReference` (`ownership-operator.contract.ts`)
  ve `resolveEffectiveOwnershipAndOperator` zaman-bazlı sahiplik/işletmeci ayrımını hazır sağlar; bu
  task kapasite snapshot'ını bu iki referansın üzerine kurar, birleştirmez.
- **029.04 (Enerji üretim emri):** `OperationCenter`/`OperationCenterKind` bu task'a girmez (DEC-0017
  D-01) — emir, tesis/makine referanslarını (`FacilityReference`/`MachineReference`) okur, operasyon
  merkezi kavramını üretmez.
- **029.05 (Operasyon Merkezi API):** `resolveOperationCenterForCaller` ve
  `resolveUserOperationAccess` (`tenant-operation-scope.contract.ts`) bu task'ın yetki
  sözleşmesinin temelidir; `operationCenterId` hiçbir zaman tek başına erişim vermeyeceği için API
  katmanı da `tenantId` + üyelik + grant üçlüsünü zorunlu tutmalıdır.
- **029.07 (Laboratuvar domain):** `UserOperationCenterScope`/`OperationAccessKind` (`VIEW`,
  `DATA_ENTRY`, `APPROVAL`, `CORRECTION`, `MANAGEMENT`) ortak laboratuvar ekibinin çoklu tenant
  üyeliğini (D-03) ve görüntüleme/veri girişi ayrımını (BRIF2 §2) doğrudan karşılar; Kırım Tesisi
  reçete/emir/kova/paçal bu task'ta `OperationCenter` (KIRIM_TESISI) ve `FacilityReference`/
  `MachineReference`'ı kullanır.
- **029.09/029.10 (İşletme):** Aynı `OPERATION_ACCESS_KINDS` vocabulary'si yeniden kullanılabilir;
  İşletme kendi domain/permission sınırını korur (DEC-0014 k.10), bu sözleşme onu değiştirmez.
- **029.11 (Olay delivery):** `ExternalSystemReference` (`SCADA_DMS`, `NETSIS`, `BEAM`, `MOSEDAS`)
  outbox olaylarının hedef sistemini taşıyabilir; `isSafeExternalReferenceValue` payload
  redaction'ının ilk katmanıdır.
- **029.12 (Kabul):** 029.01'in static-guarantees testleri (permission kodu yok, secret yok, tenant
  oluşturma yok, yalnız `tenant-identity.ts`/`external-reference.contract.ts` MOSEDAŞ'ı anar) bu
  task'ın negatif test setine doğrudan referans/örnek olarak kullanılabilir.

**D-04 (MOSB/MOSB ENERJİ/MOSBİO tenant dili) bu task'ta otomatik düzeltilmedi** —
`OPERATION_CENTER_OWNER_ROLE` tablosu ve `TenantOperationRoleAssignment`, rolü **hiçbir zaman bir
tenant slug'ından türetmez**; gerçek `t-mosb-enerji`/`t-mosbio` eşlemesi ayrı, henüz `ready`
olmayan uyum task'ının (D-04) çıktısıdır. Bu, blocker olarak raporlanmıştır, kapatılmamıştır.

## TASK-029.02 Teslimi ve Etki Notları (2026-09-28, `done` — AI1 onayı)

`apps/api/src/operations/domain/mosedas/` (6 dosya + 178 test) ve
`docs/migration/METNEX_MOSEDAS_B2B_SECURITY_DECISION_PACKAGE.md` teslim edildi (bkz.
`backlog/TASK-029-02-mosedas-b2b-security-message-contract.md`). DEC-0014 k.7/8 (birleşik
mTLS+OAuth2, tenant/tesis/makine allowlist) doğrudan uygulandı, yeniden tartışılmadı.

- **029.01 üzerine inşa eder, tekrar tanımlamaz:** `B2bClientIdentity`/`resolveB2bTargetScope`,
  029.01'in `tenant-identity.ts` (MOSEDAŞ ret kuralı), `external-reference.contract.ts`
  (`isSafeExternalReferenceValue`, `EXTERNAL_SYSTEMS`) ve `reference-validity.contract.ts`'ini
  doğrudan tüketir.
- **029.02'nin gerçek implementation task'ı** (henüz `ready` değil) bu sözleşmeyi API/worker'a
  bağlarken D-B01 (sertifika/secret sahipliği) ve D-B02 (allowlist yönetim ekranı) kararlarını
  bekler.
- **029.04 (Enerji üretim emri):** `validateInboundMosedasMessage`, gerçek emir kabul/ret/`PAUSED`/
  `EXECUTION_BLOCKED` iş mantığından ÖNCE çalışan zarf/kimlik/kapsam/idempotency kapısıdır; 029.04
  bu kapıdan geçmiş mesajları işler, kendi kapısını tekrar icat etmez. `STATUS_CHANGE`/
  `REALIZED_PRODUCTION_FEEDBACK` outbound mesajları 029.04'ün ürettiği durumları taşır.
- **029.05/029.06 (Operasyon Merkezi):** `targetTenantReference.operationCenterId`, 029.01'in
  `OperationCenter` kimlikleriyle aynıdır; MOSEDAŞ Kırım Tesisi'ne asla emir gönderemez (D-01).
- **029.11 (Olay delivery):** `ProcessedMessageRecord`, `INBOUND_FAILURE_CATEGORIES`, `IS_RETRYABLE`
  bu task'ın girdisidir; gerçek outbox/DLQ/sayısal retry-backoff değerleri (D-B04/D-B05) orada
  kararlaştırılır — bu task'ta icat edilmedi.
- **029.12 (Kabul):** threat model (§7, karar paketi) ve `static-guarantees.spec.ts` negatif test
  setine referans olarak kullanılabilir.

**Kapatılmayan açık sorular:** D-B01 (sertifika/secret sahipliği), D-B02 (allowlist ekranı), D-B03
(`schemaVersion` stratejisi), D-B04 (mesaj geçmişi retention), D-B05 (DLQ/retry eşiği), D-B06
(audit action adı), D-B07 (gerçek MOSEDAŞ payload'ı, dış), D-B08 (mTLS/OAuth2 sağlayıcısı, dış),
D-B09 (imzalı mesaj ek katmanı). Ayrıntı: karar paketi §11.

