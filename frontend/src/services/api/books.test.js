import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  request: vi.fn(),
}));

import { request } from "./client";
import { booksAPI } from "./books";

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ success: true, data: { books: [] } });
});

describe("booksAPI query parameters", () => {
  it("omits undefined, null and empty filters", async () => {
    await booksAPI.getAll({
      page: 1,
      limit: 20,
      search: undefined,
      category: null,
      stockStatus: "",
      raw: 1,
    });

    expect(request).toHaveBeenCalledWith("/books?page=1&limit=20&raw=1");
  });

  it("passes the analytics session to personalized recommendations", async () => {
    await booksAPI.getRecommendations({
      sessionId: "session_12345678",
      limit: 8,
    });

    expect(request).toHaveBeenCalledWith(
      "/books/recommendations?sessionId=session_12345678&limit=8"
    );
  });
});
