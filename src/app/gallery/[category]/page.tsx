"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Lightbox from "../../../components/Lightbox";

const CATEGORIES: Record<string, { label: string; labelEn: string; images: string[] }> = {
  door: {
    label: "防盗门",
    labelEn: "DOOR",
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      "https://images.unsplash.com/photo-1600585154526-990dced4db3d?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      "https://images.unsplash.com/photo-1600585154526-990dced4db3d?w=800&q=80",
    ],
  },
  window: {
    label: "防盗窗",
    labelEn: "WINDOW GUARD",
    images: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
  gate: {
    label: "车道门",
    labelEn: "DRIVEWAY GATE",
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      "https://images.unsplash.com/photo-1600585154526-990dced4db3d?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
  fence: {
    label: "围栏",
    labelEn: "FENCE",
    images: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
  outdoor: {
    label: "室外栏杆",
    labelEn: "OUTDOOR RAIL",
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80",
    ],
  },
  indoor: {
    label: "室内栏杆",
    labelEn: "INDOOR RAIL",
    images: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
  awning: {
    label: "雨棚",
    labelEn: "RAIN ROOF",
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
  stair: {
    label: "楼梯",
    labelEn: "STAIR",
    images: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
};

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const category = typeof params.category === "string" ? params.category : "";
  const data = CATEGORIES[category];
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!data) {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
        <p className="text-white/40">分类不存在</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
        <button
          onClick={() => router.back()}
          className="text-white/60 hover:text-white text-2xl"
        >
          ←
        </button>
        <div>
          <p className="text-xs uppercase tracking-widest text-yellow-400">{data.labelEn}</p>
          <h1 className="text-xl font-bold">{data.label}</h1>
        </div>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-3">
        {data.images.map((src, i) => (
          <div
            key={i}
            className="aspect-square cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-yellow-400/40"
            onClick={() => setLightboxIndex(i)}
          >
            <img
              src={src}
              alt={`${data.label} ${i + 1}`}
              className="h-full w-full object-cover hover:scale-105 transition"
            />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={data.images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </main>
  );
}