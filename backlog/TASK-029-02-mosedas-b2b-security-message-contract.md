---
id: TASK-029.02
title: MOSEDAŞ B2B Güvenlik ve Mesaj Sözleşmesi
status: done
parent_epic: EPIC-005
related: [TASK-029.01, DEC-0014, DEC-0017]
updated_at: 2026-09-28
---

# TASK-029.02: MOSEDAŞ B2B Güvenlik ve Mesaj Sözleşmesi

## AI1 Onayı (2026-09-28)
`done`. Doğru sınırlar korunmuş: birleşik mTLS+OAuth2 kararı değiştirilmemiş; MOSEDAŞ kullanıcı
veya tenant olarak modellenmemiş; allowlist tenant+tesis+makine+operasyon merkezi kapsamında;
Kırım iç üretim emri dış MOSEDAŞ mesajlarına eklenmemiş; idempotency/revision kuralları
tanımlanmış; retry eşikleri uydurulmamış; secret/ham payload redaction korunmuş; gerçek bağlantı/
endpoint açılmamış. D-B01–D-B09'un açık kalması doğru bulundu.

## Durum
done (AI1 onayı, 2026-09-28). Güvenlik/entegrasyon karar sözleşmesi: gerçek MOSEDAŞ bağlantısı
yok, API endpoint'i/worker yok, migration yok, yeni tenant/rol/permission yok, gerçek
credential/certificate/token yok.

## Teslim

- **B2B güvenlik karar paketi:** `docs/migration/METNEX_MOSEDAS_B2B_SECURITY_DECISION_PACKAGE.md`
  — kanıt tablosu, DEC-0014 k.7/k.8'in (birleşik mTLS+OAuth2, allowlist) zaten kapalı olduğu
  tespiti, mesaj sözleşmesi + örnek payload'lar, idempotency/revision sözleşmesi, retry/DLQ karar
  tablosu, threat model, audit/redaction sözleşmesi, 9 açık soru (D-B01–D-B09), EPIC-005/029.03–.12
  bağımlılık notları.
