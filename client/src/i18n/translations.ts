/**
 * Unshelv'd — Internationalization
 *
 * Core translated locales are hand-curated.
 * Additional top-language locales currently use English strings as fallback.
 */

type TopTranslatedLocale =
  | "en" | "es" | "fr" | "de" | "pt" | "ru" | "zh" | "ja" | "ko" | "ar";

type FallbackLocale =
  | "hi" | "bn" | "ur" | "id" | "sw" | "mr" | "te" | "tr" | "ta" | "vi"
  | "fa" | "it" | "th" | "gu" | "pl" | "uk" | "ml" | "kn" | "or" | "pa"
  | "ro" | "nl" | "el" | "cs" | "hu";

export type Locale = TopTranslatedLocale | FallbackLocale;

export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  hi: "हिन्दी",
  bn: "বাংলা",
  ur: "اردو",
  id: "Bahasa Indonesia",
  sw: "Kiswahili",
  mr: "मराठी",
  te: "తెలుగు",
  tr: "Türkçe",
  ta: "தமிழ்",
  vi: "Tiếng Việt",
  fa: "فارسی",
  it: "Italiano",
  th: "ไทย",
  gu: "ગુજરાતી",
  pl: "Polski",
  uk: "Українська",
  ml: "മലയാളം",
  kn: "ಕನ್ನಡ",
  or: "ଓଡ଼ିଆ",
  pa: "ਪੰਜਾਬੀ",
  ro: "Română",
  nl: "Nederlands",
  el: "Ελληνικά",
  cs: "Čeština",
  hu: "Magyar",
};

export const localeDirections: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr", es: "ltr", fr: "ltr", de: "ltr", pt: "ltr",
  ru: "ltr", zh: "ltr", ja: "ltr", ko: "ltr", ar: "rtl",
  hi: "ltr", bn: "ltr", ur: "rtl", id: "ltr", sw: "ltr",
  mr: "ltr", te: "ltr", tr: "ltr", ta: "ltr", vi: "ltr",
  fa: "rtl", it: "ltr", th: "ltr", gu: "ltr", pl: "ltr",
  uk: "ltr", ml: "ltr", kn: "ltr", or: "ltr", pa: "ltr",
  ro: "ltr", nl: "ltr", el: "ltr", cs: "ltr", hu: "ltr",
};

type TranslationStrings = {
  // Navigation
  nav_browse: string;
  nav_requests: string;
  nav_about: string;
  nav_dashboard: string;
  nav_messages: string;
  nav_profile: string;
  nav_login: string;
  nav_register: string;
  nav_logout: string;

  // Home
  home_hero: string;
  home_subtitle: string;
  home_browse_books: string;
  home_book_requests: string;
  home_recently_listed: string;
  home_view_all: string;
  home_community_requests: string;

  // Auth
  auth_join: string;
  auth_welcome_back: string;
  auth_sign_in: string;
  auth_create_account: string;
  auth_username: string;
  auth_display_name: string;
  auth_email: string;
  auth_password: string;
  auth_already_have_account: string;
  auth_no_account: string;

  // Password policy
  pw_min_length: string;
  pw_uppercase: string;
  pw_lowercase: string;
  pw_number: string;
  pw_symbol: string;
  pw_no_name: string;

  // Browse
  browse_title: string;
  browse_subtitle: string;
  browse_search_placeholder: string;
  browse_no_books: string;

  // Book detail
  book_buy_now: string;
  book_make_offer: string;
  book_message_seller: string;
  book_for_sale: string;
  book_not_for_sale: string;
  book_open_to_offers: string;
  book_condition: string;
  book_description: string;
  book_other_editions: string;

  // Book statuses
  status_new: string;
  status_like_new: string;
  status_good: string;
  status_fair: string;
  status_poor: string;

  // Dashboard
  dash_title: string;
  dash_active_listings: string;
  dash_pending_offers: string;
  dash_unread_messages: string;
  dash_list_a_book: string;
  dash_post_request: string;
  dash_my_listings: string;
  dash_no_books: string;
  dash_add_first: string;

  // Requests
  req_title: string;
  req_subtitle: string;
  req_budget: string;
  req_i_have_this: string;
  req_post_request: string;

  // Messages
  msg_title: string;
  msg_conversations: string;
  msg_no_conversations: string;
  msg_select_conversation: string;
  msg_start_conversation: string;
  msg_type_message: string;

  // Payments
  pay_checkout: string;
  pay_review_purchase: string;
  pay_book_price: string;
  pay_platform_fee: string;
  pay_seller_receives: string;
  pay_total: string;
  pay_buyer_protection: string;
  pay_purchase_complete: string;
  pay_processing: string;

  // Common
  common_cancel: string;
  common_save: string;
  common_delete: string;
  common_edit: string;
  common_loading: string;
  common_error: string;
  common_search: string;
  common_filter: string;
  common_sort: string;
  common_back: string;
};

