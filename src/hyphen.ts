// Переносы русских слов по слогам. Браузеры на части телефонов и компьютеров русских
// переносов не знают, и при выравнивании по ширине между словами получаются дыры.
// Ставлю в слова невидимые «мягкие переносы» (U+00AD): браузер ломает слово только там.
// Правила — упрощённый алгоритм Христова (как в старых текстовых редакторах).
//
// Russian hyphenation by syllables. Some phone and computer browsers don't hyphenate Russian,
// so justified text gets big gaps. I insert invisible soft hyphens (U+00AD) — the browser
// breaks words only there. Rules: simplified Khristov algorithm (as in old text editors).

const SHY = '\u00ad';
const x = '[йьъ]';
const g = '[аеёиоуыэюя]'; // гласные / vowels
const s = '[бвгджзклмнпрстфхцчшщ]'; // согласные / consonants
const l = '[а-яё]';

const rules = [
  new RegExp(`(${x})(?=${l}${l})`, 'gi'),
  new RegExp(`(${g})(?=${g}${l})`, 'gi'),
  new RegExp(`(${g}${s})(?=${s}${g})`, 'gi'),
  new RegExp(`(${s}${g})(?=${s}${g})`, 'gi'),
  new RegExp(`(${g}${s})(?=${s}${s}${g})`, 'gi'),
  new RegExp(`(${g}${s}${s})(?=${s}${s}${g})`, 'gi'),
];

const hyphenateWord = (w: string) => {
  let out = w;
  for (const r of rules) out = out.replace(r, `$1${SHY}`);
  // Не оставляю одну букву в начале или в конце строки / Never leave a single letter at a line edge
  return out.replace(new RegExp(`^(${l})${SHY}`, 'i'), '$1').replace(new RegExp(`${SHY}(${l})$`, 'i'), '$1');
};

export const hyphenate = (text: string) => text.replace(/[а-яё]{5,}/gi, hyphenateWord);

// Перевод номера символа между текстом с переносами (на экране) и без (в базе)
// Converting char index between the hyphenated text (on screen) and the plain one (in the DB)
export function toPlain(shown: string, i: number) {
  let n = 0;
  for (let k = 0; k < i && k < shown.length; k++) if (shown[k] !== SHY) n++;
  return n;
}

export function toShown(shown: string, j: number) {
  let n = 0;
  for (let k = 0; k < shown.length; k++) {
    if (shown[k] === SHY) continue;
    if (n === j) return k;
    n++;
  }
  return shown.length;
}
