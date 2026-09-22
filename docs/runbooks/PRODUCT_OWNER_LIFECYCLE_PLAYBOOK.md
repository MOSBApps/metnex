# Product Owner / Chief Engineer Lifecycle Playbook

## 0. Bu Doküman Ne İçin Var

Diğer runbook'lar **süreç ve format** tanımlar:

- `REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` — Discovery ve SRS üretiminin
  kuralları.
- `PROJECT_LIFECYCLE_AND_STATUS_RUNBOOK.md` — SRS sonrası evreler ve
  makine tarafından okunabilir durum kontratı.

Bu doküman ise **insan tarafının** (Product Owner / Chief Engineer — kim
projeyi yürütüyorsa) baştan sona **hangi sırayla, hangi eylemi** yapacağını
anlatan operasyonel checklist'tir. Yeni bir proje metnex'dan türetildiğinde
bu dosya baştan sona takip edilir.

Rol kısaltmaları:

| Kısaltma | Rol |
|---|---|
| **PO** | Product Owner / Chief Engineer (insan) |
| **AI0** | SRS üretim asistanı |
| **AI1** | Product Governance Agent |
| **AI2** | Engineering Executor |

---

## Faz 0 — Proje Kurulumu (Otomatik: `scripts/create-project.sh`)

Bu faz elle yapılmaz; `scripts/create-project.sh` (Windows: `create-project.ps1`)
çalıştırılır:

```bash
./scripts/create-project.sh --name "Proje Adı" --slug proje-slug \
  --app-language tr-TR --db-collation tr-x-icu --db-locale-provider icu \
  --port-base 7500
```

Script otomatik olarak halleder:

- Skeleton'ı `--out` hedefine kopyalar (git/node_modules/dist hariç).
- `Open Mas`, `metnex`, `tr-TR`,
  `tr-x-icu`, `icu` placeholder'larını tüm
  dosyalarda (root `ODC.md` dahil) doldurur.
- Dosya/klasör adlarındaki `metnex`/`PROJECT` kalıplarını slug ile
  değiştirir.
- `.project-defaults` içindeki `DEV_PORT_BASE`'i ayarlar.

**Script bitince PO'nun elle yapması gerekenler (script bunları yapmaz):**

1. `git init && pnpm install` (script son çıktısında hatırlatır).
2. Repo kökündeki **`ODC.md`**'yi aç, placeholder'ların doğru dolduğunu
   doğrula (`project.description` alanı hâlâ `TBD` — Faz 1 sonunda
   doldurulacak).
3. `docs/domain/DB-METADATA-TEMPLATE.md`'yi kopyalayıp `docs/domain/DB_META.md`
   olarak, script'e verdiğin `--db-collation`/`--db-locale-provider`
   değerleriyle doldur. **Script bunu otomatik yapmaz** — `DB_META.md`
   boş/eksik kalması `DEC-0006` gereği **blocker**'dır.
4. `docs/opendevcon/PROJECT_STATE.md` içinde `stage: discovery` olduğunu
   doğrula (varsayılan zaten budur, elle değişiklik gerekmez).

---

## Faz 1 — Discovery (Müşteri Görüşmesi)

1. `docs/runbooks/DISCOVERY_TEMPLATE.md` dosyasını **kopyala**, değiştirme.
   Hedef: `docs/requirements/DISCOVERY.md` (bkz. runbook §3).
2. Gerekirse `docs/runbooks/DISCOVERY_EXAMPLE.md`'ye bakarak beklenen detay
   seviyesini gör (kopyalama, sadece referans).
3. Müşteri görüşmesini yap, `docs/requirements/DISCOVERY.md` dosyasını
   doldur. Kurallar (`REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` §4):
   - Müşterinin söylemediğini ekleme.
   - Belirsizi `Q-xxx` açık soru yap.
   - Feature'lar `F-xxx`, kararlar `D-xxx`, açık sorular `Q-xxx` ID'li.
4. Discovery **yaşayan dokümandır** — yeni görüşmede aynı dosya güncellenir,
   ID'ler yeniden kullanılmaz, eski karar/talep silinmez (runbook §5).
