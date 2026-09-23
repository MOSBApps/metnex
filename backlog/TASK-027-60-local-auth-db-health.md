---
id: TASK-027.60
title: Local Auth/DB Health ve Hesap Durumu Düzeltmesi
status: done
srs_refs: []
parent_epic: EPIC-004
updated_at: 2026-09-23
---

# TASK-027.60: Local Auth/DB Health ve Hesap Durumu Düzeltmesi

## Amaç

Yerel geliştirme ortamında login sonrası sürekli görünen "Hesap devre dışı"
uyarısının gerçek nedenini kanıtlamak ve güvenli biçimde düzeltmek.

## Teslim notu (2026-09-23, AI2)

### Başlangıç koşulları (salt-okunur)

```
pwd → /home/mrtznc/projects/metnex
./dev.sh --status → Postgres/Redis/MinIO/Jasper: çalışıyor (healthy).
  API (3001) ve Web (3000) dev process'leri: "henüz başlatılmamış".
docker ps -a → Docker daemon çalışıyor. metnex-postgres-dev/redis-dev/minio-dev/
  jasper-renderer-dev: Up (healthy). Bu makinede başka fork projelerine ait
  (openfiscus/openvisg/finflow/demo) container'lar da var, hepsi Exited durumda
  — şu anda aktif bir port çakışması yok, ama aynı 7502-7506 port aralığını
  paylaştıkları not edildi (bkz. "Ek gözlem" altta).
ss -ltnp → 3000/3001 dinlenmiyordu (dev process'ler kapalı); 7502/7503/7504/
  7505/7506 dinleniyordu (infra).
```

Docker daemon çalışıyordu; Docker build/run/compose komutu çalıştırılmadı,
sadece zaten ayakta olan mevcut container'lar kullanıldı. API/web dev
process'leri (Docker değil, düz `nest start --watch` / `next dev`) teşhis
amacıyla başlatıldı — bu, önceki oturumlarda da (TASK-027.54 sırasında) aynı
şekilde uygulanan, onaylı bir pattern.

### 1) Port ve environment matrisi

| Değer | Kaynak | Sonuç |
|---|---|---|
| `DEV_PORT_BASE` | `.project-defaults` | `7500` |
| Web `PORT` | `apps/web/.env.local` | `3000` |
| Web `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | `http://localhost:3001` |
| API `PORT` | `apps/api/.env` | `3001` |
| API `DATABASE_URL` portu | `apps/api/.env` | `7502` (host) |
| Postgres compose host portu | `docker ps -a` (çalışan container) | `127.0.0.1:7502->5432` |

**Sonuç: port/env matrisi tutarlı, uyumsuzluk yok.**
- Web (3000) ≠ API (3001) ✓
- API (3001) == `NEXT_PUBLIC_API_URL` (3001) ✓
- 7502 yalnızca Postgres için kullanılıyor, web adresi olarak kullanılmıyor ✓
- `DATABASE_URL` portu (7502) == çalışan Postgres container'ının host portu (7502) ✓

Secret/parola/bağlantı dizesi değeri bu raporda yok; yalnızca port numaraları.

### 2) API health

Teşhis için API (`nest start --watch`) ve web (`next dev`) başlatıldı.

```
curl -i http://localhost:3001/api/v1/health
→ HTTP/1.1 200 OK
  {"status":"ok"}
```

API sağlıklı ve doğru portta (3001) çalışıyor; `NEXT_PUBLIC_API_URL` ile eşleşiyor.

### 3) Kullanıcı durumu (salt-okunur DB sorgusu)

```sql
SELECT id, email, status, "isSystemAdmin", "createdAt" FROM users ORDER BY "createdAt";
```

Sonuç: DB'de **tek bir kullanıcı** var — bootstrap sistem yöneticisi
(`admin@example.com`), **`status = ACTIVE`**. INACTIVE veya LOCKED hiçbir
kullanıcı yok. Parola/hash/token değeri sorgulanmadı, gösterilmedi.

