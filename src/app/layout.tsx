import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { cn } from "@/lib/utils";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Gas — gas when you need gas",
  description:
    "Turn the ERC-20 tokens you have into native gas on another chain.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookie = (await headers()).get("cookie");
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        <AppProviders cookies={cookie}>{children}</AppProviders>
      </body>
    </html>
  );
}
