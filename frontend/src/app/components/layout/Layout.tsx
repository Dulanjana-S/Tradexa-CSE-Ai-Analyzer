import { Outlet, useLocation } from "react-router";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";
import ChatWidget from "../ChatWidget";
import { useState, useEffect, useRef } from "react";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { pathname } = useLocation();
  const scrollContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo(0, 0);
    }
  }, [pathname]);

  useEffect(() => {
    // Auto-close sidebar based on screen size
    const handleResize = () => {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    // Initial check
    handleResize();

    // Listen for window resize
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="h-screen w-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-[var(--background)] flex flex-col"
        >
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
          <ChatWidget />
        </main>
      </div>
    </div>
  );
}