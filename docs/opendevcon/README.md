# docs/opendevcon/ — External Reporting Surface

Bu klasördeki dosyalar, bu repoyu **AI kullanmadan, yalnızca dosya okuyarak**
izleyen dış araçlar (ör. OpenDevConnect / ODC) için tutulur.

AI agent'lar (AI1 — Product Governance Agent, AI2 — Engineering Executor)
her görev sonunda bu klasördeki dosyaları güncellemekle yükümlüdür. Kural
`../AI_Governance/AGENT_BOOTSTRAP.md` içinde tanımlıdır.

| File | Purpose |
|---|---|
| `METNEX_STATE.md` | Tek kaynak, her zaman güncel özet durum (stage, aktif EPIC'ler, blocker'lar) |
| `PROGRESS_LOG.md` | Append-only agent oturum kaydı — asla düzenlenmez, silinmez, sadece eklenir |

Süreç detayı: `../runbooks/METNEX_LIFECYCLE_AND_STATUS_RUNBOOK.md`.

Not: `ODC.md` contract dosyası repo **kökünde** kalır (dış araçlar kontratı
orada arar), bu klasörde değildir. `ODC.md` içindeki `documentation.state` ve
`documentation.progress_log` alanları bu klasördeki dosyalara işaret eder.
