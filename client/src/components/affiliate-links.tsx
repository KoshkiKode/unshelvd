/**
 * Affiliate Links — "Also find on" section
 * 
 * Shows external marketplace links for books.
 * ThriftBooks affiliate link earns 4-6.5% commission (Impact affiliate program).
 * 
 * Set VITE_THRIFTBOOKS_AFF_ID in your env to enable tracked links.
 * Without an affiliate ID, links still work but aren't tracked.
 */

import { ExternalLink } from "lucide-react";

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
  const links = [
    {
      name: "ThriftBooks",
      url: buildThriftBooksUrl(title, author, isbn),
      color: "text-blue-700 dark:text-blue-400",
    },
    {
      name: "AbeBooks",
      url: buildAbeUrl(title, author, isbn),
      color: "text-red-700 dark:text-red-400",
    },
    {
      name: "Open Library",
      url: buildOpenLibraryUrl(title, author),
      color: "text-green-700 dark:text-green-400",
    },
  ];

  return (
    <div className={`text-xs text-muted-foreground ${className}`} data-testid="affiliate-links">
      <p className="mb-1.5 font-medium text-foreground/70">Also find on</p>
      <div className="flex flex-wrap gap-3">
        {links.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 hover:underline ${link.color}`}
          >
            {link.name}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ))}
      </div>
    </div>
  );
}
