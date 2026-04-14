/**
 * Affiliate Links — "Also available on" section
 *
 * Shows external marketplace links for books.
 * ThriftBooks affiliate link earns 4-6.5% commission (Impact affiliate program).
 *
 * ThriftBooks Impact affiliate URL format:
 *   https://www.thriftbooks.com/browse/?b.search=ISBN
 *   with ref param: ?ref=AFFID (or the Impact click URL if you have one)
 *
 * Set VITE_THRIFTBOOKS_AFF_ID in your .env to enable tracked links.
 * Without it, links still work — just untracked.
 *
 * Smart display logic:
 *   - Always show for English-language books (ThriftBooks is US-centric)
 *   - Show for any book with an ISBN (reliable match)
 *   - Hide for books in non-Latin scripts with no ISBN (unlikely to be on ThriftBooks)
 */

import { ExternalLink, BookMarked, Tag, ShoppingBag } from "lucide-react";
import ExternalAnchor from "@/components/external-link";

interface AffiliateLinkProps {
  title: string;
  author: string;
  isbn?: string | null;
  language?: string | null;
  script?: string | null;
  className?: string;
}

const affId = import.meta.env?.VITE_THRIFTBOOKS_AFF_ID ?? null;

// Languages that ThriftBooks reliably carries
const TB_SUPPORTED_LANGUAGES = new Set([
  "English", "Spanish", "French", "German", "Portuguese", "Italian",
  "Dutch", "Swedish", "Norwegian", "Danish", "Finnish", "Polish",
  "Czech", "Hungarian", "Romanian",
]);

// Scripts that ThriftBooks almost never carries
const TB_UNSUPPORTED_SCRIPTS = new Set([
  "Cyrillic", "Arabic", "Hebrew", "Japanese (Kanji 漢字)", "Chinese (Simplified 简体)",
  "Korean (Hangul 한글)", "Thai", "Georgian", "Armenian", "Tibetan",
  "Arabic (العربية)", "Hebrew (עברית)", "Persian (فارسی)",
]);

/**
 * Decide whether to show a ThriftBooks link.
 * Show if: has ISBN, or is in a supported language, or language is unknown.
 * Hide if: non-Latin script with no ISBN (won't be on ThriftBooks).
 */
function shouldShowThriftBooks(
  isbn?: string | null,
  language?: string | null,
  script?: string | null,
): boolean {
  // Always show if we have an ISBN — the match will be exact regardless of language
  if (isbn) return true;
  // If no language info, show by default (err on the side of showing)
  if (!language) return true;
  // If it's a supported language, show
  if (TB_SUPPORTED_LANGUAGES.has(language)) return true;
  // If it has a non-Latin script and no ISBN, ThriftBooks won't have it
  if (script && TB_UNSUPPORTED_SCRIPTS.has(script)) return false;
  // Default: show (many international books in Latin script are on ThriftBooks)
  return true;
}

/**
 * Build the ThriftBooks search URL.
 * ISBN search is the most precise — goes directly to the right book.
 * Title+Author search is a fuzzy fallback.
 *
 * Affiliate tracking: ThriftBooks/Impact uses ?ref= for simple affiliate attribution.
 * For a full Impact click URL you'd use their generator, but ?ref=AFFID works for
 * the basic program.
 */
function buildThriftBooksUrl(title: string, author: string, isbn?: string | null): string {
  const searchTerm = isbn
    ? isbn.replace(/[^0-9X]/gi, "") // clean ISBN
    : `${title} ${author}`.trim();

  const base = `https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent(searchTerm)}`;
  return affId ? `${base}&ref=${encodeURIComponent(affId)}` : base;
}

function buildAbeUrl(title: string, author: string, isbn?: string | null): string {
  if (isbn) {
    return `https://www.abebooks.com/servlet/SearchResults?isbn=${encodeURIComponent(
      isbn.replace(/[^0-9X]/gi, ""),
    )}`;
  }
  return `https://www.abebooks.com/servlet/SearchResults?tn=${encodeURIComponent(
    title,
  )}&an=${encodeURIComponent(author)}`;
}

