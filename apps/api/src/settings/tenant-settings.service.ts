import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { platformAiProviderSettings, platformSmtpSettings, tenantAiProviderOverrides, tenantSmtpOverrides } from '../db/schema'
import { CredentialCryptoService } from './credential-crypto.service'

export interface UpsertSmtpOverrideDto {
  notificationsEnabled?: boolean
  host?: string
  port?: number
  secure?: boolean
  username?: string
  password?: string
  fromName?: string
  fromEmail?: string
}

export interface UpsertAiOverrideDto {
  providerType?: string
  apiKey?: string
  endpoint?: string
  defaultModel?: string
  isActive?: boolean
}

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async resolveEffectiveSmtp(tenantId: string) {
    const [override] = await this.db.select().from(tenantSmtpOverrides).where(eq(tenantSmtpOverrides.tenantId, tenantId)).limit(1)
    if (override) {
      return {
        source: 'tenant',
        notificationsEnabled: override.notificationsEnabled,
        host: override.host,
        port: override.port,
        secure: override.secure,
        username: override.username,
        fromName: override.fromName,
        fromEmail: override.fromEmail,
        hasPassword: override.passwordCiphertext !== null,
        updatedAt: override.updatedAt.toISOString(),
      }
    }

    const [platform] = await this.db.select().from(platformSmtpSettings).limit(1)
    if (platform) {
      return {
        source: 'platform',
        notificationsEnabled: platform.notificationsEnabled,
        host: platform.host,
        port: platform.port,
        secure: platform.secure,
        username: platform.username,
        fromName: platform.fromName,
        fromEmail: platform.fromEmail,
        hasPassword: platform.passwordCiphertext !== null,
        updatedAt: platform.updatedAt.toISOString(),
      }
    }

    return {
      source: 'none',
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

  async getSmtpOverride(tenantId: string) {
    const [override] = await this.db.select().from(tenantSmtpOverrides).where(eq(tenantSmtpOverrides.tenantId, tenantId)).limit(1)
    return override
      ? {
          notificationsEnabled: override.notificationsEnabled,
          host: override.host,
          port: override.port,
          secure: override.secure,
          username: override.username,
          fromName: override.fromName,
          fromEmail: override.fromEmail,
          hasPassword: override.passwordCiphertext !== null,
          updatedAt: override.updatedAt.toISOString(),
        }
      : null
  }

  async upsertSmtpOverride(tenantId: string, dto: UpsertSmtpOverrideDto) {
    const [existing] = await this.db.select().from(tenantSmtpOverrides).where(eq(tenantSmtpOverrides.tenantId, tenantId)).limit(1)
    let passwordCiphertext = existing?.passwordCiphertext ?? null
    if (dto.password) passwordCiphertext = this.crypto.encrypt(dto.password)

    const row = assertRow(
      await this.db
        .insert(tenantSmtpOverrides)
        .values({
          tenantId,
          notificationsEnabled: dto.notificationsEnabled ?? false,
          host: dto.host || null,
          port: dto.port ?? null,
          secure: dto.secure ?? false,
          username: dto.username || null,
          fromName: dto.fromName || null,
          fromEmail: dto.fromEmail || null,
          passwordCiphertext,
        })
        .onConflictDoUpdate({
          target: tenantSmtpOverrides.tenantId,
          set: {
            notificationsEnabled: dto.notificationsEnabled ?? existing?.notificationsEnabled ?? false,
            host: dto.host !== undefined ? dto.host || null : existing?.host ?? null,
            port: dto.port !== undefined ? dto.port : existing?.port ?? null,
            secure: dto.secure ?? existing?.secure ?? false,
            username: dto.username !== undefined ? dto.username || null : existing?.username ?? null,
            fromName: dto.fromName !== undefined ? dto.fromName || null : existing?.fromName ?? null,
            fromEmail: dto.fromEmail !== undefined ? dto.fromEmail || null : existing?.fromEmail ?? null,
            passwordCiphertext,
          },
        })
        .returning(),
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

  async deleteSmtpOverride(tenantId: string) {
    const [existing] = await this.db.select().from(tenantSmtpOverrides).where(eq(tenantSmtpOverrides.tenantId, tenantId)).limit(1)
    if (!existing) throw new NotFoundException('Bu kiracı için SMTP override bulunamadı')
    await this.db.delete(tenantSmtpOverrides).where(eq(tenantSmtpOverrides.tenantId, tenantId))
  }

  async resolveEffectiveAiProvider(tenantId: string) {
    const [override] = await this.db.select().from(tenantAiProviderOverrides).where(eq(tenantAiProviderOverrides.tenantId, tenantId)).limit(1)
    if (override) {
      return {
        source: 'tenant',
        providerType: override.providerType,
        endpoint: override.endpoint,
        defaultModel: override.defaultModel,
        isActive: override.isActive,
        hasApiKey: override.apiKeyCiphertext !== null,
        updatedAt: override.updatedAt.toISOString(),
      }
    }

    const [platform] = await this.db.select().from(platformAiProviderSettings).limit(1)
    if (platform) {
      return {
        source: 'platform',
        providerType: platform.providerType,
        endpoint: platform.endpoint,
        defaultModel: platform.defaultModel,
        isActive: platform.isActive,
        hasApiKey: platform.apiKeyCiphertext !== null,
        updatedAt: platform.updatedAt.toISOString(),
      }
    }

    return {
      source: 'none',
      providerType: 'OPENAI',
      endpoint: null,
      defaultModel: null,
      isActive: false,
      hasApiKey: false,
      updatedAt: null,
    }
  }

  async getAiProviderOverride(tenantId: string) {
    const [override] = await this.db.select().from(tenantAiProviderOverrides).where(eq(tenantAiProviderOverrides.tenantId, tenantId)).limit(1)
    return override
      ? {
          providerType: override.providerType,
          endpoint: override.endpoint,
          defaultModel: override.defaultModel,
          isActive: override.isActive,
          hasApiKey: override.apiKeyCiphertext !== null,
          updatedAt: override.updatedAt.toISOString(),
        }
      : null
  }

  async upsertAiProviderOverride(tenantId: string, dto: UpsertAiOverrideDto) {
    const [existing] = await this.db.select().from(tenantAiProviderOverrides).where(eq(tenantAiProviderOverrides.tenantId, tenantId)).limit(1)
    let apiKeyCiphertext = existing?.apiKeyCiphertext ?? null
    if (dto.apiKey) apiKeyCiphertext = this.crypto.encrypt(dto.apiKey)

    const row = assertRow(
      await this.db
        .insert(tenantAiProviderOverrides)
        .values({
          tenantId,
          providerType: dto.providerType ?? 'OPENAI',
          endpoint: dto.endpoint || null,
          defaultModel: dto.defaultModel || null,
          apiKeyCiphertext,
          isActive: dto.isActive ?? false,
        })
        .onConflictDoUpdate({
          target: tenantAiProviderOverrides.tenantId,
          set: {
            providerType: dto.providerType ?? existing?.providerType ?? 'OPENAI',
            endpoint: dto.endpoint !== undefined ? dto.endpoint || null : existing?.endpoint ?? null,
            defaultModel: dto.defaultModel !== undefined ? dto.defaultModel || null : existing?.defaultModel ?? null,
            apiKeyCiphertext,
            isActive: dto.isActive ?? existing?.isActive ?? false,
          },
        })
        .returning(),
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

  async deleteAiProviderOverride(tenantId: string) {
    const [existing] = await this.db.select().from(tenantAiProviderOverrides).where(eq(tenantAiProviderOverrides.tenantId, tenantId)).limit(1)
    if (!existing) throw new NotFoundException('Bu kiracı için AI provider override bulunamadı')
    await this.db.delete(tenantAiProviderOverrides).where(eq(tenantAiProviderOverrides.tenantId, tenantId))
  }
}
