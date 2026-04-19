import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import BookCard from "@/components/book-card";
import CatalogCard from "@/components/catalog-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, BookOpen, Search, Users } from "lucide-react";
import { useState, useEffect } from "react";
import type { Book, BookRequest, CatalogEntry } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface CatalogResponse {
  books: CatalogEntry[];
  total: number;
}

interface RequestUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface RequestWithUser extends BookRequest {
  user: RequestUser | null;
}

const fallbackGenres = ["Fiction", "Non-Fiction", "Textbooks", "Sci-Fi", "Mystery", "Biography", "Poetry", "Philosophy", "History", "Rare"];

export default function Home() {
  const { data: books, isLoading: booksLoading } = useQuery<Book[]>({
    queryKey: ["/api/books?limit=10"],
  });

  const { data: catalogData, isLoading: catalogLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/catalog?limit=10"],
  });

  const { data: requestsData, isLoading: requestsLoading } = useQuery<{ requests: RequestWithUser[]; total: number }>({
    queryKey: ["/api/requests?status=open&limit=6"],
  });
  const requests = requestsData?.requests;

  const { data: dynamicGenres } = useQuery<string[]>({
    queryKey: ["/api/genres"],
    staleTime: 10 * 60 * 1000,
  });
  const genres = dynamicGenres && dynamicGenres.length > 0 ? dynamicGenres.slice(0, 10) : fallbackGenres;

  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [heroSearch, setHeroSearch] = useState("");

  // Show a success toast when the user has just verified their email
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("email_verified") === "1") {
      toast({ title: "Email verified!", description: "Your email address has been confirmed. Welcome to Unshelv'd!" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      // Clean up the query param (replace hash without the param)
      window.history.replaceState(null, "", window.location.pathname + "#/");
    }
  }, []);

  const hasUserBooks = books && books.length > 0;
  const catalogBooks = catalogData?.books || [];
  const hasCatalogBooks = catalogBooks.length > 0;

  return (
    <div className="min-h-screen" data-testid="home-page">
      {/* Hero */}
      <section className="relative py-20 md:py-28 px-4" data-testid="hero">
        <div className="container mx-auto max-w-4xl">
          <h1 className="font-serif text-4xl md:text-6xl font-bold leading-tight mb-4 max-w-2xl">
            Where every book finds its next reader.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-lg mb-8">
            A community marketplace for buying, selling, and trading books. Discover hidden gems from fellow readers.
          </p>
          <p className="text-sm text-muted-foreground max-w-lg mb-6">
            Unshelv&apos;d is run by a small middleman model: currently a 10% per-transaction fee,
            with a long-term target to reduce to 5% as the platform scales.
          </p>
          <form
            className="flex gap-2 mb-6 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (heroSearch.trim()) {
                setLocation(`/browse?search=${encodeURIComponent(heroSearch.trim())}`);
              }
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by title or author..."
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                className="pl-9"
                data-testid="hero-search-input"
              />
            </div>
            <Button type="submit" data-testid="hero-search-btn">Search</Button>
          </form>
          <div className="flex flex-wrap gap-3">
            <Link href="/browse">
              <Button size="lg" className="font-medium" data-testid="hero-browse">
                <Search className="h-4 w-4 mr-2" />
                Browse Books
              </Button>
            </Link>
            <Link href="/requests">
              <Button size="lg" variant="outline" className="font-medium" data-testid="hero-requests">
                <BookOpen className="h-4 w-4 mr-2" />
                Book Requests
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Genre quick filters */}
      <section className="px-4 pb-8">
        <div className="container mx-auto max-w-6xl">
          <div className="flex gap-2 flex-wrap">
            {genres.map((genre) => (
              <Link key={genre} href={`/browse?genre=${genre}`}>
                <Button variant="outline" size="sm" className="rounded-full text-xs" data-testid={`genre-${genre.toLowerCase()}`}>
                  {genre}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recently listed books */}
      <section className="px-4 pb-16" data-testid="recent-books">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl font-semibold">
              {hasUserBooks ? "Recently Listed" : "Featured Books"}
            </h2>
            <Link href={hasUserBooks ? "/browse" : "/catalog"}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View all <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>

          {booksLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-52 rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : hasUserBooks ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {books.slice(0, 10).map((book, i) => (
                <BookCard key={book.id} book={book} size={i < 2 ? "large" : i < 5 ? "medium" : "small"} />
              ))}
            </div>
          ) : catalogLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-52 rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : hasCatalogBooks ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {catalogBooks.slice(0, 10).map((entry, i) => (
                <CatalogCard key={entry.id} entry={entry} size={i < 2 ? "large" : i < 5 ? "medium" : "small"} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border rounded-lg bg-card">
              <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-serif text-lg font-medium mb-1">No books listed yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Be the first to list a book on Unshelv'd</p>
              <Link href="/dashboard/add-book">
                <Button>List a Book</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Book Requests preview */}
      <section className="px-4 pb-16 bg-muted/30" data-testid="recent-requests">
        <div className="container mx-auto max-w-6xl py-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-serif text-2xl font-semibold">Community Requests</h2>
              <p className="text-sm text-muted-foreground mt-1">People looking for specific books</p>
            </div>
            <Link href="/requests">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View all <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>

          {requestsLoading ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : requests && requests.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {requests.slice(0, 6).map((req) => (
                <div key={req.id} className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow" data-testid={`request-card-${req.id}`}>
                  <h3 className="font-serif font-medium text-sm mb-1">Looking for: {req.title}</h3>
                  {req.author && <p className="text-xs text-muted-foreground mb-1">by {req.author}</p>}
                  {req.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{req.description}</p>}
                  <div className="flex items-center justify-between">
                    {req.maxPrice && (
                      <span className="text-xs font-medium text-primary">Budget: ${req.maxPrice}</span>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {req.user?.displayName}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg bg-card">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No book requests yet</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
