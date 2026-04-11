import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import BookCard from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { User as UserIcon, MapPin, Star, Calendar, MessageSquare, BookOpen, ShoppingBag, Settings } from "lucide-react";
import type { Book, User } from "@shared/schema";

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();

  const { data: profileUser, isLoading: userLoading } = useQuery<Omit<User, "password">>({
    queryKey: [`/api/users/${id}`],
  });

  const { data: books, isLoading: booksLoading } = useQuery<Book[]>({
    queryKey: [`/api/books/user/${id}`],
  });

  const forSale = books?.filter((b) => b.status === "for-sale") || [];
  const openToOffers = books?.filter((b) => b.status === "open-to-offers") || [];
  const collection = books?.filter((b) => b.status === "not-for-sale") || [];
  const reading = books?.filter((b) => b.status === "reading") || [];
  const wishlist = books?.filter((b) => b.status === "wishlist") || [];

  if (userLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex gap-6 mb-8">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-20 text-center">
        <UserIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h2 className="font-serif text-xl font-medium">User not found</h2>
      </div>
    );
  }

  const joinDate = profileUser.createdAt ? new Date(profileUser.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8" data-testid="user-profile-page">
      {/* Profile header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          {profileUser.avatarUrl ? (
            <img src={profileUser.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <UserIcon className="h-10 w-10 text-primary/40" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="font-serif text-2xl font-bold" data-testid="user-display-name">{profileUser.displayName}</h1>
          <p className="text-sm text-muted-foreground mb-2">@{profileUser.username}</p>
          {profileUser.bio && <p className="text-sm text-muted-foreground mb-3">{profileUser.bio}</p>}

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {profileUser.rating != null && profileUser.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                {profileUser.rating.toFixed(1)} rating
              </span>
            )}
            {profileUser.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {profileUser.location}
              </span>
            )}
            {joinDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Joined {joinDate}
              </span>
            )}
            {(profileUser.totalSales ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <ShoppingBag className="h-3.5 w-3.5" />
                {profileUser.totalSales} sales
              </span>
            )}
          </div>
        </div>

        {currentUser && currentUser.id !== profileUser.id && (
          <Link href={`/dashboard/messages?user=${profileUser.id}`}>
            <Button variant="outline" size="sm">
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Message
            </Button>
          </Link>
        )}
        {currentUser && currentUser.id === parseInt(id!) && (
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm" data-testid="edit-profile-btn">
              <Settings className="h-4 w-4 mr-1.5" />
              Edit Profile
            </Button>
          </Link>
        )}
      </div>

      {/* Book tabs */}
      <Tabs defaultValue="for-sale" data-testid="shelf-tabs">
        <TabsList className="mb-6">
          <TabsTrigger value="for-sale" data-testid="tab-for-sale">For Sale ({forSale.length})</TabsTrigger>
          <TabsTrigger value="offers" data-testid="tab-offers">Open to Offers ({openToOffers.length})</TabsTrigger>
          <TabsTrigger value="collection" data-testid="tab-collection">Collection ({collection.length})</TabsTrigger>
          <TabsTrigger value="reading" data-testid="tab-reading">Reading ({reading.length})</TabsTrigger>
          <TabsTrigger value="wishlist" data-testid="tab-wishlist">Wishlist ({wishlist.length})</TabsTrigger>
        </TabsList>

        {[
          { value: "for-sale", items: forSale },
          { value: "offers", items: openToOffers },
          { value: "collection", items: collection },
          { value: "reading", items: reading },
          { value: "wishlist", items: wishlist },
        ].map(({ value, items }) => (
          <TabsContent key={value} value={value}>
            {booksLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-52 rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : items.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border rounded-lg bg-card">
                <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No books in this section yet
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