5. SRS'ye geçmeden önce **Discovery Tamamlanma Kontrolü** çalıştır
   (runbook §6 — amaç, kapsam, paydaşlar, feature'lar, açık sorular vb.).
   Tüm sorular cevaplı olmak zorunda değil; cevapsızlar açıkça görünür
   olmalı.

**Çıkış kriteri:** Discovery kontrol listesi gözden geçirildi, kritik
alanlar dolu veya bilinçli olarak açık soru işaretli.

---

## Faz 2 — SRS Üretimi (AI0)

1. AI0'a şu iki dosyayı ver:
   - `docs/requirements/DISCOVERY.md` (doldurulmuş)
   - `docs/runbooks/SRS_TEMPLATE.md` (hedef şablon)
2. `REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` §8'deki **örnek prompt**'u
   kullan (gerekirse iyileştir, anlamını koru).
3. AI0 kuralları (runbook §7): müşteri belirtmediyse uydurma, eksikler
   `TBD` + açık soru, çelişkiler otomatik çözülmez, her FR/BR benzersiz ID,
   teknik öneriler "Önerilen Teknik Karar" olarak ayrı işaretlenir, MVP ile
   sonraki fazlar ayrılır.
4. AI0 çıktısını `docs/requirements/SRS.md` olarak kaydet. Doküman
   başındaki **Durum** alanı `Taslak` olarak başlar.
5. **İnsan (PO) gözden geçirmesi** — runbook §9'daki kontrol listesini
   uygula (uydurma gereksinim var mı, Discovery feature'ları karşılanmış
   mı, açık sorular doğru taşınmış mı, kabul kriterleri test edilebilir
   mi, vb.).
6. Kontrol tamamlandığında `docs/requirements/SRS.md` **Durum: Onaylı**
   yap. Onaysız SRS geliştirme kaynağı olarak kullanılamaz.
7. `docs/opendevcon/PROJECT_STATE.md` içinde `stage: srs` → geçiş notunu
   ekle, `updated_at`/`updated_by` doldur.

**Çıkış kriteri:** SRS Durum = Onaylı.

---

## Faz 3 — Mimari Kararlar

1. SRS'deki "Önerilen Teknik Karar" maddelerini gözden geçir; kabul
   edilenler için `docs/decisions/DEC-NNNN-*.md` oluştur (şablon:
   `DEC-0000-template.md`).
2. Kritik gate: DB locale/collation kararı (`DEC-0006`) proje bazında
   kayıtlı mı — `docs/domain/DB_META.md` boşsa **blocker**.
3. `ARCHITECTURE_RULES.md` ile çelişen bir karar varsa önce onu güncelle
   veya kararı reddet.
4. Repo kökündeki `ODC.md`'yi doğrula — Faz 0'da `create-project.sh`
   tarafından zaten oluşturuldu/dolduruldu. Burada yalnızca
   `project.description` alanını (Discovery/SRS artık netleştiği için)
   ve doc lokasyonlarının projede fiilen doğru olduğunu kontrol et.
5. `docs/opendevcon/PROJECT_STATE.md` → `stage: architecture`.

**Çıkış kriteri:** Kritik DEC'ler `Accepted`, `ODC.md` doğrulanmış.

---

## Faz 4 — Backlog Üretimi

1. AI1'e (Product Governance Agent) rolünü ver: "Act as the Product
   Governance Agent." AI1 önce `AGENT_BOOTSTRAP.md` Step 2'deki tüm
   governance dosyalarını okur.
2. Onaylı SRS'den Epic → Feature → Story → Task üret. Her dosyanın
   frontmatter'ında:
   - `status: backlog` veya `ready`
   - `srs_refs: [...]` — SRS'deki FR-xxx/BR-xxx'e atıf
     (`REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` §10 izlenebilirlik
     zinciri: F-xxx → FEAT-xxx → FR-xxx → BR-xxx → AC-xxx → TC-xxx)
3. PO, üretilen backlog'u SRS'ye göre doğrular — SRS'de olmayan bir iş
   kuralı backlog'a giremez.
4. `docs/opendevcon/PROJECT_STATE.md` → `stage: backlog`, `active_epics`
   ilk sette dolu.

**Çıkış kriteri:** İlk EPIC seti `ready` durumunda, `srs_refs` dolu.

---

## Faz 5 — Geliştirme Döngüsü (Bu Faz Sürekli Tekrarlanır)

Bu döngü, `continuous` evresine kadar (ve sonrasında da) tekrar eder.

1. PO bir görev seçer, AI2'ye rolünü verir: "Act as the Engineering
   Executor." AI2 `AGENT_BOOTSTRAP.md` Step 2–4'ü uygular (governance
   dosyaları + repository discovery).
2. Görev başlarken ilgili backlog dosyasının `status`'u `in_progress`
   yapılır.
