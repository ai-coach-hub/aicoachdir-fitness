import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aicoachdir.com"),
  // No canonical was emitted. The site is reachable on both the apex and the www host,
  // so search engines were free to treat them as two sites and split the ranking signal.
  alternates: { canonical: "/" },
  title: "AI Coach Directory",
  description: "Personalized AI coaching designed around you.",
  openGraph: {
    type: "website",
    url: "https://aicoachdir.com",
    siteName: "AI Coach Directory",
    title: "AI Coach Directory",
    description: "Personalized AI coaching designed around you.",
    images: [
      {
        url: "/images/ai-coach-directory-logo.jpg",
        width: 1153,
        height: 1152,
        alt: "AI Coach Directory logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Coach Directory",
    description: "Personalized AI coaching designed around you.",
    images: ["/images/ai-coach-directory-logo.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
