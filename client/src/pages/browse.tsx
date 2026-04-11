import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, Link } from "wouter";
import BookCard from "@/components/book-card";
import CatalogCard from "@/components/catalog-card";
import AdBanner from "@/components/ad-banner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, SlidersHorizontal, ArrowRight, ArrowUp } from "lucide-react";
import type { Book, CatalogEntry } from "@shared/schema";

interface CatalogResponse {
  books: CatalogEntry[];
  total: number;
}

const fallbackGenres = ["Fiction", "Non-Fiction", "Sci-Fi", "Mystery", "Biography", "Poetry", "Philosophy", "History"];
const conditions = ["new", "like-new", "good", "fair", "poor"];

export default function Browse() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);

  const [search, setSearch] = useState(params.get("search") || "");
  const [genre, setGenre] = useState(params.get("genre") || "");
  const [condition, setCondition] = useState("");
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > window.innerHeight);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch genres dynamically from API, fall back to hardcoded list
  const { data: dynamicGenres } = useQuery<string[]>({
    queryKey: ["/api/genres"],
  });
  const genres = dynamicGenres && dynamicGenres.length > 0 ? dynamicGenres : fallbackGenres;

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (genre) queryParams.set("genre", genre);
  if (condition) queryParams.set("condition", condition);
  if (status) queryParams.set("status", status);
  if (sort && sort !== "newest") queryParams.set("sort", sort === "price-low" ? "price-asc" : sort === "price-high" ? "price-desc" : "");

  const { data: books, isLoading } = useQuery<Book[]>({
    queryKey: [`/api/books?${queryParams.toString()}`],
  });

  // Fetch catalog entries as fallback when no user listings exist
  const { data: catalogData, isLoading: catalogLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/catalog?limit=24"],
    enabled: !isLoading && (!books || books.length === 0),
  });

  const catalogBooks = catalogData?.books || [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8" data-testid="browse-page">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold mb-2">Browse Books</h1>
        <p className="text-muted-foreground">Find your next read from the community</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by title or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="search-input"
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} data-testid="toggle-filters">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-6 p-4 border rounded-lg bg-card" data-testid="filters-panel">
          <Select value={genre || "all"} onValueChange={(v) => setGenre(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genres</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={condition || "all"} onValueChange={(v) => setCondition(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Condition</SelectItem>
              {conditions.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="for-sale">For Sale</SelectItem>
              <SelectItem value="open-to-offers">Open to Offers</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: Low-High</SelectItem>
              <SelectItem value="price-high">Price: High-Low</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setGenre(""); setCondition(""); setStatus(""); setSort("newest"); setSearch(""); }}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Genre pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {genres.map((g) => (
          <Button
            key={g}
            variant={genre === g ? "default" : "outline"}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setGenre(genre === g ? "" : g)}
            data-testid={`filter-genre-${g.toLowerCase()}`}
          >
            {g}
          </Button>
        ))}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-52 rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : books && books.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-testid="books-grid">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <>
          {catalogLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-52 rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : catalogBooks.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-4 p-4 border rounded-lg bg-muted/30">
                <div>
                  <h3 className="font-serif text-lg font-medium">No user listings yet</h3>
                  <p className="text-sm text-muted-foreground">Browse our catalog of {catalogData?.total ? catalogData.total.toLocaleString() : ""} known books and editions</p>
                </div>
                <Link href="/catalog">
                  <Button variant="outline" size="sm">
                    Full Catalog <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-testid="catalog-fallback-grid">
                {catalogBooks.map((entry) => (
                  <CatalogCard key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 border rounded-lg bg-card">
              <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-serif text-lg font-medium mb-1">No books found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          )}
        </>
      )}

      {/* Subtle ad */}
      <div className="mt-8 flex justify-center">
        <AdBanner size="leaderboard" />
      </div>

      {/* Back to top */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
          aria-label="Back to top"
          data-testid="back-to-top"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
