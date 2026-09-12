import { Outlet, useLocation } from "react-router-dom";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ChatSupportWidget from "@/components/layout/ChatSupportWidget";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ScrollToTop from "@/components/common/ScrollToTop";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import RouteMetadata from "@/components/common/RouteMetadata";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function MainLayout() {
  const { pathname } = useLocation();

  return (
    <TooltipProvider delayDuration={150}>
      <ScrollToTop />
      <RouteMetadata />
      <div className="min-h-screen flex flex-col bg-muted">
        {/* Keyboard users otherwise tab through the whole header on every page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-float"
        >
          Bỏ qua, đến nội dung chính
        </a>
        <AnnouncementBar />
        <Header />
        <main id="main-content" className="flex-1 pb-16 lg:pb-0">
          <ErrorBoundary>
            {/* key on pathname remounts on navigation so the enter animation
                replays. Uses tailwindcss-animate (already a dependency) rather
                than pulling in a motion library. Deliberately subtle — a 2px
                rise, not a slide: the page content is what should be noticed,
                not the transition. */}
            <div
              key={pathname}
              className="animate-in fade-in slide-in-from-bottom-2 duration-slow ease-out-soft"
            >
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
        <Footer />
        <ChatSupportWidget />
        <MobileBottomNav />
      </div>
    </TooltipProvider>
  );
}
