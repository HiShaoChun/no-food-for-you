import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "No Food For You · Arena",
  description: "5 个国产 LLM 互相博弈生存的语言驱动模拟",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
