import React from "react";
import { TOKENS_CSS } from "@/theme/tokens.web";

export default function Html({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Poker Champ</title>
        <style id="expo-reset" dangerouslySetInnerHTML={{ __html: TOKENS_CSS }} />
      </head>
      <body>
        <div id="root" style={{ display: "flex", flex: 1, height: "100%", margin: 0, minHeight: "100%" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
