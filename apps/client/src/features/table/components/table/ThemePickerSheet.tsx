import { View, Pressable, ScrollView, Image, Platform } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { usePreferencesStore } from "@/stores/preferences.store";
import { resolveBackground, resolvedToBodyStyle, applyAppPageBackgroundStyle, type SurfaceBackground } from "@/theme/backgrounds";
import { getBackgroundImageUrl } from "@/theme/backgrounds/getBackgroundImageUrl.web";
import { PROCEDURAL_CARD_BACK_PATTERNS } from "@/assets/cards/cardBackProcedural";
import {
  CARD_BACK_PACK_MANIFEST,
  CARD_FACE_PACK_MANIFEST,
  getCardFacePackById,
} from "@/assets/cards/packManifest";
import { CARD_FACE_PACKS, type CardBackPackId, type CardFacePackId } from "@/assets/cards/packs";
import { THEME_PACK_CONFIG } from "@/config/themePackConfig";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { BuiltinCardFace } from "./BuiltinCardFace";
import { CardBackPattern } from "./CardBackPatterns";
import { getCardBackSource, keyToRankSuit } from "./cardFaceAssets";
import { getFeltImageSource, FELT_IMAGE_PRESETS } from "./feltImages";
import type { FeltImageId } from "./feltImages";

type FeltPresetColor = { name: string; value: string };
type FeltPresetImage = { name: string; imageId: FeltImageId };
type FeltPreset = FeltPresetColor | FeltPresetImage;

const FELT_COLOR_PRESETS: ReadonlyArray<FeltPresetColor> = [
  { name: "Forest", value: "158 30% 14%" },
  { name: "Ocean", value: "217 30% 14%" },
  { name: "Blood", value: "0 30% 14%" },
  { name: "Void", value: "0 0% 5%" },
];

const FELT_PRESETS: ReadonlyArray<FeltPreset> = [...FELT_COLOR_PRESETS, ...FELT_IMAGE_PRESETS];

const withTapSound = (fn: () => void) => () => {
  emitSoundEvent("ui.tap");
  fn();
};

