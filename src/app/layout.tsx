import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "SR Pet Clube | Sistema de Gestão para Pet Shops",
  description: "Sistema completo para gestão de Pet Shops, incluindo creche, hotel, banho e tosa.",
  keywords: ["pet shop", "banho e tosa", "hotel pet", "creche pet", "gestão pet shop"],
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
