import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Adviser",
  description: "Self-hosted spending dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
