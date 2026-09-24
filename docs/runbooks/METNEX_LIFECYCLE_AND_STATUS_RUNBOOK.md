# Project Lifecycle and Status Runbook

## 1. Amaç ve Kapsam

`REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` süreci Discovery → onaylı SRS
aşamasında biter. Bu runbook, onaylı SRS'den başlayarak projenin **sürekli
geliştirme (continuous development)** evresine geçişine ve o evredeki
operasyona kadar olan tüm yaşam döngüsünü tanımlar.

İkinci ve asıl amaç: bu projenin (repo) durumunu **AI kullanmadan, yalnızca
repodaki dokümanları okuyarak** anlamak isteyen dış araçlar (ör. OpenDevConnect
/ ODC) için **makine tarafından okunabilir bir durum katmanı** tanımlamaktır.
Bu nedenle bu runbook'ta tanımlanan dosya/alan adları keyfi değildir; ODC'nin
repo okuma sözleşmesiyle (`ODC.md` contract) birebir eşleşecek şekilde
seçilmiştir. Bu runbook'u uygulamayan bir proje, ODC tarafından "Contract
Missing" veya eksik/yanlış durumda raporlanır.

Standartlaştırılan yaşam döngüsü:

```text
(Discovery → SRS onayı)   [bkz. REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md]
  → ODC.md contract oluşturma
  → Mimari kararlar (DEC-xxxx)
  → Backlog üretimi (EPIC/Feature/Story/Task)
  → METNEX_STATE.md ilk yayını (stage: backlog)
  → Geliştirme döngüsü (stage: development)
      - task seçilir → status: in_progress
      - iş biter → status: review
      - onaylanır → status: done
      - METNEX_STATE.md + PROGRESS_LOG.md her oturumda güncellenir
  → İlk sürüm / release (stage: released)
  → Sürekli geliştirme (stage: continuous)
```

---

## 2. Evreler (Lifecycle Stages)

Her evre `METNEX_STATE.md` içindeki `stage` alanının alabileceği bir
değerdir. Enum sabittir, serbest metin değildir.

| stage | Anlamı | Giriş Kriteri | Çıkış Kriteri | Zorunlu Artefakt |
|---|---|---|---|---|
| `discovery` | İhtiyaç toplama sürüyor | Proje başlatıldı | Discovery dokümanı tamam | `DISCOVERY_*.md` |
| `srs` | SRS yazılıyor/gözden geçiriliyor | Discovery tamam | SRS onaylandı (Durum: Onaylı) | `docs/SRS.md`, Durum alanı |
| `architecture` | Temel mimari kararlar alınıyor | SRS onaylı | Kritik DEC'ler Accepted | `docs/decisions/DEC-*.md` |
| `backlog` | Epic/Feature/Story/Task üretiliyor | Mimari iskelet var | İlk EPIC seti `ready` durumunda | `backlog/EPIC-*.md`, `ODC.md` |
| `development` | Aktif geliştirme | En az 1 EPIC `in_progress` | — (bu evre sürekli tekrar eder) | `METNEX_STATE.md`, `PROGRESS_LOG.md` |
| `released` | İlk üretim sürümü çıktı | MVP kabul kriterleri karşılandı | — | CHANGELOG etiketi |
| `continuous` | Sürekli geliştirme/bakım | Release sonrası, backlog akışı sürüyor | — (terminal durum) | aynı yukarıdakiler, düzenli güncel |

`stage` yalnızca ileri gider; geri düşüş (ör. `development` → `srs`) yeni bir
DEC ile gerekçelendirilmeli ve `PROGRESS_LOG.md`'e not düşülmelidir.

---

## 3. `ODC.md` — Repo Kökü Contract Dosyası

Bu dosya, dış araçların (ODC gibi) repoyu AI kullanmadan yorumlayabilmesi
için gereken sözleşmedir (bkz. opendevcon EPIC-008, FR-210/FR-211).

`ODC.md` repo kökünde bulunur ve `project.name`/`project.slug` alanları
Metnex kimliğiyle doldurulmuştur (bkz. `PRODUCT_OWNER_LIFECYCLE_PLAYBOOK.md`
Faz 0). `development` evresine geçmeden önce (Faz 3 — Mimari Kararlar) PO
yalnızca içeriği doğrular; `project.description` alanı Discovery/SRS
netleştikçe elle güncellenir.

Zorunlu alanlar:

```yaml
contract-version: "1.0"
project:
  name:
  description:
documentation:
  srs: docs/requirements/SRS.md   # bkz. REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md §13; proje gerçek yoluna göre değiştirilir
  decisions: docs/decisions/
  backlog: backlog/
  runbooks: docs/runbooks/
  state: docs/opendevcon/METNEX_STATE.md
  progress_log: docs/opendevcon/PROGRESS_LOG.md
task_format: epic-markdown-frontmatter
task_status_model:
  values: [backlog, ready, in_progress, review, blocked, done]
project_stage_model:
  field: stage
  values: [discovery, srs, architecture, backlog, development, released, continuous]
  order: forward-only
agents:
  - role: SRS Generation Assistant   # AI0
  - role: Product Governance Agent   # AI1
  - role: Engineering Executor       # AI2
```

