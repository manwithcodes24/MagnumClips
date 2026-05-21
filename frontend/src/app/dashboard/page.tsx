"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  getMyUsage,
  getMySubscription,
  type UsageInfo,
  type SubscriptionInfo,
} from "@/lib/api";

function ProgressBar({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isHigh = pct >= 80;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[var(--color-muted)]">{label}</span>
        <span className={isHigh ? "text-amber-400" : ""}>
          {used} / {limit}
        </span>
      </div>
      <div className="w-full h-2 bg-[var(--color-background)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isHigh ? "bg-amber-400" : "bg-[var(--color-primary)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/signin");
  }, [user, authLoading, router]);

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        const [u, s] = await Promise.all([
          getMyUsage(),
          getMySubscription().catch(() => null),
        ]);
        setUsage(u);
        setSubscription(s);
      } catch {
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading && user) load();
  }, [user, authLoading]);

  if (authLoading || (!user && !authLoading)) return null;

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        {/* Account Info */}
        <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
          <h2 className="text-lg font-semibold mb-4">Account</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Email</span>
              <span>{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Plan</span>
              <span className="capitalize font-medium text-[var(--color-primary)] flex items-center gap-2">
                {usage?.plan_name || subscription?.plan?.name || "Free"}
                {usage?.is_admin && (
                  <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                    ADMIN
                  </span>
                )}
              </span>
            </div>
            {subscription?.status && (
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Status</span>
                <span className="capitalize">{subscription.status}</span>
              </div>
            )}
            {subscription?.current_period_end && (
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Renews</span>
                <span>
                  {new Date(
                    subscription.current_period_end,
                  ).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Usage Stats */}
        {usage && (
          <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
            <h2 className="text-lg font-semibold mb-4">Usage This Month</h2>
            {usage.is_admin ? (
              <p className="text-sm text-[var(--color-muted)]">
                Unlimited access — no usage limits apply.
              </p>
            ) : (
              <div className="space-y-4">
                <ProgressBar
                  used={usage.videos_used}
                  limit={usage.videos_limit}
                  label="Videos"
                />
                <ProgressBar
                  used={usage.exports_used}
                  limit={usage.exports_limit}
                  label="Exports"
                />
                <div className="flex justify-between text-sm pt-2 border-t border-[var(--color-border)]">
                  <span className="text-[var(--color-muted)]">
                    Max Video Duration
                  </span>
                  <span>
                    {formatDuration(usage.max_video_duration_seconds)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium transition-colors text-sm"
            >
              New Video
            </Link>
            <Link
              href="/history"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-background)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] font-medium transition-colors text-sm"
            >
              View History
            </Link>
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-background)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] font-medium transition-colors text-sm col-span-2"
            >
              Manage Plan
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
