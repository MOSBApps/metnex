---
id: TASK-028.1
title: Metnex — kalan AI Skeleton atıflarının, tanımlarının ve fork-generator'ın temizliği
status: done
srs_refs: []
parent_epic: EPIC-003
updated_at: 2026-09-22
---

## Amaç

TASK-024.1 → 024.5 ile teknik/runtime kimlik (kod, DB, Docker, cookie/localStorage,
Java package, npm scope) zaten Metnex'e taşınmıştı. Bu task, o programın kapsamına
girmeyen ama Product Owner'ın gördüğü kalan iki kategoriyi kapatır:

1. Kendini hâlâ jenerik bir "AI Skeleton" olarak tanımlayan/tarifleyen aktif
   dokümantasyon (README.md, ODC.md, docs/README.md ve bağlı runbook'lar).
2. `docs/rename/METNEX_HISTORICAL_REFERENCE_POLICY.md` §7'de AI1 kararı bekleyen
   açık soru: `scripts/create-project.sh`/`.ps1` fork-generator script'lerinin akıbeti.

## Product Owner kararı

Generator script'i (`scripts/create-project.sh`/`.ps1`) **tamamen kaldırıldı**.
Gerekçe: Metnex artık kendi git geçmişi ve remote'u olan somut bir ürün; bu repo'yu
başka bir projeye fork etmek için bir mekanizma tutmaya gerek yok.

## Yapılanlar

### 1. Generator script'lerinin kaldırılması
- `scripts/create-project.sh`, `scripts/create-project.ps1` silindi.
- Bu script'lere aktif referans veren dokümanlar güncellendi (generator artık yok,
  yeni kurulum elle yapılır): `README.md`, `docs/README.md`,
  `docs/runbooks/PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md` (Faz 0 bölümü ve checklist),
  `docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md`,
  `docs/runbooks/local-development.md` (script uyumluluk matrisi satırı),
  `docs/project/METNEX_SCOPE.json`.
- `docs/rename/*`, `docs/migration/*`, `backlog/TASK-024-*`, `PROGRESS_LOG.md` içindeki
  geçmiş referanslar **değiştirilmedi** (tarihi kayıt / append-only kuralı).

### 2. README.md yeniden yazıldı
- Başlık "# AI Skeleton" → "# Metnex"; genel "reusable skeleton" tanımı kaldırıldı.
- Sabit/kişisel path'ler (`/Users/dogan/Documents/Projects/ownprojects/metnex`)
  kaldırıldı; jenerik `cd /path/to/metnex` ile değiştirildi.
- Fork/generator ile ilgili tüm örnek komutlar kaldırıldı.

### 3. ODC.md temizliği
- `documentation.project-plan/scope/delivery/traceability/execution` alanları,
  gerçekte var olmayan eski dosya adlarından (`PROJECT_PLAN.json` vb.) gerçek
  dosya adlarına (`METNEX_PLAN.json` vb., TASK-024.2'de zaten rename edilmişti)
  düzeltildi — kırık path'ler.
- `product-baseline` alanı ve "Product Baseline SRS" bölümü kaldırıldı:
  `docs/product/PRODUCT_BASELINE_SRS.md` bu repoda hiç var olmadı.
- "Dogfooding note" bölümü tamamen kaldırıldı: bu repo OpenDevConnect'in kendi
  kök kontratı değil, Metnex'in ODC kontratı; iki rolü aynı anda taşıma iddiası
  yanlıştı ve `docs/SRS.md`, `docs/product/roadmap/`, `docs/odc/` gibi bu
  repoda hiç var olmayan dosyalara atıfta bulunuyordu.
- "Remote contract sync" bölümü, var olmayan `scripts/odc-sync.sh` ve
  `docs/odc/*` dosyalarına referans veriyordu; bölüm, `remote-contract:`
  bloğunun **beyan edilmiş ama henüz uygulanmamış** bir sözleşme olduğunu
  açıkça belirtecek şekilde yeniden yazıldı.
- `scripts/check-project-records.mjs` / `docs/runbooks/PROJECT_RECORDS_MAINTENANCE_RUNBOOK.md`
  referansı kaldırıldı (bu repoda hiç var olmadı).
- `project.description` alanındaki "iskelet" ifadesi kaldırıldı.

### 4. Kırık dosya-adı referanslarının düzeltilmesi (TASK-024.2'nin kalıntısı)
`docs/opendevcon/PROJECT_STATE.md` ve `docs/runbooks/PROJECT_LIFECYCLE_AND_STATUS_RUNBOOK.md`
(TASK-024.2'de gerçek dosyalar `METNEX_STATE.md`/`METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md`
olarak rename edilmişti, ama şu dosyalardaki çapraz referanslar eski adı kullanmaya
devam ediyordu — kırık link): `docs/README.md`, `docs/AI_Governance/QUALITY_GATES.md`,
`docs/opendevcon/README.md`, `docs/runbooks/PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md`,
`docs/runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md` (kendi içi), `docs/AI_Governance/AGENT_BOOTSTRAP.md`,
`docs/opendevcon/METNEX_STATE.md`. `docs/opendevcon/PROGRESS_LOG.md`'deki geçmiş
girdiler append-only kuralı gereği dokunulmadı.

### 5. Taramanın kaçırdığı gerçek kalıntılar
- `apps/web/src/app/(platform)/system/roles/page.tsx`: canlı kullanıcı arayüzü
  metninde `openmas`/`aiskeleton` regex'inin yakalamadığı `"openbm"` marka
  kalıntısı bulundu ve kaldırıldı — bu, uygulamayı kullanan gerçek bir kullanıcıya
  görünen bir string'di.
- "Open Mas" (araya boşluklu, önceki taramaların `openmas` regex'iyle
  yakalayamadığı biçim) — `docs/README.md`, `docs/domain/DB-METADATA-TEMPLATE.md`,
  `docs/backlog/{FEATURE_RELEASE_PLAN,AI_MODULE_BACKLOG,ARCHITECTURE_BACKLOG,DEPENDENCY_MAP}_TEMPLATE.md`,
  `docs/runbooks/db-recreate-with-icu.md` başlıklarında/örnek metinlerinde
  Metnex'e çevrildi.
- `docs/runbooks/local-development.md`: "Bu skeleton repo icin varsayilan
  baslangic 6500'dur" satırı hem yanlış port (gerçek `.project-defaults` değeri
  `7500`) hem de artık geçersiz "skeleton" çerçevesi taşıyordu — düzeltildi.

