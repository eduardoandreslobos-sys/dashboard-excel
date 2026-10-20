import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)] px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <Link href="/" className="flex items-center gap-2.5 self-center">
          <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }}>
            <BarChart3 size={18} aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Dashboard Excel</span>
        </Link>
        {children}
        <p className="text-center text-[12px] text-muted-foreground">
          Tus datos solo los ven las personas con las que decides compartirlos.
        </p>
      </div>
    </div>
  );
}
