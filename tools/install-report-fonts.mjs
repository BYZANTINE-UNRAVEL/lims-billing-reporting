#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'electron-main', 'assets', 'fonts'),
  path.join(root, 'dist-electron', 'assets', 'fonts')
];

const GOOGLE_CSS_UA = 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko';

const fonts = [
  { name: 'Roboto-Regular.ttf', family: 'Roboto', weight: 400 },
  { name: 'Roboto-Bold.ttf', family: 'Roboto', weight: 700 },
  { name: 'Roboto-Italic.ttf', family: 'Roboto', weight: 400, italic: true },
  { name: 'Roboto-BoldItalic.ttf', family: 'Roboto', weight: 700, italic: true },

  { name: 'Inter-Regular.ttf', family: 'Inter', weight: 400 },
  { name: 'Inter-Bold.ttf', family: 'Inter', weight: 700 },
  { name: 'Inter-Italic.ttf', family: 'Inter', weight: 400, italic: true },
  { name: 'Inter-BoldItalic.ttf', family: 'Inter', weight: 700, italic: true },

  { name: 'Lato-Regular.ttf', family: 'Lato', weight: 400 },
  { name: 'Lato-Bold.ttf', family: 'Lato', weight: 700 },
  { name: 'Lato-Italic.ttf', family: 'Lato', weight: 400, italic: true },
  { name: 'Lato-BoldItalic.ttf', family: 'Lato', weight: 700, italic: true },

  { name: 'NotoSans-Regular.ttf', family: 'Noto Sans', weight: 400 },
  { name: 'NotoSans-Bold.ttf', family: 'Noto Sans', weight: 700 },
  { name: 'NotoSans-Italic.ttf', family: 'Noto Sans', weight: 400, italic: true },
  { name: 'NotoSans-BoldItalic.ttf', family: 'Noto Sans', weight: 700, italic: true },

  { name: 'NotoSerif-Regular.ttf', family: 'Noto Serif', weight: 400 },
  { name: 'NotoSerif-Bold.ttf', family: 'Noto Serif', weight: 700 },
  { name: 'NotoSerif-Italic.ttf', family: 'Noto Serif', weight: 400, italic: true },
  { name: 'NotoSerif-BoldItalic.ttf', family: 'Noto Serif', weight: 700, italic: true },

  { name: 'NotoSansTamil-Regular.ttf', family: 'Noto Sans Tamil', weight: 400 },
  { name: 'NotoSansTamil-Bold.ttf', family: 'Noto Sans Tamil', weight: 700 },

  { name: 'NotoSansDevanagari-Regular.ttf', family: 'Noto Sans Devanagari', weight: 400 },
  { name: 'NotoSansDevanagari-Bold.ttf', family: 'Noto Sans Devanagari', weight: 700 },
  { name: 'NotoSansMalayalam-Regular.ttf', family: 'Noto Sans Malayalam', weight: 400 },
  { name: 'NotoSansMalayalam-Bold.ttf', family: 'Noto Sans Malayalam', weight: 700 },
  { name: 'NotoSansKannada-Regular.ttf', family: 'Noto Sans Kannada', weight: 400 },
  { name: 'NotoSansKannada-Bold.ttf', family: 'Noto Sans Kannada', weight: 700 },
  { name: 'NotoSansTelugu-Regular.ttf', family: 'Noto Sans Telugu', weight: 400 },
  { name: 'NotoSansTelugu-Bold.ttf', family: 'Noto Sans Telugu', weight: 700 },
  { name: 'NotoSansBengali-Regular.ttf', family: 'Noto Sans Bengali', weight: 400 },
  { name: 'NotoSansBengali-Bold.ttf', family: 'Noto Sans Bengali', weight: 700 },

  { name: 'NotoSansSymbols-Regular.ttf', family: 'Noto Sans Symbols', weight: 400 },
  { name: 'NotoSansSymbols2-Regular.ttf', family: 'Noto Sans Symbols 2', weight: 400 },

  { name: 'Poppins-Regular.ttf', family: 'Poppins', weight: 400 },
  { name: 'Poppins-Bold.ttf', family: 'Poppins', weight: 700 },
  { name: 'Poppins-Italic.ttf', family: 'Poppins', weight: 400, italic: true },
  { name: 'Poppins-BoldItalic.ttf', family: 'Poppins', weight: 700, italic: true },

  { name: 'Montserrat-Regular.ttf', family: 'Montserrat', weight: 400 },
  { name: 'Montserrat-Bold.ttf', family: 'Montserrat', weight: 700 },
  { name: 'Montserrat-Italic.ttf', family: 'Montserrat', weight: 400, italic: true },
  { name: 'Montserrat-BoldItalic.ttf', family: 'Montserrat', weight: 700, italic: true },

  { name: 'OpenSans-Regular.ttf', family: 'Open Sans', weight: 400 },
  { name: 'OpenSans-Bold.ttf', family: 'Open Sans', weight: 700 },
  { name: 'OpenSans-Italic.ttf', family: 'Open Sans', weight: 400, italic: true },
  { name: 'OpenSans-BoldItalic.ttf', family: 'Open Sans', weight: 700, italic: true },

  { name: 'NunitoSans-Regular.ttf', family: 'Nunito Sans', weight: 400 },
  { name: 'NunitoSans-Bold.ttf', family: 'Nunito Sans', weight: 700 },
  { name: 'NunitoSans-Italic.ttf', family: 'Nunito Sans', weight: 400, italic: true },
  { name: 'NunitoSans-BoldItalic.ttf', family: 'Nunito Sans', weight: 700, italic: true },

  { name: 'SourceSans3-Regular.ttf', family: 'Source Sans 3', weight: 400 },
  { name: 'SourceSans3-Bold.ttf', family: 'Source Sans 3', weight: 700 },
  { name: 'SourceSans3-Italic.ttf', family: 'Source Sans 3', weight: 400, italic: true },
  { name: 'SourceSans3-BoldItalic.ttf', family: 'Source Sans 3', weight: 700, italic: true },

  { name: 'Merriweather-Regular.ttf', family: 'Merriweather', weight: 400 },
  { name: 'Merriweather-Bold.ttf', family: 'Merriweather', weight: 700 },
  { name: 'Merriweather-Italic.ttf', family: 'Merriweather', weight: 400, italic: true },
  { name: 'Merriweather-BoldItalic.ttf', family: 'Merriweather', weight: 700, italic: true },

  { name: 'LibreBaskerville-Regular.ttf', family: 'Libre Baskerville', weight: 400 },
  { name: 'LibreBaskerville-Bold.ttf', family: 'Libre Baskerville', weight: 700 },
  { name: 'LibreBaskerville-Italic.ttf', family: 'Libre Baskerville', weight: 400, italic: true },

  { name: 'Lora-Regular.ttf', family: 'Lora', weight: 400 },
  { name: 'Lora-Bold.ttf', family: 'Lora', weight: 700 },
  { name: 'Lora-Italic.ttf', family: 'Lora', weight: 400, italic: true },
  { name: 'Lora-BoldItalic.ttf', family: 'Lora', weight: 700, italic: true }
];

