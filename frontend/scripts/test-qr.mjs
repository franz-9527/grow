import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { parseQrCode, qrCodeFromLocation, qrLabelUrl } from '../lib/qr.ts';
import { plantingCode, plantingIdFromUrl, plantingUrl } from '../lib/planting-code.ts';

globalThis.window = { location: { origin: 'https://garden.example' } };

void test('normalize digit codes, links and query-string entry points', () => {
  assert.equal(parseQrCode(' 7 '), '007');
  assert.equal(parseQrCode('https://garden.example/q/78'), '078');
  assert.equal(parseQrCode('/?qr=999999'), '999999');
  assert.throws(() => parseQrCode('１２３'));
  assert.throws(() => parseQrCode('1234567'));
  assert.throws(() => parseQrCode('https://garden.example/other'));
});

void test('QR entry links resolve and labels use a canonical absolute URL', () => {
  assert.equal(
    qrCodeFromLocation({ href: 'https://garden.example/?qr=7' }),
    '007',
  );
  assert.equal(
    qrCodeFromLocation({ href: 'https://garden.example/q/78/' }),
    '078',
  );
  assert.equal(qrCodeFromLocation({ href: 'https://garden.example/' }), null);
  assert.equal(
    qrLabelUrl('7', 'https://garden.example'),
    'https://garden.example/q/007',
  );
});

void test('planting labels keep a unique ID and a fixed trace URL', () => {
  assert.equal(plantingCode(1), 'ZC-000001');
  assert.equal(plantingCode(2), 'ZC-000002');
  assert.equal(plantingUrl(1, 'https://garden.example'), 'https://garden.example/?trace=1');
  assert.equal(plantingIdFromUrl('https://garden.example/?trace=1', 'https://garden.example'), 1);
  assert.equal(plantingIdFromUrl('https://other.example/?trace=1', 'https://garden.example'), null);
});

void test('generated numeric and link QR labels decode with the actual camera decoder', () => {
  for (const text of ['001', 'https://garden.example/q/123456']) {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const scale = 8,
      margin = 4,
      size = (modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / scale) - margin,
          col = Math.floor(x / scale) - margin;
        if (
          row >= 0 &&
          col >= 0 &&
          row < modules.size &&
          col < modules.size &&
          modules.get(row, col)
        ) {
          const index = (y * size + x) * 4;
          pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
        }
      }
    const result = jsQR(pixels, size, size);
    assert.equal(result?.data, text);
    assert.equal(parseQrCode(result.data), text === '001' ? '001' : '123456');
  }
});
