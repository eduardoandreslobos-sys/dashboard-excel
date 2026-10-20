import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard Excel",
  description: "Sube cualquier Excel y obtén un dashboard automático: KPIs, tendencias, segmentos y hallazgos.",
};

// Aplica tema y densidad guardados antes del primer pintado (evita el destello).
const preferencias = `try{var t=localStorage.getItem("tema");if(t)document.documentElement.dataset.theme=t;var d=localStorage.getItem("densidad");if(d)document.documentElement.dataset.density=d}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencias }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
