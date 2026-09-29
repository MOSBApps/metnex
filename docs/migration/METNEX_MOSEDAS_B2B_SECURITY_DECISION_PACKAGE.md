# Metnex ↔ MOSEDAŞ B2B Güvenlik ve Mesaj Sözleşmesi — Karar Paketi

> **Durum: karar paketi (TASK-029.02).** Gerçek MOSEDAŞ bağlantısı kurulmamıştır; gerçek
> credential/certificate/token kullanılmamıştır; API endpoint'i veya worker yazılmamıştır; database
> migration yapılmamıştır; yeni tenant, rol veya permission oluşturulmamıştır. Kırım Tesisi'nin iç
> üretim emri (DEC-0017 D-01, Metnex SoR) bu sözleşmeye **hiçbir yerde** karıştırılmamıştır. Somut,
> test edilebilir kurallar `apps/api/src/operations/domain/mosedas/` altında saf TypeScript domain
> sözleşmesi olarak teslim edilmiştir (178 test, bkz. §9); bu belge o kodun **gerekçesi, kapsamadığı
> kararlar ve açık sorularıdır**.

**Tarih:** 2026-09-28 · **Hazırlayan:** AI2 · **Bağlı:** DEC-0014 (k.5–k.8), DEC-0017 D-01/D-04,
TASK-029.01 (`operation-center.contract.ts`, `external-reference.contract.ts`,
`tenant-identity.ts`), EPIC-005, `backlog/TASK-029-00-…md`

## 0. Kanıt (repo'da bugün gerçekten olan)

| # | Kanıt | Kaynak |
|---|---|---|
| E1 | DEC-0014 karar 7: "Üretimde mTLS ve OAuth2 client credentials **birlikte** kullanılır. Kullanıcı JWT'si, `isSystemAdmin`, `TENANT_ADMIN` veya impersonation entegrasyon bypass'ı değildir. Her sistem kendi credential ve sertifikasını yönetir." **Kabul edilmiş, bağlayıcı.** | `docs/decisions/DEC-0014-…md` |
| E2 | DEC-0014 karar 8: "MOSEDAŞ hedefleri onaylı external-system allowlist'i ile tenant, tesis ve makine düzeyinde eşlenir. Payload tek başına erişim vermez." **Kabul edilmiş, bağlayıcı.** | aynı |
| E3 | DEC-0014 karar 5/6: emir versiyonlu + idempotent + çoklu vardiyaya yayılabilir; koşullar bozulursa `PAUSED`/`EXECUTION_BLOCKED`; olaylar önce kalıcılaşır, sonra asenkron gönderilir; `CRITICAL/HIGH/NORMAL` öncelik + retry/DLQ davranışı **var olduğu söylenir, sayısal değer verilmez**. | aynı |
| E4 | DEC-0014'ün kod tarafında **hiçbir** MOSEDAŞ B2B/entegrasyon/message tablosu/servisi henüz yoktur; `apps/api/src` içinde "mosedas" geçen tek üretim kodu kimlik migration slug kümesi (`tenant-mapping.ts`) ve TASK-029.01'in ret kuralı/sistem-adı kullanımıydı. | `dec-0014-slug-consistency.spec.ts` (TASK-027.58-R1) |
| E5 | TASK-029.01: `OperationCenter`, `FacilityReference`/`MachineReference`, `ExternalSystemReference` (`EXTERNAL_SYSTEMS = ['BEAM','NETSIS','MOSEDAS','SCADA_DMS']`), `AssetOwnershipReference`/`OperatorReference`, `TenantOperationScope`/`UserOperationCenterScope` — bu task bunların üzerine inşa eder, tekrar tanımlamaz. | `apps/api/src/operations/domain/` |
| E6 | Mevcut audit sözleşmesi deseni (TASK-027.57/58): statik `reasonCode`, actor/aktör kimliği ayrı alan, ham hata/SQL/secret asla metadata'da; `scrubSecrets` yalnız **anahtar** bazlı redaksiyon yapar. | `platform-audit.service.ts`, `audit/scrub-secrets.ts` |
| E7 | Standing kural: sayısal performans/limit eşikleri (retry sayısı, backoff, TTL) icat edilmez; TASK-029.00/00-R2 "Ortak kurallar" bunu MOSEDAŞ/Netsis/kepçe bağlamında zaten teyit etti. | `backlog/TASK-029-00-…md` |
| E8 | DEC-0017 D-01: Kırım Tesisi üretim emri **ayrı, Metnex-SoR'lu bounded context**; MOSEDAŞ'tan gelmez. | `docs/decisions/DEC-0017-…md` |

