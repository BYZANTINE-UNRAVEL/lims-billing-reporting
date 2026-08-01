const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
  '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
  '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
  '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112',
] as const;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[ch]);
}

function code128Symbols(value: string): number[] {
  if (!value) throw new Error('Barcode value is empty.');
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Barcode contains an unsupported character: ${JSON.stringify(ch)}.`);
    }
  }

  let start = 104; // Code Set B
  const data: number[] = [];

  // Code Set C gives numeric sample IDs wider, cleaner modules on small labels.
  if (/^\d{4,}$/.test(value)) {
    let offset = 0;
    if (value.length % 2 === 0) {
      start = 105; // Start Code C
    } else {
      data.push(value.charCodeAt(0) - 32); // first digit in Code B
      data.push(99); // switch to Code C
      offset = 1;
    }
    for (let i = offset; i < value.length; i += 2) data.push(Number(value.slice(i, i + 2)));
  } else {
    for (const ch of value) data.push(ch.charCodeAt(0) - 32);
  }

  let checksum = start;
  data.forEach((code, index) => { checksum += code * (index + 1); });
  return [start, ...data, checksum % 103, 106];
}

/** Returns a standards-compliant Code 128 SVG with built-in 10-module quiet zones. */
export function code128Svg(rawValue: unknown): string {
  const value = String(rawValue ?? '').trim();
  const symbols = code128Symbols(value);
  const quietZone = 10;
  const barHeight = 64;
  let x = quietZone;
  const bars: string[] = [];

  for (const symbol of symbols) {
    const pattern = CODE128_PATTERNS[symbol];
    if (!pattern) throw new Error(`Unable to encode Code 128 symbol ${symbol}.`);
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${barHeight}"/>`);
      x += width;
    }
  }

  const totalWidth = x + quietZone;
  const label = escapeXml(value);
  // Horizontal scaling changes every module by the same factor, so Code 128
  // bar ratios remain exact while the barcode fills the requested tube width.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${barHeight}" width="100%" height="100%" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Code 128 barcode for ${label}"><title>${label}</title><rect width="${totalWidth}" height="${barHeight}" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
}
