// Skeleton shown while an app page loads its data: same rhythm as a real page
// (title, stat row, two panels) so nothing jumps when content arrives.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <div className="app-skeleton h-9 w-64 rounded-lg" />
        <div className="app-skeleton h-4 w-96 max-w-full rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="app-skeleton h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="app-skeleton h-72 rounded-xl" />
        <div className="app-skeleton h-72 rounded-xl" />
      </div>
    </div>
  );
}
