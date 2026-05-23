import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bot OS",
  description: "AI operating system for Instagram creators.",
};

/**
 * Inline script that runs before paint and applies the user's saved
 * theme. Default is dark to preserve the original visual experience;
 * users who toggled to light keep their preference via localStorage.
 * Must stay synchronous + inline; running it from a deferred script
 * causes a flash of the wrong theme on every navigation.
 */
const NO_FLASH_THEME_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'light') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
