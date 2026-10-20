export function plantingCode(id: number): string {
  return `ZC-${String(id).padStart(6, '0')}`;
}

export function plantingUrl(id: number, origin: string): string {
  return new URL(`/?trace=${id}`, origin).toString();
}

export function plantingIdFromUrl(raw: string, origin: string): number | null {
  try {
    const url = new URL(raw, origin);
    const id = url.searchParams.get('trace');
    if (url.origin !== origin || url.pathname !== '/' || !id || !/^\d+$/.test(id)) return null;
    const value = Number(id);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
