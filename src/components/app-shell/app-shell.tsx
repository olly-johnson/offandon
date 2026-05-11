import { Sidebar } from "./sidebar";

interface AppShellProps {
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  children: React.ReactNode;
}

/**
 * Server component shell. The sidebar is server-rendered with the user
 * identity passed in (the route's layout reads auth and supplies it).
 * Active-link highlighting lives in the client SidebarNav inside.
 */
export function AppShell({ email, displayName, isAdmin, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar email={email} displayName={displayName} isAdmin={isAdmin} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
