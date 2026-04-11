import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, ArrowUp } from "lucide-react";
import CatalogCard from "@/components/catalog-card";
import type { CatalogEntry } from "@shared/schema";

interface CatalogResponse {
  books: CatalogEntry[];
  total: number;
}

export default function Catalog() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const [search, setSearch] = useState(params.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [page, setPage] = useState(1);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > window.innerHeight);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
          aria-label="Back to top"
          data-testid="catalog-back-to-top"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
