export function absoluteUrl(relativePath: string): string {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const rel = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${rel}`;
}
