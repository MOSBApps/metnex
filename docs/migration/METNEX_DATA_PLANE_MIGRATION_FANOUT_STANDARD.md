# Data-Plane Migration Fan-out Standardı (kavramsal — TASK-027.26)

> **Durum: Kavramsal standart. Runner, tablo, migration, `pgSchema()` veya kod YAZILMAMIŞTIR.** Karar paketi:
> `METNEX_CUSTOMER_ROOT_DATA_PLANE_ARCHITECTURE_DECISION.md` (AI2 önerisi Seçenek C). Standart, C'nin AI1/PO tarafından
> onaylandığı varsayımıyla **koşullu** yazılmıştır; onaylanmazsa geçersizdir. DEC-0010 §9 ("designed, not built") ve
> `METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md` (run ID/dry-run/idempotency/rollback kategorileri) ile hizalıdır;
> onların yerine geçmez. Hiçbir soru kapatılmaz.
> **Tarih:** 2026-09-21 · **Hazırlayan:** AI2

**Kanıt zemini:** `customer_schema_registry` (`schemaName`, `migrationVersion`, `status`, `lastError`), `CustomerSchemaRegistryService`
(idempotent provisioning), `drizzle-orm/migrator.d.ts` (`migrationsTable?`, `migrationsSchema?` seçenekleri mevcut), `drizzle.config.ts`
(tek `public` hedef), DEC-0010 §9-10.

---

## 1. Kavramlar

| Terim | Tanım |
|---|---|
| Data-plane migration | Yalnızca müşteri-root schema **içindeki** nesneleri değiştiren migration; `public` control-plane migration'ı (mevcut `drizzle-kit`) ayrıdır |
| Fan-out run | Bir data-plane migration sürümünü tüm uygun customer-root schema'larına uygulama girişimi (`migrationRunId` ile) |
| Hedef | `customer_schema_registry` satırı (`customerRootTenantId`, `schemaName`) — hedef listesi **yalnızca registry'den** türetilir, kullanıcı girdisinden asla |
| Sürüm | Data-plane migration günlüğündeki sıralı etiket (örn. `0001_<ad>`); registry `migrationVersion` **ulaşılan son sürümü** tutar (bugün sabit `'0000_empty'`) |
| Yerel takip | Her schema içinde uygulanmış migration'ları tutan takip tablosu (drizzle migrator `migrationsSchema`/`migrationsTable` ile — ad ve konum **karar bekler**, Q-DP01) |

## 2. Yaşam döngüsü

```text
DISCOVER → VALIDATE_REGISTRY → PLAN → APPLY_PER_SCHEMA → VERIFY → FINALIZE
                                          │                 │
                                          ▼                 ▼
                                       FAILED ──► RETRY ──► (APPLY_PER_SCHEMA)
                                          │
                                          ▼
                                       ROLLBACK (yalnızca onaylı, kısıtlı — §6)
```

| Aşama | Yapılan | Yazım | Çıkış/hata |
|---|---|---|---|
| **DISCOVER** | Registry'den `ACTIVE` satırları listele; `PROVISIONING/FAILED/ARCHIVED` satırları **ayrı raporla** (hedef değil) | Yok | Boş liste → run `NOOP` |
| **VALIDATE_REGISTRY** | Her satır için: `schemaName` `isSafeSchemaIdentifier`; `customerRootTenantId` gerçek bir `ROOT` tenant'a ait ve `ACTIVE`; **fiziksel schema var** (registry↔schema doğrulaması, bugün yok — D1/D2); `schemaName` benzersiz | Yok | Başarısız satır → o schema `BLOCKED` (uygulanmaz), run devam kararı §4 |
| **PLAN** | Her schema için yerel takipteki uygulanmış sürümleri oku (salt-okuma), bekleyenleri ve migration dosyası checksum'larını hesapla | Yok | **Dry-run burada biter** (DDL yok, rapor: schema başına bekleyen migration) |
| **APPLY_PER_SCHEMA** | Schema başına **tek transaction** ve advisory lock altında bekleyenleri sırayla uygula; sonunda yerel takip + kayıt | Schema içi DDL + takip | Hata → o schema `FAILED` (transaction geri alınır) |
| **VERIFY** | Uygulanan sürümün nesnelerini doğrula (`information_schema`), yerel takip = beklenen, checksum eşleşmesi | Yok | Uyuşmazlık → `VERIFY_FAILED` (FAILED kategorisi) |
| **FINALIZE** | Doğrulanan schema için registry `migrationVersion` güncelle (yalnızca VERIFY başarılıysa); run özetini kapat | Registry, ledger | Kısmi başarı ise run `PARTIAL` |
| **FAILED/RETRY/ROLLBACK** | §4–§6 | | |

