// ═══════════════════════════════════════════════════════════════
// LANGUAGES — worldwide, grouped by family for the UI
// ═══════════════════════════════════════════════════════════════

export const languageGroups: Record<string, string[]> = {
  "Major World Languages": [
    "English", "Spanish", "French", "Portuguese", "German", "Italian",
    "Russian", "Chinese (Mandarin)", "Chinese (Cantonese)", "Japanese", "Korean",
    "Arabic", "Hindi", "Bengali", "Urdu", "Punjabi",
    "Indonesian", "Malay", "Vietnamese", "Thai", "Turkish",
    "Persian (Farsi)", "Swahili",
  ],
  "European": [
    "Dutch", "Swedish", "Norwegian", "Danish", "Finnish", "Icelandic",
    "Polish", "Czech", "Slovak", "Romanian", "Hungarian",
    "Greek", "Bulgarian", "Serbian", "Croatian", "Bosnian",
    "Slovenian", "Macedonian", "Albanian", "Montenegrin",
    "Ukrainian", "Belarusian", "Lithuanian", "Latvian", "Estonian",
    "Irish (Gaeilge)", "Welsh (Cymraeg)", "Scottish Gaelic",
    "Basque (Euskara)", "Catalan", "Galician",
    "Maltese", "Luxembourgish", "Romansh",
  ],
  "Caucasus & Central Asia": [
    "Georgian", "Armenian", "Azerbaijani",
    "Kazakh", "Uzbek", "Kyrgyz", "Tajik", "Turkmen",
    "Chechen", "Ossetian", "Abkhaz",
  ],
  "Middle Eastern & North African": [
    "Arabic (Classical)", "Arabic (Modern Standard)", "Arabic (Egyptian)",
    "Arabic (Levantine)", "Arabic (Gulf)", "Arabic (Maghrebi)",
    "Hebrew", "Aramaic", "Syriac",
    "Kurdish (Kurmanji)", "Kurdish (Sorani)",
    "Pashto", "Dari",
    "Amazigh (Berber)", "Coptic",
  ],
  "South Asian": [
    "Sanskrit", "Pali", "Tamil", "Telugu", "Kannada", "Malayalam",
    "Marathi", "Gujarati", "Odia", "Assamese",
    "Sinhala", "Nepali", "Tibetan", "Dzongkha",
  ],
  "East Asian": [
    "Chinese (Classical/Literary)", "Chinese (Simplified)", "Chinese (Traditional)",
    "Japanese", "Korean",
    "Mongolian", "Manchu",
  ],
  "Southeast Asian": [
    "Thai", "Lao", "Khmer", "Burmese",
    "Vietnamese", "Indonesian", "Malay",
    "Tagalog/Filipino", "Cebuano", "Javanese",
  ],
  "African": [
    "Swahili", "Amharic", "Tigrinya", "Oromo",
    "Yoruba", "Igbo", "Hausa", "Zulu", "Xhosa",
    "Somali", "Afrikaans", "Malagasy",
    "Twi/Akan", "Wolof", "Lingala",
    "Ge'ez (Classical Ethiopian)",
  ],
  "Americas (Indigenous)": [
    "Nahuatl", "Quechua", "Aymara", "Guaraní",
    "Maya (Yucatec)", "Zapotec", "Mapudungun",
    "Navajo (Diné)", "Cherokee", "Ojibwe", "Inuktitut",
  ],
  "Pacific & Austronesian": [
    "Hawaiian", "Māori", "Samoan", "Tongan", "Fijian",
  ],
  "Classical & Liturgical": [
    "Latin", "Ancient Greek", "Sanskrit", "Pali",
    "Classical Chinese (文言文)", "Old Church Slavonic",
    "Ge'ez", "Coptic", "Avestan",
    "Old Norse", "Old English", "Middle English",
    "Old French", "Old High German",
    "Esperanto", "Yiddish",
  ],
};

