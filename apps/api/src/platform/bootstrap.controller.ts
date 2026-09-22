import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { BootstrapService } from './bootstrap.service'
import { validateBootstrapBody } from './domain/platform-input.domain'

interface BootstrapBody {
  tenantName?: string
  tenantSlug?: string
  tenantShortName?: string
  email?: string
  password?: string
  displayName?: string
}

@Controller('platform')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Get('bootstrap/status')
  async status() {
    const completed = await this.bootstrapService.isBootstrapped()
    return { bootstrapped: completed }
  }

  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  async bootstrap(@Body() body: BootstrapBody) {
    const shape = validateBootstrapBody(body)
    if (!shape.valid) throw new BadRequestException(shape.errors)
    if (!body.tenantName || !body.email || !body.password || !body.displayName) {
      throw new BadRequestException('tenantName, email, password ve displayName zorunludur')
    }

    const result = await this.bootstrapService.bootstrapInitialAdmin({
      tenantName: body.tenantName,
      tenantSlug: body.tenantSlug,
      tenantShortName: body.tenantShortName,
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    })

    return {
      userId: result.user.id,
      email: result.user.email,
      rootTenantId: result.rootTenant.id,
      rootTenantSlug: result.rootTenant.slug,
      message: 'Bootstrap completed. System admin and root tenant created.',
    }
  }
}
