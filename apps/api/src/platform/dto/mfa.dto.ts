import { RECOVERY_CODE_PATTERN } from '../domain/mfa-input.domain'
import { IsBoolean, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator'


export class VerifyTotpSetupDto {
  @IsString()
  @Length(6, 6, { message: 'Doğrulama kodu 6 haneli olmalıdır' })
  code!: string
}

export class DisableTotpDto {
  @IsString()
  password!: string

  @IsString()
  @Length(6, 6, { message: 'Doğrulama kodu 6 haneli olmalıdır' })
  code!: string
}

export class RegenerateRecoveryCodesDto {
  @IsString()
  @Length(6, 6, { message: 'Doğrulama kodu 6 haneli olmalıdır' })
  code!: string
}

export class VerifyMfaChallengeDto {
  @IsString()
  challengeToken!: string

  @IsOptional()
  @ValidateIf((o: VerifyMfaChallengeDto) => !o.recoveryCode)
  @IsString()
  @Length(6, 6, { message: 'Doğrulama kodu 6 haneli olmalıdır' })
  code?: string

  @IsOptional()
  @ValidateIf((o: VerifyMfaChallengeDto) => !o.code)
  @IsString()
  @Matches(RECOVERY_CODE_PATTERN, {
    message: 'Kurtarma kodu formatı geçersiz',
  })
  recoveryCode?: string
}

export class SetTenantMfaPolicyDto {
  @IsBoolean()
  mfaRequired!: boolean
}
