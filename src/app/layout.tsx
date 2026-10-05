import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Workspace } from "@/components/workspace";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};
export const metadata: Metadata = {
  title: "GlobalRDP Hub",
  description: "Global RDP plans with secure, personally verified delivery",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Workspace>{children}</Workspace>
      </body>
    </html>
  );
}
