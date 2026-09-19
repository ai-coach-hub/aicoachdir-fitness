export function decideExistingHandoff(status, expiresAt, now = new Date()) {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry <= now) return 'claim';
  if (status === 'succeeded') return 'succeeded';
  if (status === 'processing') return 'processing';
  return 'claim';
}
