/**
 * Affiliate Links — "Also found on" section
 * 
 * Shows external marketplace links for books.
 * ThriftBooks affiliate link earns 4-6.5% commission (Impact affiliate program).
 * 
 * Set VITE_THRIFTBOOKS_AFF_ID in your env to enable tracked links.
 * Without an affiliate ID, links still work but aren't tracked.
 */

import { ExternalLink, BookMarked, Tag } from "lucide-react";

interface AffiliateLinkProps {
  title: string;
  author: string;
  isbn?: string | null;
  className?: string;
}

const affId = typeof import.meta !== "undefined" ? import.meta.env?.VITE_THRIFTBOOKS_AFF_ID : null;

function buildThriftBooksUrl(title: string, author: string, isbn?: string | null): string {
  // ISBN search is most precise
  if (isbn) {
    const base = `https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent(isbn)}`;
    return affId ? `${base}#${affId}` : base;
  }
  // Fallback to title + author search
  const query = `${title} ${author}`.trim();
  const base = `https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent(query)}`;
  return affId ? `${base}#${affId}` : base;
}

function buildAbeUrl(title: string, author: string, isbn?: string | null): string {
  if (isbn) {
    return `https://www.abebooks.com/servlet/SearchResults?isbn=${encodeURIComponent(isbn)}`;
  }
  return `https://www.abebooks.com/servlet/SearchResults?tn=${encodeURIComponent(title)}&an=${encodeURIComponent(author)}`;
}

function buildOpenLibraryUrl(title: string, author: string): string {
  return `https://openlibrary.org/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

export default function AffiliateLinks({ title, author, isbn, className = "" }: AffiliateLinkProps) {
  const thriftBooksUrl = buildThriftBooksUrl(title, author, isbn);

  const secondaryLinks = [
    {
      name: "AbeBooks",
      url: buildAbeUrl(title, author, isbn),
      color: "text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300",
    },
    {
      name: "Open Library",
      url: buildOpenLibraryUrl(title, author),
      color: "text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300",
    },
  ];

  return (
    <div className={`${className}`} data-testid="affiliate-links">
      {/* ThriftBooks — hero affiliate link */}
      <a
        href={thriftBooksUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3 transition-all duration-200 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30"
        data-testid="thriftbooks-link"
      >
        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
          <BookMarked className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Also found on ThriftBooks
            </span>
            <ExternalLink className="h-3 w-3 text-blue-500 dark:text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/60 mt-0.5">
            {isbn
              ? <>Matched by ISBN <span className="font-mono">{isbn}</span></>
              : <>Search by title &amp; author</>
            }
          </p>
        </div>
        <div className="flex-shrink-0">
          <Tag className="h-4 w-4 text-blue-400 dark:text-blue-500 opacity-40 group-hover:opacity-70 transition-opacity" />
        </div>
      </a>

      {/* Secondary links */}
      <div className="flex items-center gap-3 mt-2.5 pl-1">
        <span className="text-[11px] text-muted-foreground/60">Also on</span>
        {secondaryLinks.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${link.color}`}
          >
            {link.name}
            <ExternalLink className="h-2.5 w-2.5 opacity-50" />
          </a>
        ))}
      </div>
    </div>
  );
}
