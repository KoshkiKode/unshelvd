/**
 * Unshelv'd — Real-time Chat via WebSocket
 *
 * Provides a WebSocket relay for conversation messages.
 * Each WS connection authenticates via the existing session cookie and
 * subscribes to one or more conversation channels.
 *
 * Protocol (JSON frames):
 *   Client → Server
 *     { type: "subscribe",   conversationId: number }
 *     { type: "unsubscribe", conversationId: number }
 *     { type: "ping" }
 *
 *   Server → Client
 *     { type: "message",  conversationId: number, message: <Message row> }
 *     { type: "status",   conversationId: number, status: string }  // blocked / closed
 *     { type: "pong" }
 *     { type: "error",   code: string, message: string }
 */

import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { RequestHandler } from "express";
import type { Message } from "@shared/schema";

// Per-conversation set of active WS clients
const conversationClients = new Map<number, Set<AuthenticatedWebSocket>>();

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  subscriptions: Set<number>;
}

/** Broadcast a JSON payload to every client subscribed to a given conversation. */
export function broadcastToConversation(conversationId: number, payload: object): void {
  const clients = conversationClients.get(conversationId);
  if (!clients) return;
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/** Notify both parties in a conversation that its status changed (e.g. blocked). */
export function broadcastConversationStatus(conversationId: number, status: string): void {
  broadcastToConversation(conversationId, { type: "status", conversationId, status });
}

function subscribe(ws: AuthenticatedWebSocket, conversationId: number): void {
  if (!conversationClients.has(conversationId)) {
    conversationClients.set(conversationId, new Set());
  }
  conversationClients.get(conversationId)!.add(ws);
  ws.subscriptions.add(conversationId);
}

function unsubscribe(ws: AuthenticatedWebSocket, conversationId: number): void {
  ws.subscriptions.delete(conversationId);
  const clients = conversationClients.get(conversationId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) conversationClients.delete(conversationId);
  }
}

function cleanupClient(ws: AuthenticatedWebSocket): void {
  for (const convId of ws.subscriptions) {
    const clients = conversationClients.get(convId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) conversationClients.delete(convId);
    }
  }
  ws.subscriptions.clear();
}

/**
 * Attach a WebSocket server to the HTTP server.
 * Uses the existing express-session middleware for authentication.
 *
 * @param httpServer The HTTP server created in index.ts
 * @param sessionMiddleware The express-session middleware instance
 * @param verifyConversationAccess Callback to check user ∈ conversation
 */
export function setupChatWebSocket(
  httpServer: HttpServer,
  sessionMiddleware: RequestHandler,
  verifyConversationAccess: (userId: number, conversationId: number) => Promise<boolean>,
): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (rawWs: WebSocket, req: IncomingMessage) => {
    const ws = rawWs as AuthenticatedWebSocket;
    ws.subscriptions = new Set();

    // Authenticate via session cookie using the express-session middleware.
    // We cast the IncomingMessage to the minimal shape express-session expects.
    const fakeRes = {
      getHeader: () => undefined,
      setHeader: () => undefined,
      on: () => undefined,
    } as any;

    sessionMiddleware(req as any, fakeRes, () => {
      const session = (req as any).session;
      const userId: number | undefined = session?.passport?.user;

      if (!userId) {
        ws.close(1008, "Unauthorized");
        return;
      }

      ws.userId = userId;

      ws.on("message", async (raw: Buffer) => {
        let frame: any;
        try {
          frame = JSON.parse(raw.toString());
        } catch {
          ws.send(JSON.stringify({ type: "error", code: "INVALID_JSON", message: "Invalid JSON" }));
          return;
        }

        if (frame.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (frame.type === "subscribe" || frame.type === "unsubscribe") {
          const conversationId = Number(frame.conversationId);
          if (!Number.isInteger(conversationId) || conversationId <= 0) {
            ws.send(JSON.stringify({ type: "error", code: "INVALID_CONV", message: "Invalid conversation ID" }));
            return;
          }

          const hasAccess = await verifyConversationAccess(userId, conversationId);
          if (!hasAccess) {
            ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: "Not a participant" }));
            return;
          }

          if (frame.type === "subscribe") {
            subscribe(ws, conversationId);
          } else {
            unsubscribe(ws, conversationId);
          }
          return;
        }

        ws.send(JSON.stringify({ type: "error", code: "UNKNOWN_TYPE", message: "Unknown message type" }));
      });

      ws.on("close", () => cleanupClient(ws));
      ws.on("error", () => cleanupClient(ws));
    });
  });
}
