# Agent Registry — Metnex

Bu dosya, bu repository'de OpenDevConnect (ODC) kontratı altında çalışan her AI
agent örneğini (instance) takip eder. `docs/AI_Governance/AI_ROLES.md` ile
karıştırılmamalıdır — `AI_ROLES.md` bir *rolün* (AI0/AI1/AI2) ne yapmaya yetkili
olduğunu tanımlar; bu dosya ise o rollerin somut, o an çalışan
*örneklerini* (instance) izler. Agent registry, rol tanımının yerine geçmez.

**Yasak:** Bu dosyaya hiçbir secret, erişim token'ı, kimlik bilgisi veya özel
(private) prompt içeriği yazılmaz. Sadece aşağıdaki alanlar tutulur.

## Kayıtlı agent'lar

Her aktif çalışan agent örneği için bir satır ekleyin. Bir agent örneğinin
görevi tamamlandığında veya örnek sonlandırıldığında satırı silin.

| agent-id | role | model-or-runtime | start-time | current-task | contract-revision |
|---|---|---|---|---|---|
| ai2-2026-09-15-01 | AI2 | gemini-3.6-flash | 2026-09-15T08:58:01+03:00 | AI2 Engineering Executor initialized against SRS and ODC pipeline | 2026-09-14 |

### Alan açıklamaları

- **agent-id** — bu agent örneğine ait, bu registry içinde benzersiz bir
  tanımlayıcı (örn. `ai2-2026-09-10-01`).
- **role** — `AI0`, `AI1` veya `AI2` (bkz. `AI_ROLES.md`).
- **model-or-runtime** — bu örneği çalıştıran model/araç adı (örn.
  `claude-sonnet-5`), asla bir API anahtarı veya endpoint URL'i değil.
- **start-time** — bu agent örneğinin işe başladığı zaman (ISO 8601).
- **current-task** — üzerinde çalışılan görevin kısa, insan-okunur açıklaması.
  Prompt içeriğinin tamamı değil.
- **contract-revision** — bu örneğin başladığı andaki ODC contract revision'ı.
