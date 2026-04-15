import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { HeartbeatSender } from "@/components/HeartbeatSender";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Directoor — AI-Native Canvas",
  description:
    "The fastest way to build and animate architecture diagrams. Just say what you want — it appears.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full bg-white text-slate-900">
        <AuthProvider>
          <HeartbeatSender />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
