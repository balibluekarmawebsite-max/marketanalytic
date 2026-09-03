import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blue Karma · Market Analytics",
  description:
    "Revenue-management dashboard for Blue Karma Dijiwa Group — BKDS, BKDU, BKV.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSession();
  return (
    <html lang="en">
      <body className={inter.className}>
        {user && (
          <div className="border-b bg-background">
            <div className="container flex items-center justify-end gap-3 py-1.5 text-xs text-muted-foreground">
              <span>
                Signed in as <span className="font-medium text-foreground">{user.name || user.email}</span>
                {user.role === "admin" && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">admin</span>}
              </span>
              <SignOutButton />
            </div>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