function buildOpenLibraryUrl(title: string, author: string, isbn?: string | null): string {
  if (isbn) {
    return `https://openlibrary.org/isbn/${isbn.replace(/[^0-9X]/gi, "")}`;
  }
  return `https://openlibrary.org/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

function buildAmazonUrl(title: string, author: string, isbn?: string | null): string {
  const searchTerm = isbn
    ? isbn.replace(/[^0-9X]/gi, "")
    : `${title} ${author}`.trim();
  return `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}`;
}

function buildBNUrl(title: string, author: string, isbn?: string | null): string {
  const searchTerm = isbn
    ? isbn.replace(/[^0-9X]/gi, "")
    : `${title} ${author}`.trim();
  return `https://www.barnesandnoble.com/s/${encodeURIComponent(searchTerm)}`;
}

export default function AffiliateLinks({
  title,
  author,
  isbn,
  language,
  script,
  className = "",
}: AffiliateLinkProps) {
  const showThriftBooks = shouldShowThriftBooks(isbn, language, script);
  const thriftBooksUrl = buildThriftBooksUrl(title, author, isbn);

  // Determine match quality label
  const matchLabel = isbn
    ? <>Matched by ISBN <span className="font-mono">{isbn}</span></>
    : <>Search by title &amp; author</>;

  const secondaryLinks = [
    {
      name: "Amazon",
      url: buildAmazonUrl(title, author, isbn),
      color: "text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300",
      show: true,
    },
    {
      name: "Barnes & Noble",
      url: buildBNUrl(title, author, isbn),
      color: "text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300",
      show: true,
    },
    {
      name: "AbeBooks",
      url: buildAbeUrl(title, author, isbn),
      color: "text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300",
      show: true, // AbeBooks has wide international inventory
    },
    {
      name: "Open Library",
      url: buildOpenLibraryUrl(title, author, isbn),
      color: "text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300",
      show: true,
    },
  ].filter((l) => l.show);
  // If nothing to show (e.g. unsupported script, no ISBN), still show AbeBooks + OL
  const showPrimarySection = showThriftBooks;

  return (
    <div className={className} data-testid="affiliate-links">
      {/* ThriftBooks — primary affiliate link (shown when likely to have the book) */}
      {showPrimarySection && (
        <ExternalAnchor
          href={thriftBooksUrl}
          rel="noopener noreferrer sponsored"
          className="group flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3 transition-all duration-200 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          data-testid="thriftbooks-link"
        >
          <div className="flex-shrink-0 h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <BookMarked className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Also on ThriftBooks
              </span>
              {affId && (
                <span className="text-[10px] text-blue-400/60 dark:text-blue-500/50 font-normal">
                  · affiliate
                </span>
              )}
              <ExternalLink className="h-3 w-3 text-blue-500 dark:text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/60 mt-0.5">
              {matchLabel}
            </p>
          </div>
          <div className="flex-shrink-0">
            <Tag className="h-4 w-4 text-blue-400 dark:text-blue-500 opacity-40 group-hover:opacity-70 transition-opacity" />
          </div>
        </ExternalAnchor>
      )}

      {/* Secondary marketplace links */}
      <div className={`flex items-center gap-3 pl-1 ${showPrimarySection ? "mt-2.5" : ""}`}>
        {!showPrimarySection && (
          <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
        <span className="text-[11px] text-muted-foreground/60">
          {showPrimarySection ? "Also on" : "Find this book on"}
        </span>
        {secondaryLinks.map((link) => (
          <ExternalAnchor
            key={link.name}
            href={link.url}
            className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${link.color}`}
          >
            {link.name}
            <ExternalLink className="h-2.5 w-2.5 opacity-50" />
          </ExternalAnchor>
        ))}
      </div>
    </div>
  );
}
