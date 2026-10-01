"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { telefonGoster } from "@/lib/utils";
import { type MusteriSecenegi, useMusteriAra } from "./ders-sorgulari";

/**
 * Yazarak müşteri arama (ad, telefon veya üye no): seçilince gizli input'a `musteri_id` yazılır.
 * Müşteri listesi istemciye topluca yüklenmez; arama sunucuda `musteri_ara` ile yapılır.
 */
export function MusteriArama({
  id,
  disabled,
  onSecim,
  onTemizle,
}: {
  id?: string;
  disabled?: boolean;
  onSecim: (musteri: MusteriSecenegi) => void;
  onTemizle: () => void;
}) {
  const [sorgu, setSorgu] = useState("");
  const [seciliId, setSeciliId] = useState("");
  const [acik, setAcik] = useState(false);
  const kapsayiciRef = useRef<HTMLDivElement>(null);
  const { veri: sonuclar, yukleniyor } = useMusteriAra(sorgu);

  useEffect(() => {
    function disariTiklandi(e: MouseEvent) {
      if (kapsayiciRef.current && !kapsayiciRef.current.contains(e.target as Node)) setAcik(false);
    }
    document.addEventListener("mousedown", disariTiklandi);
    return () => document.removeEventListener("mousedown", disariTiklandi);
  }, []);

  const yeterli = sorgu.trim().length >= 2;

  return (
    <div ref={kapsayiciRef} className="relative flex flex-col gap-2">
      <input type="hidden" name="musteri_id" value={seciliId} required />
      <Input
        id={id}
        value={sorgu}
        disabled={disabled}
        placeholder="Ad, telefon veya üye no yazın..."
        autoComplete="off"
        role="combobox"
        aria-expanded={acik}
        aria-autocomplete="list"
        onFocus={() => setAcik(true)}
        onChange={(e) => {
          setSorgu(e.target.value);
          if (seciliId) {
            setSeciliId("");
            onTemizle();
          }
          setAcik(true);
        }}
      />
      {acik && yeterli && !seciliId && (
        <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-z3">
          {yukleniyor || sonuclar === null ? (
            <p className="px-3 py-2 text-muted-foreground">Aranıyor…</p>
          ) : sonuclar.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">Eşleşen müşteri yok.</p>
          ) : (
            sonuclar.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
                onClick={() => {
                  setSorgu(m.ad_soyad);
                  setSeciliId(m.id);
                  setAcik(false);
                  onSecim(m);
                }}
              >
                <span className="truncate font-medium">{m.ad_soyad}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  #{m.uye_no} · {telefonGoster(m.telefon)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
