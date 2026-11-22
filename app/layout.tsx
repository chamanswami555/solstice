import type { Metadata } from "next";
import { Figtree, Young_Serif } from "next/font/google";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  weight: "400",
  subsets: ["latin"],
});

const SHARE_TITLE = `${BRAND.name}: a Secret Santa for your group`;
const SHARE_TEXT = "Draw names, ask your person questions without showing your name, and watch the reveal live on every phone. No app, no sign-up.";

// The share fields give a link in a chat or a post a title, a text and the image of app/opengraph-image.tsx.
export const metadata: Metadata = {
  title: SHARE_TITLE,
  description: BRAND.tagline,
  openGraph: { title: SHARE_TITLE, description: SHARE_TEXT, siteName: BRAND.name, type: "website" },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_TEXT },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${youngSerif.variable}`}>
      <body>
        <header className="site-header">
          <div className="container">
            <Link className="wordmark" href="/" aria-label={`${BRAND.name} home`}>
              {BRAND.name}
            </Link>
          </div>
        </header>
        <main className="site-main container">{children}</main>
        <footer className="container">
          <p className="site-footer__line">
            {BRAND.tagline} <Link href="/usage">Usage numbers</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