## 3. Kayıtlar

### 3.1 Schema başına (kalıcı ledger — `public`, control-plane; Q-ID01 ile aynı düzlem ayrımı)
`migrationRunId`, `customerRootTenantId`, `schemaName`, `fromVersion`, `toVersion`, `status`
(`PENDING|BLOCKED|APPLYING|APPLIED|VERIFIED|FAILED|SKIPPED|ROLLED_BACK`), `startedAt`, `finishedAt`, `errorCategory`, `retryable`
(bool), `migrationChecksum` (uygulanan migration dosyalarının birleşik hash'i), `verificationResult` (`PASSED|FAILED|NOT_RUN` + neden kodu),
`attempt` (deneme sayacı), `lastError` (**veri/SQL değeri içermez**; kategori + kısa kod).

### 3.2 Run başına
`migrationRunId` (ortak run ID standardıyla aynı kimlik), `targetVersion`, `mode` (`DRY_RUN|APPLY`), `startedAt/finishedAt`,
`globalStatus` (§4), `schemaCounts` (planlanan/uygulanan/başarısız/atlanan/bloklanan), `initiatedBy` (audit kimliği), `approvalRef`.

Ledger `public`'te olmalı: PLATFORM_ROOT data-plane'i okuyamaz (F5) ama fan-out'u izleyip yönetebilmelidir; ledger **iş verisi içermez**.

## 4. Hata davranışı

| Konu | Standart (öneri) |
|---|---|
| Bir schema başarısız | O schema'nın transaction'ı geri alınır; schema `FAILED` + kategori + `retryable`; yerel takip **değişmez** (kısmi migration görünmez) |
| Diğer schema'lara etkisi | **Kademeli politika (öneri):** ilk `APPLY` run'ında **canary** (tek schema; en düşük riskli) → başarılıysa kalanlar. Canary başarısızsa **run durur** (`HALTED`). Kalanlarda tek bir hata **diğerlerini otomatik durdurmaz** (bağımsız schema'lar), ama `FAILED` oranı eşiği (PO belirler) aşılırsa run `HALTED`. Sayısal eşik **uydurulmadı** |
| Run global status | `SUCCEEDED` (hepsi VERIFIED/SKIPPED) · `PARTIAL` (en az bir FAILED/BLOCKED, diğerleri VERIFIED) · `FAILED` (hiç VERIFIED yok) · `HALTED` (politika ile durduruldu) · `NOOP` · `DRY_RUN_COMPLETE` |
| Retry | Yalnızca `retryable=true` kategoriler (bağlantı/timeout/lock); aynı `migrationRunId`, `attempt++`; **sınırlı deneme** (sayı PO/standart) ve artan bekleme. Non-retryable (`CHECKSUM_MISMATCH`, `SYNTAX/SEMANTIC`, `VERIFY_FAILED`) insan müdahalesi ister |
| Idempotent tekrar | Schema zaten hedef sürümde ve checksum eşit → `SKIPPED` (no-op); checksum farklı → **`CHECKSUM_MISMATCH`** (sessiz uygulama/üzerine yazma yok) |
| Partial apply raporu | Run sonunda schema başına tablo (sürüm, status, kategori, retryable, sonraki adım); **müşteri adı/veri** yok, yalnızca `customerRootTenantId` ve `schemaName` |
| Sürüm kayması | Bazı schema'lar eski sürümde kalırsa, uygulama kodu yeni şekle bağımlıysa o müşterinin data-plane endpoint'leri **fail-closed** olmalı (sürüm geçidi); geçit `resolve()` davranışını değiştirir → **Q-DP01** olarak karar, bu standart onu uygulamaz |
| Eşzamanlılık | Aynı anda **tek fan-out run** (global advisory lock) + schema başına advisory lock; ikinci run `BLOCKED_CONCURRENT` |
| Timeout | Statement/lock timeout'ları açık (sayı karar bekler); zaman aşımı = retryable |

## 5. Yeni müşteri ve sürüm modeli
- Yeni customer-root provisioning (bugün yalnızca boş schema, `0000_empty`) fan-out ile **tutarlı** olmalı: schema oluşturulur, **mevcut tüm data-plane migration'ları** uygulanır, ancak ondan sonra `ACTIVE` (bugün `ACTIVE` boş schema'yla işaretleniyor — sürüm gerisi kalabilir → Q-DP01).
- `DATA_PLANE_SCHEMA_VERSION` sabiti "provisioning'in hedef sürümü" olarak kalırsa fan-out ile senkronize tutulmalı; kaynak gerçek migration günlüğü olmalı (sabit ikinci bir doğruluk kaynağı yaratır).
- `ARCHIVED` schema fan-out hedefi **değildir** ve yeniden aktivasyon fan-out'un işi değildir (D1 → Q-DP03).

## 6. Rollback sınırı
- **Varsayılan: forward-only.** Data-plane migration'ları genişlet/daralt (expand–contract) ile yazılır; geri alma = düzeltici ileri migration veya **yedekten schema-bazlı restore** (`pg_dump -n` deseni; mevcut tüm-DB `backup-db.sh` yeterli değil).
- Down-migration yalnızca önceden **geri döndürülebilir** olarak işaretlenmiş ve veri kaybı olmayan değişiklikler için; `ROLLBACK` aşaması **insan onayı** ister.
- Rollback yalnızca **bu run'ın** uyguladığı ve `APPLIED/VERIFIED` schema'lara etki eder; başka run'ın/diğer müşterilerin sürümüne dokunmaz.
- İş verisi taşıyan migration'da (ör. Vardiya) rollback öncesi **yedek doğrulanmış** olmalı (checkpoint).

## 7. İnsan onay noktaları
1. PLAN raporu (dry-run) onayı **APPLY öncesi**.
2. Canary sonucu sonrası "kalanlara devam" onayı (ilk production run).
3. `HALTED/PARTIAL` sonrası retry veya rollback kararı.
4. Rollback uygulaması (her zaman).
5. Retention/ledger temizliği (payload yok; ledger kalıcı).

## 8. Güvenlik ve gözlem
- Hedef listesi yalnızca registry'den; `schemaName` yalnızca `isSafeSchemaIdentifier` geçince kullanılır; ham DDL'de `quoteIdentifier`.
- Runner yalnızca migration servis kimliğiyle; `isSystemAdmin`/PLATFORM_ROOT kullanıcı erişimi runner yetkisi **değildir** (yeni yetki icat edilmedi; tetikleyici/yetki Q-DP02).
- Audit: her run ve schema durum değişimi `PlatformAuditService` ile (`entityType` örn. `DATA_PLANE_MIGRATION_RUN`; `metadata`: run ID, `schemaName`, sürüm, status, kategori — **veri, SQL değeri, secret yok**).
- Gözlem: schema başına süre, başarısız sayısı, `FAILED` registry yaşı (D2 izleme boşluğu), sürüm dağılımı (registry `migrationVersion` histogramı).

## 9. Test planı (uygulanmadı)
Saf/in-memory fake runner + fake registry ile: (1) registry boş, (2) `ACTIVE` değil satırlar hedeflenmez, (3) geçersiz `schemaName` → BLOCKED, (4) tek schema başarısız → diğerleri etkilenmez/`PARTIAL`, (5) çoklu başarısız → eşik/`HALTED`,
(6) retry yalnızca retryable, (7) idempotent tekrar `SKIPPED`, (8) checksum değişimi → `CHECKSUM_MISMATCH`, (9) VERIFY başarısız → registry sürümü güncellenmez, (10) eşzamanlı ikinci run engellenir.
Gerçek PG entegrasyonu (cross-customer erişim, gerçek transaction geri alma) ayrı harness task'ı.

## 10. Bu standardın açtığı sorular (yeni, append-only)
Q-DP01 sürüm geçidi + provisioning-sürüm tutarlılığı · Q-DP02 fan-out tetikleyici/yetki (pipeline adımı/yönetici CLI/başlangıç) · Q-DP03 `ARCHIVED` yeniden aktivasyon
kusurunun (D1) sahibi/düzeltmesi · Q-DP04 `FAILED` registry için otomatik retry sahibi (D2) · Q-DP05 müşteri-başına DB rolü/RLS sertleştirmesi (H1/H2) ·
Q-DP06 DEC-0010 metin güncellemesi (D5) ve Phase 5-9 kapsam tanımı (D6) · Q-DP07 `drizzle.config` varsayılan bağlantı bilgisi (D7). Tümü **açık**, AI1/PO kararı bekliyor.

## 11. Teyit
Kod, tablo, migration, gerçek DB bağlantısı yok; kavramsal standart. Hiçbir soru kapatılmadı.

---

## Uygulama Notu (TASK-027.32, 2026-09-21)
Bu standardın **tek-customer-root** çekirdeği `apps/api/src/data-plane/` altında port-tabanlı saf sözleşme olarak var (DRY_RUN/APPLY, root başına advisory lock, ledger idempotency, checksum, kilit altında yeniden kabul, fail-closed kapılar); ayrıntı `METNEX_DATA_PLANE_FOUNDATION_CONTRACT.md`.
**Fan-out (çok müşterili), canary, eşikler, gerçek portlar, tetikleyici ve ledger/registry implementasyonu uygulanmadı**; bu standart o kısımlar için geçerliliğini korur.
