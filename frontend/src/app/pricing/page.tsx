"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getPlans,
  getMySubscription,
  type PlanInfo,
  type SubscriptionInfo,
} from "@/lib/api";

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
}

function formatStorage(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;
}

export default function PricingPage() {
  const { user, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [p, sub] = await Promise.all([
          getPlans(),
          user ? getMySubscription().catch(() => null) : Promise.resolve(null),
        ]);
        setPlans(p);
        setSubscription(sub);
      } catch {
        setError("Failed to load plans");
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) load();
  }, [user, authLoading]);

  if (loading || authLoading) {
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
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Choose Your Plan</h1>
          <p className="text-[var(--color-muted)] text-lg">
            Scale your content creation with the right plan
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan?.id === plan.id;
            const isPopular =
              plan.price_monthly > 0 &&
              plans.filter((p) => p.price_monthly > plan.price_monthly).length >
                0;

            return (
              <div
                key={plan.id}
                className={`relative bg-[var(--color-surface)] rounded-xl p-6 border transition-all ${
                  isCurrent
                    ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/50"
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--color-primary)] text-white text-xs font-medium px-3 py-1 rounded-full">
                    Current Plan
                  </div>
                )}
                {isPopular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-medium px-3 py-1 rounded-full">
                    Popular
                  </div>
                )}

                <h2 className="text-xl font-bold capitalize mb-1">
                  {plan.name}
                </h2>

                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    ${plan.price_monthly}
                  </span>
                  <span className="text-[var(--color-muted)]">/month</span>
                </div>

                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">✓</span>
                    {plan.max_videos_per_month} videos / month
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">✓</span>
                    {plan.max_exports_per_month} exports / month
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">✓</span>
                    Max {formatDuration(plan.max_video_duration_seconds)} video
                    length
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">✓</span>
                    {formatStorage(plan.max_storage_mb)} storage
                  </li>
                </ul>

                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-lg font-medium bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 cursor-default"
                  >
                    Active
                  </button>
                ) : (
                  <button className="w-full py-3 rounded-lg font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white transition-colors">
                    {plan.price_monthly === 0 ? "Get Started" : "Upgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