## 1. B2B kimlik modeli — protokol seçimi zaten kapalı, bu paket onu **detaylandırır**

Görev talimatı mTLS/OAuth2/imzalı mesaj/birleşik model seçeneklerini değerlendirmemizi istiyor;
ancak **DEC-0014 karar 7 bunu zaten kesin ve bağlayıcı biçimde kararlaştırmıştır: birleşik
mTLS + OAuth2 client credentials.** Bu paket bu seçimi **yeniden tartışmaz**, yalnız sonuçlarını
somutlaştırır:

| Seçenek | DEC-0014 durumu | Bu paketteki rol |
|---|---|---|
| Yalnız mTLS | Değerlendirilmedi (DEC-0014 açıkça "birlikte" diyor) | Uygulanmaz |
| Yalnız OAuth2 client credentials | Değerlendirilmedi | Uygulanmaz |
| Yalnız imzalı mesaj (mesaj imzası, taşıma katmanı güvensiz) | Görev metninde seçenek olarak sunuldu | DEC-0014 kapsamında değil; **açık soru Q-B01** olarak aşağıda bırakıldı (mTLS/OAuth2'ye **ek** bir savunma katmanı olabilir mi?) |
| **Birleşik mTLS + OAuth2 client credentials** | **Kabul edilmiş (E1)** | Bu paketin temel varsayımı |

**AI2 notu:** mTLS bağlantı katmanını (karşılıklı sertifika doğrulaması) kurar; OAuth2 client
credentials aynı bağlantı üzerinde uygulama katmanı yetkilendirmesini (client_id/scope) taşır.
İkisi birbirinin yerine geçmez — DEC-0014'ün "birlikte" ifadesi budur. Gerçek sertifika/CA/OAuth2
token endpoint sözleşmesi bu pakette **üretilmemiştir** (kesin sınır: gerçek credential yok).

### D-B01 — Sertifika/secret yaşam döngüsü sahipliği (açık)

| Seçenek | Anlamı | Etki |
|---|---|---|
| A | Metnex, MOSEDAŞ'ın sertifikasını/OAuth2 client'ını **kendi** admin panelinde yönetir (oluşturma, döndürme, iptal) | Merkezi kontrol; Metnex'in PKI/secret-store işletmesi gerekir |
| B | Her sistem kendi sertifika/secret'ını kendi tarafında üretir, yalnızca **public** kısmı (sertifika/İzin verilen client_id) karşı tarafa bildirilir | DEC-0014 k.7 "her sistem kendi credential ve sertifikasını yönetir" ile birebir uyumlu |
| C | Üçüncü taraf bir kimlik sağlayıcı (ör. ortak bir OAuth2 authorization server) | Yeni altyapı bağımlılığı, kapsam dışı olabilir |

**AI2 önerisi: B** (DEC-0014 k.7'nin doğrudan okunuşu). Karar sahibi: PO/AI1 — **kapatılmadı**.

## 2. Tenant/tesis/makine/operasyon merkezi kapsamı (E2 ile uygulanmış)

Kod: `b2b-client-identity.contract.ts` — `B2bClientIdentity` (opak `b2bClientId`, `status`,
`validity`) ve `B2bTargetAllowlistEntry` (`b2bClientId + targetTenantId + facilityReferenceId? +
machineReferenceId? + operationCenterId? + validity`). `resolveB2bTargetScope`:

1. Kimlik `ACTIVE` değilse veya geçerlilik penceresi dışındaysa **reddeder** (`B2B_IDENTITY_REVOKED`/`_EXPIRED`).
2. Hedef tenant mappable değilse (pasif, `PLATFORM_ROOT`, veya **MOSEDAŞ'ın kendisiyse** —
   DEC-0014/DEC-0017 gereği MOSEDAŞ asla hedef tenant olamaz) **reddeder** (`B2B_TARGET_TENANT_NOT_MAPPABLE`).
3. Allowlist'te bu client + bu tenant için eşleşen (facility/machine/operationCenter alanları
   `null` = "herhangi", **asla "tüm tenantlar"**) ve geçerli bir kayıt yoksa **reddeder**
   (`B2B_SCOPE_NOT_ALLOWLISTED`).

**Test kanıtı:** bir client'ın bir tenant için allowlist'i olması başka bir tenant'a erişim
vermiyor; boş allowlist her tenant'ı reddediyor; tesis/makine/operasyon-merkezi bazlı daraltma
çalışıyor (`b2b-client-identity.spec.ts`, 15 test).

### D-B02 — Allowlist yönetim arayüzü (açık, kapsam dışı)

Bu task **yalnızca modeli** tanımlar; allowlist kayıtlarının kim tarafından, hangi ekranda
yönetileceği (sistem yöneticisi mi, MOSEDAŞ entegrasyon sorumlusu mu) ve versiyonlama/audit izi
**029.01'in genişletilmiş bir implementation task'ında** ele alınmalıdır. Kapatılmadı.

## 3. Mesaj sözleşmesi

`message-envelope.contract.ts` — altı mesaj türü, tam olarak görev metninin istediği gibi:

| Tür | Yön | Açıklama |
|---|---|---|
| `PRODUCTION_PLAN` | MOSEDAŞ → Metnex | Tekil bir emre henüz bağlanmamış plan bilgisi; `externalOrderId`/`externalRevision` **null**. |
| `PRODUCTION_ORDER` | MOSEDAŞ → Metnex | Yeni emir; `externalOrderId` zorunlu, `externalRevision` başlangıç sürümü. |
| `PRODUCTION_ORDER_REVISION` | MOSEDAŞ → Metnex | Aynı `externalOrderId`, **kesin artan** `externalRevision`. |
| `CANCELLATION` | MOSEDAŞ → Metnex | Emri iptal eder; `externalOrderId` zorunlu. |
| `STATUS_CHANGE` | **Metnex → MOSEDAŞ** | DEC-0014 k.5 `PAUSED`/`EXECUTION_BLOCKED` gibi operasyon durumu geri bildirimi. |
| `REALIZED_PRODUCTION_FEEDBACK` | **Metnex → MOSEDAŞ** | DEC-0014 k.6 gerçekleşen üretim/olay geri bildirimi. |

**Zorunlu ortak zarf alanları** (görev metninden birebir): `externalMessageId, externalOrderId,
externalRevision, correlationId, occurredAt, sentAt, schemaVersion, sourceSystem,
targetTenantReference, messageType`. `validateMosedasMessageEnvelope` yapısal/güvenlik
doğrulamasını yapar: bilinmeyen tür, `sentAt < occurredAt`, siparişsiz revizyon, negatif/tam
sayı-olmayan revizyon ve bağlantı-dizesi/secret şekilli değer **hepsi reddedilir**.

> **Kritik sınır (görev metninin kendi notu, kod ve testle kanıtlı):** Kırım Tesisi'nin iç üretim
> emri (DEC-0017 D-01) bu enum'da **yoktur ve olamaz** — `static-guarantees.spec.ts`,
> `KIRIM|PAÇAL|BLEND|RECIPE|REÇETE` desenlerinden herhangi birinin bu dosyalarda **hiç
> geçmediğini** doğrular.

### Örnek payload — `PRODUCTION_ORDER` (yalnız şema örneği, gerçek veri değil)

```json
{
  "externalMessageId": "mosedas-msg-2026-000123",
  "externalOrderId": "mosedas-order-2026-0045",
  "externalRevision": 1,
  "correlationId": "corr-2026-000123",
  "occurredAt": "2026-06-01T05:00:00Z",
  "sentAt": "2026-06-01T05:00:02Z",
  "schemaVersion": "1.0",
  "sourceSystem": "MOSEDAS",
  "targetTenantReference": {
    "targetTenantId": "<metnex-tenant-id>",
    "facilityReferenceId": "<facility-reference-id>",
    "machineReferenceId": "<machine-reference-id>",
    "operationCenterId": null
  },
  "messageType": "PRODUCTION_ORDER"
}
```

### Örnek payload — `PRODUCTION_ORDER_REVISION`

```json
{
  "externalMessageId": "mosedas-msg-2026-000456",
  "externalOrderId": "mosedas-order-2026-0045",
  "externalRevision": 2,
  "correlationId": "corr-2026-000456",
  "occurredAt": "2026-06-01T09:00:00Z",
  "sentAt": "2026-06-01T09:00:01Z",
  "schemaVersion": "1.0",
  "sourceSystem": "MOSEDAS",
  "targetTenantReference": { "targetTenantId": "<metnex-tenant-id>", "facilityReferenceId": "<facility-reference-id>", "machineReferenceId": "<machine-reference-id>", "operationCenterId": null },
  "messageType": "PRODUCTION_ORDER_REVISION"
}
```

**Gerçek iş payload'ının içeriği** (üretim miktarı, zaman aralığı, vb. iş alanları)
**bu pakette tanımlanmamıştır** — o, MOSEDAŞ'ın kendi Discovery/SRS'sinin ve 029.04'ün konusudur;
burada yalnız zarf (envelope) sözleşmesi somutlaştırılmıştır.

### D-B03 — `schemaVersion` uyumluluk stratejisi (açık)

| Seçenek | Anlamı |
|---|---|
| A | Semver (`major.minor`); major değişince Metnex eski major'ı da bir süre kabul eder |
| B | Tek artan tamsayı; Metnex yalnız desteklediği tam sürüm(ler)i kabul eder |
| C | Sürüm uyumsuzluğu her zaman `SCHEMA_INVALID` (geriye dönük uyumluluk yok) |

Kapatılmadı — karar sahibi PO/AI1 + MOSEDAŞ ekibi (dış doğrulama gerekir, D-B04).

## 4. Idempotency ve replay (E-alanları birebir karşılanmıştır)

`idempotency.contract.ts` — `checkMessageIdempotency(envelope, history)`:

- **Aynı `externalMessageId`** → her zaman `DUPLICATE_MESSAGE` (içerik farklı olsa bile —
  "replay" saldırısı/ağ tekrar denemesi aynı sonuca varır, ikinci kez işlenmez).
- **Aynı `externalOrderId` için `externalRevision`**, o ana kadar görülmüş **en yüksek**
  revizyondan **kesin büyük** değilse → `STALE_REVISION` (eşit veya küçük — geç gelen eski
  revizyon asla yeni revizyonun üzerine yazmaz).
- Revizyonlar arasında **boşluk olabilir** (1 → 5 kabul edilir) — bu fonksiyon monotonluğu
  kontrol eder, ardışıklığı değil (görev metni "eski revision yeni revision'ın üzerine
  yazmamalı" diyor, "atlanan revizyon olamaz" demiyor).
- Farklı `externalOrderId`'lerin revizyon geçmişi birbirini **etkilemez**.

**Test kanıtı:** 8 senaryo (`idempotency.spec.ts`), dahil: aynı mesajın farklı içerikle tekrarı
yine duplicate, geç gelen düşük revizyon reddi, boş geçmişte ilk revizyonun kabulü.

### D-B04 — Kalıcı mesaj geçmişinin saklama süresi/kapsamı (açık, dış doğrulama)

`ProcessedMessageRecord` yalnızca **okuma sözleşmesidir** — gerçek depolama, retention süresi ve
hangi alanların saklanacağı 029.11'in (outbox/event) implementation kararıdır. Bu pakette **hiçbir
sayısal retention/TTL değeri verilmemiştir**.

## 5. Retry ve hata yönetimi

`retry-classification.contract.ts` — görev metninin istediği sekiz kategori **birebir**
tanımlanmıştır: `AUTHENTICATION_FAILED, SCOPE_DENIED, SCHEMA_INVALID, BUSINESS_RULE_INVALID,
TRANSIENT_INFRASTRUCTURE_ERROR, DUPLICATE_MESSAGE, INVALID_REVISION, UNKNOWN_TARGET`.

| Kategori | Retryable? | Gerekçe |
|---|---|---|
| `AUTHENTICATION_FAILED` | Hayır | Aynı credential ile tekrar denemek aynı sonucu verir |
| `SCOPE_DENIED` | Hayır | Allowlist değişmeden tekrar deneme sonucu değiştirmez |
| `SCHEMA_INVALID` | Hayır | Mesajın kendisi düzeltilmeden tekrar aynı hata |
| `BUSINESS_RULE_INVALID` | Hayır | İş kuralı ihlali; düzeltme gerekir (bu task'ın işlemediği bir katman — 029.04) |
| `TRANSIENT_INFRASTRUCTURE_ERROR` | **Evet** | Metnex tarafı geçici olarak erişilemez olabilir; içerik sorunlu değil |
| `DUPLICATE_MESSAGE` | Hayır | Zaten işlendi; tekrar göndermek hiçbir şey değiştirmez |
| `INVALID_REVISION` | Hayır | Gönderen doğru/yeni bir revizyon göndermeli, aynısını değil |
| `UNKNOWN_TARGET` | Hayır | Hedef tanımlı olmadan tekrar deneme anlamsız |

`classifyInboundErrorCode`, bu domain'in ürettiği her somut hata kodunu (**tam liste**:
`ENVELOPE_INVALID, ENVELOPE_UNSAFE_VALUE, B2B_IDENTITY_INVALID, B2B_IDENTITY_REVOKED,
B2B_IDENTITY_EXPIRED, B2B_TARGET_TENANT_NOT_MAPPABLE, B2B_SCOPE_NOT_ALLOWLISTED,
DUPLICATE_MESSAGE, STALE_REVISION`) yukarıdaki kategorilerden birine eşler; bilinmeyen bir kod
`null` döner (asla tahmin edilmez).

**Sayısal olarak icat EDİLMEYENLER (standing kural, E7):** maksimum retry sayısı, backoff
aralığı, DLQ'ya düşme eşiği, işlem timeout'u. `static-guarantees.spec.ts` bu dosyalarda böyle bir
sabitin **hiç yazılmadığını** statik olarak doğrular.

### D-B05 — DLQ ve teknik alındı/işlendi cevabı (açık)

| Konu | Seçenekler | Durum |
|---|---|---|
| DLQ'ya düşme koşulu | (A) yalnız `TRANSIENT_INFRASTRUCTURE_ERROR` tekrar tekrar başarısız olursa · (B) hiçbir zaman (kalıcı hatalar anında MOSEDAŞ'a bildirilir, kuyruklanmaz) | Kapatılmadı — sayı gerektirir (kaç deneme), 029.11'e bırakıldı |
| Teknik alındı (`DELIVERED`) ile işleme sonucu (`ACCEPTED`/`REJECTED`) ayrımı | DEC-0014/SRS §9.1.2 zaten "teknik alındı ile işleme sonucu ayrıdır" diyor — bu paket bunu **onaylar**, senkron/asenkron olup olmayacağı 029.11'e bırakılır | Kısmen kapalı (ayrım DEC-0014'te var, mekanizma açık) |

