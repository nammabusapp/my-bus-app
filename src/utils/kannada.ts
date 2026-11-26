// Clean phonetic transliteration helper for optional Kannada typing on standard keyboards
const CONSONANTS: Array<[string, string]> = [
  ['ksh', 'ಕ್ಷ'],
  ['jny', 'ಜ್ಞ'],
  ['kh', 'ಖ'],
  ['gh', 'ಘ'],
  ['ng', 'ಙ'],
  ['chh', 'ಛ'],
  ['ch', 'ಚ'],
  ['jh', 'ಝ'],
  ['ny', 'ಞ'],
  ['th', 'ಥ'],
  ['dh', 'ಧ'],
  ['ph', 'ಫ'],
  ['bh', 'ಭ'],
  ['sh', 'ಶ'],
  ['Sh', 'ಷ'],
  ['T', 'ಟ'],
  ['Th', 'ಠ'],
  ['D', 'ಡ'],
  ['Dh', 'ಢ'],
  ['N', 'ಣ'],
  ['k', 'ಕ'],
  ['g', 'ಗ'],
  ['j', 'ಜ'],
  ['t', 'ತ'],
  ['d', 'ದ'],
  ['n', 'ನ'],
  ['p', 'ಪ'],
  ['b', 'ಬ'],
  ['m', 'ಮ'],
  ['y', 'ಯ'],
  ['r', 'ರ'],
  ['l', 'ಲ'],
  ['L', 'ಳ'],
  ['v', 'ವ'],
  ['w', 'ವ'],
  ['s', 'ಸ'],
  ['h', 'ಹ'],
];

const VOWELS: Array<[string, string, string]> = [
  // [roman, independent, matra]
  ['aa', 'ಆ', 'ಾ'],
  ['ee', 'ಈ', 'ೀ'],
  ['ii', 'ಈ', 'ೀ'],
  ['oo', 'ಊ', 'ೂ'],
  ['uu', 'ಊ', 'ೂ'],
  ['ai', 'ಐ', 'ೈ'],
  ['au', 'ಔ', 'ೌ'],
  ['ou', 'ಔ', 'ೌ'],
  ['ru', 'ಋ', 'ೃ'],
  ['a', 'ಅ', ''],
  ['A', 'ಆ', 'ಾ'],
  ['i', 'ಇ', 'ಿ'],
  ['I', 'ಈ', 'ೀ'],
  ['u', 'ಉ', 'ು'],
  ['U', 'ಊ', 'ೂ'],
  ['e', 'ಎ', 'ೆ'],
  ['E', 'ಏ', 'ೇ'],
  ['o', 'ಒ', 'ೊ'],
  ['O', 'ಓ', 'ೋ'],
];

export function transliterateToKannada(input: string): string {
  // Preserve already-Kannada characters, digits, punctuation, and spaces
  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (!/[a-zA-Z]/.test(ch)) {
      if (ch === 'M' || ch === 'H') {
        out += ch === 'M' ? 'ಂ' : 'ಃ';
      } else {
        out += ch;
      }
      i += 1;
      continue;
    }

    // Check consonant match
    const rest = input.slice(i);
    const conMatch = CONSONANTS.find(([rom]) => rest.startsWith(rom));
    if (conMatch) {
      const [rom, knCon] = conMatch;
      i += rom.length;
      const afterCon = input.slice(i);
      const vowelMatch = VOWELS.find(([vRom]) => afterCon.startsWith(vRom));
      if (vowelMatch) {
        const [vRom, , matra] = vowelMatch;
        out += knCon + matra;
        i += vRom.length;
      } else if (afterCon.length > 0 && /[a-zA-Z]/.test(afterCon[0])) {
        // Consonant cluster -> add halant (virama)
        out += knCon + '್';
      } else {
        out += knCon;
      }
      continue;
    }

    // Check independent vowel match
    const vowMatch = VOWELS.find(([vRom]) => rest.startsWith(vRom));
    if (vowMatch) {
      const [vRom, indep] = vowMatch;
      out += indep;
      i += vRom.length;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}
