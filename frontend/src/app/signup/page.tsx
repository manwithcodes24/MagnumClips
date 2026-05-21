"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";

export default function SignUpPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      router.push("/");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create account";
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
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">Create Account</h1>
            <p className="text-slate-500 dark:text-slate-400">Start turning long videos into viral clips today.</p>
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
                minLength={6}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
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
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 flex justify-center items-center gap-2 mt-2"
            >
              {loading ? (
                 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : "Create Account"}
            </button>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-4">
              Already have an account?{" "}
              <Link href="/signin" className="text-blue-600 dark:text-blue-500 font-semibold hover:underline">
                Sign In
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
            <div className="w-32 h-32 rounded-2xl bg-white dark:bg-slate-800 shadow-2xl dark:shadow-none border border-slate-200 dark:border-slate-700 flex items-center justify-center z-20 relative transform hover:scale-105 transition-transform duration-500">
               <svg className="w-12 h-12 text-blue-600 dark:text-blue-500 animate-[pulse-in_3s_ease-out_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
               </svg>
            </div>
            
            {/* Orbiting Elements */}
            <div className="absolute w-full h-full border border-dashed border-slate-300 dark:border-slate-700 rounded-full animate-[spin_20s_linear_infinite_reverse]" />
            <div className="absolute w-[70%] h-[70%] border border-dashed border-slate-300 dark:border-slate-700 rounded-full animate-[spin_15s_linear_infinite]" />
            
            {/* Floating Clip Cards */}
            {[0, 1, 2].map((i) => (
              <div 
                key={i} 
                className="absolute z-30"
                style={{ 
                  transform: `rotate(${i * 120 + 60}deg) translateY(-140px) rotate(-${i * 120 + 60}deg)`
                }}
              >
                <div 
                  className="w-20 h-28 bg-white dark:bg-slate-800 rounded-lg shadow-xl dark:shadow-none border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center overflow-hidden"
                  style={{ animation: `float-caption 4s ease-in-out infinite ${i * 0.7}s` }}
                >
                  <div className="w-full flex-1 bg-slate-100 dark:bg-slate-900/50 mx-2 mt-2 rounded flex items-center justify-center">
                     <span className="text-xs font-bold text-slate-400">Clip {i+1}</span>
                  </div>
                  <div className="w-full p-2 flex flex-col gap-1">
                     <div className="h-1 bg-blue-500 rounded-full w-full opacity-60" />
                     <div className="h-1 bg-blue-500 rounded-full w-3/4 opacity-60" />
                     <div className="h-1 bg-blue-500 rounded-full w-1/2 opacity-60" />
                  </div>
                </div>
              </div>
            ))}
         </div>
      </div>
    </main>
  );
}
