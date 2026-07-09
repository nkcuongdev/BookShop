import { useEffect, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import {
  Calendar,
  User,
  Eye,
  ArrowLeft,
  Tag,
  Link2,
} from "lucide-react";

function FacebookIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TwitterIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
import { usePostBySlug } from "@/features/admin/posts/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatRelativeDate, formatDate } from "@/utils/format";
import useDocumentMetadata, { getSiteUrl } from "@/hooks/useDocumentMetadata";
import { toast } from "@/components/ui/sonner";

import useCopyToClipboard from "@/hooks/useCopyToClipboard";
function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url = "") {
  const value = String(url || "").trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(value)) return value;
  return "#";
}

function sanitizeHtml(html = "") {
  return DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: [
      "p", "br", "h1", "h2", "h3", "h4", "ul", "ol", "li",
      "strong", "b", "em", "i", "u", "s", "blockquote", "code",
      "pre", "a", "img", "figure", "figcaption", "hr", "table",
      "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: [
      "href", "title", "target", "rel", "src", "alt", "width",
      "height", "loading", "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style"],
  });
}

function markdownToHtml(markdown = "") {
  const lines = markdown.split("\n");
  let inList = false;
  const html = [];

  const pushListState = (shouldOpen) => {
    if (shouldOpen && !inList) {
      html.push("<ul>");
      inList = true;
    } else if (!shouldOpen && inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      pushListState(false);
      html.push("<br />");
      continue;
    }

    const escaped = escapeHtml(line)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
        return `<a href="${escapeHtml(sanitizeUrl(href))}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });

    if (/^###\s+/.test(line)) {
      pushListState(false);
      html.push(`<h3>${escaped.replace(/^###\s+/, "")}</h3>`);
    } else if (/^##\s+/.test(line)) {
      pushListState(false);
      html.push(`<h2>${escaped.replace(/^##\s+/, "")}</h2>`);
    } else if (/^#\s+/.test(line)) {
      pushListState(false);
      html.push(`<h1>${escaped.replace(/^#\s+/, "")}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      pushListState(true);
      html.push(`<li>${escaped.replace(/^[-*]\s+/, "")}</li>`);
    } else {
      pushListState(false);
      html.push(`<p>${escaped}</p>`);
    }
  }

  pushListState(false);
  return html.join("");
}

function renderPostContent(content = "") {
  const hasHtmlTag = /<[^>]+>/.test(content);
  if (hasHtmlTag) {
    return sanitizeHtml(content);
  }
  return markdownToHtml(content);
}

function PostDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-6 w-96" />
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function RelatedPostCard({ post }) {
  return (
    <Link to={`/news/${post.slug}`} className="group block">
      <Card interactive className="overflow-hidden">
        <div className="aspect-video overflow-hidden bg-muted">
          {post.thumbnail ? (
            <img
              src={post.thumbnail}
              alt={post.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
              <span className="text-2xl font-bold text-primary-400">
                {post.title?.[0]?.toUpperCase() || "B"}
              </span>
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h4 className="text-base font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </h4>
          <p className="text-xs text-muted-foreground mt-2">
            {formatRelativeDate(post.publishedAt || post.createdAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function NewsDetail() {
  const { copy } = useCopyToClipboard();
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = usePostBySlug(slug);

  const post = data?.post;
  const relatedPosts = data?.relatedPosts || [];

  const articleStructuredData = useMemo(() => {
    if (!post) return null;
    const url = `${getSiteUrl()}/news/${post.slug}`;
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.metaDescription || post.shortDescription || "",
      image: post.thumbnail || undefined,
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.publishedAt || post.createdAt,
      author: post.author?.name
        ? { "@type": "Person", name: post.author.name }
        : { "@type": "Organization", name: "BookShop" },
      mainEntityOfPage: url,
      url,
    };
  }, [post]);

  useDocumentMetadata({
    title: post ? `${post.metaTitle || post.title} | BookShop` : "Bài viết | BookShop",
    description: post?.metaDescription || post?.shortDescription || "Tin tức và bài viết từ BookShop.",
    canonicalPath: `/news/${slug}`,
    image: post?.thumbnail,
    type: "article",
    structuredData: articleStructuredData,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const handleShare = (platform) => {
    const url = window.location.href;
    const title = post?.title || "";

    const shareUrls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      copy: async () => {
        const ok = await copy(url);
        if (ok) toast.success("Đã copy link bài viết");
        else toast.error("Không thể copy link");
      },
    };

    if (platform === "copy") {
      shareUrls.copy();
    } else {
      window.open(shareUrls[platform], "_blank", "width=600,height=400");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="page-container section-tight max-w-3xl">
          <PostDetailSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📰</div>
          <h2 className="text-h2 font-bold text-foreground mb-2">
            Không tìm thấy bài viết
          </h2>
          <p className="text-muted-foreground mb-6">
            Bài viết này có thể đã bị xóa hoặc không tồn tại
          </p>
          <Button onClick={() => navigate("/news")}>
            <ArrowLeft className="size-4" />
            Quay lại danh sách
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Breadcrumb */}
      <div className="bg-card border-b">
        <div className="page-container py-4">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-primary">
              Trang chủ
            </Link>
            <span className="text-muted-foreground/70">/</span>
            <Link to="/news" className="text-muted-foreground hover:text-primary">
              Tin tức
            </Link>
            {post.category && (
              <>
                <span className="text-muted-foreground/70">/</span>
                <Link
                  to={`/news?category=${post.category._id || post.category}`}
                  className="text-muted-foreground hover:text-primary"
                >
                  {post.category.name}
                </Link>
              </>
            )}
            <span className="text-muted-foreground/70">/</span>
            <span className="text-foreground font-medium line-clamp-1">
              {post.title}
            </span>
          </nav>
        </div>
      </div>

      <article className="page-container section-tight">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => navigate("/news")}
          >
            <ArrowLeft className="size-4" />
            Quay lại
          </Button>

          {/* Header */}
          <header className="mb-8">
            {post.category && (
              <Badge variant="secondary" className="mb-4">
                {post.category.name}
              </Badge>
            )}

            <h1 className="mb-4 text-h1 font-display font-bold text-foreground lg:text-display">
              {post.title}
            </h1>

            {post.shortDescription && (
              <p className="text-lg text-muted-foreground mb-6">
                {post.shortDescription}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {post.author && (
                <span className="flex items-center gap-1.5">
                  <User className="size-4" />
                  {post.author.name}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                {formatDate(post.publishedAt || post.createdAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="size-4" />
                {post.viewCount || 0} lượt xem
              </span>
            </div>
          </header>

          {/* Featured Image */}
          {post.thumbnail && (
            <div className="mb-8 overflow-hidden rounded-xl">
              <img
                src={post.thumbnail}
                alt={post.title}
                className="w-full object-cover"
              />
            </div>
          )}

          {/* Content */}
          <div
            className="prose-content mb-8"
            dangerouslySetInnerHTML={{ __html: renderPostContent(post.content || "") }}
          />

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <Tag className="size-4 text-muted-foreground" />
              {post.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Share */}
          <div className="flex items-center gap-4 py-6 border-t border-b">
            <span className="text-muted-foreground font-medium">Chia sẻ:</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleShare("facebook")}
              aria-label="Share on Facebook"
            >
              <FacebookIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleShare("twitter")}
              aria-label="Share on Twitter"
            >
              <TwitterIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleShare("copy")}
              aria-label="Copy link"
            >
              <Link2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="max-w-6xl mx-auto mt-12">
            <Separator className="mb-8" />
            <h2 className="text-h2 font-bold text-foreground mb-6">
              Bài viết liên quan
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {relatedPosts.map((relatedPost) => (
                <RelatedPostCard
                  key={relatedPost._id || relatedPost.id}
                  post={relatedPost}
                />
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
