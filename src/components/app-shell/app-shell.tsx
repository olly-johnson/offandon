import { Sidebar } from "./sidebar";

interface AppShellProps {
  email: string;
  displayName: string | null;
  children: React.ReactNode;
}

/**
 * Server component shell. The sidebar is server-rendered with the user
 * identity passed in (the route's layout reads auth and supplies it).
 * Active-link highlighting lives in the client SidebarNav inside.
 */
export function AppShell({ email, displayName, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar email={email} displayName={displayName} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
