import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useSearch, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, User as UserIcon, ArrowLeft } from "lucide-react";
import type { Message, User } from "@shared/schema";

interface Conversation {
  otherUserId: number;
  lastMessage: Message;
  unreadCount: number;
  user: { id: number; username: string; displayName: string; avatarUrl: string | null };
}

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialUserId = params.get("user");

  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialUserId ? parseInt(initialUserId) : null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/messages"],
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: threadMessages, isLoading: threadLoading } = useQuery<Message[]>({
    queryKey: [`/api/messages/${selectedUserId}`],
    enabled: !!user && !!selectedUserId,
    refetchInterval: 3000,
  });

  const { data: selectedUserInfo } = useQuery<Omit<User, "password">>({
    queryKey: [`/api/users/${selectedUserId}`],
    enabled: !!selectedUserId,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/messages", {
        receiverId: selectedUserId!,
        content: messageText,
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${selectedUserId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  if (!user) return <Redirect to="/login" />;

  const selectedConv = conversations?.find((c) => c.otherUserId === selectedUserId);
  const displayName = selectedConv?.user?.displayName || selectedUserInfo?.displayName || "User";

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8" data-testid="messages-page">
      <h1 className="font-serif text-3xl font-bold mb-6">Messages</h1>

      <div className="grid md:grid-cols-[280px_1fr] gap-4 min-h-[500px]">
        {/* Conversation list */}
        <div className="border rounded-lg bg-card overflow-hidden" data-testid="conversations-list">
          <div className="p-3 border-b">
            <h2 className="text-sm font-medium text-muted-foreground">Conversations</h2>
          </div>
          <div className="overflow-y-auto max-h-[460px]">
            {convsLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : conversations && conversations.length > 0 ? (
              conversations.map((conv) => (
                <button
                  key={conv.otherUserId}
                  className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                    selectedUserId === conv.otherUserId ? "bg-muted" : ""
                  }`}
                  onClick={() => setSelectedUserId(conv.otherUserId)}
                  data-testid={`conversation-${conv.otherUserId}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {conv.user?.avatarUrl ? (
                        <img src={conv.user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <UserIcon className="h-4 w-4 text-primary/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">{conv.user?.displayName}</p>
                        {conv.unreadCount > 0 && (
                          <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{conv.lastMessage.content}</p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No conversations yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Message thread */}
        <div className="border rounded-lg bg-card flex flex-col overflow-hidden" data-testid="message-thread">
          {selectedUserId ? (
            <>
              <div className="p-3 border-b flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-8 w-8"
                  onClick={() => setSelectedUserId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <p className="font-medium text-sm">{displayName}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[380px]">
                {threadLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-3/4" />
                    ))}
                  </div>
                ) : threadMessages && threadMessages.length > 0 ? (
                  threadMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderId === user.id ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                          msg.senderId === user.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                        data-testid={`message-${msg.id}`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Start a conversation</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (messageText.trim()) sendMutation.mutate();
                  }}
                >
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1"
                    data-testid="message-input"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!messageText.trim() || sendMutation.isPending}
                    data-testid="send-message-btn"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
