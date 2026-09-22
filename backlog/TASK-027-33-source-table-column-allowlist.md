---
id: TASK-027.33
title: Data-Plane Port, Ledger ve Migration Kaynağı Karar Paketi
status: done
srs_refs: [FEAT-008]
parent_epic: EPIC-004
updated_at: 2026-09-21
---

> **Başlık/kapsam notu:** Bu ID, orijinal batch'ten "Source table column allowlist" (Wave 5, SCADA/DMS) placeholder'ıydı. AI1'in talimatıyla kapsam **data-plane port, ledger ve migration kaynağı karar paketi** olarak yeniden tanımlandı;
> **SCADA/DMS kaynak tablo-kolon allowlist'i bu task'ta yapılmadı** (Wave 5). Orijinal placeholder en altta tarihi kayıt olarak korunmuştur. Talimatta backlog dosya adı verilmemişti; aynı ID'nin mevcut dosyası güncellendi.

## AI2 Teslim Raporu (2026-09-21)

**Karar paketi — production kodu, veritabanı, ledger/migration/schema, advisory lock kodu, probe implementasyonu, executor, fan-out job/CLI, Docker, Git history değiştirilmedi. Kapatılan soru yok.**

Ana teslimat: `docs/migration/METNEX_DATA_PLANE_PORT_AND_LEDGER_DECISION_PACKAGE.md` (12 konu; her biri için Soru ID, mevcut kanıt, seçenekler, güvenlik/izolasyon/operasyon etkisi, geri dönüş maliyeti, AI2 önerisi, **boş AI1/PO KARARI**, karar sonrası implementation task'ı).
Ek: `METNEX_DATA_PLANE_READINESS_BLOCKER.md` (güncelleme), `BOTC_MIGRATION_OPEN_QUESTIONS.md` (append-only).

### Karar konuları → tablo eşlemesi
T1 registry portu · T2 fiziksel probe · T3 advisory lock/granülarite · T4 ledger yeri · T5 retention/PII · T6 executor transaction · T7 migration kaynağı · T8 checksum politikası · T9 VERIFY · T10 UUID · T11 fan-out (Q-DP02 data-plane) · T12 control/data-plane DB kimlikleri.

### Kod/belge kanıtıyla bulunan yeni bulgular
- **E1 (en önemli):** mevcut sözleşmede DDL / ledger / registry-CAS **üç ayrı commit**; DDL commit'inden sonra çökme "aynı DDL'i yeniden çalıştırma" penceresi bırakır; yedekten geri yükleme `public` ledger'ı ile schema'yı ayrıştırır. Ledger yeri (T4) ve transaction sınırı (T6) **birlikte** karara bağlanmalı.
- **E2:** drizzle migrator hash'i normalizasyonsuz `sha256(dosya)`; repoda `.gitattributes` yok → CRLF/LF sahte checksum uyuşmazlığı.
- **E3:** `infra/docker/init-db.sql` eski şablon schema'ları (`platform`, `shared`, `customer_root`) oluşturuyor; `cust_*` biçimine uymuyor, amaçları `[DOĞRULANAMADI]`.
- **E4–E9:** control-plane kilidi `hashtext` 32-bit oturum kilidi; `DbService` tek uygulama havuzu (migration kimliğiyle port için ayrı havuz gerekir); Dockerfile `drizzle/` klasörünü bütün kopyaladığından `drizzle/data-plane/` ek değişiklik olmadan image'a girer; tenant id'leri `generateId()` UUID (gerçek DB satırları `[DOĞRULANAMADI]`);
  dev PG 16 (prod sürümü ve pooler `[DOĞRULANAMADI]`); schema oluşturma bugün uygulama kimliğiyle (sahiplik çıkarımı `[DOĞRULANAMADI]`).

### Q-ID01 ilişkisi ve fan-out etkisi
"Ledger" dört ayrı kayıt sınıfına ayrıştırıldı (1 uygulanmış-migration takibi, 2 run ledger, 3 identity staging, 4 Vardiya payload staging/legacy ledger); paket yalnızca 1–2'yi karara sunar, **3–4 (Q-ID01) kapatılmadı ve etkilenmedi**.
Fan-out: sürücü ayrı bileşen (registry'den keşif → her root için runner'ı açık root ile çağırır); bugün data-plane migration'ı olmadığından ilk migration ile birlikte planlanmalı; sayısal parametreler **PO kararı gerekli**.

### VERIFY'ın sözleşmeye etkisi (kabul kriteri 6)
V3 seçilirse: yeni `verifier` portu, `FAILED/VERIFY_FAILED` sonucu, sıra `executor(DDL+takip) → verifier → registry CAS`, yeniden çalıştırmada yalnızca verifier+CAS; DRY_RUN etkilenmez; yeni testler. V1'de sözleşme değişmez; V2 yalnızca executor beklentisini genişletir (paket §4). Sözleşme **şimdi değiştirilmedi**.

### AI2 önerileri (karar AI1/PO'da — alanlar boş)
T1 migration kimliğiyle ince registry repository (koşullu tek UPDATE, status yazımı yok) · T2 `pg_namespace` parametreli probe, yalnızca runner/tanı · T3 root başına oturum kilidi + fan-out global kilidi, iki-int anahtar · **T4 bölünmüş ledger: uygulanmış-takip customer schema'da (DDL ile aynı tx), run ledger public** ·
T5 sabit alan allowlist'i, serbest metin yok, takip kalıcı, run ledger süresi PO · T6 migration başına tek transaction · **T7 `apps/api/drizzle/data-plane/*.sql` + tek yer tutucu** · **T8 LF-normalize sha256 + manifest testi + `.gitattributes`, değişmezlik** · T9 ayrı salt-okuma VERIFY · T10 katı UUID + salt-okuma preflight · T11 ayrı pipeline işi + acil CLI, sıralı v1, ilk migration ile · T12 üç kimlik hedef (iki kimlik ara), env adı önerileri.

### Açık kalan blocker listesi
1) Ledger yeri (T4) kararı ledger/executor implementasyonunu engeller; 2) migration kaynağı + checksum (T7/T8) gerçek migration dosyasını engeller; 3) kimlik ayrımı + schema sahipliği/provizyon (T12, Q-DP05, **yeni Q-DP13**); 4) pooler/PG sürümü/eski schema'lar teyidi (**yeni Q-DP14**, `[DOĞRULANAMADI]`);
5) UUID preflight hedef DB erişimi ister; 6) ilk data-plane migration'ı yok; 7) gerçek PostgreSQL harness ve port implementasyonları ayrı task; 8) Q-DP01/03/04/05/09, Q-ID01 açık.
**Yeni sorular:** Q-DP13, Q-DP14. **Q-DP11 (alt kararlar a–g) ve Q-DP12 (a–c):** AI1/PO kararı bekliyor.

