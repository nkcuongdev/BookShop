// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RouteMetadata from "@/components/common/RouteMetadata";
import useDocumentMetadata from "./useDocumentMetadata";

function MetadataHarness() {
  useDocumentMetadata({
    title: "Sách thử nghiệm – Tác giả | BookShop",
    description: "Mô tả sách thử nghiệm",
    canonicalPath: "/books/123",
    type: "book",
    structuredData: { "@context": "https://schema.org", "@type": "Book", name: "Sách thử nghiệm" },
  });
  return null;
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('script[data-bookshop-json-ld="true"]').forEach((node) => node.remove());
});

describe("document metadata", () => {
  it("sets canonical metadata and Book JSON-LD", async () => {
    render(<MetadataHarness />);
    await waitFor(() => expect(document.title).toContain("Sách thử nghiệm"));
    expect(document.head.querySelector('meta[name="description"]')?.content).toBe("Mô tả sách thử nghiệm");
    expect(document.head.querySelector('meta[property="og:type"]')?.content).toBe("book");
    expect(document.head.querySelector('link[rel="canonical"]')?.href).toContain("/books/123");
    const jsonLd = JSON.parse(document.head.querySelector('script[type="application/ld+json"]')?.textContent);
    expect(jsonLd["@type"]).toBe("Book");
  });

  it("marks account routes as noindex", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <RouteMetadata />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')?.content).toBe("noindex,nofollow");
    });
  });
});
