import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CLUB_IDS, DEFAULT_CLUB } from "./_theme/clubs";
import InitialLoader from "./components/InitialLoader";

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

  manifest: "/manifest.json",

  appleWebApp: {
    capable: true,
    title: "FutGo",
    statusBarStyle: "black-translucent",
  },

  icons: {
    apple: [
      {
        url: "/icons/image.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    icon: [
      {
        url: "/icons/image.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

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
        <link
          rel="apple-touch-icon"
          href="/icons/image.png"
          sizes="512x512"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>

      <body className="min-h-full flex flex-col">
        {/* FutGo Initial Loading Screen */}
        <div id="initial-loader" className="initial-loader">
          <div className="loader-content">
            <img
              src="/icons/image.png"
              alt="FutGo"
              className="loader-logo"
            />

            <div className="loader-text">FUTGO</div>

            <div className="loader-indicator">
              <div className="loader-indicator-bar"></div>
            </div>
          </div>
        </div>

        <InitialLoader />
        {children}
      </body>
    </html>
  );
}
