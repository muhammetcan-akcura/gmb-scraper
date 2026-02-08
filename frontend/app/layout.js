import './globals.css';

export const metadata = {
  title: 'GMB Veri Çekici | Google Maps İşletme Bilgileri',
  description: 'Google Maps işletme bilgilerini kolayca çekin ve indirin',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
