import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, MapPin, Star, MessageSquare, DollarSign, User, ArrowLeft, Globe, Languages, BookType, BookCopy, CreditCard, ShoppingCart } from "lucide-react";
import { useState } from "react";
import type { Book, Work } from "@shared/schema";
import BookCard from "@/components/book-card";
import CheckoutDialog from "@/components/checkout-dialog";
import AdBanner from "@/components/ad-banner";
import AffiliateLinks from "@/components/affiliate-links";

const conditionLabels: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  "like-new": { label: "Like New", color: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" },
  good: { label: "Good", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  fair: { label: "Fair", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  poor: { label: "Poor", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const { data: book, isLoading } = useQuery<Book & { seller: any }>({
    queryKey: [`/api/books/${id}`],
  });

  const offerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/offers", {
        bookId: parseInt(id!),
        amount: parseFloat(offerAmount),
        message: offerMessage || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Offer sent!" });
      setOfferOpen(false);
      setOfferAmount("");
      setOfferMessage("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/messages", {
        receiverId: book!.seller.id,
        bookId: parseInt(id!),
        content: messageContent,
      });
    },
    onSuccess: () => {
      toast({ title: "Message sent!" });
      setMessageOpen(false);
      setMessageContent("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="h-96 rounded-lg" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-20" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-20 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h2 className="font-serif text-xl font-medium">Book not found</h2>
      </div>
    );
  }

  const cond = conditionLabels[book.condition] || { label: book.condition, color: "" };
  // Handle both JSON array and comma-separated genre strings
  let genres: string[] = [];
  if (book.genre) {
    try { genres = JSON.parse(book.genre); } catch { genres = book.genre.split(",").map(g => g.trim()); }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8" data-testid="book-detail-page">
      <Link href="/browse">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Browse
        </Button>
      </Link>

      <div className="grid md:grid-cols-[1fr_1.2fr] gap-8">
        {/* Cover */}
        <div className="rounded-lg overflow-hidden bg-muted aspect-[3/4] max-h-[500px]">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <BookOpen className="h-20 w-20 text-primary/20" />
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-3 ${cond.color}`} data-testid="condition-badge">
            {cond.label}
          </span>

          <h1 className="font-serif text-3xl font-bold mb-1" data-testid="book-title">{book.title}</h1>
          <p className="text-lg text-muted-foreground mb-4" data-testid="book-author">by {book.author}</p>

          {/* Price / Status */}
          <div className="mb-6">
            {book.status === "for-sale" && book.price != null ? (
              <div className="text-3xl font-bold text-primary" data-testid="book-price">${book.price.toFixed(2)}</div>
            ) : book.status === "open-to-offers" ? (
              <Badge className="text-sm px-3 py-1">Open to Offers</Badge>
            ) : (
              <Badge variant="secondary" className="text-sm px-3 py-1 capitalize">{book.status.replace(/-/g, " ")}</Badge>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm mb-6">
            {book.publisher && (
              <>
                <span className="text-muted-foreground">Publisher</span>
                <span>{book.publisher}</span>
              </>
            )}
            {book.edition && (
              <>
                <span className="text-muted-foreground">Edition</span>
                <span>{book.edition}</span>
              </>
            )}
            {book.year && (
              <>
                <span className="text-muted-foreground">Year</span>
                <span>{book.year}</span>
              </>
            )}
            {book.isbn && (
              <>
                <span className="text-muted-foreground">ISBN</span>
                <span className="font-mono text-xs">{book.isbn}</span>
              </>
            )}
          </div>

          {/* International metadata */}
          {(book.language || book.countryOfOrigin || book.era || book.script) && (
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm mb-6 border-t pt-4">
              {book.language && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5"><Languages className="h-3 w-3" /> Language</span>
                  <span>{book.language}{book.originalLanguage && book.originalLanguage !== book.language ? ` (translated from ${book.originalLanguage})` : ""}</span>
                </>
              )}
              {book.countryOfOrigin && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5"><Globe className="h-3 w-3" /> Origin</span>
                  <span>{book.countryOfOrigin}</span>
                </>
              )}
              {book.printCountry && book.printCountry !== book.countryOfOrigin && (
                <>
                  <span className="text-muted-foreground">Printed In</span>
                  <span>{book.printCountry}</span>
                </>
              )}
              {book.era && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5"><BookType className="h-3 w-3" /> Era</span>
                  <span>{book.era}</span>
                </>
              )}
              {book.script && (
                <>
                  <span className="text-muted-foreground">Script</span>
                  <span>{book.script}</span>
                </>
              )}
            </div>
          )}

          {/* Genres */}
          {genres.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-6">
              {genres.map((g: string) => (
                <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
              ))}
            </div>
          )}

          {/* Description */}
          {book.description && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-1">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{book.description}</p>
            </div>
          )}

          {/* Action buttons */}
          {user && book.seller && user.id !== book.seller.id && (
            <div className="flex gap-2 flex-wrap mb-8">
              {/* Buy Now button for for-sale books */}
              {book.status === "for-sale" && book.price != null && (
                <Button onClick={() => setCheckoutOpen(true)} className="gap-1.5" data-testid="buy-now-btn">
                  <ShoppingCart className="h-4 w-4" />
                  Buy Now — ${book.price.toFixed(2)}
                </Button>
              )}
              {(book.status === "open-to-offers" || book.status === "for-sale") && (
                <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="make-offer-btn">
                      <DollarSign className="h-4 w-4 mr-1.5" />
                      Make an Offer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-serif">Make an Offer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Your offer amount</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="$0.00"
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)}
                          data-testid="offer-amount"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Message (optional)</label>
                        <Textarea
                          placeholder="Tell the seller why you'd like this book..."
                          value={offerMessage}
                          onChange={(e) => setOfferMessage(e.target.value)}
                          data-testid="offer-message"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => offerMutation.mutate()}
                        disabled={!offerAmount || offerMutation.isPending}
                        data-testid="submit-offer"
                      >
                        {offerMutation.isPending ? "Sending..." : "Send Offer"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="message-seller-btn">
                    <MessageSquare className="h-4 w-4 mr-1.5" />
                    Message Seller
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-serif">Message Seller</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <Textarea
                      placeholder={`Ask ${book.seller.displayName} about "${book.title}"...`}
                      value={messageContent}
                      onChange={(e) => setMessageContent(e.target.value)}
                      rows={4}
                      data-testid="message-content"
                    />
                    <Button
                      className="w-full"
                      onClick={() => messageMutation.mutate()}
                      disabled={!messageContent || messageMutation.isPending}
                      data-testid="send-message"
                    >
                      {messageMutation.isPending ? "Sending..." : "Send Message"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Seller card */}
          {book.seller && (
            <Link href={`/user/${book.seller.id}`}>
              <div className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow cursor-pointer" data-testid="seller-card">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {book.seller.avatarUrl ? (
                      <img src={book.seller.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-primary/50" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{book.seller.displayName}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {book.seller.rating > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          {book.seller.rating.toFixed(1)}
                        </span>
                      )}
                      {book.seller.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {book.seller.location}
                        </span>
                      )}
                      {book.seller.totalSales > 0 && (
                        <span>{book.seller.totalSales} sales</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Other editions of this work */}
          {book.workId && <OtherEditions workId={book.workId} currentBookId={book.id} />}

          {/* Also find on ThriftBooks / AbeBooks / Open Library */}
          <div className="mt-6 p-4 border rounded-lg bg-muted/30">
            <AffiliateLinks title={book.title} author={book.author} isbn={book.isbn} />
          </div>

          {/* Subtle ad slot */}
          <div className="mt-6 flex justify-center">
            <AdBanner size="leaderboard" />
          </div>
        </div>
      </div>

      {/* Checkout dialog */}
      {book.price != null && (
        <CheckoutDialog book={book} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
      )}
    </div>
  );
}

function OtherEditions({ workId, currentBookId }: { workId: number; currentBookId: number }) {
  const { data } = useQuery<{ work: Work; userListings: Record<string, Book[]>; totalListings: number }>({
    queryKey: ["/api/works", workId],
  });

  if (!data) return null;

  const allListings = Object.values(data.userListings)
    .flat()
    .filter((b) => b.id !== currentBookId);

  if (allListings.length === 0 && !data.work) return null;

  return (
    <div className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookCopy className="h-4 w-4 text-primary" />
          <h3 className="font-serif font-medium">Other Editions & Translations</h3>
        </div>
        <Link href={`/work/${workId}`}>
          <Button variant="ghost" size="sm" className="text-xs">
            View all {data.work.editionCount || 0} editions →
          </Button>
        </Link>
      </div>

      {data.work.description && (
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{data.work.description}</p>
      )}

      {allListings.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {allListings.slice(0, 4).map((listing) => (
            <BookCard key={listing.id} book={listing} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No other copies currently for sale.
          <Link href={`/work/${workId}`}>
            <span className="text-primary ml-1 cursor-pointer">See all known editions →</span>
          </Link>
        </p>
      )}
    </div>
  );
}
