---
id: TASK-025.1
title: MinIO Docker healthcheck'i wget eksikliği nedeniyle başarısız oluyor
status: done
srs_refs: []
parent_epic: null
updated_at: 2026-09-17
---

> AI1 final onayı: 2026-09-17. MinIO image araçları doğrulandı; healthcheck
> `curl` ile güncellendi ve gerçek container `healthy` olarak doğrulandı.
> SDK storage auth ve `./scripts/check.sh --skip-docker` PASS.

## AI2 Teslim Raporu (2026-09-17)

### Araç doğrulaması (varsayım yapılmadı)

`docker exec metnex-minio-dev` ile gerçek `minio/minio:latest` image'ı içinde kontrol edildi:
- `wget` → **yok** (`which` bile yok, image çok minimal).
- `mc` → **var** (`mc version RELEASE.2025-08-13T08-35-41Z`), MinIO'nun kendi istemcisi ama
  health endpoint'ini parolasız/alias'sız kontrol etmek için ek yapılandırma gerektiriyor.
- `curl` → **var** (`curl 8.11.0`), health endpoint'i doğrudan, credential gerektirmeden
  sorgulayabiliyor — **seçilen araç**.

### Değiştirilen dosyalar

| Dosya | Değişiklik |
|---|---|
| `infra/docker/docker-compose.dev.yml` | `minio` servisi healthcheck: `wget -qO- ...` → `curl -sf ...` |
| `infra/docker/docker-compose.infra.yml` | `minio` servisi healthcheck: `wget -qO- ...` → `curl -sf ...` |

MinIO servisini tanımlayan başka compose dosyası yok (`docker-compose.{dev-stack,test,swarm,registry}.yml`
kendi `minio` servisi tanımlamıyor, yalnızca `MINIO_*` env değişkenleriyle harici MinIO'ya
bağlanıyor). Bucket, credential, volume, network veya image sürümüne (`minio/minio:latest`
sabit kaldı) **dokunulmadı**.

### Gerçek container'da doğrulama

Compose healthcheck tanımı yalnızca container **oluşturma** anında uygulandığından (mevcut
`metnex-minio-dev` container'ı TASK-024.5'te `docker run` ile healthcheck tanımlanmadan
başlatılmıştı), gerçek `healthy` durumunu göstermek için container **aynı volume
(`openmas_minio_data`), aynı portlar (`7504→9000`, `7505→9001`), aynı `MINIO_ROOT_USER`/
`MINIO_ROOT_PASSWORD` ve aynı image (`minio/minio:latest`)** ile, yalnızca yeni `--health-cmd`
eklenerek yeniden oluşturuldu:

```
docker run -d --name metnex-minio-dev-v2 \
  -p 127.0.0.1:7504:9000 -p 127.0.0.1:7505:9001 \
  -v openmas_minio_data:/data \
  -e MINIO_ROOT_USER=... -e MINIO_ROOT_PASSWORD=... \
  --health-cmd="curl -sf http://127.0.0.1:9000/minio/health/live" \
  --health-interval=20s --health-timeout=5s --health-retries=5 \
  minio/minio:latest server /data --console-address ":9001"
```

