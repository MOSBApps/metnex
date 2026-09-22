# AI API Key Encryption Rotation Runbook

## Amaç

`platform.tenant_ai_providers` tablosundaki şifrelenmiş API anahtarlarını yeni bir şifreleme anahtarıyla yeniden şifrelemek (key rotation). Bu işlem aşağıdaki durumlarda gereklidir:

- Periyodik güvenlik rotasyonu (yılda en az 1 kez önerilir)
- Şifreleme anahtarı sızma şüphesi
- Şifreleme algoritması değişikliği

---

## Şifreleme Mimarisi

| Env Değişkeni | Açıklama |
|---|---|
| `ENCRYPTION_KEY` | Mevcut (aktif) anahtar — 32 byte / 64 hex karakter |
| `ENCRYPTION_KEY_PREVIOUS` | Eski anahtar — rotasyon penceresi süresince tutulur |
| `ENCRYPTION_KEY_VERSION` | Mevcut anahtar versiyon etiketi (örn: `v1`, `v2`) |

**Format**: AES-256-GCM, `iv(12 byte) + tag(16 byte) + ciphertext` → base64

**Şifre çözme önceliği**:
1. `key_version` mevcut versiyonla eşleşiyorsa → `ENCRYPTION_KEY` dene
2. Eşleşmiyorsa → `ENCRYPTION_KEY_PREVIOUS` dene
3. Her iki anahtar da başarısız → hata logla, `null` döner

---

## Ön Koşullar

- [ ] Mevcut `ENCRYPTION_KEY` değerini güvenli bir yerde sakla (rollback için)
- [ ] Yeni anahtar üret: `openssl rand -hex 32`
- [ ] Deployment erişimi ve yeterli yetkiye sahipsin
- [ ] Tüm servisler sağlıklı çalışıyor (`GET /api/v1/health` → `{"status":"ok"}`)

---

## Rotasyon Adımları

### 1. Yeni Anahtar Üret

```bash
NEW_KEY=$(openssl rand -hex 32)
echo "Yeni anahtar: $NEW_KEY"
# NOT: Bu değeri güvenli kaydet — bir daha göremezsin
```

### 2. Ortam Değişkenlerini Güncelle

**Mevcut değerler** (rotasyon öncesi):
```
ENCRYPTION_KEY=<mevcut_anahtar>
ENCRYPTION_KEY_VERSION=v1
ENCRYPTION_KEY_PREVIOUS=
```

**Yeni değerler** (rotasyon sonrası):
```
ENCRYPTION_KEY=<yeni_anahtar>          # openssl rand -hex 32
ENCRYPTION_KEY_VERSION=v2              # bir artır
ENCRYPTION_KEY_PREVIOUS=<mevcut_anahtar>  # ESKİ anahtarı buraya taşı
```

> Docker Swarm:
> ```bash
> printf '<yeni_anahtar>' | docker secret create metnex_encryption_key_v2 -
> docker service update --secret-rm metnex_encryption_key --secret-add metnex_encryption_key_v2 metnex_api
> ```

### 3. Servisi Yeniden Başlat

```bash
# Docker Swarm
docker service update --force metnex_api

# veya
docker stack deploy -c infra/docker/docker-compose.prod.yml metnex
```

### 4. Rotasyonu Tetikle

```bash
# API endpoint üzerinden (SUPER_ADMIN token gerekli)
curl -X PUT https://your-domain/api/v1/settings/ai-provider/rotate-keys \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

Beklenen yanıt:
```json
{
  "processed": 3,
  "skipped": 0,
  "failed": 0
}
```

- `processed`: yeni anahtarla yeniden şifrelenmiş kayıt sayısı
- `skipped`: zaten güncel key_version'da olan kayıtlar
- `failed`: şifresi çözülemeyen kayıtlar (0 olmalı)

### 5. Doğrulama

```bash
# AI yardım asistanının çalıştığını doğrula
curl -X POST https://your-domain/api/v1/ai/help/message \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba, çalışıyor musun?"}'

# Sağlık kontrolü
curl https://your-domain/api/v1/ai/help/health \
  -H "Authorization: Bearer $USER_TOKEN"
# Beklenen: {"available":true,"module":"HELP_ASSISTANT"}
```

### 6. Eski Anahtarı Temizle (Rotasyon Tamamlandıktan Sonra)

Tüm kayıtlar yeni anahtarla yeniden şifrelendikten sonra (processed > 0, failed = 0):

```bash
# ENCRYPTION_KEY_PREVIOUS'ı temizle
# (En az 24 saat bekle — tüm kayıtların güncellendiğinden emin ol)
unset ENCRYPTION_KEY_PREVIOUS
# veya Docker secret'tan kaldır
```

---

## Rollback Prosedürü

Rotasyon sonrası AI anahtarları çözülemiyorsa (API `GATEWAY_UNAVAILABLE` hatası):

1. **Eski anahtarları geri yükle**:
   ```
   ENCRYPTION_KEY=<eski_anahtar>
   ENCRYPTION_KEY_VERSION=v1
   ENCRYPTION_KEY_PREVIOUS=
   ```

2. Servisi yeniden başlat

3. AI asistanının çalıştığını doğrula

4. Hatayı analiz et (logs): `AI API key şifresi çözülemedi — ENCRYPTION_KEY değişmiş ya da bozuk olabilir`

---

## Olası Hatalar

| Hata | Neden | Çözüm |
|------|-------|-------|
| `failed > 0` | Bazı kayıtlar ne yeni ne eski anahtarla çözülüyor | Etkilenen tenantların anahtarını sıfırla |
| `GATEWAY_UNAVAILABLE` | Tüm anahtarlar geçersiz | Rollback yap |
| `ENCRYPTION_KEY 32-byte hex değil` | Yanlış formatlı anahtar | `openssl rand -hex 32` çıktısını doğru kopyala |

---

## Güvenlik Notları

- Anahtar asla loglanmaz; audit_log'a yalnızca metadata yazılır
- `ENCRYPTION_KEY_PREVIOUS` rollback için gereklidir — aceleyle silme
- Rotasyon penceresi: yeni ve eski anahtar aynı anda aktif olabilir (geçiş güvenlidir)
- Rotasyon tamamlanmadan `ENCRYPTION_KEY_PREVIOUS` silinmemelidir
