"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar as CalendarIcon,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Microscope,
  Palette,
  PenLine,
  ScrollText,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Scripts", href: "/scripts", icon: ScrollText, enabled: true },
  { label: "Research", href: "/research", icon: Microscope, enabled: false },
  { label: "Brand", href: "/brand", icon: Palette, enabled: false },
  { label: "Calendar", href: "/calendar", icon: CalendarIcon, enabled: false },
  { label: "Performance", href: "/performance", icon: BarChart3, enabled: false },
  { label: "Chats", href: "/chat", icon: MessageSquare, enabled: true },
  { label: "Off&On Pocket", href: "/pocket", icon: Wallet, enabled: false },
  { label: "Learn", href: "/learn", icon: GraduationCap, enabled: false },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              !item.enabled && "opacity-60",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {!item.enabled ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function NewChatButton() {
  return (
    <Link
      href="/chat"
      className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
    >
      <PenLine className="size-4" />
      New chat
    </Link>
  );
}