Bu admin ile taze bir login yapılıp access token'ın `sub` claim'i DB'deki
`id` ile karşılaştırıldı (token'ın kendisi/imzası raporda gösterilmedi,
yalnızca decode edilmiş `sub` alanı):

```
JWT sub:  cc929d25-d28c-4c8a-96dd-c5e11dab35d6
DB id:    cc929d25-d28c-4c8a-96dd-c5e11dab35d6
→ eşleşiyor.
```

**Web hangi API'ye bağlanıyor:** `http://localhost:3001` (yukarıdaki matris).
**API hangi veritabanına bağlanıyor:** `127.0.0.1:7502/metnex` (çalışan
`metnex-postgres-dev` container'ı, `docker ps -a` ile doğrulandı).

### 4) Kök neden — kanıtlandı (kod hatası, DB/port değil)

Taze, geçerli bir token ile, DB'de ACTIVE olan AYNI admin kullanıcısı için,
`@RequireMfaSetupComplete()` ile korunan gerçek bir route'a (`GET
/reports/artifacts`) istek atıldığında:

```
HTTP 403
{"message":"Hesap devre dışı","error":"Forbidden","statusCode":403}
```

Bu, DB/port/env sorunuyla açıklanamaz — kullanıcı gerçekten ACTIVE, token
gerçekten geçerli ve doğru `sub`'a sahip, API gerçekten doğru DB'ye bağlı.
Kaynak kodu incelemesi kesin nedeni ortaya çıkardı:

- **Mesajın kaynak satırı:** `apps/api/src/platform/guards/mfa-enforcement.guard.ts:41`
  — `throw new ForbiddenException('Hesap devre dışı')`.
- **Gerçek kök neden:** aynı guard, hemen üstünde (eski haliyle satır 39),
  `this.mfaRequirement.isActorActive(user.sub)` çağırıyordu. Ama
  `request.user`, `JwtStrategy.validate()` → `AuthService.validateJwtPayload()`
  tarafından üretiliyor ve bu obje `users` tablosu satırının spread'i (`id`
  alanı var, **`sub` alanı yok**). Yani `user.sub` **her zaman `undefined`**
  idi — gerçek DB durumundan tamamen bağımsız olarak, **her** MFA-zorunlu
  route'ta **her** kullanıcı için. `MfaRequirementService.isActorActive(undefined)`
  eşleşen satır bulamıyor, `false` dönüyor, guard "Hesap devre dışı" fırlatıyor.
  Aynı ambiguity `apps/api/src/platform/mfa.controller.ts`'de zaten biliniyordu
  ve `user.sub ?? user.id` fallback'iyle ele alınmıştı — sadece bu guard'a
  uygulanmamıştı.
- **Neden hiç yakalanmadı:** guard'ın kendi testi (`mfa-enforcement.guard.spec.ts`)
  `request.user`'ı `{ sub: 'u1' }` şeklinde kurguluyordu — guard'ın hatalı
  varsayımıyla birebir eşleşen, ama gerçek runtime şeklini hiç yansıtmayan bir
  fixture. Bu, testin kendisinin gerçek sözleşmeyi doğrulamadığı bir durumdu.

**Ayırt edilen senaryolar (task'ın istediği 5 ihtimal):**
1. Kullanıcı gerçekten INACTIVE/LOCKED → **hayır**, DB'de tek kullanıcı var ve ACTIVE.
2. Kullanıcı DB'de yok → **hayır**, JWT sub ile DB id eşleşti.
3. Access token eski veya başka DB'ye ait → **hayır**, taze token, aynı DB.
4. API yanlış veritabanına bağlı → **hayır**, port/env matrisi tutarlı, container doğrulandı.
5. **MFA guard yanlış alan okuyor → EVET, kanıtlandı.** Bu gerçek kök neden.

### Düzeltme (minimal, kanıtlanmış hataya dayalı)

Task kuralı: "Auth kodunda değişiklik yalnızca gerçek bir yanlış mesajlama
veya bağlantı kusuru kanıtlanırsa yapılabilir." Bu kanıtlandığı için minimal
bir düzeltme yapıldı:

- `apps/api/src/platform/guards/mfa-enforcement.guard.ts`: `user.sub` okuyuşu
  `mfa.controller.ts`'deki mevcut pattern'le aynı şekilde `user.sub ?? user.id`
  fallback'ine çevrildi (4 kullanım yeri: `isActorActive`, `isRequired`,
  `userMfaSettings` sorgusu, audit yazımı). `user` hiç `id`/`sub` taşımıyorsa
  guard artık `false` döner (fail-closed, önceki davranışla aynı yön), ama artık
  gerçek DB durumu sorgulanırken doğru id kullanılıyor.
- **Değiştirilmeyen (bilinçli):** `isActorActive`'in "kullanıcı yok" ile
  "kullanıcı INACTIVE/LOCKED" durumlarını aynı `false`/"Hesap devre dışı"
  mesajına indirmesi davranışı korundu — bu, guard'ın ÖNCEDEN de var olan,
  bu task'ın kapsamındaki bug'dan bağımsız bir tasarım kararı. Task'ın kendi
  talimatı ("varsayım yaparak mesajı değiştirme") gereği bunu ayrıca bir
  **karar maddesi** olarak aşağıda raporluyorum, kod değiştirmedim.

### Karar/blocker maddesi (kod değiştirilmedi, onay bekliyor)

`MfaRequirementService.isActorActive` şu an "kullanıcı bulunamadı" ile
"kullanıcı bulundu ama INACTIVE/LOCKED" durumlarını ayırt etmiyor — ikisi de
aynı "Hesap devre dışı" (403) mesajını üretiyor. Bu, kullanılabilirlik
açısından (kullanıcıya "tekrar giriş yap" ile "hesabın devre dışı, yöneticine
başvur" arasında fark göstermiyor) iyileştirilebilir, ama bu bir **güvenlik
sınırı değil** (fail-closed davranış her iki durumda da doğru: erişim
reddediliyor) ve bu task'ın kanıtladığı asıl bug'dan bağımsız bir tasarım
sorusu. **Ayrı bir karar/task olarak Product Owner/AI1'e bırakılıyor** —
varsayımla değiştirilmedi.

### DB'de değişiklik yapılmadı

Kullanıcı `status` alanına UPDATE yapılmadı, seed/reset/silme işlemi
çalıştırılmadı. Yukarıdaki `SELECT` tamamen salt-okunurdu. Bu task için önerilen
bir düzeltme SQL'i **yok** — çünkü gerçek kök neden DB durumu değil, kod hatasıydı.

### Ek gözlem (bilgi amaçlı, bu task'ın parçası değil)

Bu geliştirme makinesinde `openfiscus`/`openvisg`/`finflow`/`demo` adlı başka
proje fork'larına ait Docker container'ları da mevcut, hepsi aynı
7502-7506 host port aralığını (bazıları farklı, bazıları aynı portu) kullanacak
şekilde tanımlı ve şu an hepsi `Exited`. Şu an aktif bir çakışma yok, ama bu
projelerden biri aynı anda `docker compose up` ile başlatılırsa port çakışması
riski var. Bilgi amaçlı not edildi, bu task kapsamında bir aksiyon alınmadı.

### Testler (eklendi)

- `apps/api/src/platform/mfa-requirement.service.spec.ts` (**yeni** — bu
  serviste hiç test yoktu): `isActorActive` için ACTIVE/INACTIVE/LOCKED/
  kullanıcı-yok, 4 test.
- `apps/api/src/platform/guards/mfa-enforcement.guard.spec.ts` (değişti):
  tüm fixture'lar `{ sub: 'u1' }`'den gerçek runtime şekli olan `{ id: 'u1' }`'e
  çevrildi (bu, düzeltmeden önce testlerin bug'ı hiç yakalayamamasının tam
  nedeniydi). Eklenen yeni testler: ACTIVE erişebilir, INACTIVE/LOCKED erişemez,
  `isActorActive`/`isRequired`'a asla `undefined` geçilmediği, `sub` mevcutsa
  hâlâ önce onun kullanıldığı, id/sub hiç yoksa güvenli `false` (DB'ye hiç
  gitmeden). **Gerçek mutasyon testi yapıldı:** düzeltme geçici olarak geri
  alınıp (`user.sub ?? user.id` → `user.sub`) testler çalıştırıldı — 16
  testten 10'u başarısız oldu, düzeltme geri getirilip tekrar 16/16 PASS
  doğrulandı. Bu, yeni testlerin bu regresyonu gerçekten yakaladığının kanıtıdır.
- `apps/web/src/app/(app)/app/reports/reports-list-client.spec.tsx` (değişti):
  yanlış/erişilemez API portu senaryosu için (`TypeError: fetch failed`) güvenli
  genel hata mesajı testi eklendi — raw fetch/network hatası UI'a sızmıyor.

### Doğrulama

- `pnpm --filter api exec tsc --noEmit`: temiz.
- `pnpm --filter web exec tsc --noEmit`: temiz.
- `pnpm --filter api exec jest platform --runInBand`: **21 suite / 991 test PASS**.
- `pnpm --filter web exec vitest run`: **15 suite / 162 test PASS**.
- `NODE_PATH=<repo>/node_modules/.pnpm/node_modules TURBO_ENV_MODE=loose
  ./scripts/check.sh --skip-docker` (Q-ENV01 workaround'u gerekti): tam PASS
  — `59 suite / 1581 test PASS` (API), web testleri ve build dahil.
- Gerçek DB/HTTP smoke test: yukarıdaki §2-§4'te açıklandığı gibi, bu makinenin
  yerel dev ortamına (metnex-postgres-dev container'ı, `nest start --watch` /
  `next dev` ile başlatılan API/web) karşı, gerçek login + gerçek MFA-korumalı
  endpoint çağrısıyla yapıldı — Docker build/run/compose komutu çalıştırılmadı,
  sadece zaten ayakta olan container'lara bağlanıldı.

### AI1 Onayı (2026-09-23)

AI1, teşhis ve düzeltmeyi inceledi ve `done` durumuna onayladı. Onaylanan
noktalar: `request.user` içinde `sub` olmadığı, `id` olduğu; MFA guard'ın
yalnızca `user.sub` okuduğu için ACTIVE kullanıcıların yanlışlıkla devre dışı
göründüğü; `user.sub ?? user.id` düzeltmesinin uygulandığı; öncesi 403,
sonrası 200'ün gerçek API akışında doğrulandığı; mutasyon testinin başarılı
olduğu; API/web testlerinin ve tam `check.sh --skip-docker`'ın başarılı
olduğu; DB'de kullanıcı status'unun değiştirilmediği. "Kullanıcı bulunamadı"
ile "INACTIVE/LOCKED" mesajlarının ayrıştırılması ayrı bir karar maddesi
olarak açık bırakıldı — bu task'ın kapanmasına engel değil.

### Kapsam dışı (bu task'ta yapılmadı)

Production DB değişikliği, kullanıcı status toplu güncellemesi, parola
resetleme, MFA enforcement tasarım değişikliği, yeni permission/rol,
token/cookie rename, Docker build/run/volume işlemleri, Wave 2/3, git
commit/push.

### Değiştirilen/eklenen dosyalar

- `apps/api/src/platform/guards/mfa-enforcement.guard.ts` (değişti — kök neden düzeltmesi)
- `apps/api/src/platform/guards/mfa-enforcement.guard.spec.ts` (değişti — gerçek
  request.user şekliyle yeniden yazıldı + yeni regresyon testleri)
- `apps/api/src/platform/mfa-requirement.service.spec.ts` (yeni)
- `apps/web/src/app/(app)/app/reports/reports-list-client.spec.tsx` (değişti — yanlış port/ağ hatası testi)
