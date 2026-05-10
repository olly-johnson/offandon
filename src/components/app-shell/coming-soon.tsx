import { Topbar } from "./topbar";

interface ComingSoonProps {
  title: string;
  blurb: string;
}

export function ComingSoon({ title, blurb }: ComingSoonProps) {
  return (
    <>
      <Topbar title={title} />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{blurb}</p>
          <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground">
            Coming soon
          </p>
        </div>
      </div>
    </>
  );
}
