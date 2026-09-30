import { ImageResponse } from "next/og";

export const alt = "Fitness Asistanı | Spor Salonu Yönetim Yazılımı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Paylaşım görseli (1200x630): marka işareti + slogan; soyut altıgen deseni, fotoğraf yok. */
export default function OpenGraphGorseli() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#121316",
          color: "#F8F9FA",
          padding: "0 88px",
          gap: 64,
        }}
      >
        <svg width="280" height="280" viewBox="0 0 120 120">
          <rect width="120" height="120" rx="28" fill="#1A1C20" />
          <path d="M60 18 L95 38 V82 L60 102 L25 82 V38 Z" fill="#C8F53C" />
          <path d="M43 61 L55 73 L78 47" fill="none" stroke="#121316" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, color: "#94A3B8", letterSpacing: 4, textTransform: "uppercase" }}>Asistan Merkezi</div>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Fitness Asistanı</div>
          <div style={{ fontSize: 38, color: "#C8F53C", lineHeight: 1.25 }}>Salonunuzu tek ekrandan yönetin.</div>
          <div style={{ fontSize: 26, color: "#94A3B8" }}>Üyelik · Check-in · Cari · Kasa</div>
        </div>
      </div>
    ),
    size
  );
}