function get(url, responseType = 'buffer') {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': GOOGLE_CSS_UA,
        'Accept': responseType === 'text' ? 'text/css,*/*;q=0.1' : '*/*'
      }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        get(next, responseType).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve(responseType === 'text' ? data.toString('utf8') : data);
      });
    });
    req.on('error', reject);
  });
}

function cssUrlFor(spec) {
  const family = encodeURIComponent(spec.family).replace(/%20/g, '+');
  if (spec.italic) {
    return `https://fonts.googleapis.com/css2?family=${family}:ital,wght@1,${spec.weight}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${spec.weight}&display=swap`;
}

async function resolveFontUrl(spec) {
  const cssUrl = cssUrlFor(spec);
  const css = await get(cssUrl, 'text');
  const matches = [...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m => m[1]);
  const ttf = matches.find(u => /\.ttf(?:$|[?#])/.test(u));
  if (ttf) return ttf;
  if (matches[0]) return matches[0];
  throw new Error(`No font file URL found in Google Fonts CSS for ${spec.family} ${spec.italic ? 'italic ' : ''}${spec.weight}`);
}

async function downloadFont(spec, dest) {
  const url = await resolveFontUrl(spec);
  const data = await get(url, 'buffer');
  if (data.length < 1024) throw new Error(`Downloaded font is too small for ${spec.name}`);
  fs.writeFileSync(dest, data);
}

for (const dir of targets) fs.mkdirSync(dir, { recursive: true });

const failures = [];
for (const spec of fonts) {
  const primary = path.join(targets[0], spec.name);
  try {
    console.log(`Downloading ${spec.name}`);
    await downloadFont(spec, primary);
    for (const dir of targets.slice(1)) fs.copyFileSync(primary, path.join(dir, spec.name));
  } catch (error) {
    failures.push(`${spec.name}: ${error?.message || error}`);
    try { if (fs.existsSync(primary)) fs.unlinkSync(primary); } catch {}
    console.warn(`WARNING: Skipped ${spec.name}: ${error?.message || error}`);
  }
}

if (!fs.existsSync(path.join(targets[0], 'Roboto-Regular.ttf'))) {
  console.error('Roboto-Regular.ttf is required and was not downloaded. Check your internet connection and rerun npm run install:report-fonts.');
  process.exit(1);
}

if (failures.length) {
  console.warn('\nSome optional report fonts were not installed:');
  for (const failure of failures) console.warn(`- ${failure}`);
  console.warn('The report renderer will fall back to Roboto for missing font families.');
}

console.log('Report fonts installed into electron-main/assets/fonts and dist-electron/assets/fonts.');
