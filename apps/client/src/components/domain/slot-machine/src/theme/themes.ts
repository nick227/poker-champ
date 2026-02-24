import type { Theme } from "./types";

export const THEMES: Theme[] = [
  {
    id: "classic-gold",
    name: "Classic Gold",
    colors: {
      bg0: "#0b0b10",
      bg1: "#141420",
      panel: "rgba(0,0,0,0.28)",
      panel2: "rgba(0,0,0,0.40)",
      border: "rgba(255,255,255,0.12)",
      text: "rgba(255,255,255,0.94)",
      textMuted: "rgba(255,255,255,0.62)",
      accent0: "#ffdf6e",
      accent1: "#ff7a3c",
      shadow: "rgba(0,0,0,0.90)",
    },
    gradients: {
      page: ["#0b0b10", "#141420"],
      frameWash: ["rgba(255,120,60,0.14)", "rgba(120,80,255,0.10)"],
      button: ["#ffdf6e", "#ff7a3c"],
      buttonDisabled: ["#2a2a34", "#1a1a22"],
      chip: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"],
      banner: ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.02)"],
    },
    radii: { sm: 10, md: 14, lg: 18, xl: 22 },
    space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
    type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.5 },
  },
  {
    id: "neon-violet",
    name: "Neon Violet",
    colors: {
      bg0: "#070712",
      bg1: "#121026",
      panel: "rgba(0,0,0,0.22)",
      panel2: "rgba(0,0,0,0.38)",
      border: "rgba(255,255,255,0.14)",
      text: "rgba(255,255,255,0.94)",
      textMuted: "rgba(255,255,255,0.62)",
      accent0: "#a9fffb",
      accent1: "#8a5bff",
      shadow: "rgba(0,0,0,0.92)",
    },
    gradients: {
      page: ["#070712", "#121026"],
      frameWash: ["rgba(138,91,255,0.16)", "rgba(169,255,251,0.10)"],
      button: ["#a9fffb", "#8a5bff"],
      buttonDisabled: ["#252338", "#141224"],
      chip: ["rgba(255,255,255,0.16)", "rgba(255,255,255,0.05)"],
      banner: ["rgba(255,255,255,0.16)", "rgba(255,255,255,0.02)"],
    },
    radii: { sm: 10, md: 14, lg: 18, xl: 22 },
    space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
    type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.8 },
  },
  {
  id: "crimson-royale",
  name: "Crimson Royale",
  colors: {
    bg0: "#120708",
    bg1: "#1e0d10",
    panel: "rgba(0,0,0,0.28)",
    panel2: "rgba(0,0,0,0.42)",
    border: "rgba(255,255,255,0.12)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.60)",
    accent0: "#ff6b6b",
    accent1: "#ffd166",
    shadow: "rgba(0,0,0,0.92)",
  },
  gradients: {
    page: ["#120708", "#1e0d10"],
    frameWash: ["rgba(255,80,80,0.18)", "rgba(255,200,100,0.10)"],
    button: ["#ff6b6b", "#ffd166"],
    buttonDisabled: ["#2a1a1a", "#1a0f10"],
    chip: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"],
    banner: ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.02)"],
  },
  radii: { sm: 10, md: 14, lg: 18, xl: 22 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
  type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.6 },
},
{
  id: "sapphire-night",
  name: "Sapphire Night",
  colors: {
    bg0: "#070d16",
    bg1: "#0f1a2a",
    panel: "rgba(0,0,0,0.26)",
    panel2: "rgba(0,0,0,0.40)",
    border: "rgba(255,255,255,0.12)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.60)",
    accent0: "#4cc9f0",
    accent1: "#4361ee",
    shadow: "rgba(0,0,0,0.92)",
  },
  gradients: {
    page: ["#070d16", "#0f1a2a"],
    frameWash: ["rgba(76,201,240,0.16)", "rgba(67,97,238,0.12)"],
    button: ["#4cc9f0", "#4361ee"],
    buttonDisabled: ["#1c2330", "#10151e"],
    chip: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"],
    banner: ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.02)"],
  },
  radii: { sm: 10, md: 14, lg: 18, xl: 22 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
  type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.6 },
},
{
  id: "emerald-luxe",
  name: "Emerald Luxe",
  colors: {
    bg0: "#07120c",
    bg1: "#0e1f18",
    panel: "rgba(0,0,0,0.26)",
    panel2: "rgba(0,0,0,0.40)",
    border: "rgba(255,255,255,0.12)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.60)",
    accent0: "#2ecc71",
    accent1: "#a8ffbf",
    shadow: "rgba(0,0,0,0.92)",
  },
  gradients: {
    page: ["#07120c", "#0e1f18"],
    frameWash: ["rgba(46,204,113,0.16)", "rgba(168,255,191,0.10)"],
    button: ["#2ecc71", "#a8ffbf"],
    buttonDisabled: ["#1a2a22", "#0f1813"],
    chip: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"],
    banner: ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.02)"],
  },
  radii: { sm: 10, md: 14, lg: 18, xl: 22 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
  type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.6 },
},
{
  id: "gunmetal-chrome",
  name: "Gunmetal Chrome",
  colors: {
    bg0: "#0b0e12",
    bg1: "#161b22",
    panel: "rgba(0,0,0,0.30)",
    panel2: "rgba(0,0,0,0.44)",
    border: "rgba(255,255,255,0.14)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.58)",
    accent0: "#bfc7d5",
    accent1: "#6c7a91",
    shadow: "rgba(0,0,0,0.94)",
  },
  gradients: {
    page: ["#0b0e12", "#161b22"],
    frameWash: ["rgba(200,210,230,0.14)", "rgba(100,110,130,0.10)"],
    button: ["#bfc7d5", "#6c7a91"],
    buttonDisabled: ["#242830", "#161a20"],
    chip: ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.04)"],
    banner: ["rgba(255,255,255,0.16)", "rgba(255,255,255,0.02)"],
  },
  radii: { sm: 10, md: 14, lg: 18, xl: 22 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
  type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.4 },
},
{
  id: "cosmic-indigo",
  name: "Cosmic Indigo",
  colors: {
    bg0: "#080915",
    bg1: "#12132a",
    panel: "rgba(0,0,0,0.26)",
    panel2: "rgba(0,0,0,0.40)",
    border: "rgba(255,255,255,0.12)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.60)",
    accent0: "#9d4edd",
    accent1: "#5a7dff",
    shadow: "rgba(0,0,0,0.92)",
  },
  gradients: {
    page: ["#080915", "#12132a"],
    frameWash: ["rgba(157,78,221,0.16)", "rgba(90,125,255,0.12)"],
    button: ["#9d4edd", "#5a7dff"],
    buttonDisabled: ["#222238", "#141426"],
    chip: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"],
    banner: ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.02)"],
  },
  radii: { sm: 10, md: 14, lg: 18, xl: 22 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },
  type: { weightBold: "800", weightHeavy: "900", trackingWide: 3.7 },
},
{
  id: "minimal-mono",
  name: "Minimal Mono",
  colors: {
    bg0: "#e6e6e6",
    bg1: "#f2f2f2",
    panel: "rgba(255,255,255,0.92)",
    panel2: "rgba(255,255,255,0.98)",
    border: "rgba(0,0,0,0.35)",
    text: "#111111",
    textMuted: "rgba(0,0,0,0.55)",
    accent0: "#000000",
    accent1: "#333333",
    shadow: "rgba(0,0,0,0.25)",
  },
  gradients: {
    page: ["#e6e6e6", "#f2f2f2"],
    frameWash: [
      "rgba(0,0,0,0.04)",
      "rgba(0,0,0,0.00)"
    ],
    button: ["#000000", "#000000"],
    buttonDisabled: ["#bdbdbd", "#bdbdbd"],
    chip: [
      "rgba(0,0,0,0.05)",
      "rgba(0,0,0,0.02)"
    ],
    banner: [
      "rgba(255,255,255,0.95)",
      "rgba(255,255,255,0.95)"
    ],
  },
  radii: {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
  },
  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  type: {
    weightBold: "700",
    weightHeavy: "900",
    trackingWide: 2.5,
  },
},
{
  id: "poker-champ-dark",
  name: "Poker Champ Dark",

  colors: {
    // Base
    bg0: "#000000",
    bg1: "#0c0c0f",

    panel: "rgba(255,255,255,0.04)",
    panel2: "rgba(255,255,255,0.06)",

    border: "rgba(255,255,255,0.08)",

    text: "rgba(255,255,255,0.92)",
    textMuted: "rgba(255,255,255,0.55)",

    // Existing gold reused
    accent0: "#d4af37",   // gold border tone (reused style)
    accent1: "#a8892a",

    shadow: "rgba(0,0,0,0.9)",
  },

  gradients: {
    page: ["#000000", "#0c0c0f"],

    frameWash: [
      "rgba(212,175,55,0.08)",
      "rgba(0,0,0,0.00)"
    ],

    button: ["#4caf8a", "#3f9f7d"],

    buttonDisabled: [
      "rgba(255,255,255,0.08)",
      "rgba(255,255,255,0.05)"
    ],

    chip: [
      "rgba(255,255,255,0.08)",
      "rgba(255,255,255,0.03)"
    ],

    banner: [
      "rgba(212,175,55,0.10)",
      "rgba(255,255,255,0.02)"
    ],
  },

  radii: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },

  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },

  type: {
    weightBold: "800",
    weightHeavy: "900",
    trackingWide: 3.2,
  },
},
];
