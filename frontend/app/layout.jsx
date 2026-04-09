import "./globals.css";

export const metadata = {
  title: "PricePilot",
  description: "Smartphone resale pricing quote MVP",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
