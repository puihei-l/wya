import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wya",
  description: "Where are you at?",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
