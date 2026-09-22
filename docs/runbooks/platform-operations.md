# Platform Operations Runbook

Bu runbook, system admin yüzeyindeki iki operasyon ekranının kullanım sınırlarını açıklar:

- `/system/audit`
- `/system/performance`

## Kapsam

- Yetki modeli: yalnızca `isSystemAdmin = true` kullanıcılar
- API yüzeyleri:
  - `GET /api/v1/platform-audit-logs`
  - `GET /api/v1/admin/perf/overview`
  - `GET /api/v1/admin/perf/tables`
  - `GET /api/v1/admin/perf/indexes`
  - `GET /api/v1/admin/perf/slow-requests`
  - `GET /api/v1/admin/perf/slow-requests/:id`
  - `GET /api/v1/admin/perf/slow-queries`
  - `GET /api/v1/admin/perf/recommendations`
  - `GET/PATCH /api/v1/admin/perf/settings`

## Audit Yüzeyi

- Auth giriş/yenileme/çıkış olayları platform audit’e yazılır.
- Platform user management akışları audit’e yazılır:
  - kullanıcı oluşturma/güncelleme/deactivate
  - parola reset
  - impersonation
  - sistem rol atama/geri alma
  - tenant membership ekleme/kaldırma
- Metadata payload’ları write sırasında scrub edilir; secret/token/parola alanları maskelenir.

## Performance Yüzeyi

- Her HTTP request için response-time ölçülür.
- `slowRequestThresholdMs` eşiğini aşan request ya da `5xx` response alan request,
  `performance_request_logs` içine persist edilir.
- `dbTraceEnabled = true` ise Prisma query şekilleri scrub edilerek
  `performance_request_query_logs` içine çocuk satır olarak yazılır.
- Trace kapalıysa `queryCount = null` normaldir; bu “trace açık ama query yok” anlamına gelmez.

## Operatör Notları

- Bu yüzey tam APM ürünü değildir; amaç platform-level diagnosis foundation sağlamaktır.
- `performance_request_logs` tüm request’leri değil yalnızca yavaş/hatalı request’leri içerir.
- `platform_audit_logs` immutable kullanım kontratına sahiptir; update/delete surface yoktur.
- Trace açıldığında veri hacmi artar; yalnız ihtiyaç anında aktif tutulmalıdır.

## Local / Deployment Sonrası Kontrol

1. Prisma migration deploy edilmiş olmalı.
2. System admin ile giriş yapın.
3. `/system/audit` ekranında auth ya da user-management event’i görün.
4. `/system/performance` ekranında DB overview ve settings kartı yükleniyor olmalı.
5. İhtiyaç varsa threshold düşürüp kontrollü test request’i ile slow-request satırı üretin.
