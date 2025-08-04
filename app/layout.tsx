import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { TargetsProvider }     from "@/contexts/targets-context"
import { CompetitorsProvider } from "@/contexts/competitors-context"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nuggt Demo Dashboard",
  description: "Nuggt Copyright 2025",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TargetsProvider>
          <CompetitorsProvider>
            {children}
          </CompetitorsProvider>
        </TargetsProvider>
      </body>
    </html>
  );
}
