import "./globals.css";
import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
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
