import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, MessageSquare, User, DollarSign } from "lucide-react";
import { useState } from "react";
import type { BookRequest } from "@shared/schema";

export default function Requests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", edition: "", description: "", maxPrice: "" });

  const { data: requests, isLoading } = useQuery<(BookRequest & { user: any })[]>({
    queryKey: ["/api/requests"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/requests", {
        title: form.title,
        author: form.author || null,
        edition: form.edition || null,
        description: form.description || null,
        maxPrice: form.maxPrice ? parseFloat(form.maxPrice) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({ title: "Request posted!" });
      setOpen(false);
      setForm({ title: "", author: "", edition: "", description: "", maxPrice: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8" data-testid="requests-page">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold mb-2">Book Requests</h1>
          <p className="text-muted-foreground">Community members looking for specific books</p>
        </div>
        {user && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="post-request-btn">
                <Plus className="h-4 w-4 mr-1.5" />
                Post a Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">Request a Book</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Book Title *</label>
                  <Input
                    placeholder="e.g., Blood Meridian"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    data-testid="request-title"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Author</label>
                  <Input
                    placeholder="e.g., Cormac McCarthy"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    data-testid="request-author"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Specific Edition</label>
                  <Input
                    placeholder="e.g., First Edition, 1985 hardcover"
                    value={form.edition}
                    onChange={(e) => setForm({ ...form, edition: e.target.value })}
                    data-testid="request-edition"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">What are you looking for?</label>
                  <Textarea
                    placeholder="Describe the condition, printing, or any specifics..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    data-testid="request-description"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Max Budget</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="$0.00"
                    value={form.maxPrice}
                    onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                    data-testid="request-max-price"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={!form.title || createMutation.isPending}
                  data-testid="submit-request"
                >
                  {createMutation.isPending ? "Posting..." : "Post Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Requests list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : requests && requests.length > 0 ? (
        <div className="space-y-3" data-testid="requests-list">
          {requests.map((req) => (
            <div
              key={req.id}
              className="border rounded-lg p-5 bg-card hover:shadow-md transition-shadow"
              data-testid={`request-card-${req.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-serif font-semibold">{req.title}</h3>
                    <Badge variant={req.status === "open" ? "default" : "secondary"} className="text-[10px]">
                      {req.status}
                    </Badge>
                  </div>
                  {req.author && <p className="text-sm text-muted-foreground mb-1">by {req.author}</p>}
                  {req.edition && <p className="text-xs text-muted-foreground mb-2">Edition: {req.edition}</p>}
                  {req.description && <p className="text-sm text-muted-foreground mb-3">{req.description}</p>}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {req.maxPrice && (
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <DollarSign className="h-3 w-3" />
                        Budget: ${req.maxPrice}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {req.user?.displayName || "Unknown"}
                    </span>
                  </div>
                </div>

                {user && req.userId !== user.id && req.status === "open" && (
                  <Link href={`/dashboard/messages?user=${req.userId}`}>
                    <Button variant="outline" size="sm" data-testid={`reply-request-${req.id}`}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      I Have This
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border rounded-lg bg-card">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-serif text-lg font-medium mb-1">No requests yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Be the first to request a book</p>
          {user && (
            <Button onClick={() => setOpen(true)}>Post a Request</Button>
          )}
        </div>
      )}
    </div>
  );
}
