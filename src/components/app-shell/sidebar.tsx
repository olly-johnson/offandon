import { signout } from "@/app/(app)/dashboard/actions";

import { NewChatButton, SidebarNav } from "./sidebar-nav";

interface SidebarProps {
  email: string;
  displayName: string | null;
}

export function Sidebar({ email, displayName }: SidebarProps) {
  const initial = (displayName ?? email).slice(0, 1).toUpperCase();
  const label = displayName ?? email.split("@")[0];

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          O
        </div>
        <span className="text-sm font-semibold tracking-tight">Off&amp;On OS</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        <NewChatButton />
        <SidebarNav />
      </div>

      <form action={signout} className="border-t border-border p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            {initial}
          </span>
          <span className="flex-1 truncate">{label}</span>
          <span className="text-xs text-muted-foreground">Sign out</span>
        </button>
      </form>
    </aside>
  );
}