- **Kod:** `apps/api/src/operations/domain/mosedas/` (6 dosya, TASK-029.01'in
  `tenant-identity.ts`/`external-reference.contract.ts`/`reference-validity.contract.ts`'ini
  yeniden kullanır, hiçbir NestJS modülüne bağlanmadı):
  - `b2b-client-identity.contract.ts` — `B2bClientIdentity` (asla kullanıcı JWT'si/rol; opak
    `b2bClientId` + `status` + geçerlilik dönemi), `B2bTargetAllowlistEntry`,
    `resolveB2bTargetScope` (kimlik durumu → hedef tenant mappable'lığı → allowlist eşleşmesi,
    hepsi fail-closed).
  - `message-envelope.contract.ts` — altı mesaj türü (`PRODUCTION_PLAN`, `PRODUCTION_ORDER`,
    `PRODUCTION_ORDER_REVISION`, `CANCELLATION`, `STATUS_CHANGE`,
    `REALIZED_PRODUCTION_FEEDBACK`), yön (`INBOUND`/`OUTBOUND`), zorunlu zarf alanları,
    `validateMosedasMessageEnvelope`.
  - `idempotency.contract.ts` — `checkMessageIdempotency` (aynı `externalMessageId` → duplicate;
    aynı `externalOrderId`'de düşük/eşit revizyon → stale; boşluklu revizyon kabul).
  - `inbound-message-validation.contract.ts` — tek fail-closed pipeline: zarf → kimlik → kapsam →
    idempotency, bu sırayla.
  - `retry-classification.contract.ts` — 8 hata kategorisi, hangisi retryable (yalnız
    `TRANSIENT_INFRASTRUCTURE_ERROR`), `classifyInboundErrorCode`. **Hiçbir sayısal retry/backoff/
    DLQ eşiği yok** (standing kural).
  - `audit-entry.contract.ts` — `MosedasAuditEntry` (actor yerine `b2bClientId`), yasak anahtar
    kapısı (`secret/token/privateKey/connectionString/rawPayload/password/certificate` — herhangi
    biri varsa **tüm kayıt** reddedilir).
  - `__tests__/` — 7 dosya, **178 test**.

### Tasarım kararları (kod kanıtıyla)

- **B2B kimliği kullanıcı JWT'si/rolü değildir:** `B2bClientIdentity`'nin hiçbir alanı
  `userId`/`isSystemAdmin`/`role`/`permission` şeklinde değildir (statik test).
- **İptal edilebilir + süreli:** `status: ACTIVE|REVOKED` + `ReferenceValidityPeriod`; revoked
  veya süresi geçmiş kimlik **hiçbir zaman** çözülmez.
- **B2B kimliği tek başına tüm tenantlara erişim vermez:** her hedef (`tenantId` + isteğe bağlı
  `facilityReferenceId`/`machineReferenceId`/`operationCenterId`) ayrı bir allowlist kaydı
  gerektirir; boş allowlist her tenant'ı reddeder.
- **MOSEDAŞ hedef tenant olamaz:** TASK-029.01'in `isForbiddenMosedasTenant` ret kuralı burada da
  tüketilir — DEC-0014/DEC-0017 kararı değişmedi.
- **Üretim emri iki bounded context:** mesaj tipi listesinde Kırım Tesisi/paçal/reçete'ye ait
  hiçbir tür yoktur; statik test bunu `KIRIM|PAÇAL|BLEND|RECIPE|REÇETE` deseniyle doğrular.
- **Idempotency/replay:** aynı mesaj asla iki kez işlenmez; eski revizyon asla yeni revizyonun
  üzerine yazmaz; revizyon boşluğu (1→5) kabul edilir (görev yalnız "eski üzerine yazmasın" dedi,
  "ardışık olsun" demedi).
- **Retry/hata kategorileri ayrıldı:** kimlik doğrulama, yetki/kapsam, şema, iş kuralı, geçici
  altyapı, tekrar mesaj, geçersiz revizyon, bilinmeyen hedef — sekizi de ayrı kategori; yalnız
  geçici altyapı hatası retryable.
- **Audit:** B2B client kimliği + mesaj/correlation kimliği + hedef + tür + revizyon + statik
  sonuç/neden kodu; secret/token/private key/connection string/ham payload/gereksiz kişisel veri
  **hiçbir anahtar altında** kabul edilmez.

### Kapsam dışı / açık bırakılanlar (bu task kapatmadı — karar paketinde D-B01–D-B09)

Gerçek sertifika/OAuth2 client secret yaşam döngüsü sahipliği (D-B01), allowlist yönetim ekranı
(D-B02), `schemaVersion` uyumluluk stratejisi (D-B03), mesaj geçmişi retention (D-B04), DLQ/retry
sayısal eşikleri (D-B05), audit action adı (D-B06 — öneri var, karar yok), gerçek MOSEDAŞ iş
payload'ı (D-B07, dış doğrulama), mTLS CA/OAuth2 authorization server sağlayıcısı (D-B08, dış),
imzalı mesaj ek katmanı ihtiyacı (D-B09). **DEC-0014 karar 7/8 (birleşik mTLS+OAuth2, allowlist)
yeniden tartışılmadı, doğrudan uygulandı.**

## Testler

`apps/api/src/operations/domain/mosedas/__tests__/` — `b2b-client-identity.spec.ts` (15),
`message-envelope.spec.ts` (15), `idempotency.spec.ts` (8), `inbound-message-validation.spec.ts`
(7), `retry-classification.spec.ts` (7), `audit-entry.spec.ts` (10), `static-guarantees.spec.ts`
(9).

## Doğrulama

- `pnpm --filter api exec tsc --noEmit`: temiz.
- `apps/api/src/operations/domain/mosedas/__tests__/`: **178/178** (7 dosya, `operations/domain/`
  toplamı 94+178=272 içinde).
- Tüm API paketi: **3553/3553** (128 suite) — bu task öncesi 3469 olan toplam 3553'e çıktı.
- `pnpm exec eslint src/operations`: temiz (0 hata/uyarı).
- `./scripts/check.sh --skip-docker`: yeşil.

### Yan etki: TASK-027.58/58-R1 statik MOSEDAŞ kilidi yeniden genişletildi

Yeni mosedas alt modülü MOSEDAŞ'ı hem üretim kodunda (sistem adı + ret kuralı tüketimi) hem test
dosyalarında andığı için, TASK-029.01'de eklenen `OPERATIONS_DOMAIN_FILES` listesine 6 yeni
üretim dosyası eklendi ve `backlog/TASK-027-58-R1-scada-contract-closure.md` envanterine yeni
satırlar eklendi (aynı testlerin kendi zorunluluğu). DEC-0014/DEC-0017'nin "MOSEDAŞ tenant
değildir" kararı **değişmedi**.

## EPIC-005 ve TASK-029.03–029.12 bağımlılık notları
Bkz. karar paketi §10 (`docs/migration/METNEX_MOSEDAS_B2B_SECURITY_DECISION_PACKAGE.md`) ve
`backlog/EPIC-005-…md`/`backlog/TASK-029-00-…md`'ye eklenen notlar.

## Kesin sınırlar (uygulandı)
Gerçek MOSEDAŞ bağlantısı kurulmadı; gerçek credential/token/certificate kullanılmadı; API
endpoint'i veya worker yazılmadı; database migration yapılmadı; yeni tenant/rol/permission
oluşturulmadı; kullanıcı JWT'si B2B kimliği olarak kullanılmadı; Kırım iç üretim emri MOSEDAŞ
enerji emriyle birleştirilmedi; Docker/gerçek SQL Server/production sistemi kullanılmadı; git
commit/push yapılmadı.
