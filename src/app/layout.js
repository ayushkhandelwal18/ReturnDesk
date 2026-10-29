import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "ReturnDesk · Returns management",
  description: "A focused workspace for customer returns and resolutions.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
            <Link
              href="/"
              className="flex items-center gap-3"
              aria-label="ReturnDesk home"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-xl font-bold text-white"
              >
                ↩
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900">
                ReturnDesk
                <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
                  Returns, resolved.
                </span>
              </span>
            </Link>
            <nav
              aria-label="Main navigation"
              className="flex items-center gap-4 text-sm font-medium sm:gap-7"
            >
              <Link
                className="inline-flex min-h-11 items-center text-slate-600 hover:text-teal-800"
                href="/"
              >
                Requests
              </Link>
              <Link
                className="inline-flex min-h-11 items-center text-teal-800 hover:underline"
                href="/requests/new"
              >
                New request
              </Link>
            </nav>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-8 sm:px-8 sm:py-10 lg:px-10"
        >
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1440px] px-5 py-6 text-xs text-slate-500 sm:px-8 lg:px-10">
          ReturnDesk <span aria-hidden="true">/</span> Support workspace · Dates
          shown in IST
        </footer>
      </body>
    </html>
  );
}
