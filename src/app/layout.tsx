import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "GlobalRDP Hub — Cloud without borders",
  description: "Your global compute control center",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
