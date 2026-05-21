"use client";

import { useAuth } from "@/lib/auth-context";
import AppHome from "./components/app-home";
import LandingPage from "./components/landing-page";

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-background)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--color-border)",
            borderTopColor: "var(--color-primary)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </main>
    );
  }

  return user ? <AppHome /> : <LandingPage />;
}
