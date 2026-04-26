/**
 * Mass catalog seeder — pulls thousands of books from Open Library
 * Covers every major literary tradition, language, era, and genre worldwide.
 * 
 * Usage: DATABASE_URL=... npx tsx server/catalog-mass-seed.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { bookCatalog } from "@shared/schema";
import { sql } from "drizzle-orm";

// Unix socket connections (local dev) don't use SSL; RDS requires SSL
const isUnixSocket = (process.env.DATABASE_URL || "").includes("host=/");
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: isUnixSocket ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false),
});
const db = drizzle(pool);

const RESULTS_PER_QUERY = 100; // max Open Library returns
const DELAY_MS = 600; // be nice to OL servers

// Cover URL — small size (S = small, M = medium)
const coverUrl = (coverId: number) => `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;

const langMap: Record<string, string> = {
  eng: "English", spa: "Spanish", fre: "French", ger: "German",
  por: "Portuguese", ita: "Italian", rus: "Russian", chi: "Chinese",
  jpn: "Japanese", kor: "Korean", ara: "Arabic", hin: "Hindi",
  ben: "Bengali", urd: "Urdu", tur: "Turkish", per: "Persian",
  pol: "Polish", cze: "Czech", dut: "Dutch", swe: "Swedish",
  nor: "Norwegian", dan: "Danish", fin: "Finnish", gre: "Greek",
  rom: "Romanian", hun: "Hungarian", srp: "Serbian", hrv: "Croatian",
  bos: "Bosnian", slv: "Slovenian", bul: "Bulgarian", ukr: "Ukrainian",
  heb: "Hebrew", yid: "Yiddish", lat: "Latin", san: "Sanskrit",
  tam: "Tamil", tel: "Telugu", mal: "Malayalam", mar: "Marathi",
  tha: "Thai", vie: "Vietnamese", ind: "Indonesian", may: "Malay",
  swa: "Swahili", amh: "Amharic", geo: "Georgian", arm: "Armenian",
  cat: "Catalan", glg: "Galician", baq: "Basque", ice: "Icelandic",
  gle: "Irish", wel: "Welsh", tib: "Tibetan", mon: "Mongolian",
  alb: "Albanian", mac: "Macedonian", kaz: "Kazakh", uzb: "Uzbek",
};

// ALL the queries — organized by category
const queries = [
  // === WORLD LITERATURE (Nobel, classics) ===
  "nobel prize literature", "world literature classics", "penguin classics",
  "oxford world classics", "everyman library", "modern library 100 best",
  
  // === ENGLISH ===
  "shakespeare complete works", "dickens novels", "jane austen", "mark twain",
  "virginia woolf", "james joyce ulysses", "george orwell", "aldous huxley",
  "ernest hemingway", "f scott fitzgerald", "toni morrison", "william faulkner",
  "herman melville moby dick", "edgar allan poe", "emily dickinson poetry",
  "walt whitman leaves grass", "kurt vonnegut", "philip roth", "don delillo",
  "cormac mccarthy", "thomas pynchon", "salman rushdie", "zadie smith",
  
  // === RUSSIAN ===
  "tolstoy war peace", "dostoevsky brothers karamazov", "chekhov stories",
  "pushkin eugene onegin", "gogol dead souls", "turgenev fathers sons",
  "bulgakov master margarita", "solzhenitsyn gulag", "nabokov lolita",
  "pasternak doctor zhivago", "akhmatova poems", "mayakovsky poetry",
  "strugatsky science fiction", "russian literature classic",
  
  // === FRENCH ===
  "victor hugo les miserables", "proust recherche temps perdu", "camus stranger",
  "sartre nausea", "flaubert madame bovary", "baudelaire fleurs mal",
  "moliere comedies", "voltaire candide", "dumas three musketeers",
  "stendhal red black", "zola germinal", "balzac comedie humaine",
  
  // === GERMAN ===
  "goethe faust", "kafka metamorphosis trial", "thomas mann magic mountain",
  "hermann hesse steppenwolf", "rilke poetry", "brecht threepenny opera",
  "nietzsche zarathustra", "schiller", "heinrich boll", "gunter grass tin drum",
  
  // === SPANISH ===
  "cervantes don quixote", "garcia marquez hundred years solitude",
  "borges ficciones", "neruda poetry", "isabel allende house spirits",
  "octavio paz labyrinth solitude", "julio cortazar hopscotch",
  "carlos fuentes", "mario vargas llosa", "roberto bolano 2666",
  
  // === PORTUGUESE ===
  "fernando pessoa book disquiet", "jose saramago blindness",
  "machado de assis", "clarice lispector", "jorge amado",
  
  // === ITALIAN ===
  "dante divine comedy", "boccaccio decameron", "eco name rose",
  "calvino invisible cities", "primo levi", "pirandello", "leopardi poems",
  
  // === JAPANESE ===
  "murakami haruki", "mishima yukio", "kawabata yasunari snow country",
  "oe kenzaburo", "tanizaki junichiro", "murasaki shikibu tale genji",
  "banana yoshimoto", "natsume soseki", "japanese manga classic",
  "japanese literature modern",
  
  // === CHINESE ===
  "dream red chamber", "romance three kingdoms", "journey west",
  "water margin outlaws marsh", "lu xun", "mo yan", "yu hua to live",
  "chinese poetry classic tang", "cao xueqin", "confucius analects",
  "lao tzu tao te ching", "chinese literature modern",
  
  // === KOREAN ===
  "korean literature modern", "han kang vegetarian", "shin kyung-sook",
  "hwang sok-yong", "yi kwang-su", "korean fiction",
  
  // === ARABIC & PERSIAN ===
  "quran translations", "arabian nights thousand one", "naguib mahfouz cairo",
  "mahmoud darwish poetry", "khalil gibran prophet", "ibn khaldun muqaddimah",
  "rumi poetry masnavi", "hafez poetry divan", "omar khayyam rubaiyat",
  "shahnameh ferdowsi", "arabic literature classic", "persian poetry classic",
  
  // === TURKISH ===
  "orhan pamuk istanbul", "elif shafak", "yashar kemal", "nazim hikmet poetry",
  "turkish literature",
  
  // === SOUTH ASIAN ===
  "tagore gitanjali", "r k narayan", "arundhati roy god small things",
  "vikram seth suitable boy", "amitav ghosh", "rohinton mistry",
  "mahabharata", "ramayana", "bhagavad gita", "upanishads",
  "hindi literature modern", "urdu poetry ghazal", "bengali literature",
  "tamil literature sangam",
  
  // === AFRICAN ===
  "chinua achebe things fall apart", "ngugi wa thiongo",
  "chimamanda ngozi adichie", "wole soyinka", "ben okri famished road",
  "nadine gordimer", "j m coetzee disgrace", "african literature",
  
  // === YUGOSLAV / BALKAN ===
  "ivo andric bridge drina", "mesa selimovic", "danilo kis",
  "miroslav krleza", "vasko popa poetry", "dubravka ugresic",
  "serbian literature", "croatian literature", "bosnian literature",
  "yugoslav literature", "macedonian literature",
  
  // === SOVIET / EASTERN EUROPEAN ===
  "czech literature kafka kundera hasek", "milan kundera unbearable lightness",
  "hasek good soldier svejk", "stanislav lem solaris",
  "polish literature gombrowicz szymborska",
  "hungarian literature", "romanian literature", "bulgarian literature",
  
  // === CENTRAL ASIAN ===
  "kazakh literature", "uzbek literature", "kyrgyz literature",
  "abai kunanbayev", "chingiz aitmatov",
  
  // === NORDIC / SCANDINAVIAN ===
  "ibsen peer gynt", "strindberg", "knut hamsun hunger",
  "sigrid undset kristin lavransdatter", "halldor laxness",
  "nordic noir crime fiction", "scandinavian literature classic",
  
  // === GENRES ===
  "science fiction classic asimov clarke", "fantasy tolkien lord rings",
  "horror lovecraft shelley", "mystery detective agatha christie",
  "romance classic bronte", "philosophy plato aristotle",
  "history ancient rome greece", "biography autobiography memoir",
  "poetry anthology world", "art history",
  
  // === RELIGIOUS / SACRED ===
  "bible translations", "quran tafsir", "torah talmud commentary",
  "buddhist texts sutras", "hindu scriptures vedas", "sufi literature",
  "christian theology augustine aquinas", "bhagavad gita translations",
  
  // === RARE / ANTIQUARIAN ===
  "first edition rare books", "incunabula early printing",
  "illuminated manuscripts", "antique books 19th century",
  "samizdat soviet underground", "banned books history",
  
  // === CHILDREN'S & GRAPHIC ===
  "children classic literature", "graphic novel award winning",
  "manga bestselling", "comic book classic",
  
  // === NON-FICTION ===
  "economics adam smith marx", "science darwin einstein",
  "psychology freud jung", "political theory machiavelli",
  "feminist literature beauvoir woolf", "civil rights literature",
  "travel writing classic", "food cooking history",

  // === AWARDS — BOOKER PRIZE ===
  "booker prize winners", "man booker prize fiction",
  "ian mcewan atonement", "kazuo ishiguro remains day",
  "hilary mantel wolf hall", "pat barker regeneration",
  "michael ondaatje english patient", "anne enright gathering",
  "graham swift last orders", "penelope fitzgerald offshore",
  "peter carey oscar lucinda", "james kelman how late it was",
  "salman rushdie midnight children booker", "j m coetzee waiting barbarians",

  // === AWARDS — PULITZER PRIZE ===
  "pulitzer prize fiction", "pulitzer prize poetry",
  "edith wharton age innocence pulitzer", "sinclair lewis main street pulitzer",
  "william faulkner fable pulitzer", "john steinbeck grapes wrath pulitzer",
  "harper lee mockingbird pulitzer", "john updike rabbit angstrom",
  "anne tyler breathing lessons", "richard russo empire falls pulitzer",
  "jeffrey eugenides middlesex pulitzer", "colson whitehead underground railroad",
  "viet thanh nguyen sympathizer", "andrew sean greer less pulitzer",

  // === AWARDS — NATIONAL BOOK AWARD ===
  "national book award fiction", "national book award nonfiction",
  "ralph ellison invisible man nba", "saul bellow adventures augie march",
  "flannery o'connor collected stories", "john barth chimera nba",
  "thomas pynchon gravity rainbow", "cynthia ozick shawl",
  "charles johnson middle passage nba", "andrea barrett ship fever nba",
  "ha jin waiting nba", "joan didion political fictions",

  // === AWARDS — NOBEL LITERATURE MORE ===
  "alice munro stories", "mo yan red sorghum",
  "patrick modiano dora bruder", "svetlana alexievich voices utopia",
  "olga tokarczuk flights", "peter handke offending audience",
  "imre kertesz fatelessness", "elfriede jelinek piano teacher",
  "j m le clezio desert", "wislawa szymborska poems",
  "seamus heaney bog poems", "derek walcott omeros",
  "nadine gordimer july people", "camilo jose cela pascual duarte",

  // === AMERICAN FICTION — EXPANDED ===
  "henry james portrait lady", "edith wharton house mirth",
  "theodore dreiser sister carrie", "upton sinclair jungle",
  "john dos passos usa trilogy", "thomas wolfe look homeward angel",
  "richard wright native son", "james baldwin giovanni room",
  "saul bellow henderson rain king", "john cheever stories",
  "john updike rabbit run", "joyce carol oates them",
  "raymond carver cathedral stories", "lorrie moore birds america",
  "david foster wallace infinite jest", "jonathan franzen corrections",
  "michael chabon kavalier clay", "junot diaz brief wondrous life oscar wao",
  "colson whitehead zone one", "donna tartt secret history",
  "cormac mccarthy road", "george saunders lincoln bardo",
  "richard powers overstory", "ocean vuong earth we were born",

  // === BRITISH FICTION — EXPANDED ===
  "thomas hardy tess durbervilles", "joseph conrad heart darkness",
  "e m forster passage india", "d h lawrence sons lovers",
  "evelyn waugh brideshead revisited", "graham greene power glory",
  "angus wilson anglo-saxon attitudes", "iris murdoch sea sea",
  "muriel spark prime miss brodie", "margaret drabble radiant way",
  "nick hornby high fidelity", "ian banks wasp factory",
  "jeanette winterson oranges only fruit", "alan hollinghurst line beauty",
  "sarah waters fingersmith", "kate atkinson behind scenes museum",
  "zadie smith on beauty", "ali smith how should person be",
  "deborah levy swimming home", "max porter grief thing feathers",

  // === IRISH LITERATURE ===
  "samuel beckett murphy", "flann o'brien third policeman",
  "william trevor stories", "edna o'brien country girls",
  "john mcgahern amongst women", "colm toibin brooklyn",
  "sebastian barry secret scripture", "anne enright forgotten waltz",
  "sally rooney normal people", "paul murray skippy dies",
  "irish literature classic", "irish poetry yeats heaney",

  // === CANADIAN LITERATURE ===
  "margaret atwood handmaid tale", "alice munro lives girls women",
  "michael ondaatje in skin lion", "anne michaels fugitive pieces",
  "robertson davies deptford trilogy", "mordecai richler barney version",
  "carol shields stone diaries", "yann martel life pi",
  "dionne brand what we all long for", "gil adamson outlander novel",
  "canadian literature classic", "indigenous canadian literature",

  // === AUSTRALIAN LITERATURE ===
  "patrick white voss", "tim winton cloudstreet",
  "peter carey true history ned kelly", "kate grenville secret river",
  "richard flanagan narrow road deep north", "christos tsiolkas slap",
  "alexis wright carpentaria", "kim scott that deadman dance",
  "australian literature classic", "indigenous australian literature",

  // === LATIN AMERICA — EXPANDED ===
  "juan rulfo pedro paramo", "alejo carpentier kingdom world",
  "jose donoso obscene bird night", "severo sarduy cobra",
  "manuel puig kiss spider woman", "luisa valenzuela lizard tail",
  "elena poniatowska hasta no verte", "rosario castellanos balun canan",
  "miguel angel asturias men maize", "augusto roa bastos son man",
  "cesar vallejo trilce poetry", "alejandra pizarnik darkness poetry",
  "latin american boom literature", "magic realism fiction",

  // === CARIBBEAN LITERATURE ===
  "derek walcott another life", "vs naipaul house biswas",
  "jean rhys wide sargasso sea", "george lamming castle skin",
  "claude mckay home harlem", "c l r james black jacobins",
  "edwidge danticat breath eyes memory", "marlon james brief history seven killings",
  "caribbean literature postcolonial",

  // === EAST AFRICAN LITERATURE ===
  "ngugi wa thiongo petals blood", "es'kia mphahlele down second avenue",
  "grace ogot land two rivers", "okot p bitek song lawino",
  "nuruddin farah maps novel", "abdulrazak gurnah paradise",
  "east african literature swahili",

  // === WEST AFRICAN LITERATURE ===
  "ama ata aidoo our sister killjoy", "buchi emecheta joys motherhood",
  "cyprian ekwensi jagua nana", "flora nwapa efuru",
  "wole soyinka season anomy", "femi osofisan midnight hotel",
  "west african literature yoruba igbo",

  // === SOUTH AFRICAN LITERATURE ===
  "nadine gordimer conservationist", "andre brink dry white season",
  "breyten breytenbach confession albino terrorist",
  "zakes mda ways dying", "damon galgut good doctor",
  "marlene van niekerk triomf", "ivan vladislavic portrait lady",
  "south african literature apartheid",

  // === MIDDLE EASTERN LITERATURE ===
  "amos oz my michael", "david grossman see under love",
  "a b yehoshua lover", "yehuda amichai poetry",
  "elias khoury gate sun", "hanan al-shaykh women sand myrrh",
  "mahmoud saeed zencir", "adonis poetry arab",
  "suad amiry sharon and my mother in law",
  "middle eastern literature arabic hebrew",

  // === GREEK LITERATURE ===
  "constantine cavafy poems", "nikos kazantzakis zorba greek",
  "giorgos seferis poetry", "odysseas elytis axion esti",
  "stratis myrivilis life in tomb", "kostas tachtsis third wedding",
  "vassilis vassilikos z novel", "greek literature modern",
  "homer iliad odyssey", "sophocles oedipus rex",
  "aristophanes comedies", "euripides medea tragedies",

  // === ROMANIAN LITERATURE ===
  "mircea eliade maitreyi", "mircea cartarescu solenoid",
  "herta muller land green plums", "norman manea clowns",
  "emil cioran trouble with being born", "gellu naum zenobia",
  "romanian literature communism",

  // === ALBANIAN LITERATURE ===
  "ismail kadare general dead army", "ismail kadare broken april",
  "albanian literature balkans",

  // === DUTCH / FLEMISH LITERATURE ===
  "harry mulisch discovery heaven", "cees nooteboom rituals",
  "w f hermans dark room damocles", "hugo claus sorrow belgium",
  "dutch literature golden age",

  // === SWISS / AUSTRIAN LITERATURE ===
  "robert walser jakob von gunten", "max frisch homo faber",
  "friedrich durrenmatt visit old lady", "ingeborg bachmann malina",
  "thomas bernhard woodcutters", "peter bichsel stories children",
  "swiss german literature", "austrian literature vienna",

  // === VIETNAMESE LITERATURE ===
  "duong thu huong novel vietnam", "nguyen huy thiep stories",
  "bao ninh sorrow war", "vietnamese literature modern",

  // === THAI LITERATURE ===
  "chart korbjitti mad loser", "prabda yoon possible worlds",
  "thai literature modern",

  // === INDONESIAN / MALAY LITERATURE ===
  "pramoedya ananta toer buru quartet", "ahmad tohari ronggeng dukuh paruk",
  "faisal tehrani fiction malaysia", "indonesian literature colonial",

  // === SCIENCE FICTION — EXPANDED ===
  "philip k dick do androids dream", "ursula le guin dispossessed",
  "octavia butler kindred parable", "samuel r delany dhalgren",
  "gene wolfe book new sun", "dan simmons hyperion cantos",
  "kim stanley robinson mars trilogy", "william gibson neuromancer",
  "neal stephenson snow crash", "vernor vinge fire upon deep",
  "iain m banks culture series", "peter watts blindsight",
  "ted chiang stories life others", "liu cixin three body problem",
  "n k jemisin broken earth", "ann leckie ancillary justice",
  "le guin earthsea cycle", "ray bradbury fahrenheit 451",
  "isaac asimov foundation trilogy", "arthur c clarke 2001",
  "robert heinlein stranger strange land", "frank herbert dune messiah",

  // === FANTASY — EXPANDED ===
  "george rr martin song ice fire", "patrick rothfuss kingkiller",
  "brandon sanderson stormlight archive", "robin hobb farseer",
  "ursula le guin wizard earthsea", "terry pratchett discworld",
  "neil gaiman american gods", "jonathan strange mr norrell",
  "joe abercrombie first law", "scott lynch lies locke lamora",
  "tad williams dragonbone chair", "raymond feist magician",
  "david eddings belgariad", "terry brooks shannara",
  "anne mccaffrey dragonriders pern", "mercedes lackey valdemar",

  // === HORROR — EXPANDED ===
  "stephen king shining", "stephen king it", "stephen king stand",
  "dean koontz watchers", "anne rice interview vampire",
  "shirley jackson haunting hill house", "peter straub ghost story",
  "ramsey campbell inhabitant lake", "clive barker hellraiser",
  "joe hill nosferatu heart shaped box", "paul tremblay head full ghosts",

  // === CRIME / MYSTERY — EXPANDED ===
  "raymond chandler big sleep", "dashiell hammett maltese falcon",
  "james m cain postman rings twice", "patricia highsmith ripley",
  "ruth rendez wexford", "pd james adam dalgliesh",
  "ian rankin rebus", "henning mankell wallander",
  "jo nesbo harry hole", "stieg larsson girl dragon tattoo",
  "gillian flynn gone girl", "tana french dublin murder squad",
  "donna leon commissario brunetti", "michael connelly bosch",

  // === ROMANCE — EXPANDED ===
  "jane austen pride prejudice", "charlotte bronte jane eyre",
  "emily bronte wuthering heights", "george eliot middlemarch",
  "thomas hardy far madding crowd", "elizabeth gaskell north south",
  "georgette heyer regency", "mary stewart romantic suspense",
  "diana gabaldon outlander", "nora roberts trilogies",

  // === HISTORICAL FICTION ===
  "hilary mantel thomas cromwell", "colm toibin master henry james",
  "anthony burgess nothing like sun shakespeare",
  "marguerite yourcenar memoirs hadrian",
  "umberto eco foucaults pendulum", "amin maalouf samarkand",
  "tariq ali shadow pomegranate tree",
  "geraldine brooks people book", "ken follett pillars earth",
  "edward rutherford london sarum",

  // === BIOGRAPHY & MEMOIR ===
  "nelson mandela long walk freedom", "maya angelou caged bird sings",
  "james baldwin notes native son", "richard wright black boy",
  "frank mccourt angelas ashes", "mary karr liar club",
  "jeannette walls glass castle", "tara westover educated",
  "michelle obama becoming", "barack obama dreams father",
  "winston churchill memoirs wwii", "charles de gaulle memoirs",
  "bertrand russell autobiography", "simone de beauvoir second sex",
  "elie wiesel night holocaust", "primo levi periodic table",
  "viktor frankl logotherapy meaning",

  // === PHILOSOPHY — EXPANDED ===
  "plato republic symposium", "aristotle nicomachean ethics",
  "descartes meditations first philosophy", "spinoza ethics geometrical",
  "locke essay concerning understanding", "hume treatise human nature",
  "kant critique pure reason", "hegel phenomenology spirit",
  "schopenhauer world will representation", "kierkegaard either or",
  "nietzsche beyond good evil", "marx capital volume 1",
  "husserl ideas phenomenology", "heidegger being time",
  "wittgenstein tractatus", "sartre being nothingness",
  "camus myth sisyphus", "foucault discipline punish",
  "derrida grammatology", "deleuze guattari anti oedipus",
  "habermas theory communicative action", "rawls theory justice",
  "nozick anarchy state utopia", "butler gender trouble",
  "zizek sublime ideology", "badiou being event",

  // === HISTORY — EXPANDED ===
  "edward gibbon decline fall roman empire",
  "thucydides history peloponnesian war",
  "tacitus annals rome", "livy history rome",
  "william mcneill rise west history", "fernand braudel mediterranean",
  "marc bloch feudal society", "eric hobsbawm age revolution",
  "tony judt postwar europe", "timothy snyder bloodlands",
  "christopher clark sleepwalkers wwi", "richard evans third reich",
  "orlando figes peoples tragedy russia",
  "jung chang wild swans china", "pankaj mishra from ruins empire",

  // === SCIENCE & NATURE ===
  "charles darwin origin species", "richard dawkins selfish gene",
  "stephen jay gould ever since darwin", "carl sagan cosmos",
  "james watson double helix dna", "richard feynman lectures physics",
  "steven weinberg first three minutes", "brian greene elegant universe",
  "oliver sacks man mistook hat wife", "antonio damasio descartes error",
  "edward o wilson diversity life", "rachel carson silent spring",
  "bill bryson short history nearly everything",

  // === ECONOMICS & SOCIAL SCIENCE ===
  "adam smith wealth nations", "john maynard keynes general theory",
  "milton friedman capitalism freedom", "karl polanyi great transformation",
  "thorstein veblen theory leisure class", "max weber protestant ethic",
  "emile durkheim suicide sociology", "claude levi-strauss tristes tropiques",
  "clifford geertz interpretation cultures", "pierre bourdieu distinction",

  // === SELF-HELP & POPULAR NONFICTION ===
  "dale carnegie win friends influence people",
  "napoleon hill think grow rich",
  "steven covey seven habits highly effective people",
  "malcolm gladwell tipping point", "malcolm gladwell blink",
  "daniel kahneman thinking fast slow", "nassim taleb black swan",
  "yuval harari homo deus", "james clear atomic habits",
  "cal newport deep work", "ryan holiday obstacle is way",

  // === GRAPHIC NOVELS & COMICS ===
  "art spiegelman maus", "alan moore watchmen", "alan moore v vendetta",
  "frank miller dark knight returns", "neil gaiman sandman",
  "brian k vaughan y last man", "chris ware building stories",
  "alison bechdel fun home", "marjane satrapi persepolis",
  "joe sacco palestine graphic", "joe sacco footnotes gaza",
  "craig thompson blankets graphic", "jeff lemire essex county",
  "gene luen yang american born chinese",

  // === POETRY — EXPANDED ===
  "pablo neruda twenty love poems", "lorca romancero gitano",
  "anna akhmatova requiem", "marina tsvetaeva poems",
  "osip mandelstam poems", "paul celan deathfugue todesfuge",
  "sylvia plath ariel poems", "anne sexton live die poems",
  "adrienne rich diving wreck", "frank o'hara lunch poems",
  "allen ginsberg howl kaddish", "gary snyder riprap cold mountain",
  "john ashbery self portrait convex mirror", "charles olson maximus poems",
  "langston hughes collected poems", "gwendolyn brooks annie allen",
  "lucille clifton collected poems", "rita dove thomas beulah",
  "yusef komunyakaa neon vernacular", "terrance hayes how to be drawn",

  // === CHILDREN'S CLASSICS — EXPANDED ===
  "lewis carroll alice wonderland", "j m barrie peter pan",
  "a a milne winnie pooh", "beatrix potter peter rabbit",
  "roald dahl charlie chocolate factory", "roald dahl james peach",
  "c s lewis narnia chronicles", "e b white charlotte web",
  "laura ingalls wilder little house", "louisa may alcott little women",
  "mark twain tom sawyer", "robert louis stevenson treasure island",
  "arthur conan doyle sherlock holmes young readers",
  "jules verne twenty thousand leagues", "h g wells time machine young",

  // === YOUNG ADULT FICTION ===
  "suzanne collins hunger games", "veronica roth divergent",
  "james dashner maze runner", "rick riordan percy jackson",
  "john green fault our stars", "rainbow rowell eleanor park",
  "cassandra clare mortal instruments", "leigh bardugo shadow bone",
  "s e hinton outsiders", "lois lowry giver",
  "madeleine l'engle wrinkle time", "philip pullman dark materials",

  // === COOKBOOKS & FOOD WRITING ===
  "julia child mastering art french cooking",
  "james beard american cookery", "elizabeth david french provincial cooking",
  "marcella hazan essentials italian cooking",
  "diana henry simple food cookbook", "yotam ottolenghi plenty",
  "samin nosrat salt fat acid heat", "niklas ekstedt fire cookbook",
  "MFK fisher art eating", "michael pollan omnivores dilemma",
  "ruth reichl tender at bone memoir", "anthony bourdain kitchen confidential",

  // === TRAVEL WRITING ===
  "ryszard kapuscinski shah iran", "ryszard kapuscinski another day life",
  "bruce chatwin songlines australia", "paul theroux great railway bazaar",
  "peter matthiessen snow leopard", "eric newby short walk hindu kush",
  "jan morris venice trieste", "colin thubron among russians",
  "jonathan raban hunting mister heartbreak", "wilfred thesiger arabian sands",
];


async function searchAndInsert(query: string): Promise<number> {
  try {
    const fields = "title,author_name,first_publish_year,publisher,isbn,cover_i,subject,language,key,edition_count";
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${RESULTS_PER_QUERY}&fields=${fields}`;
    
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return 0;
    
    const data = await res.json() as any;
    if (!data.docs?.length) return 0;

    const entries = data.docs
      .filter((doc: any) => doc.title && doc.author_name?.[0])
      .map((doc: any) => {
        const lang3 = doc.language?.[0];
        return {
          title: doc.title.substring(0, 500),
          author: doc.author_name[0].substring(0, 200),
          isbn13: doc.isbn?.find((i: string) => i.length === 13) || null,
          isbn10: doc.isbn?.find((i: string) => i.length === 10) || null,
          openLibraryId: doc.key || null,
          publisher: doc.publisher?.[0]?.substring(0, 200) || null,
          firstPublishedYear: doc.first_publish_year || null,
          language: langMap[lang3] || lang3 || "English",
          coverUrl: doc.cover_i ? coverUrl(doc.cover_i) : null,
          subjects: doc.subject?.slice(0, 10).join(",").substring(0, 500) || null,
          source: "open_library",
          sourceId: doc.key || null,
        };
      });

    if (entries.length > 0) {
      // Use ON CONFLICT DO NOTHING to skip duplicates
      await db.insert(bookCatalog).values(entries).onConflictDoNothing({ target: bookCatalog.openLibraryId });
    }

    return entries.length;
  } catch (e) {
    return 0;
  }
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Unshelv'd — Mass Catalog Seeder              ║`);
  console.log(`║  ${queries.length} queries × ${RESULTS_PER_QUERY} results = up to ${(queries.length * RESULTS_PER_QUERY).toLocaleString()} books  ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  let totalInserted = 0;
  let completed = 0;

  for (const query of queries) {
    const count = await searchAndInsert(query);
    totalInserted += count;
    completed++;
    
    if (count > 0) {
      process.stdout.write(`  [${completed}/${queries.length}] "${query}" → ${count} books (total: ${totalInserted.toLocaleString()})\n`);
    } else {
      process.stdout.write(`  [${completed}/${queries.length}] "${query}" → skipped\n`);
    }

    // Rate limit: be nice to Open Library
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Get final count from DB
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  Done! Catalog now has ${count.toLocaleString()} entries.`);
  console.log(`  Inserted ${totalInserted.toLocaleString()} from ${queries.length} queries.`);
  console.log(`══════════════════════════════════════════════\n`);

  await pool.end();
}

main().catch(console.error);
