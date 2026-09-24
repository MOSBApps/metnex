import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/lib/api'
import SecuritySettingsPage from '../page'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)

/**
 * TASK-027.48 — apps/web had zero coverage of the MFA setup/disable/recovery-code UI before this
 * task (the whole feature didn't exist). This covers the four state transitions a user can drive:
 * disabled → setup → recovery-codes → enabled, and enabled → disabling/regenerating → back.
 */
describe('SecuritySettingsPage', () => {
  beforeEach(() => {
    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
  })

  it('shows the setup call-to-action when MFA is not enabled', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: false })
    render(<SecuritySettingsPage />)

    expect(await screen.findByText('MFA şu anda hesabınızda etkin değil.')).toBeInTheDocument()
    expect(mockedApiGet).toHaveBeenCalledWith('/api/v1/auth/mfa/status')
  })

  it('shows the enabled state with regenerate/disable actions when MFA is already enabled', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: true })
    render(<SecuritySettingsPage />)

    expect(await screen.findByText('MFA hesabınızda etkin.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kurtarma Kodlarını Yenile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "MFA'yı Devre Dışı Bırak" })).toBeInTheDocument()
  })

  it('full setup flow: start setup shows the QR + secret, verifying the code shows recovery codes, acknowledging returns to the enabled view', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: true })
    mockedApiPost
      .mockResolvedValueOnce({ otpauthUri: 'otpauth://totp/x', qrDataUri: 'data:image/png;base64,abc', secret: 'JBSWY3DP' })
      .mockResolvedValueOnce({ recoveryCodes: ['ABCD-2345', 'EFGH-6789'] })
    render(<SecuritySettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'MFA Kurulumunu Başlat' }))

    expect(await screen.findByAltText('MFA QR kodu')).toHaveAttribute('src', 'data:image/png;base64,abc')
    expect(screen.getByText('JBSWY3DP')).toBeInTheDocument()
    expect(mockedApiPost).toHaveBeenNthCalledWith(1, '/api/v1/auth/mfa/totp/setup')

    fireEvent.change(screen.getByLabelText(/Authenticator uygulamasındaki 6 haneli kod/), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve Etkinleştir' }))

    expect(await screen.findByText('ABCD-2345')).toBeInTheDocument()
    expect(screen.getByText('EFGH-6789')).toBeInTheDocument()
    expect(mockedApiPost).toHaveBeenNthCalledWith(2, '/api/v1/auth/mfa/totp/verify-setup', { code: '654321' })

    fireEvent.click(screen.getByRole('button', { name: 'Kaydettim, Devam Et' }))
    expect(await screen.findByText('MFA hesabınızda etkin.')).toBeInTheDocument()
    expect(mockedApiGet).toHaveBeenCalledTimes(2)
  })

  it('shows an error and stays on the setup-code step when the verification code is rejected', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: false })
    mockedApiPost
      .mockResolvedValueOnce({ otpauthUri: 'otpauth://totp/x', qrDataUri: 'data:image/png;base64,abc', secret: 'JBSWY3DP' })
      .mockRejectedValueOnce(new Error('invalid code'))
    render(<SecuritySettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'MFA Kurulumunu Başlat' }))
    await screen.findByAltText('MFA QR kodu')
    fireEvent.change(screen.getByLabelText(/Authenticator uygulamasındaki 6 haneli kod/), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve Etkinleştir' }))

    expect(await screen.findByText(/Kod doğrulanamadı/)).toBeInTheDocument()
    expect(screen.getByAltText('MFA QR kodu')).toBeInTheDocument() // still on the setup step, not silently advanced
  })

  it('disable flow: sends password + code, returns to the disabled view on success', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: true })
    mockedApiPost.mockResolvedValueOnce({ success: true })
    render(<SecuritySettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: "MFA'yı Devre Dışı Bırak" }))
    fireEvent.change(screen.getByLabelText(/^Parola/), { target: { value: 'StrongPass1!' } })
    fireEvent.change(screen.getByLabelText(/Authenticator kodu/), { target: { value: '111222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Devre Dışı Bırak' }))

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/api/v1/auth/mfa/totp/disable', { password: 'StrongPass1!', code: '111222' }),
    )
    expect(await screen.findByText('MFA şu anda hesabınızda etkin değil.')).toBeInTheDocument()
  })

  it('disable flow: a rejected password/code shows an error and does not advance', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: true })
    mockedApiPost.mockRejectedValueOnce(new Error('wrong password'))
    render(<SecuritySettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: "MFA'yı Devre Dışı Bırak" }))
    fireEvent.change(screen.getByLabelText(/^Parola/), { target: { value: 'wrong' } })
    fireEvent.change(screen.getByLabelText(/Authenticator kodu/), { target: { value: '111222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Devre Dışı Bırak' }))

    expect(await screen.findByText(/MFA devre dışı bırakılamadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Devre Dışı Bırak' })).toBeInTheDocument() // still on the disable form
  })

  it('regenerate flow: sends the code, shows new recovery codes', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: true })
    mockedApiPost.mockResolvedValueOnce({ recoveryCodes: ['WXYZ-0001'] })
    render(<SecuritySettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Kurtarma Kodlarını Yenile' }))
    fireEvent.change(screen.getByLabelText(/Authenticator kodu/), { target: { value: '999888' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kurtarma Kodlarını Yenile' }))

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/api/v1/auth/mfa/recovery-codes/regenerate', { code: '999888' }),
    )
    expect(await screen.findByText('WXYZ-0001')).toBeInTheDocument()
  })

  it('"Vazgeç" on the disable form returns to the enabled view without calling the API', async () => {
    mockedApiGet.mockResolvedValueOnce({ enabled: true })
    render(<SecuritySettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: "MFA'yı Devre Dışı Bırak" }))
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))

    expect(await screen.findByText('MFA hesabınızda etkin.')).toBeInTheDocument()
    expect(mockedApiPost).not.toHaveBeenCalled()
  })
})
