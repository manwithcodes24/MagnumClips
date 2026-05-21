"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();

  const isAuthPage = pathname === "/signin" || pathname === "/signup";

  return (
    <nav className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#020617] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-20 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 text-2xl font-serif font-semibold tracking-tight text-slate-800 dark:text-slate-100 group">
            <div className="w-10 h-10 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm group-hover:scale-105 transition-transform">
               <img src="/logo.png" alt="MagnumClips Logo" className="w-full h-full object-cover" />
            </div>
            <span>Magnum<span className="text-blue-600 dark:text-blue-500">Clips</span></span>
          </Link>
          
          <div className="hidden md:flex gap-6">
            {!user && (
              <>
                <Link 
                  href="/#features" 
                  onClick={(e) => { if (pathname === "/") { e.preventDefault(); document.getElementById('features')?.scrollIntoView({behavior: 'smooth'}); }}}
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Features
                </Link>
                <Link 
                  href="/#how-it-works" 
                  onClick={(e) => { if (pathname === "/") { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({behavior: 'smooth'}); }}}
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  How it Works
                </Link>
              </>
            )}
            <Link
              href="/#pricing"
              onClick={(e) => { if (pathname === "/") { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({behavior: 'smooth'}); }}}
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Pricing
            </Link>
            {!user && (
               <Link 
                 href="/#faq" 
                 onClick={(e) => { if (pathname === "/") { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({behavior: 'smooth'}); }}}
                 className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
               >
                 FAQ
               </Link>
            )}
            {user && (
              <>
                <Link
                  href="/history"
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  History
                </Link>
                <Link
                  href="/explainer"
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Explainer
                </Link>
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Dashboard
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          
          {loading ? (
            <div className="w-5 h-5 border-2 border-blue-600 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : user ? (
            <>
              <span className="text-sm text-slate-600 dark:text-slate-400 hidden sm:inline font-medium">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-sm font-semibold px-4 py-2 rounded-full border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 dark:hover:border-red-500 transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : !isAuthPage ? (
            <>
              <Link
                href="/signin"
                className="hidden md:inline-flex px-5 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 text-sm font-semibold hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="px-5 py-2.5 rounded-full bg-slate-800 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-700 dark:hover:bg-blue-500 transition-colors shadow-sm"
              >
                Sign Up
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
