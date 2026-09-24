---
id: TASK-027.75
title: BOTC Düz Metin Credential Rotasyonu ve Güvenlik Değerlendirmesi
status: planned
srs_refs: [SEC-DATA-001, SEC-DATA-002]
parent_epic: EPIC-004
related: [TASK-027.63, DEC-0016]
updated_at: 2026-09-23
---

# TASK-027.75: BOTC Düz Metin Credential Rotasyonu ve Güvenlik Değerlendirmesi

> Q-W523’ün devri (AI1/PO kararı, DEC-0016). Wave 5 zincirinin **parçası değildir**; TASK-027.63–.74 bu task’a bağlı değildir ve bu task onlara bağlı değildir. Durum `planned`; `ready` yapılması ve **her gerçek rotasyon adımı ayrıca açık kullanıcı onayı** gerektirir.

## Amaç

BOTC kaynak deposundaki `BOT/appsettings.json` (ve `publish` kopyaları) içinde düz metin duran bağlantı dizeleri, `Auth:PasswordSalt`, `Telegram:BotToken` ve SMTP ayarlarının **ifşa/rotasyon değerlendirmesini** yapmak ve rotasyon planını hazırlamak.

## Kapsam

- Etkilenen credential sınıflarının envanteri (**yalnızca ad/konum, değer asla yazılmaz**), sistem sahipleri, bağımlı servisler.
- Rotasyon sırası, geri dönüş planı, doğrulama adımları, iletişim planı (yalnızca doküman).
- BOTC deposunda düz metin tutmanın engellenmesi için öneriler (secret store, `.gitignore`, ön-commit taraması).

## Kapsam dışı

- **Gerçek rotasyon uygulaması** (ayrı açık onay olmadan yapılmaz), Metnex koduna credential taşıma, SQL Server/PostgreSQL bağlantısı, Docker, production kodu.
- Metnex SCADA kataloğu (TASK-027.63): düz metin credential’lar Metnex’e **taşınmaz**.

## Bağımlılıklar

Yok (Wave 5 zincirinden bağımsız). Sonraki: AI1 kararı.

## Kabul kriterleri

- Credential değeri hiçbir dokümanda/logda yoktur; envanter yalnızca adlarla yapılmıştır.
- Rotasyon planı sahipleri, sırayı, geri dönüşü ve doğrulamayı içerir; gerçek rotasyon **yapılmamıştır** ve ayrıca onay beklemektedir.

## AI1/PO kararı gerektiren açık sorular

- Rotasyonun sahibi/zamanı, hangi ortamların (BOTC üretim/test) kapsandığı, ifşa değerlendirmesinin (kimler erişebildi) kapsamı.
