export function parseQrCode(raw: string): string {
  let code = raw.trim();
  if (!/^\d{1,6}$/.test(code)) {
    try {
      const url = new URL(code, window.location.origin);
      code =
        url.searchParams.get('qr') ||
        url.pathname.match(/^\/q\/(\d{1,6})\/?$/)?.[1] ||
        '';
    } catch {
      code = '';
    }
  }
  if (!/^\d{1,6}$/.test(code))
    throw new Error('请扫描 1～6 位数字二维码，或包含 /q/编号 的菜园链接');
  return code.padStart(3, '0');
}

export function qrCodeFromLocation(
  location: Pick<Location, 'href'>,
): string | null {
  try {
    const url = new URL(location.href);
    const raw =
      url.searchParams.get('qr') ||
      url.pathname.match(/\/q\/(\d{1,6})\/?$/)?.[1];
    return raw ? parseQrCode(raw) : null;
  } catch {
    return null;
  }
}

export function qrLabelUrl(code: string, origin: string): string {
  return new URL(`/q/${parseQrCode(code)}`, origin).toString();
}