// Flat list for simple dropdowns
export const languages = Object.values(languageGroups).flat().filter(
  (v, i, a) => a.indexOf(v) === i // deduplicate
);

// ═══════════════════════════════════════════════════════════════
// COUNTRIES — current + historical, grouped
// ═══════════════════════════════════════════════════════════════

export const countries: Record<string, string[]> = {
  "Historical / Dissolved Nations": [
    "Yugoslavia (SFR)", "Kingdom of Yugoslavia", "Serbia and Montenegro",
    "USSR / Soviet Union", "Russian Empire",
    "Czechoslovakia",
    "East Germany (DDR)", "West Germany (BRD)",
    "Ottoman Empire",
    "Austria-Hungary", "Austrian Empire",
    "Kingdom of Serbia", "Kingdom of Montenegro",
    "Kingdom of Italy", "Kingdom of Hungary",
    "Polish-Lithuanian Commonwealth", "Kingdom of Poland",
    "Republic of Venice", "Papal States",
    "Byzantine Empire", "Holy Roman Empire",
    "Qing Dynasty (China)", "Ming Dynasty (China)", "Republic of China (pre-1949)",
    "Tokugawa Japan", "Empire of Japan",
    "Joseon (Korea)", "Korean Empire",
    "British Raj (India)", "Mughal Empire",
    "Safavid Empire (Persia)", "Qajar Iran",
    "Abbasid Caliphate", "Umayyad Caliphate", "Fatimid Caliphate",
    "Sultanate of Oman (historical)",
    "Kingdom of Egypt", "United Arab Republic",
    "Rhodesia", "South Vietnam", "North Vietnam",
    "Tibet (pre-1950)",
    "Manchukuo", "South Yemen", "Tanganyika",
    "Gran Colombia", "United Provinces (Argentina)",
    "Confederate States",
    "Prussia", "Kingdom of Saxony", "Bavaria (Kingdom)",
    "Siam (Thailand pre-1939)",
  ],
  "Africa": [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso",
    "Burundi", "Cameroon", "Cape Verde", "Central African Republic",
    "Chad", "Comoros", "DR Congo", "Republic of Congo",
    "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini",
    "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau",
    "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya",
    "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius",
    "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
    "Rwanda", "São Tomé and Príncipe", "Senegal", "Seychelles",
    "Sierra Leone", "Somalia", "South Africa", "South Sudan",
    "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
  ],
  "Americas": [
    "Argentina", "Bolivia", "Brazil", "Canada", "Chile",
    "Colombia", "Costa Rica", "Cuba", "Dominican Republic", "Ecuador",
    "El Salvador", "Guatemala", "Haiti", "Honduras", "Jamaica",
    "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru",
    "Puerto Rico", "Suriname", "Trinidad and Tobago",
    "United States", "Uruguay", "Venezuela",
  ],
  "Asia": [
    "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh",
    "Bhutan", "Brunei", "Cambodia", "China", "Georgia",
    "Hong Kong", "India", "Indonesia", "Iran", "Iraq",
    "Israel", "Japan", "Jordan", "Kazakhstan", "Kuwait",
    "Kyrgyzstan", "Laos", "Lebanon", "Macau", "Malaysia",
    "Maldives", "Mongolia", "Myanmar", "Nepal", "North Korea",
    "Oman", "Pakistan", "Palestine", "Philippines", "Qatar",
    "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka",
    "Syria", "Taiwan", "Tajikistan", "Thailand", "Timor-Leste",
    "Turkey", "Turkmenistan", "UAE", "Uzbekistan", "Vietnam", "Yemen",
  ],
  "Europe": [
    "Albania", "Andorra", "Austria", "Belarus", "Belgium",
    "Bosnia & Herzegovina", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Estonia", "Finland", "France",
    "Germany", "Greece", "Hungary", "Iceland", "Ireland",
    "Italy", "Kosovo", "Latvia", "Liechtenstein", "Lithuania",
    "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro",
    "Netherlands", "North Macedonia", "Norway", "Poland", "Portugal",
    "Romania", "Russia", "San Marino", "Serbia", "Slovakia",
    "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine",
    "United Kingdom", "Vatican City",
  ],
  "Oceania": [
    "Australia", "Fiji", "New Zealand", "Papua New Guinea",
    "Samoa", "Tonga", "Vanuatu",
  ],
};

