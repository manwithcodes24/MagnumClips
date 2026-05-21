"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      router.push("/");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Invalid email or password";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    <main className="flex-1 flex min-h-[calc(100vh-80px)]">
      {/* Left Form Section */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white dark:bg-[#020617] transition-colors duration-300">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">Welcome Back</h1>
            <p className="text-slate-500 dark:text-slate-400">Enter your details to sign in.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 flex justify-center items-center gap-2"
            >
              {loading ? (
                 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : "Sign In"}
            </button>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-4">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-blue-600 dark:text-blue-500 font-semibold hover:underline">
                Sign Up
              </Link>
            </p>
          </form>
        </div>
      </div>

      {/* Right Animated Visual Section */}
      <div className="hidden lg:flex flex-1 bg-slate-50 dark:bg-slate-900/30 border-l border-slate-100 dark:border-slate-800/60 items-center justify-center relative overflow-hidden transition-colors duration-300">
         {/* Decorative Gradients */}
         <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 blur-3xl rounded-full translate-x-1/3 -translate-y-1/3" />
         <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 blur-3xl rounded-full -translate-x-1/3 translate-y-1/3" />

         {/* Abstract UI representation */}
         <div className="relative w-full max-w-lg aspect-square flex items-center justify-center">
            {/* Center Core */}
            <div className="w-32 h-32 rounded-2xl bg-white dark:bg-slate-800 shadow-2xl dark:shadow-none border border-slate-200 dark:border-slate-700 flex items-center justify-center z-20 relative">
               <svg className="w-12 h-12 text-blue-600 dark:text-blue-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
               </svg>
            </div>
            
            {/* Orbiting Elements */}
            <div className="absolute w-full h-full border border-dashed border-slate-300 dark:border-slate-700 rounded-full animate-[spin_20s_linear_infinite]" />
            <div className="absolute w-[70%] h-[70%] border border-dashed border-slate-300 dark:border-slate-700 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
            
            {/* Floating Clip Cards */}
            {[0, 1, 2].map((i) => (
              <div 
                key={i} 
                className="absolute z-30"
                style={{ 
                  transform: `rotate(${i * 120}deg) translateY(-140px) rotate(-${i * 120}deg)`
                }}
              >
                <div 
                  className="w-20 h-28 bg-white dark:bg-slate-800 rounded-lg shadow-xl dark:shadow-none border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center overflow-hidden"
                  style={{ animation: `float-caption 3s ease-in-out infinite ${i * 0.5}s` }}
                >
                  <div className="w-full flex-1 bg-slate-100 dark:bg-slate-900 mx-2 mt-2 rounded flex items-center justify-center">
                     <svg className="w-5 h-5 text-slate-300 dark:text-slate-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3.5l4 4v-11l-4 4z" /></svg>
                  </div>
                  <div className="w-full p-2 flex flex-col gap-1">
                     <div className="h-1.5 w-full bg-blue-500 rounded-full" />
                     <div className="h-1.5 w-2/3 bg-slate-200 dark:bg-slate-600 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
         </div>
      </div>
    </main>
  );
}