`ODC.md` yoksa proje "Repository Connected / ODC Contract Missing" olarak
görünür — geliştirme başlamadan önce bu dosyanın var olması zorunludur.

---

## 4. Backlog Durum Modeli (Zorunlu Frontmatter)

`backlog/EPIC-*.md` (ve varsa Feature/Story/Task) dosyalarındaki `status`
alanı yalnızca şu değerleri alabilir:

`backlog` → `ready` → `in_progress` → `review` → `blocked` | `done`

- Bu enum `ODC.md`'deki `task_status_model.values` ile birebir aynı olmalı.
- Bir agent bir task'ı bitirdiğinde task dosyasındaki `status` alanını
  güncellemeden görevi "tamamlandı" sayamaz. Bu, `QUALITY_GATES.md`'e ek
  zorunlu kapı olarak eklenmelidir (bkz. §6).
- `review` durumu, insan onayı bekleyen AI-executed işleri işaretler
  (opendevcon "Human Attention" metriği bunu okur).
- Her EPIC/Feature/Task dosyasının frontmatter'ında `srs_refs` alanı
  bulunmalı ve `REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` §10'daki
  izlenebilirlik zincirine (F-xxx → FEAT-xxx → FR-xxx → BR-xxx → AC-xxx →
  TC-xxx) atıf yapmalıdır. Bu, backlog'un SRS'den kopmasını engeller.

---

## 5. `docs/opendevcon/METNEX_STATE.md` — Tek Kaynak Durum Dosyası

`docs/opendevcon/` klasöründe, her zaman güncel, tek ve küçük bir dosya
(bkz. `docs/opendevcon/README.md`):

```yaml
---
stage: development
updated_at: 2026-09-09
updated_by: Engineering Executor
active_epics: [EPIC-003, EPIC-007]
blocked_epics: []
last_release: null
notes: >
  Kısa, insan diliyle 1-2 cümlelik özet.
---
```

Bu dosya, opendevcon gibi araçların tüm backlog'u tarayıp progress
hesaplamasına gerek kalmadan projenin "şu an ne durumda" olduğunu tek
istekte anlamasını sağlar. `backlog/EPIC-*.md` dosyaları detay/kanıt
kaynağıdır; `METNEX_STATE.md` özet/işaret kaynağıdır — ikisi çelişirse
EPIC dosyaları esas alınır, `METNEX_STATE.md` hatalı sayılır ve düzeltilir.

---

## 6. `docs/opendevcon/PROGRESS_LOG.md` — Append-Only İlerleme İzi

Her agent oturumu sonunda tek satır/blok eklenir, önceki kayıtlar
**asla değiştirilmez veya silinmez**:

```markdown
## 2026-09-09 — Engineering Executor
- EPIC-007 (github-connection): FR-140 implement edildi, status: review.
- Dokunulan dosyalar: apps/api/src/github/*, backlog/EPIC-007-github-connection.md
- Bir sonraki adım: insan onayı bekleniyor.
```

Amaç: git log'dan bağımsız, "neden" ve "hangi karar altında" bilgisini
taşıyan, AI hallucination riskine karşı izlenebilir bir kayıt.

---

## 7. Agent Zorunluluğu (AGENT_BOOTSTRAP.md ile bağlantı)

`AGENT_BOOTSTRAP.md` — Step 3 (Follow Role Behavior) altına şu kural
eklenmelidir:

> Bir görev "tamamlandı" olarak raporlanmadan önce agent şunları yapmak
> zorundadır:
> 1. İlgili `backlog/EPIC-*.md` dosyasının `status` alanını güncelle.
> 2. `docs/opendevcon/METNEX_STATE.md`'i güncelle (`stage`, `active_epics`, `updated_at`).
> 3. `docs/opendevcon/PROGRESS_LOG.md`'e bir kayıt ekle.
>
> Bu üç adım atlanırsa görev tamamlanmış sayılmaz — `QUALITY_GATES.md`
> ihlali olarak değerlendirilir.

---

## 8. Bu Runbook'un opendevcon Tarafında Karşılığı

| Bu runbook'taki artefakt | opendevcon epic/FR |
|---|---|
| `ODC.md` | EPIC-008, FR-210/FR-211 |
| EPIC frontmatter `status` | EPIC-009 (parse), EPIC-010 FR-230/FR-231 |
| `docs/SRS.md`, decisions, runbooks | EPIC-011 (Documentation Status — varlık kontrolü) |
| `docs/opendevcon/METNEX_STATE.md`, `docs/opendevcon/PROGRESS_LOG.md` | EPIC-010, EPIC-013 (Portfolio Dashboard) girdisi |

Bu tablo, iki repo (metnex ve opendevcon) arasında sözleşme
değiştiğinde ilk kontrol edilecek yer olarak kullanılmalıdır.
