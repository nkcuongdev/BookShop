import { useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Calendar,
  User,
  Eye,
  ArrowLeft,
  Tag,
  Share2,
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

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

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
    return content;
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
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <div className="aspect-video overflow-hidden bg-gray-100">
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
          <h4 className="font-medium text-secondary-800 line-clamp-2 group-hover:text-primary-600 transition-colors">
            {post.title}
          </h4>
          <p className="text-xs text-secondary-500 mt-2">
            {formatRelativeDate(post.publishedAt || post.createdAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function NewsDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = usePostBySlug(slug);

  const post = data?.post;
  const relatedPosts = data?.relatedPosts || [];

  useEffect(() => {
    if (post) {
      document.title = post.metaTitle || post.title;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          "content",
          post.metaDescription || post.shortDescription || ""
        );
      }
    }
    return () => {
      document.title = "BookShop";
    };
  }, [post]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const handleShare = (platform) => {
    const url = window.location.href;
    const title = post?.title || "";

    const shareUrls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      copy: () => {
        navigator.clipboard.writeText(url);
        alert("Đã copy link!");
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
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <PostDetailSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📰</div>
          <h2 className="text-2xl font-bold text-secondary-800 mb-2">
            Không tìm thấy bài viết
          </h2>
          <p className="text-secondary-600 mb-6">
            Bài viết này có thể đã bị xóa hoặc không tồn tại
          </p>
          <Button onClick={() => navigate("/news")}>
            <ArrowLeft className="h-4 w-4" />
            Quay lại danh sách
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-secondary-500 hover:text-primary-600">
              Trang chủ
            </Link>
            <span className="text-secondary-400">/</span>
            <Link to="/news" className="text-secondary-500 hover:text-primary-600">
              Tin tức
            </Link>
            {post.category && (
              <>
                <span className="text-secondary-400">/</span>
                <Link
                  to={`/news?category=${post.category._id || post.category}`}
                  className="text-secondary-500 hover:text-primary-600"
                >
                  {post.category.name}
                </Link>
              </>
            )}
            <span className="text-secondary-400">/</span>
            <span className="text-secondary-800 font-medium line-clamp-1">
              {post.title}
            </span>
          </nav>
        </div>
      </div>

      <article className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => navigate("/news")}
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>

          {/* Header */}
          <header className="mb-8">
            {post.category && (
              <Badge variant="secondary" className="mb-4">
                {post.category.name}
              </Badge>
            )}

            <h1 className="text-3xl md:text-4xl font-bold text-secondary-900 mb-4">
              {post.title}
            </h1>

            {post.shortDescription && (
              <p className="text-lg text-secondary-600 mb-6">
                {post.shortDescription}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-secondary-500">
              {post.author && (
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {post.author.name}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(post.publishedAt || post.createdAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
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
            className="prose prose-lg max-w-none mb-8"
            dangerouslySetInnerHTML={{ __html: renderPostContent(post.content || "") }}
          />

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <Tag className="h-4 w-4 text-secondary-500" />
              {post.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Share */}
          <div className="flex items-center gap-4 py-6 border-t border-b">
            <span className="text-secondary-600 font-medium">Chia sẻ:</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleShare("facebook")}
              aria-label="Share on Facebook"
            >
              <FacebookIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleShare("twitter")}
              aria-label="Share on Twitter"
            >
              <TwitterIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleShare("copy")}
              aria-label="Copy link"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="max-w-6xl mx-auto mt-12">
            <Separator className="mb-8" />
            <h2 className="text-2xl font-bold text-secondary-800 mb-6">
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
