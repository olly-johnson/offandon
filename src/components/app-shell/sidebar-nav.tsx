"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  BookOpen,
  Bot,
  Calendar,
  FileText,
  LayoutDashboard,
  Library,
  type LucideIcon,
  Mic,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sliders,
  Target,
  Zap,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Scripts", href: "/scripts", icon: FileText, enabled: true },
  { label: "Library", href: "/library", icon: Library, enabled: true },
  { label: "Transcripts", href: "/transcripts", icon: Mic, enabled: true },
  { label: "Research", href: "/research", icon: Search, enabled: false },
  { label: "Brand", href: "/brand", icon: Target, enabled: false, adminOnly: true },
  { label: "Calendar", href: "/calendar", icon: Calendar, enabled: false },
  { label: "Performance", href: "/performance", icon: BarChart2, enabled: false },
  { label: "Chat", href: "/chat", icon: MessageSquare, enabled: true },
  { label: "Methodology", href: "/methodology", icon: Sliders, enabled: true },
  { label: "Off&On Pocket", href: "/pocket", icon: Zap, enabled: false },
  { label: "Learn", href: "/learn", icon: BookOpen, enabled: false },
  { label: "Admin", href: "/admin", icon: ShieldCheck, enabled: true, adminOnly: true },
  { label: "Master Bot", href: "/admin/master-bot", icon: Bot, enabled: true, adminOnly: true },
];

interface SidebarNavProps {
  isAdmin: boolean;
}

export function SidebarNav({ isAdmin }: SidebarNavProps) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className="flex-1 overflow-y-auto py-1.5">
      <p className="label-xs px-4 pb-2 pt-2">Navigation</p>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all ${
              active ? "sidebar-active" : "sidebar-item"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {!item.enabled ? (
              <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ background: "var(--oo-bg-hover)", color: "var(--oo-text-dim)" }}>
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
    <div className="px-3 pb-2 pt-3">
      <Link
        href="/chat"
        className="gold-btn-outline flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs"
      >
        <Plus className="size-3.5" />
        New chat
      </Link>
    </div>
  );
}
