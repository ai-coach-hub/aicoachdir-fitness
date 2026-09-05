import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { SITE_ORIGIN } from "@/lib/siteUrl";
import "./globals.css";

export const metadata: Metadata = {
  // The WWW host, not the apex: the apex answers 308 -> www, so a metadataBase
  // on the apex makes every canonical and social URL resolve to a redirect.
  metadataBase: new URL(SITE_ORIGIN),
  title: "AI Coach Directory",
  description: "Personalized AI coaching designed around you.",
  openGraph: {
    type: "website",
    url: SITE_ORIGIN,
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
