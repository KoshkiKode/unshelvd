import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BookCard from "@/components/book-card";
import {
  BookOpen,
  Globe,
  Languages,
  Calendar,
  ArrowLeft,
  Users,
  BookCopy,
  ExternalLink,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTextDirection, isCJK } from "@/lib/constants";
import type { Work, Book, CatalogEntry } from "@shared/schema";
import AffiliateLinks from "@/components/affiliate-links";
import ExternalAnchor from "@/components/external-link";

interface WorkResponse {
  work: Work;
  catalogEditions: Record<string, CatalogEntry[]>;
  userListings: Record<string, Book[]>;
  languages: string[];
  totalEditions: number;
  totalListings: number;
}

export default function WorkPage() {
  const [, params] = useRoute("/work/:id");
  const workId = params?.id ? parseInt(params.id) : null;

  const { data, isLoading, error } = useQuery<WorkResponse>({
    queryKey: ["/api/works", workId],
    enabled: !!workId,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-40 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="font-serif text-xl mb-2">Work not found</h2>
        <Link href="/browse">
          <Button variant="outline">Browse Books</Button>
        </Link>
      </div>
    );
  }

  const {
    work,
    catalogEditions,
    userListings,
    languages,
    totalEditions,
    totalListings,
  } = data;
  const allListings = Object.values(userListings).flat();
  const dir = getTextDirection(work.originalLanguage);

  return (
    <div
      className="container mx-auto max-w-5xl px-4 py-8"
      data-testid="work-page"
    >
      <Link href="/browse">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Browse
        </Button>
      </Link>

      {/* Work header */}
      <div className="flex gap-6 mb-8">
        {work.coverUrl && (
          <img
            src={work.coverUrl}
            alt={work.title}
            className="w-32 h-48 object-cover rounded-lg shadow-md flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h1
            className="font-serif text-2xl font-bold mb-1"
            data-testid="work-title"
          >
            {work.title}
          </h1>
          {work.titleOriginalScript &&
            work.titleOriginalScript !== work.title && (
              <p
                className={`text-lg text-muted-foreground mb-1 ${isCJK(work.titleOriginalScript) ? "font-cjk" : ""}`}
                dir={dir}
                data-testid="work-title-original"
              >
                {work.titleOriginalScript}
              </p>
            )}
          <p className="text-muted-foreground mb-3" data-testid="work-author">
            by {work.author}
            {work.authorOriginalScript &&
              work.authorOriginalScript !== work.author && (
                <span className="ml-2 text-sm" dir={dir}>
                  ({work.authorOriginalScript})
                </span>
              )}
          </p>

          {/* Stats badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {work.firstPublishedYear && (
              <Badge variant="outline" className="gap-1">
                <Calendar className="h-3 w-3" />
                First published {work.firstPublishedYear}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <BookCopy className="h-3 w-3" />
              {work.editionCount || totalEditions} editions
            </Badge>
            {(work.languageCount || languages.length) > 1 && (
              <Badge variant="outline" className="gap-1">
                <Languages className="h-3 w-3" />
                {work.languageCount || languages.length} languages
              </Badge>
            )}
            {totalListings > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {totalListings} for sale
              </Badge>
            )}
            {work.originalLanguage && (
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                Original: {work.originalLanguage}
              </Badge>
            )}
          </div>

          {/* Genre badges */}
          {work.genre && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {work.genre.split(",").map((g) => g.trim()).filter(Boolean).map((g) => (
                <Link key={g} href={`/browse?genre=${encodeURIComponent(g)}`}>
                  <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                    <Tag className="h-3 w-3" />
                    {g}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          {work.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {work.description}
            </p>
          )}

          <AffiliateLinks
            title={work.title}
            author={work.author}
            isbn={
              // Use the best ISBN from English catalog editions first, then any edition
              Object.values(catalogEditions)
                .flat()
                .find((e) => e.language === "English" && (e.isbn13 || e.isbn10))
                ?.isbn13 ||
              Object.values(catalogEditions)
                .flat()
                .find((e) => e.isbn13 || e.isbn10)?.isbn13 ||
              Object.values(catalogEditions)
                .flat()
                .find((e) => e.isbn10)?.isbn10 ||
              null
            }
            language={work.originalLanguage}
            className="mt-3"
          />
        </div>
      </div>

      {/* Tabs: For Sale listings, then editions by language */}
      <Tabs defaultValue="listings">
        <TabsList className="mb-4">
          <TabsTrigger value="listings">For Sale ({totalListings})</TabsTrigger>
          {languages.sort().map((lang) => (
            <TabsTrigger key={lang} value={`lang-${lang}`}>
              {lang} (
              {(catalogEditions[lang]?.length || 0) +
                (userListings[lang]?.length || 0)}
              )
            </TabsTrigger>
          ))}
        </TabsList>

        {/* For Sale tab */}
        <TabsContent value="listings">
          {allListings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No copies currently for sale.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Be the first to list a copy of this work.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allListings.map((listing) => (
                <BookCard key={listing.id} book={listing} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Language tabs */}
        {languages.sort().map((lang) => {
          const catEditions = catalogEditions[lang] || [];
          const langListings = userListings[lang] || [];

          return (
            <TabsContent key={lang} value={`lang-${lang}`}>
              {/* User listings in this language */}
              {langListings.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-medium text-sm mb-3 text-muted-foreground">
                    Copies for sale in {lang}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {langListings.map((listing) => (
                      <BookCard key={listing.id} book={listing} />
                    ))}
                  </div>
                </div>
              )}

              {/* Catalog editions in this language */}
              {catEditions.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-3 text-muted-foreground">
                    Known editions in {lang} ({catEditions.length})
                  </h3>
                  <div className="space-y-2">
                    {catEditions.map((ed) => (
                      <Card key={ed.id} className="overflow-hidden">
                        <CardContent className="p-3 flex items-center gap-3">
                          {ed.coverUrl ? (
                            <img
                              src={ed.coverUrl}
                              alt={ed.title}
                              className="w-10 h-14 object-cover rounded flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
                              <BookOpen className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-medium text-sm truncate ${isCJK(ed.titleNative || ed.title) ? "font-cjk" : ""}`}
                              dir={getTextDirection(ed.language)}
                            >
                              {ed.titleNative || ed.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ed.publisher && `${ed.publisher}`}
                              {ed.publicationYear && ` · ${ed.publicationYear}`}
                              {ed.isbn13 && ` · ISBN ${ed.isbn13}`}
                              {ed.script && ` · ${ed.script}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/add-book?title=${encodeURIComponent(ed.title)}&author=${encodeURIComponent(ed.author)}&isbn=${ed.isbn13 || ed.isbn10 || ""}&year=${ed.publicationYear || ""}&publisher=${encodeURIComponent(ed.publisher || "")}&coverUrl=${encodeURIComponent(ed.coverUrl || "")}`}
                            >
                              <Button variant="outline" size="sm">
                                Sell This Edition
                              </Button>
                            </Link>
                            {/* Per-edition ThriftBooks link when we have an ISBN */}
                            {(ed.isbn13 || ed.isbn10) && (
                              <ExternalAnchor
                                href={`https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent((ed.isbn13 || ed.isbn10)!.replace(/[^0-9X]/gi, ""))}${import.meta.env?.VITE_THRIFTBOOKS_AFF_ID ? `&ref=${import.meta.env.VITE_THRIFTBOOKS_AFF_ID}` : ""}`}
                                rel="noopener noreferrer sponsored"
                                className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                                title="Search on ThriftBooks"
                              >
                                TB <ExternalLink className="h-2.5 w-2.5" />
                              </ExternalAnchor>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {catEditions.length === 0 && langListings.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  No editions found in {lang}.
                </p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
