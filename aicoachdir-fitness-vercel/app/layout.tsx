import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Fitness Coach | AI Coach Directory",
  description: "Personalized AI fitness coaching, available whenever you need it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
