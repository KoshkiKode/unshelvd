import { useState, useRef, useEffect } from "react";
import { useLocation, Redirect, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Search, BookOpen, X, Globe, Smartphone, Mail } from "lucide-react";
import { Link } from "wouter";
import {
  languages,
  allCountries,
  countries,
  eras,
  scripts,
  genres,
  calendarSystems,
  languageGroups,
} from "@/lib/constants";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface SearchResult {
  title: string;
  author: string;
  year: number | null;
  publisher: string | null;
  isbn: string | null;
  coverUrl: string | null;
  editionCount: number;
  subjects: string[];
}

const conditions = [
  { value: "new", label: "New" },
  { value: "like-new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

const statuses = [
  {
    value: "for-sale",
    label: "For Sale",
    description: "List with a fixed price",
  },
  {
    value: "open-to-offers",
    label: "Open to Offers",
    description: "Let buyers make offers",
  },
  {
    value: "not-for-sale",
    label: "Not For Sale",
    description: "Show in your collection",
  },
  {
    value: "reading",
    label: "Currently Reading",
    description: "Show what you're reading",
  },
  {
    value: "wishlist",
    label: "Wishlist",
    description: "Books you want to find",
  },
];

// genres imported from constants

export default function AddBook() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchStr = useSearch();

  const editParams = new URLSearchParams(searchStr);
  const editBookId = editParams.get("edit") ? parseInt(editParams.get("edit")!) : null;

  // Fetch existing book when editing
  const { data: editBook } = useQuery<Book>({
    queryKey: [`/api/books/${editBookId}`],
    enabled: editBookId != null,
  });

  // Desktop-only: dismiss state for "email yourself a link" banner
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" && window.innerWidth >= 768,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const sendMobileLink = () => {
    if (!user?.email) {
      toast({
        title: "No email on file",
        description: "Update your profile with an email address first.",
        variant: "destructive",
      });
      return;
    }
    const addBookUrl = `${window.location.origin}/add-book`;
    const subject = encodeURIComponent("Add a book on Unshelv'd");
    const body = encodeURIComponent(
      `Here's your link to add a book using your phone camera:\n\n${addBookUrl}\n\nJust open this on your phone to scan the barcode or take a photo of the cover.`,
    );
    const to = encodeURIComponent(user.email);
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    toast({ title: "Opening email app…", description: "Send the link to yourself and open it on your phone." });
  };

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const searchRef = useRef<HTMLDivElement>(null);

  // Form state
  const [form, setForm] = useState({
    title: "",
    author: "",
    isbn: "",
    coverUrl: "",
    description: "",
    condition: "good",
    status: "for-sale",
    price: "",
    genre: [] as string[],
    publisher: "",
    edition: "",
    year: "",
    // Advanced
    language: "",
    originalLanguage: "",
    countryOfOrigin: "",
    printCountry: "",
    era: "",
    script: "",
    calendarSystem: "",
    calendarYear: "",
    textDirection: "",
  });

  // Pre-fill form from URL params
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const title = params.get("title");
    if (title) {
      setForm((prev) => ({
        ...prev,
        title: title,
        author: params.get("author") || "",
        isbn: params.get("isbn") || "",
        year: params.get("year") || "",
        publisher: params.get("publisher") || "",
        coverUrl: params.get("coverUrl") || "",
      }));
      toast({
        title: "Book Details Pre-filled",
        description: `Now just add the condition and price for your copy of "${title}".`,
      });
    }
  }, [searchStr, toast]);

  // Pre-fill form when editing an existing book
  useEffect(() => {
    if (!editBook) return;
    setForm({
      title: editBook.title || "",
      author: editBook.author || "",
      isbn: editBook.isbn || "",
      coverUrl: editBook.coverUrl || "",
      description: editBook.description || "",
      condition: editBook.condition || "good",
      status: editBook.status || "for-sale",
      price: editBook.price != null ? String(editBook.price) : "",
      genre: editBook.genre ? editBook.genre.split(",").map((g: string) => g.trim()) : [],
      publisher: editBook.publisher || "",
      edition: editBook.edition || "",
      year: editBook.year != null ? String(editBook.year) : "",
      language: editBook.language || "",
      originalLanguage: editBook.originalLanguage || "",
      countryOfOrigin: editBook.countryOfOrigin || "",
      printCountry: editBook.printCountry || "",
      era: editBook.era || "",
      script: editBook.script || "",
      calendarSystem: editBook.calendarSystem || "",
      calendarYear: editBook.calendarYear || "",
      textDirection: editBook.textDirection || "",
    });
  }, [editBook]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiRequest(
          "GET",
          `/api/search/books?q=${encodeURIComponent(searchQuery)}`,
        );
        const data = await res.json();
        setSearchResults(data);
        setShowResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectResult = (result: SearchResult) => {
    setForm((prev) => ({
      ...prev,
      title: result.title,
      author: result.author,
      isbn: result.isbn || "",
      coverUrl: result.coverUrl || "",
      publisher: result.publisher || "",
      year: result.year ? String(result.year) : "",
    }));
    setSearchQuery("");
    setShowResults(false);
    toast({
      title: "Book info filled in",
      description: `"${result.title}" by ${result.author}`,
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        author: form.author,
        isbn: form.isbn || null,
        coverUrl: form.coverUrl || null,
        description: form.description || null,
        condition: form.condition,
        status: form.status,
        price: form.price ? parseFloat(form.price) : null,
        genre: form.genre.length > 0 ? form.genre.join(",") : null,
        publisher: form.publisher || null,
        edition: form.edition || null,
        year: form.year ? parseInt(form.year) : null,
        language: form.language || null,
        originalLanguage: form.originalLanguage || null,
        countryOfOrigin: form.countryOfOrigin || null,
        printCountry: form.printCountry || null,
        era: form.era || null,
        script: form.script || null,
        calendarSystem: form.calendarSystem || null,
        calendarYear: form.calendarYear || null,
        textDirection: form.textDirection || null,
      };
      if (editBookId) {
        const res = await apiRequest("PATCH", `/api/books/${editBookId}`, payload);
        return await res.json();
      } else {
        const res = await apiRequest("POST", "/api/books", payload);
        return await res.json();
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/books/user/${user?.id}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      if (editBookId) {
        toast({ title: "Book updated!" });
      } else {
        const matched = data?.matchedRequests ?? [];
        if (matched.length > 0) {
          toast({
            title: "Book listed!",
            description: `Matches ${matched.length} open request${matched.length > 1 ? "s" : ""}. Check the Requests page.`,
          });
        } else {
          toast({ title: "Book listed!" });
        }
      }
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!user) return <Redirect to="/login" />;

  const toggleGenre = (g: string) => {
    setForm((prev) => ({
      ...prev,
      genre: prev.genre.includes(g)
        ? prev.genre.filter((x) => x !== g)
        : [...prev.genre, g],
    }));
  };

  const showPrice =
    form.status === "for-sale" || form.status === "open-to-offers";

  return (
    <div
      className="container mx-auto max-w-2xl px-4 py-8"
      data-testid="add-book-page"
    >
      <Link href="/dashboard">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">{editBookId ? "Edit Listing" : "Add a Book"}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop: offer to email a link so users can add the book via phone camera */}
          {isDesktop && !emailBannerDismissed && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Want to use your phone camera?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Email yourself a link to scan the barcode or take a photo of the cover.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={sendMobileLink}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email me a link
                </Button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setEmailBannerDismissed(true)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Book search / autofill */}
          <div className="mb-6" ref={searchRef}>
            <label className="text-sm font-medium mb-1 block">
              Search for a book to autofill details
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a title, author, or ISBN..."
                className="pl-9 pr-9"
                data-testid="book-search-input"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {searchQuery && !isSearching && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setShowResults(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {showResults && searchResults.length > 0 && (
              <div
                className="absolute z-50 mt-1 w-full max-w-[calc(100%-2rem)] bg-card border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto"
                data-testid="search-results"
              >
                {searchResults.map((result, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full flex items-start gap-3 p-3 hover:bg-accent text-left border-b border-border last:border-0 transition-colors"
                    onClick={() => selectResult(result)}
                    data-testid={`search-result-${i}`}
                  >
                    {result.coverUrl ? (
                      <img
                        src={result.coverUrl}
                        alt={result.title}
                        className="w-10 h-14 object-cover rounded flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {result.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.author}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.year && `${result.year}`}
                        {result.publisher && ` · ${result.publisher}`}
                        {result.editionCount > 1 &&
                          ` · ${result.editionCount} editions`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showResults &&
              searchResults.length === 0 &&
              searchQuery.length >= 2 &&
              !isSearching && (
                <div className="absolute z-50 mt-1 w-full max-w-[calc(100%-2rem)] bg-card border border-border rounded-lg shadow-lg p-4 text-center text-sm text-muted-foreground">
                  No books found. You can still fill in the details manually
                  below.
                </div>
              )}
          </div>

          {/* Cover preview */}
          {form.coverUrl && (
            <div className="mb-5 flex items-start gap-4">
              <img
                src={form.coverUrl}
                alt="Cover preview"
                className="w-20 h-28 object-cover rounded shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {form.title || "Book cover preview"}
                </p>
                {form.author && <p>{form.author}</p>}
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-5"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Title *
                </label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Book title"
                  required
                  data-testid="book-title-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Author *
                </label>
                <Input
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  placeholder="Author name"
                  required
                  data-testid="book-author-input"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Cover Image URL
              </label>
              <Input
                value={form.coverUrl}
                onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
                placeholder="https://... (auto-filled from search)"
                data-testid="book-cover-input"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Description
              </label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Tell readers about this book..."
                rows={3}
                data-testid="book-description-input"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Condition *
                </label>
                <Select
                  value={form.condition}
                  onValueChange={(v) => setForm({ ...form, condition: v })}
                >
                  <SelectTrigger data-testid="book-condition-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conditions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">
                  Status *
                </label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger data-testid="book-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div>
                          <span>{s.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            — {s.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {showPrice && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {form.status === "for-sale"
                    ? "Price *"
                    : "Starting Price (optional)"}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="$0.00"
                  required={form.status === "for-sale"}
                  data-testid="book-price-input"
                />
              </div>
            )}

            {/* Genres */}
            <div>
              <label className="text-sm font-medium mb-2 block">Genres</label>
              <div
                className="flex flex-wrap gap-2"
                data-testid="genre-selector"
              >
                {genres.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    variant={form.genre.includes(g) ? "default" : "outline"}
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => toggleGenre(g)}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            </div>

            {/* --- Advanced Details --- */}
            <Accordion
              type="single"
              collapsible
              className="w-full pt-5 mt-2 border-t"
            >
              <AccordionItem value="advanced">
                <AccordionTrigger>
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4" />
                    Advanced & International Details
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Language
                      </label>
                      <Select
                        value={form.language}
                        onValueChange={(v) => setForm({ ...form, language: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Original Language
                      </label>
                      <Select
                        value={form.originalLanguage}
                        onValueChange={(v) =>
                          setForm({ ...form, originalLanguage: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="If translated" />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Country of Origin
                      </label>
                      <Select
                        value={form.countryOfOrigin}
                        onValueChange={(v) =>
                          setForm({ ...form, countryOfOrigin: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Where was it written/published" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Historical Nations
                          </div>
                          {countries["Historical Nations"].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">
                            Current Nations
                          </div>
                          {countries["Current Nations"].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Printed In
                      </label>
                      <Select
                        value={form.printCountry}
                        onValueChange={(v) =>
                          setForm({ ...form, printCountry: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Where this copy was printed" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Historical Nations
                          </div>
                          {countries["Historical Nations"].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">
                            Current Nations
                          </div>
                          {countries["Current Nations"].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Era
                      </label>
                      <Select
                        value={form.era}
                        onValueChange={(v) => setForm({ ...form, era: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Time period" />
                        </SelectTrigger>
                        <SelectContent>
                          {eras.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Script
                      </label>
                      <Select
                        value={form.script}
                        onValueChange={(v) => setForm({ ...form, script: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Writing system" />
                        </SelectTrigger>
                        <SelectContent>
                          {scripts.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Calendar System
                      </label>
                      <Select
                        value={form.calendarSystem}
                        onValueChange={(v) =>
                          setForm({ ...form, calendarSystem: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Gregorian (default)" />
                        </SelectTrigger>
                        <SelectContent>
                          {calendarSystems.map((cal) => (
                            <SelectItem key={cal.value} value={cal.value}>
                              <div>
                                <span>{cal.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  — {cal.description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {form.calendarSystem &&
                      form.calendarSystem !== "gregorian" && (
                        <div className="animate-in fade-in duration-300">
                          <label className="text-sm font-medium mb-1 block">
                            Year in{" "}
                            {calendarSystems.find(
                              (c) => c.value === form.calendarSystem,
                            )?.label || "Calendar"}
                          </label>
                          <Input
                            value={form.calendarYear}
                            onChange={(e) =>
                              setForm({ ...form, calendarYear: e.target.value })
                            }
                            placeholder="e.g. 1444 AH, 5784, 2567 BE"
                          />
                        </div>
                      )}
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Text Direction
                    </label>
                    <Select
                      value={form.textDirection}
                      onValueChange={(v) =>
                        setForm({ ...form, textDirection: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Left-to-Right (default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ltr">
                          Left-to-Right (e.g. English)
                        </SelectItem>
                        <SelectItem value="rtl">
                          Right-to-Left (e.g. Arabic, Hebrew)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">ISBN</label>
                <Input
                  value={form.isbn}
                  onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                  placeholder="978-..."
                  data-testid="book-isbn-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Publisher
                </label>
                <Input
                  value={form.publisher}
                  onChange={(e) =>
                    setForm({ ...form, publisher: e.target.value })
                  }
                  placeholder="Publisher"
                  data-testid="book-publisher-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Edition
                </label>
                <Input
                  value={form.edition}
                  onChange={(e) =>
                    setForm({ ...form, edition: e.target.value })
                  }
                  placeholder="1st, 2nd..."
                  data-testid="book-edition-input"
                />
              </div>
            </div>

            <div className="w-32">
              <label className="text-sm font-medium mb-1 block">Year</label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="2024"
                data-testid="book-year-input"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="submit-book"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {editBookId ? "Save Changes" : "List Book"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
