import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reddit VOC Pipeline",
  description: "Voice-of-customer research from Reddit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
