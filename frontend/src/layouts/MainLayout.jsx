import { Outlet } from "react-router-dom";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ChatSupportWidget from "@/components/layout/ChatSupportWidget";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ScrollToTop from "@/components/common/ScrollToTop";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function MainLayout() {
  return (
    <TooltipProvider delayDuration={150}>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col bg-gray-50">
        <AnnouncementBar />
        <Header />
        <main className="flex-1 pb-16 lg:pb-0">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        <Footer />
        <ChatSupportWidget />
        <MobileBottomNav />
      </div>
    </TooltipProvider>
  );
}
