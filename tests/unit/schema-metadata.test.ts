import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  books,
  bookCatalog,
  bookRequests,
  messages,
  offers,
  transactions,
  users,
  works,
  TERMINAL_TX_STATUSES,
} from "@shared/schema";

function getForeignKey(table: any, columnName: string) {
  return getTableConfig(table).foreignKeys.find((fk) =>
    fk.reference().columns.some((col) => col.name === columnName)
  );
}

describe("database schema metadata", () => {
  it("defines expected indexes for listing and transaction lookup paths", () => {
    expect(getTableConfig(books).indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining(["books_user_id_idx", "books_status_idx", "books_genre_idx"]),
    );
    expect(getTableConfig(bookCatalog).indexes.map((i) => i.config.name)).toContain(
      "book_catalog_work_id_idx",
    );
    expect(getTableConfig(bookRequests).indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining(["book_requests_user_id_idx", "book_requests_status_idx"]),
    );
    expect(getTableConfig(messages).indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining(["messages_sender_id_idx", "messages_receiver_id_idx", "messages_is_read_idx"]),
    );
    expect(getTableConfig(offers).indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining(["offers_buyer_id_idx", "offers_seller_id_idx"]),
    );
    expect(getTableConfig(transactions).indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining(["transactions_buyer_id_idx", "transactions_seller_id_idx", "transactions_status_idx"]),
    );
  });

  it("enforces expected foreign key deletion rules for books and catalog links", () => {
    const userFk = getForeignKey(books, "user_id");
    const catalogFk = getForeignKey(books, "catalog_id");
    const workFk = getForeignKey(books, "work_id");
    const catalogWorkFk = getForeignKey(bookCatalog, "work_id");

    expect(userFk?.onDelete).toBe("restrict");
    expect(getTableConfig(userFk!.reference().foreignTable).name).toBe(getTableConfig(users).name);
    expect(catalogFk?.onDelete).toBe("set null");
    expect(workFk?.onDelete).toBe("set null");
    expect(catalogWorkFk?.onDelete).toBe("set null");
    expect(getTableConfig(catalogWorkFk!.reference().foreignTable).name).toBe(getTableConfig(works).name);
  });

  it("enforces expected foreign key deletion rules for requests, messages, offers, and transactions", () => {
    expect(getForeignKey(bookRequests, "user_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(messages, "sender_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(messages, "receiver_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(messages, "book_id")?.onDelete).toBe("set null");
    expect(getForeignKey(offers, "buyer_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(offers, "seller_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(offers, "book_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(transactions, "buyer_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(transactions, "seller_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(transactions, "book_id")?.onDelete).toBe("restrict");
    expect(getForeignKey(transactions, "offer_id")?.onDelete).toBe("set null");
  });
});

describe("TERMINAL_TX_STATUSES", () => {
  it("contains all terminal transaction states used by route guards", () => {
    expect(TERMINAL_TX_STATUSES).toEqual(["completed", "refunded", "failed", "cancelled"]);
  });
});
