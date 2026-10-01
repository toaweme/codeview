// buildLabel names a stamped build by version and short commit,
// and an unstamped one plain "dev".
export function buildLabel(version?: string, commit?: string): string {
  const short = commit?.slice(0, 7) ?? ''
  if (!version || version === 'dev') return short ? `dev (${short})` : 'dev'
  return short ? `${version} (${short})` : version
}
