import "./globals.css";

export const metadata = {
  title: "약알림e",
  description: "AI 기반 스마트 복약 관리 서비스"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
