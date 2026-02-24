export type Theme = {
  id: string;
  name: string;
  colors: {
    bg0: string; bg1: string;
    panel: string; panel2: string;
    border: string;
    text: string; textMuted: string;
    accent0: string; accent1: string;
    shadow: string;
  };
  gradients: {
    page: [string, string];
    frameWash: [string, string];
    button: [string, string];
    buttonDisabled: [string, string];
    chip: [string, string];
    banner: [string, string];
  };
  radii: { sm:number; md:number; lg:number; xl:number; };
  space: { xs:number; sm:number; md:number; lg:number; xl:number; };
  type: { weightBold: "700" | "800" | "900"; weightHeavy: "900"; trackingWide:number; };
};