## 6. Audit ve redaction

`audit-entry.contract.ts` — `MosedasAuditEntry`: `b2bClientId` (actor yerine — **hiçbir zaman bir
kullanıcı kimliği değil**), `externalMessageId`, `correlationId`, `targetTenantId`,
`facilityReferenceId`, `machineReferenceId`, `operationCenterId`, `messageType`,
`externalRevision`, `result` (`ACCEPTED`/`REJECTED`), `reasonCode` (statik, `A-Z0-9_` deseni).

`validateMosedasAuditEntry`, aşağıdaki anahtarlardan **herhangi biri** varsa **kaydın tamamını**
reddeder (best-effort maskeleme değil, sert kapı): `secret, token, privateKey, connectionString,
rawPayload, password, certificate` (ve alt çizgi biçimleri). Ayrıca `b2bClientId`/
`externalMessageId`/`correlationId` bağlantı-dizesi/JWT şekilliyse reddedilir.

**Test kanıtı:** 10 zorunlu-alan + 10 yasak-anahtar senaryosu (`audit-entry.spec.ts`).

### D-B06 — Audit action adı (açık — mevcut desenle uyumlu olmalı)

TASK-027.57/58 deseni (`REPORT_EXPORT_SUCCEEDED/FAILED`, `SCADA_QUERY_SUCCEEDED/DENIED/FAILED`)
izlenirse aday: `MOSEDAS_MESSAGE_ACCEPTED` / `MOSEDAS_MESSAGE_REJECTED`. **Bu bir öneridir, karar
değildir** — yeni bir audit action adı bu pakette **oluşturulmamıştır**; 029.11/029.02'nin gerçek
implementation task'ında AI1 onayıyla sabitlenmelidir.

