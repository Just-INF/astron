import type { MenuPalette } from "@/types";

export interface MenuPalettePreset {
  id: MenuPalette;
  label: string;
  colors: [string, string, string];
  note: string;
}

export const menuPalettePresets: MenuPalettePreset[] = [
  {
    id: "gold-dark",
    label: "Astron night",
    colors: ["#090d18", "#eef3ff", "#9ee1c3"],
    note: "Deep navy with a fresh mint accent",
  },
  {
    id: "emerald-light",
    label: "Verdant",
    colors: ["#eff5ef", "#132c20", "#19734c"],
    note: "Herb green with soft paper",
  },
  {
    id: "rose-terracotta",
    label: "Terracotta",
    colors: ["#fff4f0", "#35211e", "#ba573e"],
    note: "Warm clay with an editorial glow",
  },
  {
    id: "monochrome-classic",
    label: "Monochrome",
    colors: ["#ffffff", "#101218", "#101218"],
    note: "Classic black on bright paper",
  },
];
