import React from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import type { CardBackPatternId } from "@/assets/cards/cardBackProcedural";

/** Parse "H S% L%" and return HSL components. */
function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const m = hsl.trim().match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  if (!m) return { h: 0, s: 0, l: 22 };
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function toHslCss(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function derivePatternColors(patternHsl: string): { lighter: string; darker: string } {
  const { h, s, l } = parseHsl(patternHsl);
  return {
    lighter: toHslCss(h, s, Math.min(100, l + 15)),
    darker: toHslCss(h, s, Math.max(0, l - 10)),
  };
}

interface CardBackPatternProps {
  pattern: CardBackPatternId;
  backgroundHsl: string;
  patternHsl: string;
  width: number;
  height: number;
}

export function CardBackPattern({
  pattern,
  backgroundHsl,
  patternHsl,
  width,
  height,
}: CardBackPatternProps) {
  const baseColor = `hsl(${backgroundHsl})`;
  const { lighter: lighterColor, darker: darkerColor } = derivePatternColors(patternHsl);

  switch (pattern) {
    case "classic":
      return (
        <View 
          style={[
            vars({
              "--pattern-base": baseColor,
              "--pattern-light": lighterColor,
              "--pattern-dark": darkerColor,
            }),
            { 
              width: width, 
              height: height,
              backgroundColor: baseColor
            }
          ]}
          className="rounded-card border border-border-subtle"
        >
          {/* Classic diamond pattern */}
          <View className="flex-1 justify-center items-center">
            <View className="relative w-full h-full">
              {/* Center diamond */}
              <View 
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45"
                style={{ 
                  width: width * 0.3, 
                  height: width * 0.3,
                  backgroundColor: "var(--pattern-light)"
                }}
              />
              {/* Corner diamonds */}
              <View 
                className="absolute top-1/4 left-1/4 transform rotate-45"
                style={{ 
                  width: width * 0.15, 
                  height: width * 0.15,
                  backgroundColor: "var(--pattern-dark)"
                }}
              />
              <View 
                className="absolute top-1/4 right-1/4 transform rotate-45"
                style={{ 
                  width: width * 0.15, 
                  height: width * 0.15,
                  backgroundColor: "var(--pattern-dark)"
                }}
              />
              <View 
                className="absolute bottom-1/4 left-1/4 transform rotate-45"
                style={{ 
                  width: width * 0.15, 
                  height: width * 0.15,
                  backgroundColor: "var(--pattern-dark)"
                }}
              />
              <View 
                className="absolute bottom-1/4 right-1/4 transform rotate-45"
                style={{ 
                  width: width * 0.15, 
                  height: width * 0.15,
                  backgroundColor: "var(--pattern-dark)"
                }}
              />
            </View>
          </View>
        </View>
      );

    case "geometric":
      return (
        <View 
          style={[
            vars({
              "--pattern-base": baseColor,
              "--pattern-light": lighterColor,
              "--pattern-dark": darkerColor,
            }),
            { 
              width: width, 
              height: height,
              backgroundColor: baseColor
            }
          ]}
          className="rounded-card border border-border-subtle"
        >
          {/* Geometric triangle pattern */}
          <View className="flex-1 justify-center items-center">
            <View className="relative w-full h-full">
              {/* Central hexagon using triangles */}
              <View 
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                style={{ 
                  width: 0, 
                  height: 0,
                  borderLeftWidth: width * 0.2,
                  borderRightWidth: width * 0.2,
                  borderBottomWidth: width * 0.35,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderBottomColor: "var(--pattern-light)"
                }}
              />
              {/* Surrounding triangles */}
              <View 
                className="absolute top-1/4 left-1/2 transform -translate-x-1/2"
                style={{ 
                  width: 0, 
                  height: 0,
                  borderLeftWidth: width * 0.1,
                  borderRightWidth: width * 0.1,
                  borderBottomWidth: width * 0.17,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderBottomColor: "var(--pattern-dark)"
                }}
              />
              <View 
                className="absolute bottom-1/4 left-1/2 transform -translate-x-1/2 rotate-180"
                style={{ 
                  width: 0, 
                  height: 0,
                  borderLeftWidth: width * 0.1,
                  borderRightWidth: width * 0.1,
                  borderBottomWidth: width * 0.17,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderBottomColor: "var(--pattern-dark)"
                }}
              />
            </View>
          </View>
        </View>
      );

    case "ornate":
      return (
        <View 
          style={[
            vars({
              "--pattern-base": baseColor,
              "--pattern-light": lighterColor,
              "--pattern-dark": darkerColor,
            }),
            { 
              width: width, 
              height: height,
              backgroundColor: baseColor
            }
          ]}
          className="rounded-card border border-border-subtle"
        >
          {/* Ornate circular pattern */}
          <View className="flex-1 justify-center items-center">
            <View className="relative w-full h-full">
              {/* Central circle */}
              <View 
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ 
                  width: width * 0.25, 
                  height: width * 0.25,
                  backgroundColor: "var(--pattern-light)"
                }}
              />
              {/* Ring of circles */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <View
                  key={angle}
                  className="absolute rounded-full"
                  style={{
                    width: width * 0.08,
                    height: width * 0.08,
                    backgroundColor: "var(--pattern-dark)",
                    top: "50%",
                    left: "50%",
                    transform: `
                      translate(-50%, -50%) 
                      rotate(${angle}deg) 
                      translateY(${width * 0.3}px)
                    `
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      );

    case "minimal":
      return (
        <View
          style={[
            vars({
              "--pattern-base": baseColor,
              "--pattern-light": lighterColor,
              "--pattern-dark": darkerColor,
            }),
            {
              width: width,
              height: height,
              backgroundColor: baseColor,
            },
          ]}
          className="rounded-card border border-border-subtle"
        >
          {/* Understated card back: a solid field, a thin inset frame, and a small centered
              diamond emblem — reads as "a card back" rather than a loading skeleton. */}
          <View className="flex-1 justify-center items-center">
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: height * 0.1,
                left: width * 0.1,
                right: width * 0.1,
                bottom: height * 0.1,
                borderWidth: 1.5,
                borderRadius: 4,
                borderColor: darkerColor,
                opacity: 0.7,
              }}
            />
            <View
              style={{
                width: width * 0.22,
                height: width * 0.22,
                backgroundColor: lighterColor,
                transform: [{ rotate: "45deg" }],
              }}
            />
          </View>
        </View>
      );

    case "gradient":
      return (
        <View 
          style={[
            vars({
              "--pattern-base": baseColor,
              "--pattern-light": lighterColor,
              "--pattern-dark": darkerColor,
            }),
            { 
              width: width, 
              height: height,
              backgroundColor: baseColor
            }
          ]}
          className="rounded-card border border-border-subtle"
        >
          {/* Gradient effect using layered rectangles */}
          <View className="flex-1 justify-center items-center">
            <View className="relative w-full h-full">
              {/* Create gradient effect with overlapping rectangles */}
              {(() => {
                const { h, s, l } = parseHsl(patternHsl);
                return [0, 1, 2, 3, 4, 5].map((index) => (
                  <View
                    key={index}
                    className="absolute left-0 right-0"
                    style={{
                      height: "20%",
                      backgroundColor: toHslCss(h, s, Math.max(0, l - index * 3)),
                      top: `${index * 16.67}%`,
                      opacity: 1 - index * 0.15,
                    }}
                  />
                ));
              })()}
              {/* Overlay pattern */}
              <View 
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                style={{ 
                  width: width * 0.4, 
                  height: width * 0.4,
                  backgroundColor: "var(--pattern-light)",
                  opacity: 0.3
                }}
              />
            </View>
          </View>
        </View>
      );

    default:
      return (
        <View 
          style={{ 
            width: width, 
            height: height,
            backgroundColor: baseColor 
          }}
          className="rounded-card border border-border-subtle"
        />
      );
  }
}
