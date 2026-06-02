/**
 * Root layout (§7.9). Sets <html lang> + an initial `data-theme` (the client store
 * reconciles it from localStorage/prefers-color-scheme on mount). Imports the
 * global CSS that ports the concept-art palettes + zoom-reveal transitions.
 *
 * Server component (no 'use client'): minimal, no providers — the review store is
 * a module-level Zustand store created on the client.
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diffwise — Semantic-zoom diff review",
  description: "AI-generated semantic-zoom review of a GitHub pull request.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
