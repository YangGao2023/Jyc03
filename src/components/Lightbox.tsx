"use client";

import { useState, useEffect, useCallback } from "react";

interface LightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  const prev = useCallback(() => {
    setIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setIndex((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl z-10"
        onClick={onClose}
      >
        ✕
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
        {index + 1} / {images.length}
      </div>

      {/* Prev */}
      <button
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl z-10"
        onClick={(e) => { e.stopPropagation(); prev(); }}
      >
        ‹
      </button>

      {/* Image */}
      <img
        src={images[index]}
        alt={`Photo ${index + 1}`}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      <button
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl z-10"
        onClick={(e) => { e.stopPropagation(); next(); }}
      >
        ›
      </button>
    </div>
  );
}