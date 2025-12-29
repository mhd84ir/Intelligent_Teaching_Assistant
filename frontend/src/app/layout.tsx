import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "دستیار آموزشی هوشمند | Intelligent Teaching Assistant",
  description: "پرسش و پاسخ هوشمند از مطالب درسی",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