## Bilinçli dokunulmayanlar (kapsam dışı, gerekçeli)

| Kalem | Gerekçe |
|---|---|
| `infra/docker/docker-compose.dev.yml` — `openmas_postgres_data`/`openmas_redis_data`/`openmas_minio_data` volume adları | TASK-024.5/026.2'de belgelendiği gibi gerçek veri bu volume'lerde duruyor; `external: true` referans adını değiştirmek fiziksel veri taşıma gerektirir, yıkıcı işlem onayı bu task'ın kapsamında istenmedi |
| `docs/ui-contract/**`, `docs/decisions/DEC-0001/0006/0010/0011/0012` içindeki jenerik "skeleton" kelimesi | Bu belgelerde "skeleton" kırık bir referans değil, "bu kod tabanı" anlamında genel bir terim olarak kullanılıyor; kapsamlı bir kelime-değişikliği ayrı, daha büyük bir dokümantasyon task'ı gerektirir |
| `backlog/TASK-024-*`, `docs/rename/*`, `docs/migration/*`, `docs/opendevcon/PROGRESS_LOG.md` geçmiş girdileri, `backup/openmas-pre-metnex-migration-*.dump` | Tarihi kayıt / append-only — AI1'in önceki onaylı politikası (`METNEX_HISTORICAL_REFERENCE_POLICY.md`) gereği değiştirilmez |

## Doğrulama

- `rg -c -i 'openmas|aiskeleton' --hidden -g '!node_modules' -g '!.git' .` → yalnızca
  yukarıdaki bilinçli istisna kategorileri kaldı (tarihi kayıtlar + korunan volume adları).
- `grep -rn "Open Mas" .` (node_modules hariç) → yalnızca tarihi kayıtlarda (`PROGRESS_LOG.md`
  geçmiş girdileri, `TASK-024-5`) kaldı.
- `grep -rln "create-project"` → yalnızca tarihi/migration-audit dosyalarında kaldı.
- `./scripts/check.sh --skip-docker` → sonuç bu task'ın teslim raporunda.

## Kalite kapısı kanıtı

`./scripts/check.sh --skip-docker`:
- `pnpm audit --audit-level=high` → PASS (33 mevcut low/moderate bulgu, high/critical yok, bu
  task'tan bağımsız, önceden var)
- `pnpm run typecheck` → PASS (api + @metnex/web)
- `pnpm run lint` → **FAIL** — `apps/web`'in `next lint` adımı, önceden var olan
  `eslint-plugin-react-hooks` çözümleme sorunuyla durdu (pnpm isolated node-linker,
  `apps/web` içinden plugin'i bulamıyor; bkz. `backlog/TASK-027-36-*.md` içindeki not). Bu
  task'ın kapsamında değil, bu task'ın değişiklikleri turbo cache'i düşürdüğü için görünür
  oldu. `pnpm --filter api exec eslint "src/**/*.ts"` ayrıca çalıştırıldı → temiz (0 hata).

`check.sh` lint adımında durduğu için kalan adımlar elle doğrulandı:
- `pnpm --filter api exec jest --runInBand` → **53 suite / 1501 test PASS**
- `pnpm --filter web run test` (vitest) → **8 dosya / 117 test PASS**
- `pnpm run build` → **api + @metnex/web PASS** (Next.js build'in kendi iç ESLint uyarısı
  build'i düşürmedi, statik/dinamik 24 route başarıyla üretildi)

Git commit/push yapılmadı; kullanıcı onayıyla ayrıca yapılacak.
