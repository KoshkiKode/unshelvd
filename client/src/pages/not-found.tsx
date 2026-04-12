import { Link } from "wouter";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <h1 className="font-serif text-3xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-6">
          We couldn't find what you were looking for. It may have been moved or deleted.
        </p>
        <Link href="/">
          <Button>Go to Home</Button>
        </Link>
      </div>
    </div>
  );
}
