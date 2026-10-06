export const metadata = { title: 'ChessLens', description: 'Local Stockfish game analysis' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: 'Georgia, serif', margin: 0, background: '#0f1a1a', color: '#eef2f1' }}>{children}</body></html>);
}
