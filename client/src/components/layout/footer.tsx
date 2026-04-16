import { Link } from "wouter";
import { BookOpen } from "lucide-react";
import ExternalLink from "@/components/external-link";

export default function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span className="font-serif font-semibold text-foreground">Unshelv'd</span>
            <span>— where every book finds its next reader.</span>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/browse" className="hover:text-foreground transition-colors">
              Browse
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </nav>

          {/* Copyright + attribution */}
          <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} KoshkiKode LLC. MIT License.</p>
            <p>Version {__APP_VERSION__}</p>
            <p>
              Book covers &amp; metadata courtesy of{" "}
              <ExternalLink
                href="https://openlibrary.org"
                className="underline hover:text-foreground transition-colors"
              >
                Open Library
              </ExternalLink>
              .
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
