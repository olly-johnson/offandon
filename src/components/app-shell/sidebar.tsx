import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";

import { signout } from "@/app/(app)/dashboard/actions";

import { NewChatButton, SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

interface SidebarProps {
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

export function Sidebar({ email, displayName, isAdmin }: SidebarProps) {
  const initials = (displayName ?? email).slice(0, 2).toUpperCase();
  const label = displayName ?? email.split("@")[0];

  return (
    <aside
      className="hidden h-screen w-64 shrink-0 flex-col md:flex"
      style={{
        background: "var(--oo-bg-sidebar)",
        borderRight: "1px solid var(--oo-border)",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-4"
        style={{ height: 56, borderBottom: "1px solid var(--oo-border)" }}
      >
        <Image
          src="/logo.png"
          alt="ABS Creative Studios"
          width={56}
          height={56}
          priority
          className="size-7 shrink-0 rounded-full object-cover"
        />
        <span className="text-sm font-bold" style={{ color: "var(--oo-gold)" }}>
          Off&amp;On
        </span>
        <span className="text-sm font-bold" style={{ color: "var(--oo-text-primary)" }}>
          OS
        </span>
      </div>

      <NewChatButton />
      <SidebarNav isAdmin={isAdmin} />

      <div style={{ borderTop: "1px solid var(--oo-border)" }} className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{
              background: "var(--oo-gold-dim)",
              color: "var(--oo-gold)",
              border: "1px solid var(--oo-border-gold)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: "var(--oo-text-primary)" }}
            >
              {label}
            </p>
            <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
              {isAdmin ? "Admin" : "Client"}
            </p>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="oo-icon-btn"
          >
            <Settings className="size-3.5" />
          </Link>
          <ThemeToggle />
          <form action={signout}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="oo-icon-btn"
            >
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
