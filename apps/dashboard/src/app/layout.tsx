import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Operations Dashboard",
  description: "Distributed Task Platform Operations Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-base-950 text-foreground overflow-hidden font-sans">
        <AuthProvider>
          <ProtectedRoute>
            <div className="flex h-screen overflow-hidden relative">
              <div className="absolute inset-0 bg-grid z-0 pointer-events-none opacity-50" />
              
              {/* Sidebar */}
              <div className="w-64 shrink-0 hidden md:block z-10 border-r border-base-800 bg-glass">
                <Sidebar />
              </div>
              
              {/* Main content */}
              <div className="flex-1 flex flex-col min-w-0 z-10 relative">
                <Header />
                <main className="flex-1 overflow-y-auto p-6 relative">
                  <div className="mx-auto max-w-7xl">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </ProtectedRoute>
        </AuthProvider>
      </body>
    </html>
  );
}
