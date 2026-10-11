/**
 * Comprehensive Turkish Language & Character Handling Utilities
 * Provides locale-safe uppercase, lowercase, comparisons, normalization,
 * and automatic repair for character encoding/mojibake errors.
 */

// Turkish character mappings
const TURKISH_LOWER_MAP: Record<string, string> = {
  'I': 'ı',
  'İ': 'i',
  'Ğ': 'ğ',
  'Ü': 'ü',
  'Ş': 'ş',
  'Ö': 'ö',
  'Ç': 'ç',
};

const TURKISH_UPPER_MAP: Record<string, string> = {
  'ı': 'I',
  'i': 'İ',
  'ğ': 'Ğ',
  'ü': 'Ü',
  'ş': 'Ş',
  'ö': 'Ö',
  'ç': 'Ç',
};

/**
 * Converts a string to lowercase using Turkish locale rules and NFC normalization.
 * Handles 'I' -> 'ı' and 'İ' -> 'i' correctly across all JavaScript engines.
 */
export function toTurkishLower(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .normalize('NFC')
    .replace(/[IİĞÜŞÖÇ]/g, (ch) => TURKISH_LOWER_MAP[ch] || ch)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC');
}

/**
 * Converts a string to uppercase using Turkish locale rules and NFC normalization.
 * Handles 'i' -> 'İ' and 'ı' -> 'I' correctly across all JavaScript engines.
 */
export function toTurkishUpper(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .normalize('NFC')
    .replace(/[iığüşöç]/g, (ch) => TURKISH_UPPER_MAP[ch] || ch)
    .toLocaleUpperCase('tr-TR')
    .normalize('NFC');
}

/**
 * Normalizes text to Unicode NFC and trims extra invisible whitespace/BOM.
 */
export function turkishNormalize(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .normalize('NFC')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/**
 * Checks if two strings are equal in Turkish, ignoring case and whitespace differences.
 */
export function turkishEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return toTurkishLower(a).trim() === toTurkishLower(b).trim();
}

/**
 * Checks if source string contains search string in Turkish case-insensitively.
 * Also supports flexible matching for Turkish characters (e.g. typing 'i' or 'ı').
 */
export function turkishIncludes(source: string | null | undefined, search: string | null | undefined): boolean {
  if (!source) return false;
  if (!search) return true;

  const sLower = toTurkishLower(source);
  const qLower = toTurkishLower(search).trim();

  if (sLower.includes(qLower)) return true;

  // Flexible match: normalize dotless/dotted i and other accents for search convenience
  const sAscii = sLower
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

  const qAscii = qLower
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

  return sAscii.includes(qAscii);
}

/**
 * Mojibake mapping table for common encoding corruption issues:
 * - UTF-8 decoded as Windows-1252 / ISO-8859-1
 * - Windows-1254 (Turkish ANSI) decoded as Windows-1252 / ISO-8859-1
 */
const MOJIBAKE_MAP: [RegExp, string][] = [
  [/Ã§/g, 'ç'],
  [/Ã‡/g, 'Ç'],
  [/ÄŸ/g, 'ğ'],
  [/Äž/g, 'Ğ'],
  [/Ä±/g, 'ı'],
  [/Ä°/g, 'İ'],
  [/Ã¶/g, 'ö'],
  [/Ã–/g, 'Ö'],
  [/ÅŸ/g, 'ş'],
  [/Åž/g, 'Ş'],
  [/Ã¼/g, 'ü'],
  [/Ãœ/g, 'Ü'],
  [/â‚º/g, '₺'],
  [/Ã¢/g, 'â'],
  [/Ã‚/g, 'Â'],
  [/Ã®/g, 'î'],
  [/ÃŽ/g, 'Î'],
  [/Ã»/g, 'û'],
  [/Ã›/g, 'Û'],
  [/â€œ/g, '"'],
  [/â€/g, '"'],
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€“/g, '–'],
  [/â€”/g, '—'],
  [/Â\s/g, ' '],
  [/Â/g, ''],
  // Common Windows-1254 single byte garbles if decoded as latin1
  [/Ã½/g, 'ı'],
  [/Ã°/g, 'ğ'],
  [/Ã¾/g, 'ş'],
  [/Ã/g, 'İ'],
  [/Ã/g, 'Ğ'],
  [/Ã/g, 'Ş'],
];

/**
 * Automatically repairs corrupted Turkish characters (Mojibake) in a string.
 */
export function fixTurkishMojibake(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let fixed = text;
  for (const [regex, replacement] of MOJIBAKE_MAP) {
    fixed = fixed.replace(regex, replacement);
  }

  return fixed.normalize('NFC');
}

/**
 * Recursively sanitizes any object or array:
 * - Fixes Turkish mojibake in all string properties
 * - Normalizes strings to NFC
 * - Cleans up corrupted characters
 */
export function deepSanitizeTurkish<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return fixTurkishMojibake(data).normalize('NFC') as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => deepSanitizeTurkish(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const cleanKey = fixTurkishMojibake(key).normalize('NFC');
      cleaned[cleanKey] = deepSanitizeTurkish(value);
    }
    return cleaned as T;
  }

  return data;
}
