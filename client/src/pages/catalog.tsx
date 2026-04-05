import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, Globe } from "lucide-react";
import { getTextDirection, isCJK } from "@/lib/constants";
import type { CatalogEntry } from "@shared/schema";

interface CatalogResponse {
  books: CatalogEntry[];
  total: number;
}

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  const linkTarget = entry.workId ? `/work/${entry.workId}` : `/browse`;

  return (
    <Link href={linkTarget}>
      <article
        className="group cursor-pointer rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
        data-testid={`catalog-card-${entry.id}`}
      >
        {/* Cover */}
        <div className="h-52 bg-muted relative overflow-hidden">
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

export default function Catalog() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const [search, setSearch] = useState(params.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [page, setPage] = useState(1);

  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("q", debouncedSearch);
  queryParams.set("page", String(page));

  const { data, isLoading } = useQuery<CatalogResponse>({
    queryKey: [`/api/catalog?${queryParams.toString()}`],
  });

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const books = data?.books || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 24);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8" data-testid="catalog-page">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold mb-2">Browse Catalog</h1>
        <p className="text-muted-foreground">Explore all {total.toLocaleString()} known books and editions.</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by title, author, or ISBN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Book Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-52 rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : books.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {books.map((entry) => (
              <CatalogCard key={entry.id} entry={entry} />
            ))}
          </div>
          {/* Pagination */}
          <div className="flex justify-center items-center gap-4 mt-8">
            <Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center py-20 border rounded-lg bg-card">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-serif text-lg font-medium mb-1">No books found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}
