import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { CurrentUser } from './current-user.decorator'
import { validateLoginAttempt } from './domain/auth.domain'
import { validateChangeOwnPassword, validateLoginBody } from './domain/platform-input.domain'
import { toSessionUserView, type SessionUserLike } from './domain/user-projection.domain'
import { JwtAuthGuard } from './jwt-auth.guard'

interface LoginBody {
  email?: string
  password?: string
}

interface ChangePasswordBody {
  currentPassword?: string
  newPassword?: string
}

interface AuthUser {
  id: string
  impersonation?: boolean
  impersonatorUserId?: string | null
}

const REFRESH_COOKIE = 'metnex_refresh_token'
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const shape = validateLoginBody(body)
    if (!shape.valid) throw new BadRequestException('INVALID_INPUT')
    const validation = validateLoginAttempt(body.email ?? '', !!body.password)
    if (!validation.valid) {
      throw new BadRequestException(validation.reason ?? 'INVALID_INPUT')
    }

    const loginResult = await this.authService.login(
      body.email!,
      body.password!,
      {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      },
    )

    if ('requiresMfa' in loginResult) {
      return loginResult
    }

    res.cookie(REFRESH_COOKIE, loginResult.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    })

    return { accessToken: loginResult.accessToken }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (!refreshToken) throw new UnauthorizedException('MISSING_REFRESH_TOKEN')

    const { accessToken, refreshToken: newRefreshToken } =
      await this.authService.refreshAccessToken(refreshToken, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      })

    res.cookie(REFRESH_COOKIE, newRefreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    })

    return { accessToken }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (refreshToken) {
      await this.authService.logout(refreshToken, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      })
    }

    res.clearCookie(REFRESH_COOKIE, { path: '/' })
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SessionUserLike) {
    return { user: toSessionUserView(user) }
  }

  /**
   * Self-service credential rotation (TASK-027.47): available to every authenticated ACTIVE user, not only
   * system administrators — it is the prerequisite that lets the peer system-administrator restriction (Model B)
   * apply without locking anyone out of their own account.
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Body() body: ChangePasswordBody, @CurrentUser() user: AuthUser) {
    const shape = validateChangeOwnPassword(body)
    if (!shape.valid) throw new BadRequestException(shape.errors)
    return this.authService.changeOwnPassword(user.id, body.currentPassword!, body.newPassword!, {
      impersonation: user.impersonation === true,
      impersonatorUserId: user.impersonatorUserId ?? null,
    })
  }
}
