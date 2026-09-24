/** Static codes only: no raw rows, SQL, host, credential or policy content in a message. */
export type ScadaDataQualityErrorCode = 'INVALID_INPUT'

export class ScadaDataQualityError extends Error {
  constructor(readonly code: ScadaDataQualityErrorCode = 'INVALID_INPUT') {
    super(code)
    this.name = 'ScadaDataQualityError'
  }
}
