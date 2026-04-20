import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { API_BASE } from "@/lib/api-base";
import { useSearch, Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import ReportDialog from "@/components/report-dialog";
import BlockDialog from "@/components/block-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Send,
  User as UserIcon,
  ArrowLeft,
  MoreVertical,
  Flag,
  Trash2,
  ShieldOff,
  Info,
  ShieldAlert,
} from "lucide-react";
import type { Message } from "@shared/schema";

interface ConvUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface ConvBook {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
}

interface Conversation {
  id: number;
  bookId: number;
  buyerId: number;
  sellerId: number;
  status: string;
  initiatedAt: string;
  closedAt: string | null;
  otherUser: ConvUser | null;
  book: ConvBook | null;
  lastMessage: Message | null;
  unreadCount: number;
}

const SAFETY_TIP = "🔒 Safety tip: Never share payment details outside the app.";

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchStr = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(searchStr);
  const initialConvId = params.get("conversation");

  const [selectedConvId, setSelectedConvId] = useState<number | null>(
    initialConvId ? parseInt(initialConvId) : null,
  );
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Report / block dialogs
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<number | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const selectedConv = conversations?.find(c => c.id === selectedConvId) ?? null;

  const { data: threadMessages, isLoading: threadLoading } = useQuery<Message[]>({
    queryKey: [`/api/conversations/${selectedConvId}/messages`],
    enabled: !!user && !!selectedConvId,
    refetchInterval: wsConnected ? false : 5000,
  });

  // ── WebSocket subscription ────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!user || !selectedConvId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = API_BASE ? new URL(API_BASE).host : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", conversationId: selectedConvId }));
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.type === "message" && frame.conversationId === selectedConvId) {
          queryClient.setQueryData<Message[]>(
            [`/api/conversations/${selectedConvId}/messages`],
            (old) => {
              if (!old) return [frame.message];
              if (old.some(m => m.id === frame.message.id)) return old;
              return [...old, frame.message];
            },
          );
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        } else if (frame.type === "message_deleted" && frame.conversationId === selectedConvId) {
          queryClient.setQueryData<Message[]>(
            [`/api/conversations/${selectedConvId}/messages`],
            (old) => old?.map(m => m.id === frame.messageId ? { ...m, deletedBySender: true } : m),
          );
        } else if (frame.type === "status") {
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          queryClient.invalidateQueries({ queryKey: [`/api/conversations/${frame.conversationId}`] });
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setWsConnected(false);
    };
  }, [user, selectedConvId, queryClient]);

  useEffect(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsConnected(false);
    if (selectedConvId) connectWs();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [selectedConvId, connectWs]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/conversations/${selectedConvId}/messages`, {
        content: messageText.trim(),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConvId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (data.isFirst) {
        toast({ title: "💬 Conversation started", description: SAFETY_TIP });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Soft-delete message ───────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (msgId: number) => {
      await apiRequest("DELETE", `/api/conversations/${selectedConvId}/messages/${msgId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConvId}/messages`] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return <Redirect to="/login" />;

  const isBlocked = selectedConv?.status === "blocked";
  const isClosed = selectedConv && selectedConv.status !== "active";
  const otherUser = selectedConv?.otherUser ?? null;

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
                  key={conv.id}
                  className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                    selectedConvId === conv.id ? "bg-muted" : ""
                  }`}
                  onClick={() => {
                    setSelectedConvId(conv.id);
                    setLocation(`/dashboard/messages?conversation=${conv.id}`);
                  }}
                  data-testid={`conversation-${conv.id}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {conv.otherUser?.avatarUrl ? (
                        <img src={conv.otherUser.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <UserIcon className="h-4 w-4 text-primary/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-medium truncate">{conv.otherUser?.displayName ?? "User"}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {conv.status === "blocked" && (
                            <ShieldAlert className="h-3 w-3 text-destructive" />
                          )}
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      {conv.book && (
                        <p className="text-[10px] text-muted-foreground truncate">{conv.book.title}</p>
                      )}
                      {conv.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.lastMessage.deletedBySender ? "[deleted]" : conv.lastMessage.content}
                        </p>
                      )}
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
          {selectedConvId && selectedConv ? (
            <>
              {/* Header */}
              <div className="p-3 border-b flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-8 w-8"
                  onClick={() => setSelectedConvId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{otherUser?.displayName ?? "User"}</p>
                  {selectedConv.book && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      Re: {selectedConv.book.title}
                    </p>
                  )}
                </div>
                {otherUser && !isBlocked && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setReportMessageId(null);
                          setReportDialogOpen(true);
                        }}
                      >
                        <Flag className="h-4 w-4 mr-2" /> Report conversation
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setBlockDialogOpen(true)}
                      >
                        <ShieldOff className="h-4 w-4 mr-2" /> Block {otherUser.displayName}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Blocked / closed banner */}
              {isClosed && (
                <div className="px-4 py-2 bg-muted/50 border-b text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  This conversation is unavailable.
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[380px]">
                {threadLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-3/4" />
                    ))}
                  </div>
                ) : threadMessages && threadMessages.length > 0 ? (
                  threadMessages.map((msg) => {
                    const isMine = msg.senderId === user.id;
                    const isDeleted = msg.deletedBySender;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? "justify-end" : "justify-start"} group`}
                      >
                        <div className="relative max-w-[70%]">
                          <div
                            className={`rounded-lg px-3 py-2 text-sm ${
                              isDeleted
                                ? "italic text-muted-foreground bg-muted"
                                : isMine
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                            data-testid={`message-${msg.id}`}
                          >
                            {isDeleted ? "[Message deleted]" : msg.content}
                          </div>
                          {/* Message context menu */}
                          {!isDeleted && (
                            <div
                              className={`absolute top-0 ${isMine ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"} opacity-0 group-hover:opacity-100 transition-opacity flex`}
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <MoreVertical className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align={isMine ? "end" : "start"}>
                                  {!isMine && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setReportMessageId(msg.id);
                                        setReportDialogOpen(true);
                                      }}
                                    >
                                      <Flag className="h-3.5 w-3.5 mr-2" /> Report message
                                    </DropdownMenuItem>
                                  )}
                                  {isMine && (
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => deleteMutation.mutate(msg.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete for me
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Start the conversation</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {!isClosed && (
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
                      maxLength={5000}
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
              )}
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

      {/* Dialogs */}
      {otherUser && selectedConv && (
        <>
          <ReportDialog
            open={reportDialogOpen}
            onOpenChange={setReportDialogOpen}
            reportedUserId={otherUser.id}
            messageId={reportMessageId}
            conversationId={selectedConv.id}
          />
          <BlockDialog
            open={blockDialogOpen}
            onOpenChange={setBlockDialogOpen}
            userId={otherUser.id}
            displayName={otherUser.displayName}
            onBlocked={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
            }}
          />
        </>
      )}
    </div>
  );
}
