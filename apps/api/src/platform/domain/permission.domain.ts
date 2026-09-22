export function checkPermission(codes: string[], required: string) {
  return { granted: codes.includes(required) }
}