3. AI2 implement eder; `QUALITY_GATES.md` ve `./scripts/check.sh` geçmeden
   iş bitmiş sayılmaz.
4. AI2 görev bitince (AGENT_BOOTSTRAP.md **Reporting Rule**, zorunlu):
   - Backlog dosyasının `status`'unu günceller (genelde `review`).
   - `docs/opendevcon/PROJECT_STATE.md`'i günceller.
   - `docs/opendevcon/PROGRESS_LOG.md`'e kayıt ekler.
5. PO (veya AI1) review yapar — `review` durumundaki işler "Human
   Attention" kuyruğudur. Onaylanırsa `status: done`; sorun varsa geri
   `in_progress`'e veya `blocked`'a çekilir (gerekçe PROGRESS_LOG'a
   yazılır).
6. `git commit`/`git push` yalnızca PO açıkça istediğinde yapılır (AI2
   kendiliğinden yapmaz — Git Write Rule).
7. **Yeni müşteri talebi gelirse** döngü içinde bile şu sıra zorunludur
   (`REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` §12):
   `Discovery güncelle → (gerekirse) müşteri onayı → SRS güncelle →
   backlog güncelle → geliştirme`. Backlog'a doğrudan SRS'siz madde
   eklenmez.

**Bu fazın çıkışı yoktur** — release'e kadar sürekli döner.

---

## Faz 6 — Release

1. SRS'deki MVP kabul kriterlerinin tamamı `done` mu kontrol et.
2. `docs/opendevcon/PROJECT_STATE.md` → `stage: released`,
   `last_release` doldurulur.
3. `PROGRESS_LOG.md`'e release kaydı düş.

**Çıkış kriteri:** MVP kabul kriterleri karşılandı, `stage: released`.

---

## Faz 7 — Sürekli Geliştirme

1. `docs/opendevcon/PROJECT_STATE.md` → `stage: continuous`.
2. Faz 5 (Geliştirme Döngüsü) aynen devam eder; tek fark artık backlog
   akışı MVP sonrası feature/bakım/teknik borç karışımıdır.
3. Periyodik olarak (ör. her sprint/ay sonu) PO şunları gözden geçirir:
   - `docs/opendevcon/PROJECT_STATE.md` güncel mi (agent'lar atlamış mı)?
   - Açık `blocked` EPIC var mı, neden bekliyor?
   - `docs/decisions/` içinde eskimiş/geçersiz DEC var mı?

`continuous` terminal evredir; geri düşüş yoktur (yalnızca yeni bir
SRS/discovery döngüsü gerektiren büyük bir pivot varsa
`PROJECT_LIFECYCLE_AND_STATUS_RUNBOOK.md` §2'deki istisna kuralı
uygulanır).

---

## Tek Sayfa Özet Checklist

- [ ] Faz 0: `create-project.sh` çalıştırıldı, `ODC.md` doğrulandı,
      `DB_META.md` elle dolduruldu (script yapmaz — DEC-0006 blocker)
- [ ] Faz 1: `docs/requirements/DISCOVERY.md` dolduruldu, tamamlanma
      kontrolü geçti
- [ ] Faz 2: AI0 → SRS üretti, insan review yaptı, **Durum: Onaylı**
- [ ] Faz 3: Kritik DEC'ler `Accepted`, `ODC.md` tam dolu
- [ ] Faz 4: İlk EPIC seti `ready`, `srs_refs` dolu
- [ ] Faz 5: Her görev sonunda `status` + `PROJECT_STATE.md` +
      `PROGRESS_LOG.md` güncel (döngüsel, sürekli kontrol)
- [ ] Faz 6: MVP kabul kriterleri tamam, `stage: released`
- [ ] Faz 7: `stage: continuous`, periyodik PO gözden geçirmesi

---

## İlgili Dosyalar

| Konu | Dosya |
|---|---|
| Discovery/SRS detay kuralları | `REQUIREMENTS_DISCOVERY_AND_SRS_RUNBOOK.md` |
| Evreler ve makine-okunabilir durum kontratı | `PROJECT_LIFECYCLE_AND_STATUS_RUNBOOK.md` |
| Agent rolleri ve zorunlu kurallar | `../AI_Governance/AGENT_BOOTSTRAP.md` |
| Dış araç raporlama yüzeyi | `../opendevcon/README.md` |
| Kalite kapıları | `../AI_Governance/QUALITY_GATES.md` |
