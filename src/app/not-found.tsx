import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <div className="font-display text-8xl font-bold text-gradient">404</div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-white">This page changed hands… or never existed.</h1>
        <p className="mt-2 text-slate-400">The listing may have been sold, withdrawn, or the link is incorrect.</p>
        <div className="mt-8 flex justify-center gap-3">
          <LinkButton href="/marketplace">Browse marketplace</LinkButton>
          <LinkButton href="/" variant="secondary">Home</LinkButton>
        </div>
      </div>
    </div>
  );
}
