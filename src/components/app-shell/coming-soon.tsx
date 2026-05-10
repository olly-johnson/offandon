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
        <div className="oo-card-static max-w-md p-8 text-center">
          <span className="gold-tag mb-4">Coming soon</span>
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ color: "var(--oo-text-primary)" }}
          >
            {title}
          </h2>
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            {blurb}
          </p>
        </div>
      </div>
    </>
  );
}
