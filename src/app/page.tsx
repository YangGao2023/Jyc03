const products = [
  {
    label: "防盗门",
    labelEn: "DOOR",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    route: "door",
  },
  {
    label: "防盗窗",
    labelEn: "WINDOW GUARD",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&q=80",
    route: "window",
  },
  {
    label: "车道门",
    labelEn: "DRIVEWAY GATE",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    route: "gate",
  },
  {
    label: "围栏",
    labelEn: "FENCE",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&q=80",
    route: "fence",
  },
  {
    label: "室外栏杆",
    labelEn: "OUTDOOR RAIL",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    route: "outdoor",
  },
  {
    label: "室内栏杆",
    labelEn: "INDOOR RAIL",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&q=80",
    route: "indoor",
  },
  {
    label: "雨棚",
    labelEn: "RAIN ROOF",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    route: "awning",
  },
  {
    label: "楼梯",
    labelEn: "STAIR",
    category: "IRONWORK",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&q=80",
    route: "stair",
  },
];

const features = [
  { icon: "🔧", title: "Hot-Dip Galvanized", desc: "Premium rust-proof coating" },
  { icon: "📐", title: "Custom Fit", desc: "Tailored to your exact specs" },
  { icon: "📍", title: "Local NY Service", desc: "Serving the NY metro area" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-yellow-400">JYC NYC · Showroom</p>
          <h1 className="text-xl font-bold tracking-tight">JYC STEEL GROUP INC</h1>
        </div>
        <a
          href="/login"
          className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
        >
          <span>Admin</span>
          <span>↗</span>
        </a>
      </header>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 px-6 py-3 text-center text-sm font-medium text-black">
        🔔 Welcome to JYC STEEL — Custom Ironwork in New York
      </div>

      {/* Tab Bar */}
      <div className="flex gap-8 border-b border-white/10 px-6 py-3 text-sm">
        {["铁艺", "不锈钢", "完工实拍"].map((tab, i) => (
          <button
            key={tab}
            className={`pb-1 transition ${
              i === 0
                ? "border-b-2 border-yellow-400 text-yellow-400"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Features Bar */}
      <div className="flex justify-center gap-12 bg-[#1a1a1a] px-6 py-4">
        {features.map((f) => (
          <div key={f.title} className="flex items-center gap-3 text-sm">
            <span className="text-xl">{f.icon}</span>
            <div>
              <p className="font-medium text-white">{f.title}</p>
              <p className="text-xs text-white/50">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Category Grid */}
      <section className="px-6 py-10">
        <h2 className="mb-6 text-center text-sm uppercase tracking-widest text-white/40">
          Select a category to browse
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {products.map((p) => (
            <a
              key={p.label}
              href={`/gallery/${p.route}`}
              className="group block cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-yellow-400/40 hover:bg-white/10"
            >
              <div className="aspect-square overflow-hidden bg-neutral-800">
                <img
                  src={p.image}
                  alt={p.label}
                  className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                />
              </div>
              <div className="border-t border-white/10 p-3">
                <p className="text-sm font-bold text-yellow-400">{p.label}</p>
                <p className="mt-0.5 text-xs text-white/50">{p.labelEn}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6 text-center text-xs text-white/30">
        <p>34-41 College Point Blvd, Flushing, NY 11354 · (917) 000-0000</p>
        <p className="mt-1">JYC STEEL GROUP INC · Est. New York</p>
      </footer>
    </main>
  );
}