## 7. Mini threat model

| Tehdit | Senaryo | Bu sözleşmedeki karşı önlem |
|---|---|---|
| Kimlik taklidi | Sahte bir client, geçerli görünen bir `b2bClientId` ile mesaj gönderir | Transport katmanı (mTLS+OAuth2, DEC-0014 k.7) kimliği zaten doğrular; bu domain yalnızca DOĞRULANMIŞ kimliğin `status`/`validity`/allowlist'ini kontrol eder — kimlik doğrulamanın kendisi bu paketin kapsamı dışıdır |
| Yetki aşımı (cross-tenant) | Geçerli bir MOSEDAŞ client'ı, allowlist'i olmayan bir tenant'a mesaj gönderir | `resolveB2bTargetScope` → `B2B_SCOPE_NOT_ALLOWLISTED`; operationCenterId/facility/machine tek başına asla yetki vermez |
| MOSEDAŞ'ın kendisinin hedef gösterilmesi | Mesaj `targetTenantId`'yi MOSEDAŞ'ın kendi slug'ına eşlemeye çalışır | `isForbiddenMosedasTenant` (TASK-029.01'in bağımsız kopyası) her zaman reddeder |
| Replay | Aynı mesaj ağ üzerinden veya kötü niyetle tekrar gönderilir | `checkMessageIdempotency` → `DUPLICATE_MESSAGE`, hiçbir yeni işlem yapılmaz |
| Revizyon geri alma saldırısı | Eski bir revizyon, yenisinin üzerine yazmak için sonradan gönderilir | `STALE_REVISION`; asla üzerine yazılmaz |
| Secret/credential sızıntısı | Ham payload veya sertifika audit/log'a yazılır | `validateMosedasAuditEntry` yasak-anahtar kapısı; `isSafeExternalReferenceValue` bağlantı-dizesi/JWT şekilli değerleri her alanda reddeder |
| Şema enjeksiyonu | `schemaVersion`/`externalMessageId` alanına SQL/komut enjekte edilir | Aynı `isSafeExternalReferenceValue` kapısı (TASK-029.01 ile paylaşılan) |
| Kırım emrinin MOSEDAŞ'a sızması | İleride bir geliştirici Kırım iç emrini yanlışlıkla bu mesaj tipine ekler | `static-guarantees.spec.ts` `KIRIM/PAÇAL/BLEND/RECIPE` desenini statik olarak reddeder |
| Aşırı büyük/DoS şekilli mesaj | Çok uzun bir alan gönderilir | `isSafeExternalReferenceValue` 256 karakter üst sınırı (TASK-029.01'den miras) |
| Yetkisiz sistem yöneticisi bypass'ı | Bir Metnex sistem yöneticisi B2B kimliği yerine kendi JWT'siyle işlem yapmaya çalışır | `B2bClientIdentity`'nin hiçbir alanı kullanıcı/rol şeklinde değildir (statik test); B2B akışı kullanıcı guard zincirinden tamamen ayrıdır |

## 8. Idempotency/revision, retry ve audit alan tabloları — tek bakışta

| Alan | Zorunlu mu | Kaynak |
|---|---|---|
| `externalMessageId` | Evet | Görev metni |
| `externalOrderId` | Yalnız sipariş-bağlı türlerde | Görev metni + `PRODUCTION_PLAN` istisnası |
| `externalRevision` | Yalnız `externalOrderId` varsa | Görev metni |
| `correlationId` | Evet | Görev metni |
| `occurredAt` | Evet | Görev metni |
| `sentAt` | Evet, `>= occurredAt` | Görev metni + AI2 ek kuralı |
| `schemaVersion` | Evet | Görev metni |
| `sourceSystem` | Evet, sabit `MOSEDAS` | Görev metni |
| `targetTenantReference` | Evet | Görev metni |

## 9. Kod ve test envanteri

`apps/api/src/operations/domain/mosedas/` (NestJS'e bağlanmadı, API/worker/migration yok):

| Dosya | İçerik | Test |
|---|---|---|
| `b2b-client-identity.contract.ts` | `B2bClientIdentity`, `B2bTargetAllowlistEntry`, `resolveB2bTargetScope` | 15 |
| `message-envelope.contract.ts` | 6 mesaj türü, `MosedasMessageEnvelope`, `validateMosedasMessageEnvelope` | 15 |
| `idempotency.contract.ts` | `checkMessageIdempotency` | 8 |
| `inbound-message-validation.contract.ts` | `validateInboundMosedasMessage` (tek fail-closed pipeline) | 7 |
| `retry-classification.contract.ts` | 8 kategori, `classifyInboundErrorCode`, `isRetryable` | 7 |
| `audit-entry.contract.ts` | `MosedasAuditEntry`, `validateMosedasAuditEntry` | 8 |
| `__tests__/static-guarantees.spec.ts` | NestJS/DB/HTTP yok, secret/sayısal-eşik/Kırım karışımı yok, MOSEDAS yalnız 2 dosyada literal | 9 |

**Toplam 178 test** (bu sözleşmeye özgü — 029.01'in 94 testiyle birlikte `operations/domain/`
altında 178+94'ün üstü; tam API paketi 3375 → 3553'e çıktı, `tsc`/`check.sh --skip-docker`
yeşil).

## 10. EPIC-005 ve TASK-029.03–029.12 bağımlılık notları

- **029.03 (Kapasite):** `B2bTargetAllowlistEntry`'nin `operationCenterId`/`facilityReferenceId`
  alanları, kapasite snapshot'ının hangi operasyon merkezine ait olduğunu MOSEDAŞ'a bildirirken
  aynı kimlikleri kullanmalıdır (yeniden tanımlanmamalı).
- **029.04 (Enerji üretim emri):** `MosedasMessageEnvelope` + `validateInboundMosedasMessage`,
  inbound `PRODUCTION_ORDER`/`_REVISION`/`CANCELLATION` işleme hattının **girişidir**; 029.04
  gerçek iş kurallarını (emir kabul/ret, `PAUSED`/`EXECUTION_BLOCKED`) bu doğrulamadan SONRA
  uygular, önce değil. `STATUS_CHANGE`/`REALIZED_PRODUCTION_FEEDBACK` outbound mesajları 029.04'ün
  ürettiği durumları taşır.
- **029.05/029.06 (Operasyon Merkezi):** `targetTenantReference.operationCenterId`, 029.01'in
  `OperationCenter`/`OPERATION_CENTER_OWNER_ROLE`'üyle **aynı kimlik alanıdır** — MOSEDAŞ mesajı
  hangi operasyon merkezine (Kömür Kazanı/Kırım Tesisi) değindiğini bu alanla bildirir; MOSEDAŞ
  Kırım Tesisi'ne emir gönderemez ama diğer tesisler/makineler için kapasite/plan mesajı
  gönderebilir (D-01'in doğal sonucu — bu paket bunu değiştirmez).
- **029.11 (Olay delivery):** `ProcessedMessageRecord`, `INBOUND_FAILURE_CATEGORIES`, `IS_RETRYABLE`
  ve D-B04/D-B05'teki açık sorular doğrudan bu task'ın girdisidir; gerçek outbox/kuyruk/DLQ
  implementasyonu ve sayısal retry/backoff/TTL değerleri orada kararlaştırılır.
- **029.12 (Kabul):** `static-guarantees.spec.ts` ve threat model (§7) negatif test setine örnek/
  referans olarak kullanılabilir; ayrıca cross-tenant/B2B-yetki-aşımı/replay senaryolarının gerçek
  API üzerinde de (029.02'nin gerçek implementation task'ında, henüz `ready` değil) doğrulanması
  gerekir.

## 11. Açık sorular ve dış sistem doğrulama listesi

| ID | Soru | Sorumlu | Durum |
|---|---|---|---|
| D-B01 | Sertifika/OAuth2 client secret'ının yaşam döngüsü sahibi kim (Metnex mi, MOSEDAŞ mı, üçüncü taraf mı)? | PO/AI1 | Açık (AI2 önerisi: B — her sistem kendisi) |
| D-B02 | Allowlist kayıtlarını kim, hangi ekranda yönetecek? | PO/AI1 | Açık, kapsam 029.01/029.02 implementation task'ına |
| D-B03 | `schemaVersion` uyumluluk stratejisi (semver/tek sayı/geriye dönük uyum yok) | PO/AI1 + MOSEDAŞ ekibi | Açık, dış doğrulama gerekir |
| D-B04 | Mesaj geçmişinin saklama süresi/kapsamı (retention) | PO/AI1 | Açık, sayısal değer gerektirir |
| D-B05 | DLQ'ya düşme koşulu ve maksimum retry sayısı | PO/AI1 | Açık, sayısal değer gerektirir (029.11) |
| D-B06 | Audit action adı (`MOSEDAS_MESSAGE_ACCEPTED`/`_REJECTED` önerisi) | AI1 | Açık, öneri var |
| D-B07 | Gerçek MOSEDAŞ mesaj sözleşmesinin iş alanları (miktar, birim, zaman aralığı) | MOSEDAŞ ekibi (dış) | Açık, dış doğrulama gerekir — bu pakette yalnız zarf tanımlıdır |
| D-B08 | mTLS sertifika CA'sı ve OAuth2 authorization server'ın gerçek sağlayıcısı | Teknik servis (dış) | Açık, dış doğrulama gerekir |
| D-B09 | İmzalı mesaj (mesaj-düzeyi imza) mTLS+OAuth2'ye ek bir savunma katmanı olarak gerekli mi? | PO/AI1 | Açık — DEC-0014 kapsamında değil, yeni öneri |

## Kesin sınırlar (uygulandı)

Gerçek MOSEDAŞ bağlantısı kurulmadı; gerçek credential/token/certificate kullanılmadı; API
endpoint'i veya worker yazılmadı; database migration yapılmadı; yeni tenant/rol/permission
oluşturulmadı; kullanıcı JWT'si B2B kimliği olarak kullanılmadı; Kırım iç üretim emri MOSEDAŞ
enerji emriyle birleştirilmedi; Docker/gerçek SQL Server/production sistemi kullanılmadı; git
commit/push yapılmadı.
