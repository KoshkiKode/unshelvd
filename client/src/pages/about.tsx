import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Heart, TrendingDown, Globe, BookOpen, Shield, MessageSquare } from "lucide-react";

export default function About() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8" data-testid="about-page">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Button>
      </Link>

      {/* Hero */}
      <div className="mb-12">
        <h1 className="font-serif text-3xl font-bold mb-3">About Unshelv'd</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Unshelv'd is a one-person project built because the world's books deserve better
          than being forgotten on shelves or lost to time. Every language, every country,
          every era — if it was written, it belongs here.
        </p>
      </div>

      {/* Why this exists */}
      <section className="mb-12">
        <h2 className="font-serif text-xl font-medium mb-4">Why Unshelv'd Exists</h2>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Most book marketplaces are built for English-language bestsellers. If you're looking for
            an original Cyrillic printing of a Yugoslav novel, a first-edition Quran commentary,
            a Soviet-era science fiction paperback, or a pre-war Japanese literary journal — good luck.
            Those books exist. The people who want them exist. There's just nowhere for them to find each other.
          </p>
          <p>
            Unshelv'd is built from the ground up to handle every language, every script, every calendar
            system, and every country that has ever existed — including the ones that don't anymore.
            Yugoslavia, the USSR, the Ottoman Empire, Austria-Hungary — these places published millions
            of books. Those books are still out there, and the people who love them shouldn't have to
            dig through eBay to find them.
          </p>
          <p>
            This is also a community. You can show off your personal library, mark books as "open to
            offers," post requests for specific editions, and message other collectors directly. It's
            Depop for books — but for every book ever written, in every language, everywhere.
          </p>
        </div>
      </section>

      {/* Fee Transparency */}
      <section className="mb-12">
        <h2 className="font-serif text-xl font-medium mb-4 flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary" />
          Our Fee — And Why It's Going Down
        </h2>

        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Right now, Unshelv'd charges a <strong className="text-foreground">10% platform fee</strong> on
                each sale. I know that's not nothing, and I want to be upfront about why and where it's going.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                I'm one person building and running this entire platform — the app, the servers, the database
                of every book ever published, the payment processing, all of it. The 10% covers server costs,
                Stripe's processing fees (~3%), and keeps the lights on while I build this into something
                that can sustain itself.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                But here's the commitment: <strong className="text-foreground">the fee goes down as the community grows.</strong> More
                users means more transactions, which means I can spread the fixed costs thinner
                and pass those savings back to you.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Fee roadmap */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="font-serif text-xl font-bold text-primary">10%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Launch</p>
            <p className="text-[10px] text-muted-foreground">Now</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted border border-border">
            <p className="font-serif text-xl font-bold">9%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Phase 2</p>
            <p className="text-[10px] text-muted-foreground">1,000 users</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted border border-border">
            <p className="font-serif text-xl font-bold">7.5%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Phase 3</p>
            <p className="text-[10px] text-muted-foreground">10,000 users</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted border border-border">
            <p className="font-serif text-xl font-bold">5%</p>
            <p className="text-[10px] text-muted-foreground mt-1">Long-term</p>
            <p className="text-[10px] text-muted-foreground">Sustainable</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          Every person who buys or sells a book on Unshelv'd is directly making it possible for
          the fee to come down for everyone. Thank you for being part of this.
        </p>
      </section>

      {/* Thank you section */}
      <section className="mb-12">
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Heart className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium mb-2">A genuine thank you</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If you're reading this, you're one of the early people who believed a global book
                  marketplace was worth trying. Whether you've listed a $5 paperback or a $500
                  first edition, you're building something that didn't exist before — a place where
                  books from every corner of the world and every period of history can find their
                  next reader. That matters more than you know. Thank you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mb-12">
        <h2 className="font-serif text-xl font-medium mb-4">Frequently Asked Questions</h2>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="what-is">
            <AccordionTrigger>What is Unshelv'd?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              A peer-to-peer book marketplace — like Depop, but for books. Buy, sell, trade,
              and discover books from fellow readers worldwide. We support every language,
              every script, and books from countries that no longer exist.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="fee">
            <AccordionTrigger>What does Unshelv'd charge?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Currently 10% of each sale. This covers server infrastructure, payment processing
              (Stripe takes ~3%), and development. The fee is on a public roadmap to decrease
              to 5% as the community grows. Listing books, browsing, messaging, and making
              offers are all free.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="payment">
            <AccordionTrigger>How do payments work?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              <p className="mb-2">Payments use an escrow system for buyer protection:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Buyer pays through the app (Stripe processes the payment)</li>
                <li>Funds are held securely — the seller doesn't get paid yet</li>
                <li>Seller ships the book and adds tracking information</li>
                <li>Buyer confirms they received the book</li>
                <li>Funds are released to the seller (minus the platform fee)</li>
              </ol>
              <p className="mt-2">
                If something goes wrong (wrong book, damaged, never arrived), the buyer
                can open a dispute before confirming delivery.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="languages">
            <AccordionTrigger>What languages and countries are supported?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              All of them. Over 150 languages, 200+ countries (including historical nations
              like Yugoslavia, the USSR, the Ottoman Empire, and Austria-Hungary), 30+ writing
              systems, and 17 calendar systems. If a book was published anywhere in the world
              at any point in history, it belongs on Unshelv'd.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="editions">
            <AccordionTrigger>How does the edition matching work?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              When you list a book, our engine automatically connects it to every other edition,
              translation, and printing of the same work. So if you list a Russian first edition
              of "The Master and Margarita," it links to the English Penguin Classics translation,
              the French edition, the Japanese translation — everything. Buyers browsing any
              version can see all available copies across all languages.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="requests">
            <AccordionTrigger>What are book requests?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              If you're looking for a specific book, edition, or translation that isn't currently
              listed, you can post a request. Other users can browse requests and message you
              if they have what you're looking for. Great for rare books, specific printings,
              or books in less common languages.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ads">
            <AccordionTrigger>Are there ads?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Small, non-intrusive ads at the bottom of some pages. Never popups, never
              interstitials, never covering content. Ads are a minor subsidy to help cover
              infrastructure costs — the primary revenue model is the platform fee on sales.
              As the platform grows and the fee decreases, ads help bridge the gap.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="who">
            <AccordionTrigger>Who's behind Unshelv'd?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              One person. I built this because I believe the world's books deserve a better
              marketplace than what exists. If you have feedback, ideas, or just want to say
              hi, message me through the app.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Platform stats */}
      <section className="mb-8">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-4 rounded-lg bg-muted/50">
            <Globe className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="font-serif text-lg font-bold">150+</p>
            <p className="text-xs text-muted-foreground">Languages</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <BookOpen className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="font-serif text-lg font-bold">40M+</p>
            <p className="text-xs text-muted-foreground">Books cataloged</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <Shield className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="font-serif text-lg font-bold">100%</p>
            <p className="text-xs text-muted-foreground">Buyer protection</p>
          </div>
        </div>
      </section>
    </div>
  );
}