**Yapılmayanlar:** gerçek PostgreSQL bağlantısı, probe implementasyonu, ledger tablosu/migration/schema, advisory lock kodu, gerçek executor, fan-out job/CLI, Vardiya schema/table/repository/API/UI, tenant seed/oluşturma, DB role/RLS, Docker build/run, Wave 2/3, git commit/push. Yeni tenant/schema/tablo/permission/migration uydurulmadı.
**Doğrulama:** `./scripts/check.sh --skip-docker` PASS (40 suite / 600 test; kod değişmedi, yalnızca dokümantasyon).

### Durum
`status: done` — karar paketi AI1 tarafından teslimat olarak onaylandı.

## AI1 Onayı (2026-09-21)

TASK-027.33 karar paketi kabul edildi ve `done` olarak kapatıldı. T1–T12
karşılaştırmaları, E1–E9 kanıtları, Q-ID01 ayrımı, VERIFY etkisi ve gerçek
implementation öncesi blocker listesi yeterli bulundu.

Bu onay herhangi bir teknik seçeneği karara bağlamaz. AI2/PO karar alanları boş
kalır; Q-DP01, Q-DP02 data-plane ayrıntıları, Q-DP03, Q-DP04, Q-DP05, Q-DP09,
Q-DP11, Q-DP12, Q-DP13, Q-DP14 ve Q-ID01 açık kalır. Ledger, migration,
port, probe, executor, fan-out, Vardiya ve gerçek PostgreSQL implementation'ı
bu task kapsamında yapılmamıştır.

---

# TASK-027.33: Source table column allowlist

## Amaç

Database/schema/table/column allowlist doğrulamasını uygula.

## Wave ve bağımlılık

TASK-027.31; TASK-027.32

## Kapsam kuralları

- Discovery ve SRS tenant, permission ve Metnex kararlarına uy.
- Mevcut modül sınırlarını koru; yeni framework oluşturma.
- Tenant scope, audit, güvenlik ve idempotency etkilerini ele al.
- Wave 2 Bakım/Arıza ve Wave 3 DÖF kapsam dışıdır.

## Kabul kriterleri

- Amaç ve bağımlılıklar kanıtla karşılanmış olmalı.
- Tenant/permission/security etkileri test veya dokümanla doğrulanmalı.
- Hata, empty state, audit ve tekrar çalıştırma davranışı tanımlı olmalı.
- İlgili domain/runbook/decision dokümanları güncellenmeli.
- ./scripts/check.sh --skip-docker sonucu raporlanmalı.
- Gerçek secret, parola veya connection string rapora yazılmamalı.
- Git commit/push yapılmamalı.

## Teslim

Değişen dosyalar, migration etkileri, test kanıtları, kalan riskler ve sonraki
bağımlılık raporlanmalı. Teslim sonunda status review, METNEX_STATE.md ve
append-only PROGRESS_LOG.md güncel olmalıdır.
