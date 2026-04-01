import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const conditions = [
  { value: "new", label: "New" },
  { value: "like-new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

const statuses = [
  { value: "for-sale", label: "For Sale", description: "List with a fixed price" },
  { value: "open-to-offers", label: "Open to Offers", description: "Let buyers make offers" },
  { value: "not-for-sale", label: "Not For Sale", description: "Show in your collection" },
  { value: "reading", label: "Currently Reading", description: "Show what you're reading" },
  { value: "wishlist", label: "Wishlist", description: "Books you want to find" },
];

const genres = ["Fiction", "Non-Fiction", "Textbooks", "Sci-Fi", "Mystery", "Biography", "Poetry", "Philosophy", "History", "Rare", "Fantasy", "Romance", "Thriller", "Horror", "Self-Help"];

export default function AddBook() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/books", {
        title: form.title,
        author: form.author,
        isbn: form.isbn || null,
        coverUrl: form.coverUrl || null,
        description: form.description || null,
        condition: form.condition,
        status: form.status,
        price: form.price ? parseFloat(form.price) : null,
        genre: form.genre.length > 0 ? JSON.stringify(form.genre) : null,
        publisher: form.publisher || null,
        edition: form.edition || null,
        year: form.year ? parseInt(form.year) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/books/user/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      toast({ title: "Book listed!" });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return <Redirect to="/login" />;

  const toggleGenre = (g: string) => {
    setForm((prev) => ({
      ...prev,
      genre: prev.genre.includes(g) ? prev.genre.filter((x) => x !== g) : [...prev.genre, g],
    }));
  };

  const showPrice = form.status === "for-sale" || form.status === "open-to-offers";

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8" data-testid="add-book-page">
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Add a Book</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-5"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Book title"
                  required
                  data-testid="book-title-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Author *</label>
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
              <label className="text-sm font-medium mb-1 block">Cover Image URL</label>
              <Input
                value={form.coverUrl}
                onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
                placeholder="https://..."
                data-testid="book-cover-input"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Tell readers about this book..."
                rows={3}
                data-testid="book-description-input"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Condition *</label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                  <SelectTrigger data-testid="book-condition-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conditions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Status *</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="book-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div>
                          <span>{s.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">— {s.description}</span>
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
                  {form.status === "for-sale" ? "Price *" : "Starting Price (optional)"}
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
              <div className="flex flex-wrap gap-2" data-testid="genre-selector">
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
                <label className="text-sm font-medium mb-1 block">Publisher</label>
                <Input
                  value={form.publisher}
                  onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                  placeholder="Publisher"
                  data-testid="book-publisher-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Edition</label>
                <Input
                  value={form.edition}
                  onChange={(e) => setForm({ ...form, edition: e.target.value })}
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
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              List Book
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
