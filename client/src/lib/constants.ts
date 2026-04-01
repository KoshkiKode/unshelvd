// Languages — sorted by global literary significance, not just population
export const languages = [
  "English", "Spanish", "French", "German", "Portuguese", "Italian",
  "Russian", "Chinese", "Japanese", "Korean", "Arabic", "Hindi",
  "Turkish", "Persian", "Polish", "Czech", "Dutch", "Swedish",
  "Norwegian", "Danish", "Finnish", "Greek", "Romanian", "Hungarian",
  "Serbian", "Croatian", "Bosnian", "Slovenian", "Macedonian", "Bulgarian",
  "Ukrainian", "Belarusian", "Georgian", "Armenian", "Albanian",
  "Hebrew", "Yiddish", "Latin", "Sanskrit", "Urdu", "Bengali",
  "Thai", "Vietnamese", "Indonesian", "Malay", "Swahili",
  "Tagalog", "Icelandic", "Irish", "Welsh", "Basque", "Catalan",
  "Esperanto", "Other",
];

// Countries of origin — includes historical/dissolved nations
export const countries = {
  "Current Nations": [
    "United States", "United Kingdom", "Canada", "Australia",
    "France", "Germany", "Italy", "Spain", "Portugal", "Netherlands",
    "Russia", "China", "Japan", "South Korea", "India",
    "Brazil", "Mexico", "Argentina", "Colombia", "Chile",
    "Turkey", "Iran", "Egypt", "Israel", "Saudi Arabia",
    "Poland", "Czech Republic", "Romania", "Hungary", "Greece",
    "Serbia", "Croatia", "Bosnia & Herzegovina", "Slovenia", "North Macedonia",
    "Montenegro", "Kosovo", "Albania", "Bulgaria",
    "Ukraine", "Belarus", "Georgia", "Armenia", "Azerbaijan",
    "Sweden", "Norway", "Denmark", "Finland", "Iceland",
    "Ireland", "Nigeria", "South Africa", "Kenya",
    "Indonesia", "Philippines", "Vietnam", "Thailand",
  ],
  "Historical Nations": [
    "Yugoslavia", "SFR Yugoslavia", "Kingdom of Yugoslavia",
    "USSR / Soviet Union",
    "Czechoslovakia",
    "East Germany (DDR)", "West Germany (BRD)",
    "Ottoman Empire",
    "Austria-Hungary",
    "Kingdom of Serbia", "Kingdom of Montenegro",
    "Russian Empire",
    "Persia",
    "Kingdom of Italy",
    "Kingdom of Hungary",
    "Polish-Lithuanian Commonwealth",
    "Republic of Venice",
    "Byzantine Empire",
    "Qing Dynasty (China)", "Ming Dynasty (China)",
    "Tokugawa Japan",
    "British Raj (India)",
    "Rhodesia",
    "Tibet",
    "South Vietnam",
  ],
};

// Flattened list for dropdowns
export const allCountries = [
  ...countries["Historical Nations"],
  ...countries["Current Nations"],
];

export const eras = [
  "Ancient (Pre-500)",
  "Medieval (500-1400)",
  "Renaissance (1400-1600)",
  "Early Modern (1600-1800)",
  "Antique (Pre-1900)",
  "Vintage (1900-1970)",
  "Modern (1970-2000)",
  "Contemporary (2000+)",
];

export const scripts = [
  "Latin",
  "Cyrillic",
  "Arabic",
  "Hebrew",
  "Devanagari",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Japanese (Kanji/Kana)",
  "Korean (Hangul)",
  "Greek",
  "Georgian",
  "Armenian",
  "Thai",
  "Bengali",
  "Tamil",
  "Other",
];

export const genres = [
  "Fiction", "Non-Fiction", "Textbooks", "Sci-Fi", "Mystery",
  "Biography", "Poetry", "Philosophy", "History", "Rare",
  "Fantasy", "Romance", "Thriller", "Horror", "Self-Help",
  "Political", "Religious", "Art", "Music", "Science",
  "Children's", "Graphic Novel", "Drama/Play", "Folklore",
];
