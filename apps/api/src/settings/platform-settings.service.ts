import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { platformAiProviderSettings, platformGeneralSettings, platformSmtpSettings } from '../db/schema'
import { CredentialCryptoService } from './credential-crypto.service'

export interface UpsertPlatformGeneralDto {
  name?: string
  shortName?: string
  address?: string
}

export interface UpsertPlatformSmtpDto {
  notificationsEnabled?: boolean
  host?: string
  port?: number
  secure?: boolean
  username?: string
  password?: string
  fromName?: string
  fromEmail?: string
}

export interface UpsertPlatformAiDto {
  providerType?: string
  apiKey?: string
  endpoint?: string
  defaultModel?: string
  isActive?: boolean
}

@Injectable()
export class PlatformSettingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async getGeneral() {
    const [row] = await this.db.select().from(platformGeneralSettings).limit(1)
    return row
      ? {
          name: row.name,
          shortName: row.shortName,
          address: row.address,
          updatedAt: row.updatedAt.toISOString(),
        }
      : { name: 'Metnex', shortName: null, address: null, updatedAt: null }
  }

  async upsertGeneral(dto: UpsertPlatformGeneralDto) {
    const [existing] = await this.db.select().from(platformGeneralSettings).limit(1)
    const data = {
      name: dto.name?.trim() || existing?.name || 'Metnex',
      shortName: dto.shortName !== undefined ? dto.shortName.trim() || null : existing?.shortName ?? null,
      address: dto.address !== undefined ? dto.address.trim() || null : existing?.address ?? null,
    }

    const row = assertRow(
      existing
        ? await this.db.update(platformGeneralSettings).set(data).where(eq(platformGeneralSettings.id, existing.id)).returning()
        : await this.db.insert(platformGeneralSettings).values(data).returning(),
      )

    return {
      name: row.name,
      shortName: row.shortName,
      address: row.address,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async getSmtp() {
    const [row] = await this.db.select().from(platformSmtpSettings).limit(1)
    return row
      ? {
          notificationsEnabled: row.notificationsEnabled,
          host: row.host,
          port: row.port,
          secure: row.secure,
          username: row.username,
          fromName: row.fromName,
          fromEmail: row.fromEmail,
          hasPassword: row.passwordCiphertext !== null,
          updatedAt: row.updatedAt.toISOString(),
        }
      : {
          notificationsEnabled: false,
          host: null,
          port: null,
          secure: false,
          username: null,
          fromName: null,
          fromEmail: null,
          hasPassword: false,
          updatedAt: null,
        }
  }

  async upsertSmtp(dto: UpsertPlatformSmtpDto) {
    const [existing] = await this.db.select().from(platformSmtpSettings).limit(1)
    let passwordCiphertext = existing?.passwordCiphertext ?? null
    if (dto.password) passwordCiphertext = this.crypto.encrypt(dto.password)

    const data = {
      notificationsEnabled: dto.notificationsEnabled ?? existing?.notificationsEnabled ?? false,
      host: dto.host !== undefined ? dto.host || null : existing?.host ?? null,
      port: dto.port !== undefined ? dto.port : existing?.port ?? null,
      secure: dto.secure ?? existing?.secure ?? false,
      username: dto.username !== undefined ? dto.username || null : existing?.username ?? null,
      fromName: dto.fromName !== undefined ? dto.fromName || null : existing?.fromName ?? null,
      fromEmail: dto.fromEmail !== undefined ? dto.fromEmail || null : existing?.fromEmail ?? null,
      passwordCiphertext,
    }

    const row = assertRow(
      existing
        ? await this.db.update(platformSmtpSettings).set(data).where(eq(platformSmtpSettings.id, existing.id)).returning()
        : await this.db.insert(platformSmtpSettings).values(data).returning(),
      )

    return {
      notificationsEnabled: row.notificationsEnabled,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      hasPassword: row.passwordCiphertext !== null,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async getAiProvider() {
    const [row] = await this.db.select().from(platformAiProviderSettings).limit(1)
    return row
      ? {
          providerType: row.providerType,
          endpoint: row.endpoint,
          defaultModel: row.defaultModel,
          isActive: row.isActive,
          hasApiKey: row.apiKeyCiphertext !== null,
          updatedAt: row.updatedAt.toISOString(),
        }
      : {
          providerType: 'OPENAI',
          endpoint: null,
          defaultModel: null,
          isActive: false,
          hasApiKey: false,
          updatedAt: null,
        }
  }

  async upsertAiProvider(dto: UpsertPlatformAiDto) {
    const [existing] = await this.db.select().from(platformAiProviderSettings).limit(1)
    let apiKeyCiphertext = existing?.apiKeyCiphertext ?? null
    if (dto.apiKey) apiKeyCiphertext = this.crypto.encrypt(dto.apiKey)

    const data = {
      providerType: dto.providerType ?? existing?.providerType ?? 'OPENAI',
      endpoint: dto.endpoint !== undefined ? dto.endpoint || null : existing?.endpoint ?? null,
      defaultModel: dto.defaultModel !== undefined ? dto.defaultModel || null : existing?.defaultModel ?? null,
      isActive: dto.isActive ?? existing?.isActive ?? false,
      apiKeyCiphertext,
    }

    const row = assertRow(
      existing
        ? await this.db.update(platformAiProviderSettings).set(data).where(eq(platformAiProviderSettings.id, existing.id)).returning()
        : await this.db.insert(platformAiProviderSettings).values(data).returning(),
      )

    return {
      providerType: row.providerType,
      endpoint: row.endpoint,
      defaultModel: row.defaultModel,
      isActive: row.isActive,
      hasApiKey: row.apiKeyCiphertext !== null,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async removeAiProviderKey() {
    const [existing] = await this.db.select().from(platformAiProviderSettings).limit(1)
    if (!existing) return this.getAiProvider()
    await this.db.update(platformAiProviderSettings).set({ apiKeyCiphertext: null }).where(eq(platformAiProviderSettings.id, existing.id))
    return this.getAiProvider()
  }
}
