import type { Metadata } from "next";
import "./global.css";

export const metadata: Metadata = {
  title: "Guitar Tuning & Theory Lab",
  description: "Learn alternate guitar tunings and music theory visually.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