- Eski (healthcheck'siz) `metnex-minio-dev` durduruldu, kaldırıldı (yalnızca container —
  **volume'e dokunulmadı**, `openmas_minio_data` paylaşımlı ve sağlam).
- `metnex-minio-dev-v2` → **`healthy`** durumuna geçtiği `docker inspect` ile poll edilerek
  doğrulandı (`until ... = "healthy"`, gerçek bekleme, varsayım değil).
- Kanonik isme geri döndürüldü: `docker rename metnex-minio-dev-v2 metnex-minio-dev`.
- Son durum: `docker ps` → **`metnex-minio-dev  Up (healthy)`**.
- `docker exec metnex-minio-dev ls /data` ile volume içeriğinin (`.minio.sys`) korunduğu
  ayrıca teyit edildi.

### MinIO health endpoint ve API storage doğrulaması

- `docker exec metnex-minio-dev curl -sf http://127.0.0.1:9000/minio/health/live` → exit **0**.
- Gerçek API storage bağlantısı (`minio` SDK, `apps/api/.env`'deki gerçek kimlik bilgileriyle)
  tekrar test edildi → **`AUTH_OK, buckets: []`** (container yeniden oluşturulmasından sonra da
  sorunsuz).

### `./scripts/check.sh --skip-docker`

**PASS** (audit, typecheck, lint, test, build) — kod değişikliği yok, regresyon riski yok.

### `wget` referansı kalmadı mı

`grep -rn "wget" infra/docker/*.yml` → yalnızca **MinIO dışı** servislerde kaldı (`jasper-renderer`,
`api`, `web`, `registry` healthcheck'leri — bunlar Alpine/registry tabanlı image'lar olup
`wget`'e gerçekten sahip, bu task'ın kapsamı dışında, dokunulmadı). MinIO servisinin
healthcheck'inde **sıfır** `wget` referansı kaldı.

### Kabul kriterleri karşılama

| Kriter | Durum |
|---|---|
| Gerçekten mevcut araç (`mc`/`curl`) doğrulandı, varsayım yapılmadı | ✅ |
| İlgili compose dosyalarındaki healthcheck güncellendi | ✅ — 2 dosya |
| Bucket/credential/volume/network/image sürümüne dokunulmadı | ✅ |
| Gerçek container'ın `healthy` durumu doğrulandı | ✅ — `docker inspect` poll ile |
| MinIO health endpoint ve `check.sh --skip-docker` raporlandı | ✅ |

### Durum

`status: review` — nihai `done` kararı AI1'e bırakıldı.

# TASK-025.1: MinIO Docker Healthcheck — `wget` Eksikliği (Teknik Borç)

## Bulgu

`infra/docker/docker-compose.dev.yml`'deki `minio` servisinin healthcheck'i şu komutu kullanıyor:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:9000/minio/health/live"]
```

`minio/minio:latest` image'ının içinde `wget` binary'si **yok** — bu yüzden container Docker
tarafından her zaman `unhealthy` olarak raporlanıyor, MinIO'nun kendisi gerçekte sağlıklı
çalışsa bile (`curl` ile aynı endpoint'e container içinden erişim başarılı oluyor).

## Keşif bağlamı

Bu sorun TASK-024.5 (Metnex PostgreSQL/MinIO kimlik geçişi) sırasında fark edildi —
`docker ps` çıktısında MinIO container'ının sürekli `unhealthy` göründüğü gözlemlendi,
`docker exec ... curl` ile gerçek sağlık durumu doğrulandı (sağlıklı). **Bu sorun Metnex
rename programından tamamen bağımsızdır** — rename öncesinde de aynı şekilde mevcuttu,
rename işlemleriyle bir ilgisi yoktur.

## Önerilen düzeltme

Healthcheck komutunu image'da gerçekten var olan bir araçla değiştirmek:

```yaml
healthcheck:
  test: ["CMD", "mc", "ready", "local"]
  # veya: ["CMD-SHELL", "curl -sf http://127.0.0.1:9000/minio/health/live || exit 1"]
```

(`minio/minio` image'ında `mc` dahili olarak mevcut; `curl`'ün var olup olmadığı image
versiyonuna göre değişebilir, uygulama öncesi doğrulanmalı.)

## Kapsam

Yalnızca `infra/docker/docker-compose.dev.yml`'deki (ve muhtemelen `docker-compose.infra.yml`
kullanılıyorsa oradaki) `minio` servisinin `healthcheck.test` alanı. Başka hiçbir davranış
değişmez.

## Öncelik

Düşük — kozmetik bir `docker ps` durum göstergesi sorunu, gerçek MinIO işlevselliğini
etkilemiyor. `parent_epic` yok, Metnex rename programının (EPIC-003) bir parçası değildir.

## AI1 uygulama talimatı

- Önce kullanılan MinIO image/tag içinde `mc` veya `curl` aracının gerçekten mevcut
  olduğunu doğrula; varsayım yapma.
- Aynı MinIO servisini tanımlayan tüm compose dosyalarını tara; yalnızca gerekli
  healthcheck alanını güncelle.
- MinIO bucket, credential, volume, network veya image sürümü değiştirilmez.
- Gerçek çalışan container'da `healthy` durumu ve MinIO health endpoint'i
  doğrulanmalıdır.
- `wget` referansı kalmadığını doğrula.
- `./scripts/check.sh --skip-docker` sonucu raporlanır.
- Teslim sonunda task `review` yapılmalı, `METNEX_STATE.md` ve
  `PROGRESS_LOG.md` append-only güncellenmelidir.
