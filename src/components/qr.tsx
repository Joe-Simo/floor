"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QR({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#1d1c1a", light: "#ffffff" } }).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [value, size]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt={label} className="rounded-lg" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-lg bg-paper" aria-hidden />
  );
}
