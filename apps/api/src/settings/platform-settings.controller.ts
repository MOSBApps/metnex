import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser } from '../platform/current-user.decorator'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { validateAiSettings, validatePlatformGeneral, validateSmtpSettings } from './settings-input.domain'
import {
  PlatformSettingsService,
  UpsertPlatformAiDto,
  UpsertPlatformGeneralDto,
  UpsertPlatformSmtpDto,
} from './platform-settings.service'

interface AuthUser {
  isSystemAdmin: boolean
}

@Controller('platform/settings')
@UseGuards(JwtAuthGuard)
export class PlatformSettingsController {
  constructor(private readonly svc: PlatformSettingsService) {}

  private requireSystemAdmin(user: AuthUser) {
    if (!user.isSystemAdmin) {
      throw new ForbiddenException('Bu endpoint yalnızca sistem yöneticilerine açıktır')
    }
  }

  @Get('general')
  async getGeneral(@CurrentUser() user: AuthUser) {
    this.requireSystemAdmin(user)
    return this.svc.getGeneral()
  }

  @Put('general')
  async upsertGeneral(@CurrentUser() user: AuthUser, @Body() dto: UpsertPlatformGeneralDto) {
    this.requireSystemAdmin(user)
    const validation = validatePlatformGeneral(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.svc.upsertGeneral(dto)
  }

  @Get('smtp')
  async getSmtp(@CurrentUser() user: AuthUser) {
    this.requireSystemAdmin(user)
    return this.svc.getSmtp()
  }

  @Put('smtp')
  async upsertSmtp(@CurrentUser() user: AuthUser, @Body() dto: UpsertPlatformSmtpDto) {
    this.requireSystemAdmin(user)
    const validation = validateSmtpSettings(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.svc.upsertSmtp(dto)
  }

  @Post('smtp/test')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  async testSmtp(@CurrentUser() user: AuthUser) {
    this.requireSystemAdmin(user)
    return { message: 'SMTP test henüz uygulanmadı' }
  }

  @Get('ai-provider')
  async getAiProvider(@CurrentUser() user: AuthUser) {
    this.requireSystemAdmin(user)
    return this.svc.getAiProvider()
  }

  @Put('ai-provider')
  async upsertAiProvider(@CurrentUser() user: AuthUser, @Body() dto: UpsertPlatformAiDto) {
    this.requireSystemAdmin(user)
    const validation = validateAiSettings(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.svc.upsertAiProvider(dto)
  }

  @Delete('ai-provider/key')
  async removeAiProviderKey(@CurrentUser() user: AuthUser) {
    this.requireSystemAdmin(user)
    return this.svc.removeAiProviderKey()
  }
}
