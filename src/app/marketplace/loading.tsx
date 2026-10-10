import { ListingGridSkeleton } from "@/components/listing-card";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <div className="skeleton mb-3 h-9 w-56" />
      <div className="skeleton mb-8 h-5 w-80" />
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="skeleton hidden h-[520px] rounded-2xl lg:block" />
        <ListingGridSkeleton count={9} />
      </div>
    </div>
  );
}
