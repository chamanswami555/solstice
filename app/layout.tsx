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

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
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
