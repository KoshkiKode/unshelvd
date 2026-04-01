import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import type { Book } from "@shared/schema";

const conditionColors: Record<string, string> = {
  new: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "like-new": "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300",
  good: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  fair: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  poor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

interface BookCardProps {
  book: Book;
  size?: "small" | "medium" | "large";
}

export default function BookCard({ book, size = "medium" }: BookCardProps) {
  const heightClass = size === "large" ? "h-72" : size === "small" ? "h-40" : "h-52";

  return (
    <Link href={`/book/${book.id}`}>
      <article
        className="group cursor-pointer rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
        data-testid={`book-card-${book.id}`}
      >
        {/* Cover */}
        <div className={`${heightClass} bg-muted relative overflow-hidden`}>
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <BookOpen className="h-10 w-10 text-primary/30" />
            </div>
          )}
          {/* Condition badge */}
          <div className="absolute top-2 right-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${conditionColors[book.condition] || ""}`}>
              {book.condition}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="font-serif font-medium text-sm leading-tight line-clamp-2 mb-0.5" data-testid="book-title">
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{book.author}</p>
          <div className="flex items-center justify-between">
            {book.status === "for-sale" && book.price != null ? (
              <span className="font-semibold text-sm text-primary" data-testid="book-price">${book.price.toFixed(2)}</span>
            ) : book.status === "open-to-offers" ? (
              <Badge variant="outline" className="text-[10px]">Open to Offers</Badge>
            ) : (
              <span className="text-xs text-muted-foreground capitalize">{book.status.replace("-", " ")}</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
