import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aicoachdir.com"),
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