export const allCountries = Object.values(countries).flat();

// ═══════════════════════════════════════════════════════════════
// SCRIPTS / WRITING SYSTEMS
// ═══════════════════════════════════════════════════════════════

export const scripts = [
  // Latin-based
  "Latin", "Latin (Extended/Diacritics)",
  // Cyrillic
  "Cyrillic", "Old Church Slavonic",
  // East Asian
  "Chinese (Simplified 简体)", "Chinese (Traditional 繁體)",
  "Japanese (Kanji 漢字)", "Japanese (Hiragana/Katakana)",
  "Korean (Hangul 한글)", "Korean (Hanja 漢字)",
  // South Asian
  "Devanagari (देवनागरी)", "Bengali (বাংলা)", "Tamil (தமிழ்)",
  "Telugu (తెలుగు)", "Kannada (ಕನ್ನಡ)", "Malayalam (മലയാളം)",
  "Gujarati (ગુજરાતી)", "Gurmukhi (ਗੁਰਮੁਖੀ)", "Odia (ଓଡ଼ିଆ)",
  "Sinhala (සිංහල)", "Tibetan (བོད་ཡིག)",
  // Middle Eastern
  "Arabic (العربية)", "Persian (فارسی)", "Hebrew (עברית)",
  "Aramaic / Syriac", "Thaana (Maldivian)",
  // Southeast Asian
  "Thai (ไทย)", "Lao (ລາວ)", "Khmer (ខ្មែរ)", "Burmese (မြန်မာ)",
  "Javanese (ꦗꦮ)",
  // African
  "Ge'ez (Ethiopian)", "N'Ko", "Tifinagh (Amazigh/Berber)",
  "Vai", "Adlam (Fulani)",
  // Other
  "Georgian (ქართული)", "Armenian (Հայերեն)",
  "Mongolian (ᠮᠣᠩᠭᠣᠯ)", "Manchu",
  "Braille", "Cuneiform (historical)", "Egyptian Hieroglyphs (historical)",
  "Runic (historical)", "Ogham (historical)",
  "Multiple Scripts", "Other",
];

// ═══════════════════════════════════════════════════════════════
// CALENDAR SYSTEMS — for dating antique/religious texts
// ═══════════════════════════════════════════════════════════════

export const calendarSystems = [
  { value: "gregorian", label: "Gregorian (CE/BCE)", description: "Standard Western calendar" },
  { value: "islamic_hijri", label: "Islamic Hijri (AH)", description: "Lunar calendar from Prophet Muhammad's migration" },
  { value: "hebrew", label: "Hebrew (AM)", description: "Jewish calendar, Anno Mundi" },
  { value: "buddhist", label: "Buddhist Era (BE)", description: "Years since Buddha's parinibbāna, used in Thailand/Sri Lanka" },
  { value: "hindu_vikram", label: "Hindu Vikram Samvat", description: "Used in India and Nepal" },
  { value: "hindu_saka", label: "Hindu Shaka Era", description: "Indian national calendar" },
  { value: "ethiopian", label: "Ethiopian (Ge'ez)", description: "7-8 years behind Gregorian" },
  { value: "coptic", label: "Coptic (AM)", description: "Anno Martyrum, Egyptian Christian calendar" },
  { value: "persian_solar", label: "Persian Solar Hijri (SH)", description: "Iranian/Afghan calendar" },
  { value: "chinese_traditional", label: "Chinese Traditional", description: "Heavenly Stems + Earthly Branches cycle" },
  { value: "japanese_imperial", label: "Japanese Imperial (年号)", description: "Era names: Reiwa, Heisei, Shōwa, etc." },
  { value: "korean_dangi", label: "Korean Dangi (단기)", description: "Years from Dangun's founding of Gojoseon" },
  { value: "tibetan", label: "Tibetan", description: "60-year Rabjung cycle" },
  { value: "byzantine", label: "Byzantine (AM)", description: "Anno Mundi, used in Orthodox tradition" },
  { value: "juche", label: "Juche (North Korea)", description: "Years from Kim Il-sung's birth (1912)" },
  { value: "thai_solar", label: "Thai Solar", description: "Buddhist era + solar calendar" },
  { value: "unknown", label: "Unknown / Undated", description: "Date uncertain or not recorded" },
];

