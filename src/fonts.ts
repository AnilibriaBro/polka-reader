// Шрифты для чтения. Все лежат внутри приложения (работают без интернета), и от каждого беру
// только русские и латинские буквы — так приложение не раздувается. Файл шрифта загружается,
// только когда его выбрали.
// Reading fonts. All ship inside the app (work offline); only Cyrillic and Latin parts are taken,
// so the app stays small. A font file loads only when the font is chosen.

import literataCyr from '@fontsource-variable/literata/files/literata-cyrillic-opsz-normal.woff2?url';
import literataLat from '@fontsource-variable/literata/files/literata-latin-opsz-normal.woff2?url';
import literataCyrI from '@fontsource-variable/literata/files/literata-cyrillic-opsz-italic.woff2?url';
import literataLatI from '@fontsource-variable/literata/files/literata-latin-opsz-italic.woff2?url';
import onestCyr from '@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2?url';
import onestLat from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url';
import ptSerifCyr from '@fontsource/pt-serif/files/pt-serif-cyrillic-400-normal.woff2?url';
import ptSerifLat from '@fontsource/pt-serif/files/pt-serif-latin-400-normal.woff2?url';
import ptSerifCyrB from '@fontsource/pt-serif/files/pt-serif-cyrillic-700-normal.woff2?url';
import ptSerifLatB from '@fontsource/pt-serif/files/pt-serif-latin-700-normal.woff2?url';
import ptSerifCyrI from '@fontsource/pt-serif/files/pt-serif-cyrillic-400-italic.woff2?url';
import ptSerifLatI from '@fontsource/pt-serif/files/pt-serif-latin-400-italic.woff2?url';
import loraCyr from '@fontsource-variable/lora/files/lora-cyrillic-wght-normal.woff2?url';
import loraLat from '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url';
import loraCyrI from '@fontsource-variable/lora/files/lora-cyrillic-wght-italic.woff2?url';
import loraLatI from '@fontsource-variable/lora/files/lora-latin-wght-italic.woff2?url';
import garamondCyr from '@fontsource-variable/eb-garamond/files/eb-garamond-cyrillic-wght-normal.woff2?url';
import garamondLat from '@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2?url';
import garamondCyrI from '@fontsource-variable/eb-garamond/files/eb-garamond-cyrillic-wght-italic.woff2?url';
import garamondLatI from '@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-italic.woff2?url';
import merriCyr from '@fontsource-variable/merriweather/files/merriweather-cyrillic-opsz-normal.woff2?url';
import merriLat from '@fontsource-variable/merriweather/files/merriweather-latin-opsz-normal.woff2?url';
import merriCyrI from '@fontsource-variable/merriweather/files/merriweather-cyrillic-opsz-italic.woff2?url';
import merriLatI from '@fontsource-variable/merriweather/files/merriweather-latin-opsz-italic.woff2?url';
import slabCyr from '@fontsource-variable/roboto-slab/files/roboto-slab-cyrillic-wght-normal.woff2?url';
import slabLat from '@fontsource-variable/roboto-slab/files/roboto-slab-latin-wght-normal.woff2?url';
import ptSansCyr from '@fontsource/pt-sans/files/pt-sans-cyrillic-400-normal.woff2?url';
import ptSansLat from '@fontsource/pt-sans/files/pt-sans-latin-400-normal.woff2?url';
import ptSansCyrB from '@fontsource/pt-sans/files/pt-sans-cyrillic-700-normal.woff2?url';
import ptSansLatB from '@fontsource/pt-sans/files/pt-sans-latin-700-normal.woff2?url';
import ptSansCyrI from '@fontsource/pt-sans/files/pt-sans-cyrillic-400-italic.woff2?url';
import ptSansLatI from '@fontsource/pt-sans/files/pt-sans-latin-400-italic.woff2?url';
import nunitoCyr from '@fontsource-variable/nunito/files/nunito-cyrillic-wght-normal.woff2?url';
import nunitoLat from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import nunitoCyrI from '@fontsource-variable/nunito/files/nunito-cyrillic-wght-italic.woff2?url';
import nunitoLatI from '@fontsource-variable/nunito/files/nunito-latin-wght-italic.woff2?url';
import openCyr from '@fontsource-variable/open-sans/files/open-sans-cyrillic-wght-normal.woff2?url';
import openLat from '@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2?url';
import openCyrI from '@fontsource-variable/open-sans/files/open-sans-cyrillic-wght-italic.woff2?url';
import openLatI from '@fontsource-variable/open-sans/files/open-sans-latin-wght-italic.woff2?url';

const CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

// [файл кириллицы, файл латиницы, насыщенность, начертание] / [Cyrillic file, Latin file, weight, style]
type Face = [string, string, string, 'normal' | 'italic'];

export type ReadingFont = {
  id: string;
  name: string; // как называется в настройках / name shown in settings
  kind: 'serif' | 'sans';
  family: string; // имя для CSS / CSS family name
  faces: Face[];
};

export const FONTS: ReadingFont[] = [
  { id: 'literata', name: 'Literata', kind: 'serif', family: 'Literata Polka', faces: [
    [literataCyr, literataLat, '200 900', 'normal'], [literataCyrI, literataLatI, '200 900', 'italic']] },
  { id: 'pt-serif', name: 'PT Serif', kind: 'serif', family: 'PT Serif Polka', faces: [
    [ptSerifCyr, ptSerifLat, '400', 'normal'], [ptSerifCyrB, ptSerifLatB, '700', 'normal'], [ptSerifCyrI, ptSerifLatI, '400', 'italic']] },
  { id: 'lora', name: 'Lora', kind: 'serif', family: 'Lora Polka', faces: [
    [loraCyr, loraLat, '400 700', 'normal'], [loraCyrI, loraLatI, '400 700', 'italic']] },
  { id: 'garamond', name: 'Garamond', kind: 'serif', family: 'EB Garamond Polka', faces: [
    [garamondCyr, garamondLat, '400 800', 'normal'], [garamondCyrI, garamondLatI, '400 800', 'italic']] },
  { id: 'merriweather', name: 'Merriweather', kind: 'serif', family: 'Merriweather Polka', faces: [
    [merriCyr, merriLat, '300 900', 'normal'], [merriCyrI, merriLatI, '300 900', 'italic']] },
  { id: 'roboto-slab', name: 'Roboto Slab', kind: 'serif', family: 'Roboto Slab Polka', faces: [
    [slabCyr, slabLat, '100 900', 'normal']] },
  { id: 'onest', name: 'Onest', kind: 'sans', family: 'Onest Polka', faces: [
    [onestCyr, onestLat, '100 900', 'normal']] },
  { id: 'pt-sans', name: 'PT Sans', kind: 'sans', family: 'PT Sans Polka', faces: [
    [ptSansCyr, ptSansLat, '400', 'normal'], [ptSansCyrB, ptSansLatB, '700', 'normal'], [ptSansCyrI, ptSansLatI, '400', 'italic']] },
  { id: 'nunito', name: 'Nunito', kind: 'sans', family: 'Nunito Polka', faces: [
    [nunitoCyr, nunitoLat, '200 1000', 'normal'], [nunitoCyrI, nunitoLatI, '200 1000', 'italic']] },
  { id: 'open-sans', name: 'Open Sans', kind: 'sans', family: 'Open Sans Polka', faces: [
    [openCyr, openLat, '300 800', 'normal'], [openCyrI, openLatI, '300 800', 'italic']] },
  { id: 'system', name: 'Как в телефоне', kind: 'sans', family: '', faces: [] },
];

// Старые настройки хранили «serif»/«sans» — перевожу в новые / Old settings stored "serif"/"sans"
export const fontById = (id: string) =>
  FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === (id === 'sans' ? 'onest' : 'literata'))!;

export const cssFamily = (f: ReadingFont) =>
  f.family ? `"${f.family}", ${f.kind === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif'}` : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Регистрирую все шрифты: браузер узнаёт о них, но файлы скачивает только по необходимости
// Registering all fonts: the browser knows them but fetches files only when needed
export function registerFonts() {
  for (const f of FONTS) {
    for (const [cyr, lat, weight, style] of f.faces) {
      document.fonts.add(new FontFace(f.family, `url(${cyr}) format('woff2')`, { weight, style, unicodeRange: CYR, display: 'swap' }));
      document.fonts.add(new FontFace(f.family, `url(${lat}) format('woff2')`, { weight, style, unicodeRange: LAT, display: 'swap' }));
    }
  }
}

// Дождаться, пока шрифт загрузится: без этого страницы посчитаются по запасному шрифту
// Wait for a font to load, otherwise pages are measured with the fallback font
export async function loadFont(f: ReadingFont) {
  if (!f.family) return;
  await Promise.all([
    document.fonts.load(`400 18px "${f.family}"`, 'Аа Aa'),
    document.fonts.load(`italic 400 18px "${f.family}"`, 'Аа Aa'),
  ]).catch(() => {});
}
