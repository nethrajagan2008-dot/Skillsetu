// SkillSetu i18n — fully data-driven. Add a language by dropping a new
// /i18n/<code>.json file (copy en.json and translate) and adding it to LANGS.
const LANGS = [
  { code: 'en', file: 'en' },
  { code: 'hi', file: 'hi' },
  { code: 'ta', file: 'ta' },
  { code: 'te', file: 'te' },
  { code: 'bn', file: 'bn' },
  { code: 'mr', file: 'mr' },
  { code: 'gu', file: 'gu' },
  { code: 'ur', file: 'ur' },
  { code: 'es', file: 'es' },
  { code: 'fr', file: 'fr' },
  { code: 'ar', file: 'ar' },
];

const I18N = {
  dicts: {},
  current: 'en',

  async load(code) {
    if (this.dicts[code]) return this.dicts[code];
    const res = await fetch(`i18n/${code}.json`);
    const data = await res.json();
    this.dicts[code] = data;
    return data;
  },

  async setLanguage(code) {
    if (!LANGS.some(l => l.code === code)) code = 'en';
    await this.load(code);
    if (code !== 'en') await this.load('en'); // fallback dictionary
    this.current = code;
    localStorage.setItem('ss_lang', code);
    const meta = this.dicts[code].meta || {};
    document.documentElement.lang = meta.code || code;
    document.documentElement.dir = meta.dir || 'ltr';
  },

  t(key) {
    const dict = this.dicts[this.current] || {};
    const fallback = this.dicts.en || {};
    return dict[key] ?? fallback[key] ?? key;
  },

  detectInitial() {
    const saved = localStorage.getItem('ss_lang');
    if (saved) return saved;
    const nav = (navigator.language || 'en').slice(0, 2);
    return LANGS.some(l => l.code === nav) ? nav : null; // null => show picker
  },
};