export type ThemePickerSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ThemePickerSheet({ visible, onClose }: ThemePickerSheetProps) {
  const {
    appBackground,
    feltBackground,
    feltColor,
    feltImageId,
    clearAppBackground,
    setAppBackgroundColor,
    setAppBackgroundImageId,
    clearFeltBackground,
    setFeltBackgroundColor,
    setFeltBackgroundImageId,
    cardBackPackId,
    cardBackPattern,
    setCardBackPackId,
    setCardBackPattern,
    cardFacePackId,
    setCardFacePackId,
    applyThemePack,
  } = usePreferencesStore();

  /** None is selected only when all three are null (never infer from a default color; gradient set => not None). */
  const isAppBackgroundNone =
    appBackground.color === null && appBackground.imageId === null && appBackground.gradient === null;
  const isFeltBackgroundNone =
    feltBackground.color === null && feltBackground.imageId === null && feltBackground.gradient === null;

  const applyWebAppBackgroundNow = (next: SurfaceBackground) => {
    if (Platform.OS !== "web") return;
    const resolved = resolveBackground(next, "app");
    const style = resolvedToBodyStyle(resolved, getBackgroundImageUrl);
    applyAppPageBackgroundStyle(style);
  };

  const onAppBackgroundColorPress = (value: string) => {
    applyWebAppBackgroundNow({ color: value, imageId: null, gradient: null });
    setAppBackgroundColor(value);
    if (Platform.OS === "web" && process.env.NODE_ENV !== "production") {
      console.log("[ThemePickerSheet] setAppBackgroundColor", value);
    }
  };

  const onAppBackgroundImagePress = (imageId: FeltImageId) => {
    applyWebAppBackgroundNow({ color: appBackground.color, imageId, gradient: null });
    setAppBackgroundImageId(imageId);
    if (Platform.OS === "web" && process.env.NODE_ENV !== "production") {
      console.log("[ThemePickerSheet] setAppBackgroundImageId", imageId);
    }
  };

  const onAppBackgroundClearPress = () => {
    applyWebAppBackgroundNow({ color: null, imageId: null, gradient: null });
    clearAppBackground();
  };

  const renderPackPreview = (packId: CardFacePackId, previewCardKeys: readonly string[]) => {
    const packMeta = getCardFacePackById(packId);
    if (!packMeta) {
      return <View className="w-full h-16 rounded-md border border-border-subtle bg-panel" />;
    }

    if (packMeta.source.type === "builtin") {
      const { variant } = packMeta.source;
      return (
        <View className="w-full h-16 rounded-md border border-border-subtle overflow-hidden bg-panel p-1">
          <View className="ui-row items-center justify-center gap-1">
            {previewCardKeys.map((key, index) => {
              const rs = keyToRankSuit(key);
              if (!rs) return <View key={`${packId}-${key}-${index}`} className="w-7 h-10 rounded-sm bg-panel-elevated border border-border-subtle" />;
              return (
                <View key={`${packId}-${key}-${index}`} className="w-7 h-10 rounded-sm overflow-hidden border border-border-subtle">
                  <BuiltinCardFace variant={variant} rank={rs.rank} suit={rs.suit} width={28} height={40} />
                </View>
              );
            })}
          </View>
        </View>
      );
    }

    const pack = CARD_FACE_PACKS[packId as keyof typeof CARD_FACE_PACKS];
    if (!pack) {
      return <View className="w-full h-16 rounded-md border border-border-subtle bg-panel" />;
    }

    return (
      <View className="w-full h-16 rounded-md border border-border-subtle overflow-hidden bg-panel p-1">
        <View className="ui-row items-center justify-center gap-1">
          {previewCardKeys.map((key, index) => {
            const source = pack[key as keyof typeof pack];
            if (source) {
              return (
                <View key={`${packId}-${key}-${index}`} className="w-7 h-10 rounded-sm overflow-hidden border border-border-subtle bg-card-face">
                  <Image source={source} style={{ width: 28, height: 40 }} resizeMode="contain" />
                </View>
              );
            }
            return <View key={`${packId}-${key}-${index}`} className="w-7 h-10 rounded-sm bg-panel-elevated border border-border-subtle" />;
          })}
        </View>
      </View>
    );
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Table Experience">
      <ScrollView className="flex-1 ui-p-stack-2" showsVerticalScrollIndicator={false}>
        <Text variant="label" className="mb-3">Presets</Text>
        <View className="ui-row-wrap gap-3 mb-8">
          {THEME_PACK_CONFIG.map((pack) => {
            const feltImgSource = pack.feltImageId ? getFeltImageSource(pack.feltImageId) : null;
            const isGradient = !feltImgSource && pack.feltMode === "gradient";
            const radial = pack.radialPreview;
            const previewStyle =
              feltImgSource
                ? undefined
                : Platform.OS === "web" && radial
                  ? { background: `radial-gradient(ellipse 92% 88% at 50% 50%, hsl(${radial[0]}) 0%, hsl(${radial[1]}) 50%, hsl(${radial[2]}) 100%)` }
                  : isGradient && Platform.OS === "web"
                    ? { background: `linear-gradient(180deg, hsl(${pack.colors[0]}), hsl(${pack.colors[1]}))` }
                    : { backgroundColor: `hsl(${pack.colors[0]})` };
            return (
              <Pressable
                key={pack.id}
                onPress={withTapSound(() => applyThemePack(pack.id))}
                className="ui-col items-center flex-1 min-w-[30%]"
              >
                <View className="w-full h-16 rounded-md border border-border-subtle overflow-hidden relative">
                  {feltImgSource ? (
                    <Image source={feltImgSource} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : (
                    <>
                      <View style={previewStyle} className="absolute inset-0" />
                      {isGradient && !radial && Platform.OS !== "web" && (
                        <View style={{ backgroundColor: `hsl(${pack.colors[1]})` }} className="absolute bottom-0 h-1/2 left-0 right-0" />
                      )}
                    </>
                  )}
                </View>
                <Text variant="muted" className="mt-1 text-center text-[11px] font-medium">{pack.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="h-px bg-border-subtle mb-6" />

        {/* BACKGROUND and FELT rows are separate so later felt-specific textures can be added without confusion. */}
        <Text variant="label" className="mb-3">Background</Text>
        <View className="ui-row gap-3 mb-6 flex-wrap">
          <Pressable
            key="none"
            onPress={withTapSound(onAppBackgroundClearPress)}
            className="ui-col items-center"
          >
            <View
              className={`w-12 h-12 rounded-full border-2 overflow-hidden ${isAppBackgroundNone ? "border-gold" : "border-transparent"}`}
              style={{ backgroundColor: "hsl(0 0% 12%)" }}
            />
            <Text variant="muted" className="mt-1 text-center text-[10px]">None</Text>
          </Pressable>
          {FELT_COLOR_PRESETS.map((p) => {
            const isSelected = !isAppBackgroundNone && appBackground.imageId === null && appBackground.gradient === null && appBackground.color === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={withTapSound(() => onAppBackgroundColorPress(p.value))}
                className="ui-col items-center"
              >
                <View
                  className={`w-12 h-12 rounded-full border-2 ${isSelected ? "border-gold" : "border-transparent"}`}
                  style={{ backgroundColor: `hsl(${p.value})` }}
                />
                <Text variant="muted" className="mt-1 text-center text-[10px]">{p.name}</Text>
              </Pressable>
            );
          })}
          {FELT_IMAGE_PRESETS.map((p) => {
            const isSelected = appBackground.imageId === p.imageId;
            const imgSource = getFeltImageSource(p.imageId);
            return (
              <Pressable
                key={p.imageId}
                onPress={withTapSound(() => onAppBackgroundImagePress(p.imageId))}
                className="ui-col items-center"
              >
                <View className={`w-12 h-12 rounded-full border-2 overflow-hidden ${isSelected ? "border-gold" : "border-transparent"}`}>
                  {imgSource ? (
                    <Image source={imgSource} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : (
                    <View className="w-full h-full bg-panel" />
                  )}
                </View>
                <Text variant="muted" className="mt-1 text-center text-[10px]">{p.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="h-px bg-border-subtle mb-6" />

        <Text variant="label" className="mb-3">Felt Color</Text>
        <View className="ui-row gap-3 mb-8 flex-wrap">
          <Pressable
            key="felt-none"
            onPress={withTapSound(clearFeltBackground)}
            className="ui-col items-center"
          >
            <View
              className={`w-12 h-12 rounded-full border-2 ${isFeltBackgroundNone ? "border-gold" : "border-transparent"}`}
              style={{ backgroundColor: "hsl(0 0% 12%)" }}
            />
            <Text variant="muted" className="mt-1 text-center text-[10px]">None</Text>
          </Pressable>
          {FELT_PRESETS.map((p) => {
            const isColor = "value" in p;
            const key = isColor ? p.value : p.imageId;
            const isSelected = isColor ? feltBackground.color === p.value : feltBackground.imageId === p.imageId;
            if (isColor) {
              return (
                <Pressable
                  key={key}
                  onPress={withTapSound(() => setFeltBackgroundColor(p.value))}
                  className="ui-col items-center"
                >
                  <View
                    className={`w-12 h-12 rounded-full border-2 ${isSelected ? "border-gold" : "border-transparent"}`}
                    style={{ backgroundColor: `hsl(${p.value})` }}
                  />
                  <Text variant="muted" className="mt-1 text-center text-[10px]">{p.name}</Text>
                </Pressable>
              );
            }
            const imgSource = getFeltImageSource(p.imageId);
            return (
              <Pressable
                key={key}
                onPress={withTapSound(() => setFeltBackgroundImageId(p.imageId))}
                className="ui-col items-center"
              >
                <View className={`w-12 h-12 rounded-full border-2 overflow-hidden ${isSelected ? "border-gold" : "border-transparent"}`}>
                  {imgSource ? (
                    <Image source={imgSource} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : (
                    <View className="w-full h-full bg-panel" />
                  )}
                </View>
                <Text variant="muted" className="mt-1 text-center text-[10px]">{p.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="h-px bg-border-subtle mb-6" />

        <Text variant="label" className="mb-3">Card Faces</Text>
        <View className="ui-row-wrap gap-3 mb-8">
          {CARD_FACE_PACK_MANIFEST.map((pack) => {
            const packId = pack.id as CardFacePackId;
            const isSelected = cardFacePackId === packId;
            return (
              <Pressable
                key={pack.id}
                onPress={withTapSound(() => setCardFacePackId(packId))}
                className="ui-col items-center flex-1 min-w-[46%]"
              >
                <View className={`w-full rounded-md ${isSelected ? "border-2 border-gold" : "border border-border-subtle"} overflow-hidden`}>
                  {renderPackPreview(packId, pack.previewCardKeys)}
                </View>
                <Text variant="muted" className="mt-1 text-center text-[11px] font-medium">{pack.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text variant="label" className="mb-3">Card Back Pattern</Text>
        <View className="ui-row mb-4 align-center">
          {PROCEDURAL_CARD_BACK_PATTERNS.map((pattern) => {
            const isSelected = cardBackPackId === null && cardBackPattern === pattern.id;
            return (
              <Pressable
                key={pattern.id}
                onPress={withTapSound(() => {
                  setCardBackPackId(null);
                  setCardBackPattern(pattern.id);
                })}
                className="ui-col items-center flex-1 min-w-[18%]"
              >
                <View className={`border-2 ${isSelected ? "border-gold" : "border-transparent"}`}>
                  <CardBackPattern
                    pattern={pattern.id}
                    backgroundHsl={pattern.background}
                    patternHsl={pattern.pattern}
                    width={48}
                    height={64}
                  />
                </View>
                <Text variant="muted" numberOfLines={1} className="mt-1 text-center text-[10px]">{pattern.icon} {pattern.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {CARD_BACK_PACK_MANIFEST.length > 0 && (
          <View className="ui-row mb-8 align-center flex-wrap gap-2">
            {CARD_BACK_PACK_MANIFEST.map((backPack) => {
              const id = backPack.id as CardBackPackId;
              const source = getCardBackSource(id);
              const isSelected = cardBackPackId === id;
              return (
                <Pressable
                  key={backPack.id}
                  onPress={withTapSound(() => setCardBackPackId(id))}
                  className="ui-col items-center min-w-[18%]"
                >
                  <View className={`border-2 rounded-card overflow-hidden ${isSelected ? "border-gold" : "border-transparent"}`}>
                    {source ? (
                      <Image source={source} style={{ width: 48, height: 64 }} resizeMode="contain" />
                    ) : (
                      <View className="w-12 h-16 bg-panel border border-border-subtle rounded-card" />
                    )}
                  </View>
                  <Text variant="muted" numberOfLines={1} className="mt-1 text-center text-[10px]">{backPack.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ModalSheet>
  );
}