// ═══════════════════════════════════════════════════════════════
// ERAS / PERIODS
// ═══════════════════════════════════════════════════════════════

export const eras = [
  "Ancient (Pre-500 CE)",
  "Early Medieval (500-1000)",
  "High Medieval (1000-1300)",
  "Late Medieval (1300-1500)",
  "Renaissance (1400-1600)",
  "Early Modern (1600-1800)",
  "19th Century / Victorian",
  "Antique (Pre-1900)",
  "Early 20th Century (1900-1945)",
  "Post-War (1945-1970)",
  "Late 20th Century (1970-2000)",
  "Contemporary (2000+)",
  "Undated / Unknown",
];

// ═══════════════════════════════════════════════════════════════
// GENRES — expanded for worldwide literary traditions
// ═══════════════════════════════════════════════════════════════

export const genres = [
  // Western standard
  "Fiction", "Non-Fiction", "Sci-Fi", "Fantasy", "Mystery",
  "Thriller", "Horror", "Romance", "Biography", "Autobiography",
  "Poetry", "Drama / Play", "History", "Philosophy", "Self-Help",
  "Science", "Mathematics", "Art", "Music",
  // Academic
  "Textbook", "Reference", "Academic", "Dissertation",
  // International literary traditions
  "Religious / Sacred", "Folklore / Mythology", "Epic Poetry",
  "Political / Revolutionary", "Propaganda",
  "Children's", "Graphic Novel / Manga / Manhwa / Manhua",
  "Comics / Bandes Dessinées",
  // Specific traditions
  "Sufi Literature", "Hadith Collection", "Quranic Studies",
  "Torah / Talmud Commentary", "Buddhist Texts",
  "Hindu Scripture", "Christian Theology",
  "Classical Literature", "Literary Criticism",
  "Travel Writing", "Journalism / Reportage",
  "Cookbook / Culinary", "Medical / Pharmaceutical",
  "Legal / Jurisprudence", "Military / Strategy",
  "Architecture / Design", "Photography",
  // Collectible categories
  "Rare / Antiquarian", "First Edition", "Signed / Inscribed",
  "Limited Edition", "Samizdat / Underground",
  "Censored / Banned", "Manuscript / Handwritten",
];

// ═══════════════════════════════════════════════════════════════
// TEXT DIRECTION — for proper display
// ═══════════════════════════════════════════════════════════════

export const textDirections: Record<string, "ltr" | "rtl"> = {
  "Arabic": "rtl", "Arabic (Classical)": "rtl", "Arabic (Modern Standard)": "rtl",
  "Arabic (Egyptian)": "rtl", "Arabic (Levantine)": "rtl",
  "Arabic (Gulf)": "rtl", "Arabic (Maghrebi)": "rtl",
  "Hebrew": "rtl", "Persian (Farsi)": "rtl", "Dari": "rtl",
  "Urdu": "rtl", "Pashto": "rtl",
  "Kurdish (Sorani)": "rtl", "Aramaic": "rtl", "Syriac": "rtl",
  "Yiddish": "rtl",
};

export function getTextDirection(language?: string | null): "ltr" | "rtl" {
  if (!language) return "ltr";
  return textDirections[language] || "ltr";
}

// CJK detection for font rendering
export function isCJK(text: string): boolean {
  return /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(text);
}
