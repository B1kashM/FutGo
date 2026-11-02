import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CLUB_IDS, DEFAULT_CLUB } from "./_theme/clubs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FutGo",
  description: "Built with Passion",
};

// Runs before first paint: applies the saved light/dark theme (or the OS theme)
// and the saved club to <html>
const themeScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}var c=localStorage.getItem('club');if(${JSON.stringify(
  CLUB_IDS,
)}.indexOf(c)<0){c=${JSON.stringify(DEFAULT_CLUB)}}d.dataset.theme=t;d.dataset.club=c}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}