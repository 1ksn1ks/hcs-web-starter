import './globals.css';

export const metadata = {
  title: 'HCS web starter',
  description: 'Copy-paste Hedera Consensus Service helpers for web apps',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
