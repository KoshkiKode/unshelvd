import { Link } from "wouter";
import { BookOpen, Globe } from "lucide-react";
import { getTextDirection, isCJK } from "@/lib/constants";
import type { CatalogEntry } from "@shared/schema";

interface CatalogCardProps {
  entry: CatalogEntry;
  size?: "small" | "medium" | "large";
}

export default function CatalogCard({ entry, size = "medium" }: CatalogCardProps) {
  const linkTarget = entry.workId ? `/work/${entry.workId}` : `/browse`;
  const heightClass = size === "large" ? "h-72" : size === "small" ? "h-40" : "h-52";

  return (
    <Link href={linkTarget}>
      <article
        className="group cursor-pointer rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
        data-testid={`catalog-card-${entry.id}`}
      >
        {/* Cover */}
        <div className={`${heightClass} bg-muted relative overflow-hidden`}>
          {entry.coverUrl ? (
            <img
              src={entry.coverUrl}
              alt={entry.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <BookOpen className="h-10 w-10 text-primary/30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <h3
            className={`font-serif font-medium text-sm leading-tight line-clamp-2 mb-0.5 ${isCJK(entry.title) ? "font-cjk" : ""}`}
            dir={getTextDirection(entry.language)}
            data-testid="catalog-title"
          >
            {entry.title}
          </h3>
          <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{entry.author}</p>
          {/* Language / Origin indicators */}
          {(entry.language || entry.countryOfOrigin) && (
            <div className="flex items-center gap-1 mb-1.5 text-[10px] text-muted-foreground">
              <Globe className="h-2.5 w-2.5" />
              {entry.language && <span>{entry.language}</span>}
              {entry.language && entry.countryOfOrigin && <span>·</span>}
              {entry.countryOfOrigin && <span>{entry.countryOfOrigin}</span>}
            </div>
          )}
          {entry.publicationYear && (
            <span className="text-xs text-muted-foreground">{entry.publicationYear}</span>
          )}
        </div>
      </article>
    </Link>
  );
}
