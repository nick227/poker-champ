import {
  forwardRef,
  type ComponentType,
  type ReactNode,
} from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { getSurfaceDefinition, type SurfaceStyleId } from "@/surfaces/surfaceRegistry";

type BaseProps = {
  styleId: SurfaceStyleId;
  className?: string;
  children?: ReactNode;
  // TODO: remove after P1 migration; use styleId/registry instead of ad-hoc overrides.
  unsafeStyle?: StyleProp<ViewStyle>;
};

export const Surface = forwardRef<any, any>(function SurfaceInner(props, ref) {
  const {
    as,
    styleId,
    className = "",
    unsafeStyle,
    children,
    ...rest
  } = props;
  const Component = (as ?? View) as ComponentType<any>;
  const def = getSurfaceDefinition(styleId as SurfaceStyleId);
  const mergedClassName = [def.className, className].filter(Boolean).join(" ");

  return (
    <Component ref={ref} className={mergedClassName} style={unsafeStyle} {...rest}>
      {children}
    </Component>
  );
});
