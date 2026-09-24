# DEC-0016 — SCADA Katalog: Kontrollü Preflight Doğrulaması ve Fiziksel İsim / Katalog Kimliği Ayrımı

**Date:** 2026-09-23
**Status:** Accepted — AI1/Product Owner kararlarıyla (bağlayıcı)
**Kapsam:** Q-W524, Q-W525 (ve Q-W523’ün devri)
**İlgili:** DEC-0015, DEC-0014, TASK-027.63, TASK-027.64

## Decisions

### Q-W524 — Kolon/şema doğrulama süreci: kontrollü read-only preflight

- Katalog kaydı başlangıçta **`UNVERIFIED`**’dir.
- Kullanıcı kaynak/kolon **keşfi yapamaz**; adapter yalnızca allowlist’teki kayıtları okur.
- **Yetkili ve kontrollü bir read-only preflight** şunları doğrular: kaynak bağlantısı, database/schema/table/column varlığı, tarih/saat kolonları, veri tipleri.
- Başarılı doğrulama sonrası kayıt **`VERIFIED`** olur.
- **Doğrulanmamış kayıt sürücüye gönderilmez.**
- Şema tabanlı serbest keşif (`INFORMATION_SCHEMA` vb.) yapılmaz.
- **Gerçek preflight ayrı açık onay olmadan çalıştırılmaz.**

### Q-W525 — Boşluklu database adı: fiziksel isim korunur, katalog kimliği ondan ayrılır

`MOSB ENERJI DB` adı **değiştirilmez ve otomatik olarak reddedilmez.**

- Fiziksel database adı yalnızca **onaylı kaynak profilinde** tutulur; kullanıcıdan database adı alınmaz.
- Kaynak profili **opaque katalog ID’siyle** seçilir.
- SQL identifier hiçbir zaman ham kullanıcı girdisiyle oluşturulmaz; gerekirse adapter SQL Server’ın güvenli identifier/driver mekanizmasını kullanır.
- Database adı `MOSB_ENERJI_DB` gibi **normalize edilip farklı bir fiziksel database varmış gibi davranılmaz**.

### Q-W523 — devredildi

Bu konu TASK-027.63 kapsamı **değildir**; **ayrı credential rotation/security task’ı** olarak takip edilir (`backlog/TASK-027-75-botc-plaintext-credential-rotation-security.md`, `planned`). Düz metin credential’lar Metnex’e taşınmaz; gerçek rotasyon ayrıca açık onay gerektirir.

## Consequences

- TASK-027.63 katalog modeli “kaynak doğrulama durumu” (`UNVERIFIED | VERIFIED | BLOCKED`) ve “kolon doğrulama durumu” taşır; **`VERIFIED` yalnızca preflight sonucunun uygulanmasıyla** oluşur (elle set edilemez).
- Katalog kimliği fiziksel isimden **türetilmez**; kaynak seçimi opaque UUID ile yapılır; fiziksel ad yalnızca profilde bulunur ve kimlik/audit/log/UI üretiminde kullanılmaz.
- TASK-027.64 (adapter) yalnızca `VERIFIED` + diğer ön koşulları sağlayan kayıtları okur; TASK-027.58 sözleşmesindeki katı identifier kuralı fiziksel adlar için **güncellenir** (TASK-027.64 içinde).
- Gerçek preflight, gerçek SQL Server/PostgreSQL, Docker ve smoke test **ayrı açık kullanıcı onayı** ister.
