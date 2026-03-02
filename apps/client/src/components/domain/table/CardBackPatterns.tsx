import React from "react";
import { View } from "react-native";
import { vars } from "nativewind";

export type CardBackPatternVariant = "classic" | "geometric" | "ornate" | "minimal" | "gradient";

interface CardBackPatternProps {
  pattern: CardBackPatternVariant;
  hue: number;
  saturation: number;
  lightness: number;
  width: number;
  height: number;
}

/** Fixed size so patterns align consistently */
const PATTERN_SIZE = 60;

export function CardBackPattern({ 
  pattern, 
  hue, 
  saturation, 
  lightness, 
  width,
  height,
}: CardBackPatternProps) {
  const baseColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const lighterColor = `hsl(${hue}, ${saturation}%, ${Math.min(100, lightness + 15)}%)`;
  const darkerColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness - 10)}%)`;

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
              backgroundColor: baseColor
            }
          ]}
          className="rounded-card border border-border-subtle"
        >
          {/* Minimal striped pattern */}
          <View className="flex-1 justify-center items-center">
            <View className="relative w-full h-full">
              {/* Horizontal stripes */}
              {[0, 1, 2, 3, 4].map((index) => (
                <View
                  key={index}
                  className="absolute left-0 right-0"
                  style={{
                    height: width * 0.08,
                    backgroundColor: index % 2 === 0 ? "var(--pattern-light)" : "var(--pattern-dark)",
                    top: `${15 + index * 15}%`
                  }}
                />
              ))}
            </View>
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
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <View
                  key={index}
                  className="absolute left-0 right-0"
                  style={{
                    height: "20%",
                    backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness - index * 3}%)`,
                    top: `${index * 16.67}%`,
                    opacity: 1 - index * 0.15
                  }}
                />
              ))}
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