const baseTranslations: Record<TopTranslatedLocale, TranslationStrings> = {
  en: {
    nav_browse: "Browse",
    nav_requests: "Requests",
    nav_about: "About",
    nav_dashboard: "Dashboard",
    nav_messages: "Messages",
    nav_profile: "Profile",
    nav_login: "Login",
    nav_register: "Register",
    nav_logout: "Logout",
    home_hero: "Where every book finds its next reader.",
    home_subtitle: "A community marketplace for buying, selling, and trading books. Discover hidden gems from fellow readers.",
    home_browse_books: "Browse Books",
    home_book_requests: "Book Requests",
    home_recently_listed: "Recently Listed",
    home_view_all: "View all",
    home_community_requests: "Community Requests",
    auth_join: "Join Unshelv'd",
    auth_welcome_back: "Welcome back",
    auth_sign_in: "Sign In",
    auth_create_account: "Create Account",
    auth_username: "Username",
    auth_display_name: "Display Name",
    auth_email: "Email",
    auth_password: "Password",
    auth_already_have_account: "Already have an account?",
    auth_no_account: "Don't have an account?",
    pw_min_length: "At least 12 characters",
    pw_uppercase: "One uppercase letter",
    pw_lowercase: "One lowercase letter",
    pw_number: "One number",
    pw_symbol: "One symbol (!@#$%^&*)",
    pw_no_name: "Cannot contain your name",
    browse_title: "Browse Books",
    browse_subtitle: "Find your next read from the community",
    browse_search_placeholder: "Search by title or author...",
    browse_no_books: "No books found",
    book_buy_now: "Buy Now",
    book_make_offer: "Make an Offer",
    book_message_seller: "Message Seller",
    book_for_sale: "For Sale",
    book_not_for_sale: "Not For Sale",
    book_open_to_offers: "Open to Offers",
    book_condition: "Condition",
    book_description: "Description",
    book_other_editions: "Other Editions & Translations",
    status_new: "New",
    status_like_new: "Like New",
    status_good: "Good",
    status_fair: "Fair",
    status_poor: "Poor",
    dash_title: "Dashboard",
    dash_active_listings: "Active Listings",
    dash_pending_offers: "Pending Offers",
    dash_unread_messages: "Unread Messages",
    dash_list_a_book: "List a Book",
    dash_post_request: "Post a Request",
    dash_my_listings: "My Listings",
    dash_no_books: "No books in your library yet",
    dash_add_first: "Add Your First Book",
    req_title: "Book Requests",
    req_subtitle: "Community members looking for specific books",
    req_budget: "Budget",
    req_i_have_this: "I Have This",
    req_post_request: "Post a Request",
    msg_title: "Messages",
    msg_conversations: "Conversations",
    msg_no_conversations: "No conversations yet",
    msg_select_conversation: "Select a conversation to start chatting",
    msg_start_conversation: "Start a conversation",
    msg_type_message: "Type a message...",
    pay_checkout: "Checkout",
    pay_review_purchase: "Review your purchase",
    pay_book_price: "Book price",
    pay_platform_fee: "Platform fee (10%)",
    pay_seller_receives: "Seller receives",
    pay_total: "Total",
    pay_buyer_protection: "Your payment is held securely until you confirm receipt of the book.",
    pay_purchase_complete: "Purchase Complete",
    pay_processing: "Processing payment...",
    common_cancel: "Cancel",
    common_save: "Save",
    common_delete: "Delete",
    common_edit: "Edit",
    common_loading: "Loading...",
    common_error: "Something went wrong",
    common_search: "Search",
    common_filter: "Filter",
    common_sort: "Sort",
    common_back: "Back",
  },

  es: {
    nav_browse: "Explorar",
    nav_requests: "Solicitudes",
    nav_about: "Acerca de",
    nav_dashboard: "Panel",
    nav_messages: "Mensajes",
    nav_profile: "Perfil",
    nav_login: "Iniciar sesión",
    nav_register: "Registrarse",
    nav_logout: "Cerrar sesión",
    home_hero: "Donde cada libro encuentra su próximo lector.",
    home_subtitle: "Un mercado comunitario para comprar, vender e intercambiar libros. Descubre joyas ocultas de otros lectores.",
    home_browse_books: "Explorar libros",
    home_book_requests: "Solicitudes de libros",
    home_recently_listed: "Publicados recientemente",
    home_view_all: "Ver todo",
    home_community_requests: "Solicitudes de la comunidad",
    auth_join: "Únete a Unshelv'd",
    auth_welcome_back: "Bienvenido de vuelta",
    auth_sign_in: "Iniciar sesión",
    auth_create_account: "Crear cuenta",
    auth_username: "Nombre de usuario",
    auth_display_name: "Nombre para mostrar",
    auth_email: "Correo electrónico",
    auth_password: "Contraseña",
    auth_already_have_account: "¿Ya tienes una cuenta?",
    auth_no_account: "¿No tienes una cuenta?",
    pw_min_length: "Al menos 12 caracteres",
    pw_uppercase: "Una letra mayúscula",
    pw_lowercase: "Una letra minúscula",
    pw_number: "Un número",
    pw_symbol: "Un símbolo (!@#$%^&*)",
    pw_no_name: "No puede contener tu nombre",
    browse_title: "Explorar libros",
    browse_subtitle: "Encuentra tu próxima lectura en la comunidad",
    browse_search_placeholder: "Buscar por título o autor...",
    browse_no_books: "No se encontraron libros",
    book_buy_now: "Comprar ahora",
    book_make_offer: "Hacer una oferta",
    book_message_seller: "Enviar mensaje al vendedor",
    book_for_sale: "En venta",
    book_not_for_sale: "No está en venta",
    book_open_to_offers: "Abierto a ofertas",
    book_condition: "Estado",
    book_description: "Descripción",
    book_other_editions: "Otras ediciones y traducciones",
    status_new: "Nuevo",
    status_like_new: "Como nuevo",
    status_good: "Bueno",
    status_fair: "Aceptable",
    status_poor: "Malo",
    dash_title: "Panel",
    dash_active_listings: "Publicaciones activas",
    dash_pending_offers: "Ofertas pendientes",
    dash_unread_messages: "Mensajes no leídos",
    dash_list_a_book: "Publicar un libro",
    dash_post_request: "Publicar solicitud",
    dash_my_listings: "Mis publicaciones",
    dash_no_books: "Aún no tienes libros en tu biblioteca",
    dash_add_first: "Agrega tu primer libro",
    req_title: "Solicitudes de libros",
    req_subtitle: "Miembros de la comunidad buscando libros específicos",
    req_budget: "Presupuesto",
    req_i_have_this: "Tengo este libro",
    req_post_request: "Publicar solicitud",
    msg_title: "Mensajes",
    msg_conversations: "Conversaciones",
    msg_no_conversations: "Sin conversaciones aún",
    msg_select_conversation: "Selecciona una conversación para chatear",
    msg_start_conversation: "Iniciar una conversación",
    msg_type_message: "Escribe un mensaje...",
    pay_checkout: "Pagar",
    pay_review_purchase: "Revisa tu compra",
    pay_book_price: "Precio del libro",
    pay_platform_fee: "Tarifa de plataforma (10%)",
    pay_seller_receives: "El vendedor recibe",
    pay_total: "Total",
    pay_buyer_protection: "Tu pago se retiene de forma segura hasta que confirmes la recepción del libro.",
    pay_purchase_complete: "Compra completada",
    pay_processing: "Procesando pago...",
    common_cancel: "Cancelar",
    common_save: "Guardar",
    common_delete: "Eliminar",
    common_edit: "Editar",
    common_loading: "Cargando...",
    common_error: "Algo salió mal",
    common_search: "Buscar",
    common_filter: "Filtrar",
    common_sort: "Ordenar",
    common_back: "Volver",
  },

  fr: {
    nav_browse: "Parcourir",
    nav_requests: "Demandes",
    nav_about: "À propos",
    nav_dashboard: "Tableau de bord",
    nav_messages: "Messages",
    nav_profile: "Profil",
    nav_login: "Connexion",
    nav_register: "S'inscrire",
    nav_logout: "Déconnexion",
    home_hero: "Où chaque livre trouve son prochain lecteur.",
    home_subtitle: "Un marché communautaire pour acheter, vendre et échanger des livres. Découvrez des trésors cachés d'autres lecteurs.",
    home_browse_books: "Parcourir les livres",
    home_book_requests: "Demandes de livres",
    home_recently_listed: "Récemment mis en vente",
    home_view_all: "Voir tout",
    home_community_requests: "Demandes de la communauté",
    auth_join: "Rejoindre Unshelv'd",
    auth_welcome_back: "Bon retour",
    auth_sign_in: "Se connecter",
    auth_create_account: "Créer un compte",
    auth_username: "Nom d'utilisateur",
    auth_display_name: "Nom d'affichage",
    auth_email: "E-mail",
    auth_password: "Mot de passe",
    auth_already_have_account: "Vous avez déjà un compte ?",
    auth_no_account: "Vous n'avez pas de compte ?",
    pw_min_length: "Au moins 12 caractères",
    pw_uppercase: "Une lettre majuscule",
    pw_lowercase: "Une lettre minuscule",
    pw_number: "Un chiffre",
    pw_symbol: "Un symbole (!@#$%^&*)",
    pw_no_name: "Ne peut pas contenir votre nom",
    browse_title: "Parcourir les livres",
    browse_subtitle: "Trouvez votre prochaine lecture dans la communauté",
    browse_search_placeholder: "Rechercher par titre ou auteur...",
    browse_no_books: "Aucun livre trouvé",
    book_buy_now: "Acheter maintenant",
    book_make_offer: "Faire une offre",
    book_message_seller: "Contacter le vendeur",
    book_for_sale: "En vente",
    book_not_for_sale: "Pas en vente",
    book_open_to_offers: "Ouvert aux offres",
    book_condition: "État",
    book_description: "Description",
    book_other_editions: "Autres éditions et traductions",
    status_new: "Neuf",
    status_like_new: "Comme neuf",
    status_good: "Bon",
    status_fair: "Correct",
    status_poor: "Mauvais",
    dash_title: "Tableau de bord",
    dash_active_listings: "Annonces actives",
    dash_pending_offers: "Offres en attente",
    dash_unread_messages: "Messages non lus",
    dash_list_a_book: "Mettre un livre en vente",
    dash_post_request: "Publier une demande",
    dash_my_listings: "Mes annonces",
    dash_no_books: "Pas encore de livres dans votre bibliothèque",
    dash_add_first: "Ajoutez votre premier livre",
    req_title: "Demandes de livres",
    req_subtitle: "Membres de la communauté recherchant des livres spécifiques",
    req_budget: "Budget",
    req_i_have_this: "J'ai ce livre",
    req_post_request: "Publier une demande",
    msg_title: "Messages",
    msg_conversations: "Conversations",
    msg_no_conversations: "Pas encore de conversations",
    msg_select_conversation: "Sélectionnez une conversation pour commencer",
    msg_start_conversation: "Commencer une conversation",
    msg_type_message: "Tapez un message...",
    pay_checkout: "Paiement",
    pay_review_purchase: "Vérifiez votre achat",
    pay_book_price: "Prix du livre",
    pay_platform_fee: "Frais de plateforme (10%)",
    pay_seller_receives: "Le vendeur reçoit",
    pay_total: "Total",
    pay_buyer_protection: "Votre paiement est conservé en sécurité jusqu'à ce que vous confirmiez la réception du livre.",
    pay_purchase_complete: "Achat terminé",
    pay_processing: "Traitement du paiement...",
    common_cancel: "Annuler",
    common_save: "Enregistrer",
    common_delete: "Supprimer",
    common_edit: "Modifier",
    common_loading: "Chargement...",
    common_error: "Une erreur est survenue",
    common_search: "Rechercher",
    common_filter: "Filtrer",
    common_sort: "Trier",
    common_back: "Retour",
  },

  de: {
    nav_browse: "Stöbern",
    nav_requests: "Anfragen",
    nav_about: "Über uns",
    nav_dashboard: "Übersicht",
    nav_messages: "Nachrichten",
    nav_profile: "Profil",
    nav_login: "Anmelden",
    nav_register: "Registrieren",
    nav_logout: "Abmelden",
    home_hero: "Wo jedes Buch seinen nächsten Leser findet.",
    home_subtitle: "Ein Marktplatz zum Kaufen, Verkaufen und Tauschen von Büchern. Entdecke verborgene Schätze von anderen Lesern.",
    home_browse_books: "Bücher durchstöbern",
    home_book_requests: "Buchwünsche",
    home_recently_listed: "Kürzlich eingestellt",
    home_view_all: "Alle anzeigen",
    home_community_requests: "Wünsche der Community",
    auth_join: "Bei Unshelv'd registrieren",
    auth_welcome_back: "Willkommen zurück",
    auth_sign_in: "Anmelden",
    auth_create_account: "Konto erstellen",
    auth_username: "Benutzername",
    auth_display_name: "Anzeigename",
    auth_email: "E-Mail",
    auth_password: "Passwort",
    auth_already_have_account: "Bereits ein Konto?",
    auth_no_account: "Noch kein Konto?",
    pw_min_length: "Mindestens 12 Zeichen",
    pw_uppercase: "Ein Großbuchstabe",
    pw_lowercase: "Ein Kleinbuchstabe",
    pw_number: "Eine Zahl",
    pw_symbol: "Ein Sonderzeichen (!@#$%^&*)",
    pw_no_name: "Darf nicht Ihren Namen enthalten",
    browse_title: "Bücher durchstöbern",
    browse_subtitle: "Finde dein nächstes Buch in der Community",
    browse_search_placeholder: "Nach Titel oder Autor suchen...",
    browse_no_books: "Keine Bücher gefunden",
    book_buy_now: "Jetzt kaufen",
    book_make_offer: "Angebot machen",
    book_message_seller: "Verkäufer kontaktieren",
    book_for_sale: "Zu verkaufen",
    book_not_for_sale: "Nicht zu verkaufen",
    book_open_to_offers: "Offen für Angebote",
    book_condition: "Zustand",
    book_description: "Beschreibung",
    book_other_editions: "Andere Ausgaben & Übersetzungen",
    status_new: "Neu",
    status_like_new: "Wie neu",
    status_good: "Gut",
    status_fair: "Akzeptabel",
    status_poor: "Schlecht",
    dash_title: "Übersicht",
    dash_active_listings: "Aktive Angebote",
    dash_pending_offers: "Ausstehende Angebote",
    dash_unread_messages: "Ungelesene Nachrichten",
    dash_list_a_book: "Buch einstellen",
    dash_post_request: "Anfrage stellen",
    dash_my_listings: "Meine Angebote",
    dash_no_books: "Noch keine Bücher in deiner Bibliothek",
    dash_add_first: "Füge dein erstes Buch hinzu",
    req_title: "Buchwünsche",
    req_subtitle: "Community-Mitglieder suchen bestimmte Bücher",
    req_budget: "Budget",
    req_i_have_this: "Ich habe dieses Buch",
    req_post_request: "Anfrage stellen",
    msg_title: "Nachrichten",
    msg_conversations: "Unterhaltungen",
    msg_no_conversations: "Noch keine Unterhaltungen",
    msg_select_conversation: "Wähle eine Unterhaltung zum Chatten",
    msg_start_conversation: "Unterhaltung beginnen",
    msg_type_message: "Nachricht eingeben...",
    pay_checkout: "Bezahlen",
    pay_review_purchase: "Kauf überprüfen",
    pay_book_price: "Buchpreis",
    pay_platform_fee: "Plattformgebühr (10%)",
    pay_seller_receives: "Verkäufer erhält",
    pay_total: "Gesamt",
    pay_buyer_protection: "Ihre Zahlung wird sicher verwahrt, bis Sie den Erhalt des Buches bestätigen.",
    pay_purchase_complete: "Kauf abgeschlossen",
    pay_processing: "Zahlung wird verarbeitet...",
    common_cancel: "Abbrechen",
    common_save: "Speichern",
    common_delete: "Löschen",
    common_edit: "Bearbeiten",
    common_loading: "Wird geladen...",
    common_error: "Etwas ist schiefgelaufen",
    common_search: "Suchen",
    common_filter: "Filtern",
    common_sort: "Sortieren",
    common_back: "Zurück",
  },

  pt: {
    nav_browse: "Explorar", nav_requests: "Pedidos", nav_about: "Sobre", nav_dashboard: "Painel", nav_messages: "Mensagens", nav_profile: "Perfil", nav_login: "Entrar", nav_register: "Registrar", nav_logout: "Sair",
    home_hero: "Onde cada livro encontra seu próximo leitor.", home_subtitle: "Um mercado comunitário para comprar, vender e trocar livros. Descubra tesouros escondidos de outros leitores.", home_browse_books: "Explorar livros", home_book_requests: "Pedidos de livros", home_recently_listed: "Listados recentemente", home_view_all: "Ver tudo", home_community_requests: "Pedidos da comunidade",
    auth_join: "Junte-se ao Unshelv'd", auth_welcome_back: "Bem-vindo de volta", auth_sign_in: "Entrar", auth_create_account: "Criar conta", auth_username: "Nome de usuário", auth_display_name: "Nome de exibição", auth_email: "E-mail", auth_password: "Senha", auth_already_have_account: "Já tem uma conta?", auth_no_account: "Não tem uma conta?",
    pw_min_length: "Pelo menos 12 caracteres", pw_uppercase: "Uma letra maiúscula", pw_lowercase: "Uma letra minúscula", pw_number: "Um número", pw_symbol: "Um símbolo (!@#$%^&*)", pw_no_name: "Não pode conter seu nome",
    browse_title: "Explorar livros", browse_subtitle: "Encontre sua próxima leitura na comunidade", browse_search_placeholder: "Pesquisar por título ou autor...", browse_no_books: "Nenhum livro encontrado",
    book_buy_now: "Comprar agora", book_make_offer: "Fazer oferta", book_message_seller: "Mensagem ao vendedor", book_for_sale: "À venda", book_not_for_sale: "Não está à venda", book_open_to_offers: "Aberto a ofertas", book_condition: "Condição", book_description: "Descrição", book_other_editions: "Outras edições e traduções",
    status_new: "Novo", status_like_new: "Como novo", status_good: "Bom", status_fair: "Razoável", status_poor: "Ruim",
    dash_title: "Painel", dash_active_listings: "Anúncios ativos", dash_pending_offers: "Ofertas pendentes", dash_unread_messages: "Mensagens não lidas", dash_list_a_book: "Anunciar um livro", dash_post_request: "Publicar pedido", dash_my_listings: "Meus anúncios", dash_no_books: "Ainda sem livros na sua biblioteca", dash_add_first: "Adicione seu primeiro livro",
    req_title: "Pedidos de livros", req_subtitle: "Membros da comunidade procurando livros específicos", req_budget: "Orçamento", req_i_have_this: "Eu tenho este", req_post_request: "Publicar pedido",
    msg_title: "Mensagens", msg_conversations: "Conversas", msg_no_conversations: "Sem conversas ainda", msg_select_conversation: "Selecione uma conversa para começar", msg_start_conversation: "Iniciar conversa", msg_type_message: "Digite uma mensagem...",
    pay_checkout: "Finalizar compra", pay_review_purchase: "Revise sua compra", pay_book_price: "Preço do livro", pay_platform_fee: "Taxa da plataforma (10%)", pay_seller_receives: "Vendedor recebe", pay_total: "Total", pay_buyer_protection: "Seu pagamento é mantido com segurança até que você confirme o recebimento do livro.", pay_purchase_complete: "Compra concluída", pay_processing: "Processando pagamento...",
    common_cancel: "Cancelar", common_save: "Salvar", common_delete: "Excluir", common_edit: "Editar", common_loading: "Carregando...", common_error: "Algo deu errado", common_search: "Pesquisar", common_filter: "Filtrar", common_sort: "Ordenar", common_back: "Voltar",
  },

  ru: {
    nav_browse: "Каталог", nav_requests: "Запросы", nav_about: "О нас", nav_dashboard: "Панель", nav_messages: "Сообщения", nav_profile: "Профиль", nav_login: "Войти", nav_register: "Регистрация", nav_logout: "Выйти",
    home_hero: "Где каждая книга находит своего следующего читателя.", home_subtitle: "Сообщество для покупки, продажи и обмена книгами. Откройте для себя скрытые сокровища от других читателей.", home_browse_books: "Просмотреть книги", home_book_requests: "Запросы книг", home_recently_listed: "Недавно добавленные", home_view_all: "Все", home_community_requests: "Запросы сообщества",
    auth_join: "Присоединиться к Unshelv'd", auth_welcome_back: "С возвращением", auth_sign_in: "Войти", auth_create_account: "Создать аккаунт", auth_username: "Имя пользователя", auth_display_name: "Отображаемое имя", auth_email: "Электронная почта", auth_password: "Пароль", auth_already_have_account: "Уже есть аккаунт?", auth_no_account: "Нет аккаунта?",
    pw_min_length: "Минимум 12 символов", pw_uppercase: "Одна заглавная буква", pw_lowercase: "Одна строчная буква", pw_number: "Одна цифра", pw_symbol: "Один спецсимвол (!@#$%^&*)", pw_no_name: "Не может содержать ваше имя",
    browse_title: "Каталог книг", browse_subtitle: "Найдите вашу следующую книгу в сообществе", browse_search_placeholder: "Поиск по названию или автору...", browse_no_books: "Книги не найдены",
    book_buy_now: "Купить сейчас", book_make_offer: "Сделать предложение", book_message_seller: "Написать продавцу", book_for_sale: "Продаётся", book_not_for_sale: "Не продаётся", book_open_to_offers: "Принимаю предложения", book_condition: "Состояние", book_description: "Описание", book_other_editions: "Другие издания и переводы",
    status_new: "Новая", status_like_new: "Как новая", status_good: "Хорошее", status_fair: "Удовлетворительное", status_poor: "Плохое",
    dash_title: "Панель", dash_active_listings: "Активные объявления", dash_pending_offers: "Ожидающие предложения", dash_unread_messages: "Непрочитанные сообщения", dash_list_a_book: "Добавить книгу", dash_post_request: "Создать запрос", dash_my_listings: "Мои объявления", dash_no_books: "В вашей библиотеке пока нет книг", dash_add_first: "Добавьте первую книгу",
    req_title: "Запросы книг", req_subtitle: "Участники сообщества ищут определённые книги", req_budget: "Бюджет", req_i_have_this: "У меня есть эта книга", req_post_request: "Создать запрос",
    msg_title: "Сообщения", msg_conversations: "Беседы", msg_no_conversations: "Пока нет бесед", msg_select_conversation: "Выберите беседу", msg_start_conversation: "Начать беседу", msg_type_message: "Введите сообщение...",
    pay_checkout: "Оплата", pay_review_purchase: "Проверьте покупку", pay_book_price: "Цена книги", pay_platform_fee: "Комиссия платформы (10%)", pay_seller_receives: "Продавец получит", pay_total: "Итого", pay_buyer_protection: "Ваш платёж надёжно удерживается до подтверждения получения книги.", pay_purchase_complete: "Покупка завершена", pay_processing: "Обработка платежа...",
    common_cancel: "Отмена", common_save: "Сохранить", common_delete: "Удалить", common_edit: "Редактировать", common_loading: "Загрузка...", common_error: "Что-то пошло не так", common_search: "Поиск", common_filter: "Фильтр", common_sort: "Сортировка", common_back: "Назад",
  },

  zh: {
    nav_browse: "浏览", nav_requests: "求书", nav_about: "关于", nav_dashboard: "控制台", nav_messages: "消息", nav_profile: "个人资料", nav_login: "登录", nav_register: "注册", nav_logout: "退出",
    home_hero: "让每本书找到下一位读者。", home_subtitle: "一个买卖和交换书籍的社区市场。发现其他读者的珍藏。", home_browse_books: "浏览书籍", home_book_requests: "求书区", home_recently_listed: "最近上架", home_view_all: "查看全部", home_community_requests: "社区求书",
    auth_join: "加入 Unshelv'd", auth_welcome_back: "欢迎回来", auth_sign_in: "登录", auth_create_account: "创建账户", auth_username: "用户名", auth_display_name: "显示名称", auth_email: "电子邮箱", auth_password: "密码", auth_already_have_account: "已有账户？", auth_no_account: "没有账户？",
    pw_min_length: "至少12个字符", pw_uppercase: "至少一个大写字母", pw_lowercase: "至少一个小写字母", pw_number: "至少一个数字", pw_symbol: "至少一个符号（!@#$%^&*）", pw_no_name: "不能包含您的姓名",
    browse_title: "浏览书籍", browse_subtitle: "从社区中找到你的下一本书", browse_search_placeholder: "按书名或作者搜索...", browse_no_books: "未找到书籍",
    book_buy_now: "立即购买", book_make_offer: "出价", book_message_seller: "联系卖家", book_for_sale: "出售中", book_not_for_sale: "非卖品", book_open_to_offers: "接受报价", book_condition: "品相", book_description: "描述", book_other_editions: "其他版本与译本",
    status_new: "全新", status_like_new: "近全新", status_good: "良好", status_fair: "尚可", status_poor: "较差",
    dash_title: "控制台", dash_active_listings: "在售书籍", dash_pending_offers: "待处理报价", dash_unread_messages: "未读消息", dash_list_a_book: "上架书籍", dash_post_request: "发布求书", dash_my_listings: "我的书籍", dash_no_books: "您的书架还是空的", dash_add_first: "添加第一本书",
    req_title: "求书区", req_subtitle: "社区成员正在寻找的书籍", req_budget: "预算", req_i_have_this: "我有这本书", req_post_request: "发布求书",
    msg_title: "消息", msg_conversations: "对话", msg_no_conversations: "暂无对话", msg_select_conversation: "选择对话开始聊天", msg_start_conversation: "开始对话", msg_type_message: "输入消息...",
    pay_checkout: "结账", pay_review_purchase: "确认购买", pay_book_price: "书价", pay_platform_fee: "平台费用（10%）", pay_seller_receives: "卖家收到", pay_total: "总计", pay_buyer_protection: "您的付款将安全保管，直到您确认收到书籍。", pay_purchase_complete: "购买完成", pay_processing: "正在处理付款...",
    common_cancel: "取消", common_save: "保存", common_delete: "删除", common_edit: "编辑", common_loading: "加载中...", common_error: "出了点问题", common_search: "搜索", common_filter: "筛选", common_sort: "排序", common_back: "返回",
  },

  ja: {
    nav_browse: "探す", nav_requests: "リクエスト", nav_about: "概要", nav_dashboard: "ダッシュボード", nav_messages: "メッセージ", nav_profile: "プロフィール", nav_login: "ログイン", nav_register: "新規登録", nav_logout: "ログアウト",
    home_hero: "すべての本が次の読者を見つける場所。", home_subtitle: "本の売買・交換のためのコミュニティマーケットプレイス。他の読者の隠れた名作を発見しよう。", home_browse_books: "本を探す", home_book_requests: "リクエスト", home_recently_listed: "最近の出品", home_view_all: "すべて見る", home_community_requests: "コミュニティリクエスト",
    auth_join: "Unshelv'd に参加", auth_welcome_back: "おかえりなさい", auth_sign_in: "ログイン", auth_create_account: "アカウント作成", auth_username: "ユーザー名", auth_display_name: "表示名", auth_email: "メールアドレス", auth_password: "パスワード", auth_already_have_account: "アカウントをお持ちですか？", auth_no_account: "アカウントをお持ちでないですか？",
    pw_min_length: "12文字以上", pw_uppercase: "大文字1つ以上", pw_lowercase: "小文字1つ以上", pw_number: "数字1つ以上", pw_symbol: "記号1つ以上（!@#$%^&*）", pw_no_name: "名前を含めることはできません",
    browse_title: "本を探す", browse_subtitle: "コミュニティから次の一冊を見つけよう", browse_search_placeholder: "タイトルまたは著者で検索...", browse_no_books: "本が見つかりませんでした",
    book_buy_now: "今すぐ購入", book_make_offer: "オファーする", book_message_seller: "出品者にメッセージ", book_for_sale: "販売中", book_not_for_sale: "非売品", book_open_to_offers: "オファー受付中", book_condition: "状態", book_description: "説明", book_other_editions: "他の版・翻訳",
    status_new: "新品", status_like_new: "ほぼ新品", status_good: "良い", status_fair: "普通", status_poor: "悪い",
    dash_title: "ダッシュボード", dash_active_listings: "出品中", dash_pending_offers: "保留中のオファー", dash_unread_messages: "未読メッセージ", dash_list_a_book: "本を出品", dash_post_request: "リクエスト投稿", dash_my_listings: "出品リスト", dash_no_books: "まだ本がありません", dash_add_first: "最初の本を追加",
    req_title: "リクエスト", req_subtitle: "コミュニティメンバーが探している本", req_budget: "予算", req_i_have_this: "この本を持っています", req_post_request: "リクエスト投稿",
    msg_title: "メッセージ", msg_conversations: "会話", msg_no_conversations: "まだ会話がありません", msg_select_conversation: "会話を選択してチャットを開始", msg_start_conversation: "会話を始める", msg_type_message: "メッセージを入力...",
    pay_checkout: "購入手続き", pay_review_purchase: "購入内容の確認", pay_book_price: "本の価格", pay_platform_fee: "プラットフォーム手数料（10%）", pay_seller_receives: "出品者の受取額", pay_total: "合計", pay_buyer_protection: "書籍の受け取りを確認するまで、お支払いは安全に保管されます。", pay_purchase_complete: "購入完了", pay_processing: "お支払い処理中...",
    common_cancel: "キャンセル", common_save: "保存", common_delete: "削除", common_edit: "編集", common_loading: "読み込み中...", common_error: "エラーが発生しました", common_search: "検索", common_filter: "フィルター", common_sort: "並べ替え", common_back: "戻る",
  },

  ko: {
    nav_browse: "둘러보기", nav_requests: "요청", nav_about: "소개", nav_dashboard: "대시보드", nav_messages: "메시지", nav_profile: "프로필", nav_login: "로그인", nav_register: "회원가입", nav_logout: "로그아웃",
    home_hero: "모든 책이 다음 독자를 만나는 곳.", home_subtitle: "책을 사고 팔고 교환하는 커뮤니티 마켓플레이스. 다른 독자들의 숨겨진 보석을 발견하세요.", home_browse_books: "도서 둘러보기", home_book_requests: "도서 요청", home_recently_listed: "최근 등록", home_view_all: "전체 보기", home_community_requests: "커뮤니티 요청",
    auth_join: "Unshelv'd 가입", auth_welcome_back: "다시 오신 것을 환영합니다", auth_sign_in: "로그인", auth_create_account: "계정 만들기", auth_username: "사용자 이름", auth_display_name: "표시 이름", auth_email: "이메일", auth_password: "비밀번호", auth_already_have_account: "이미 계정이 있으신가요?", auth_no_account: "계정이 없으신가요?",
    pw_min_length: "12자 이상", pw_uppercase: "대문자 1개 이상", pw_lowercase: "소문자 1개 이상", pw_number: "숫자 1개 이상", pw_symbol: "기호 1개 이상 (!@#$%^&*)", pw_no_name: "이름을 포함할 수 없습니다",
    browse_title: "도서 둘러보기", browse_subtitle: "커뮤니티에서 다음 읽을 책을 찾아보세요", browse_search_placeholder: "제목 또는 저자로 검색...", browse_no_books: "도서를 찾을 수 없습니다",
    book_buy_now: "지금 구매", book_make_offer: "제안하기", book_message_seller: "판매자에게 메시지", book_for_sale: "판매 중", book_not_for_sale: "비매품", book_open_to_offers: "제안 가능", book_condition: "상태", book_description: "설명", book_other_editions: "다른 판본 및 번역",
    status_new: "새 것", status_like_new: "거의 새 것", status_good: "양호", status_fair: "보통", status_poor: "나쁨",
    dash_title: "대시보드", dash_active_listings: "판매 중", dash_pending_offers: "대기 중인 제안", dash_unread_messages: "읽지 않은 메시지", dash_list_a_book: "도서 등록", dash_post_request: "요청 등록", dash_my_listings: "내 도서", dash_no_books: "아직 도서가 없습니다", dash_add_first: "첫 번째 도서를 추가하세요",
    req_title: "도서 요청", req_subtitle: "커뮤니티 회원들이 찾고 있는 도서", req_budget: "예산", req_i_have_this: "이 책을 가지고 있어요", req_post_request: "요청 등록",
    msg_title: "메시지", msg_conversations: "대화", msg_no_conversations: "아직 대화가 없습니다", msg_select_conversation: "대화를 선택하여 채팅을 시작하세요", msg_start_conversation: "대화 시작", msg_type_message: "메시지를 입력하세요...",
    pay_checkout: "결제", pay_review_purchase: "구매 확인", pay_book_price: "도서 가격", pay_platform_fee: "플랫폼 수수료 (10%)", pay_seller_receives: "판매자 수령액", pay_total: "합계", pay_buyer_protection: "도서 수령을 확인할 때까지 결제금이 안전하게 보관됩니다.", pay_purchase_complete: "구매 완료", pay_processing: "결제 처리 중...",
    common_cancel: "취소", common_save: "저장", common_delete: "삭제", common_edit: "편집", common_loading: "로딩 중...", common_error: "문제가 발생했습니다", common_search: "검색", common_filter: "필터", common_sort: "정렬", common_back: "뒤로",
  },

  ar: {
    nav_browse: "تصفح", nav_requests: "طلبات", nav_about: "حول", nav_dashboard: "لوحة التحكم", nav_messages: "الرسائل", nav_profile: "الملف الشخصي", nav_login: "تسجيل الدخول", nav_register: "إنشاء حساب", nav_logout: "تسجيل الخروج",
    home_hero: "حيث يجد كل كتاب قارئه التالي.", home_subtitle: "سوق مجتمعي لشراء وبيع وتبادل الكتب. اكتشف الكنوز المخفية من القراء الآخرين.", home_browse_books: "تصفح الكتب", home_book_requests: "طلبات الكتب", home_recently_listed: "أضيفت مؤخراً", home_view_all: "عرض الكل", home_community_requests: "طلبات المجتمع",
    auth_join: "انضم إلى Unshelv'd", auth_welcome_back: "مرحباً بعودتك", auth_sign_in: "تسجيل الدخول", auth_create_account: "إنشاء حساب", auth_username: "اسم المستخدم", auth_display_name: "اسم العرض", auth_email: "البريد الإلكتروني", auth_password: "كلمة المرور", auth_already_have_account: "لديك حساب بالفعل؟", auth_no_account: "ليس لديك حساب؟",
    pw_min_length: "١٢ حرفاً على الأقل", pw_uppercase: "حرف كبير واحد على الأقل", pw_lowercase: "حرف صغير واحد على الأقل", pw_number: "رقم واحد على الأقل", pw_symbol: "رمز واحد على الأقل (!@#$%^&*)", pw_no_name: "لا يمكن أن تحتوي على اسمك",
    browse_title: "تصفح الكتب", browse_subtitle: "ابحث عن كتابك التالي من المجتمع", browse_search_placeholder: "البحث بالعنوان أو المؤلف...", browse_no_books: "لم يتم العثور على كتب",
    book_buy_now: "اشترِ الآن", book_make_offer: "قدم عرضاً", book_message_seller: "راسل البائع", book_for_sale: "للبيع", book_not_for_sale: "غير معروض للبيع", book_open_to_offers: "مفتوح للعروض", book_condition: "الحالة", book_description: "الوصف", book_other_editions: "طبعات وترجمات أخرى",
    status_new: "جديد", status_like_new: "شبه جديد", status_good: "جيد", status_fair: "مقبول", status_poor: "سيئ",
    dash_title: "لوحة التحكم", dash_active_listings: "إعلانات نشطة", dash_pending_offers: "عروض معلقة", dash_unread_messages: "رسائل غير مقروءة", dash_list_a_book: "أضف كتاباً", dash_post_request: "انشر طلباً", dash_my_listings: "إعلاناتي", dash_no_books: "لا توجد كتب في مكتبتك بعد", dash_add_first: "أضف كتابك الأول",
    req_title: "طلبات الكتب", req_subtitle: "أعضاء المجتمع يبحثون عن كتب محددة", req_budget: "الميزانية", req_i_have_this: "لدي هذا الكتاب", req_post_request: "انشر طلباً",
    msg_title: "الرسائل", msg_conversations: "المحادثات", msg_no_conversations: "لا توجد محادثات بعد", msg_select_conversation: "اختر محادثة للبدء", msg_start_conversation: "ابدأ محادثة", msg_type_message: "اكتب رسالة...",
    pay_checkout: "الدفع", pay_review_purchase: "راجع عملية الشراء", pay_book_price: "سعر الكتاب", pay_platform_fee: "رسوم المنصة (١٠٪)", pay_seller_receives: "يحصل البائع على", pay_total: "المجموع", pay_buyer_protection: "يتم الاحتفاظ بدفعتك بأمان حتى تؤكد استلام الكتاب.", pay_purchase_complete: "اكتملت عملية الشراء", pay_processing: "جارٍ معالجة الدفع...",
    common_cancel: "إلغاء", common_save: "حفظ", common_delete: "حذف", common_edit: "تعديل", common_loading: "جارٍ التحميل...", common_error: "حدث خطأ ما", common_search: "بحث", common_filter: "تصفية", common_sort: "ترتيب", common_back: "رجوع",
  },
};

const fallbackLocales = (Object.keys(localeNames) as Locale[]).filter(
  (locale): locale is FallbackLocale => !(locale in baseTranslations),
);

const translations: Record<Locale, TranslationStrings> = {
  ...baseTranslations,
  ...Object.fromEntries(fallbackLocales.map((locale) => [locale, baseTranslations.en])) as Record<FallbackLocale, TranslationStrings>,
};

export default translations;
