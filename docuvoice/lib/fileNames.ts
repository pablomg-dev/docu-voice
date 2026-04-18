/**
 * Derives a safe MP3 filename from a document title.
 *
 * Rules:
 * - Lowercase
 * - Replace spaces and non-alphanumeric chars with hyphens
 * - Collapse consecutive hyphens
 * - Strip leading/trailing hyphens
 * - Append a timestamp suffix
 * - Always ends with .mp3
 * - Falls back to "docuvoice-audio" if the slug is empty
 */
export function deriveFilename(title: string, suffix?: string): string {
  const slug = title
    .toLowerCase()
    // Normalize unicode to ASCII-compatible form
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace anything that isn't alphanumeric or hyphen with a hyphen
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse consecutive hyphens
    .replace(/-{2,}/g, '-')
    // Strip leading/trailing hyphens
    .replace(/^-+|-+$/g, '')

  const base = slug || 'docuvoice-audio'
  const timestamp = Date.now()
  const suffixPart = suffix ? `-${suffix}` : ''

  return `${base}${suffixPart}-${timestamp}.mp3`
}
