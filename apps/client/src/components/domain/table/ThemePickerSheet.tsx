import { View, Pressable, ScrollView, Image } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { usePreferencesStore } from "@/stores/preferences.store";
import { CARD_FACE_PACK_MANIFEST, getCardFacePackById } from "@/assets/cards/packManifest";
import { CARD_FACE_PACKS, type CardFacePackId } from "@/assets/cards/packs";
import { BuiltinCardFace } from "./BuiltinCardFace";
import { CardBackPattern } from "./CardBackPatterns";
import { keyToRankSuit } from "./cardFaceAssets";

const THEME_PACKS = [
  { id: "default", name: "Royal Casino", colors: ["158 30% 14%", "42 82% 50%"] },
  { id: "monokai", name: "Monokai", colors: ["70 8% 15%", "340 70% 56%"] },
  { id: "zen", name: "Zen Mode", colors: ["0 0% 12%", "0 0% 80%"] },
  { id: "mono", name: "Mono Mode", colors: ["0 0% 100%", "0 0% 0%"] },
  { id: "back-alley", name: "Back Alley", colors: ["0 0% 5%", "0 80% 50%"] },
  { id: "cyber", name: "Cyberpunk", colors: ["280 40% 10%", "300 100% 50%"] },
] as const;

const FELT_PRESETS = [
  { name: "Forest", value: "158 30% 14%" },
  { name: "Ocean", value: "217 30% 14%" },
  { name: "Blood", value: "0 30% 14%" },
  { name: "Void", value: "0 0% 5%" },
];

const CARD_BACK_PATTERNS = [
  { id: "classic" as const, name: "Classic", icon: "♦" },
  { id: "geometric" as const, name: "Geometric", icon: "▲" },
  { id: "ornate" as const, name: "Ornate", icon: "✦" },
  { id: "minimal" as const, name: "Minimal", icon: "■" },
  { id: "gradient" as const, name: "Gradient", icon: "▬" },
];

export type ThemePickerSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ThemePickerSheet({ visible, onClose }: ThemePickerSheetProps) {
  const {
    feltColor,
    setFeltColor,
    cardBackPattern,
    setCardBackPattern,
    cardBackHue,
    cardBackSaturation,
    cardBackLightness,
    cardFacePackId,
    setCardFacePackId,
    applyThemePack,
  } = usePreferencesStore();

  const cardFacePackOptions = CARD_FACE_PACK_MANIFEST;

  const renderPackPreview = (packId: CardFacePackId, previewCardKeys: readonly string[]) => {
    const packMeta = getCardFacePackById(packId);
    if (!packMeta) {
      return <View className="w-full h-16 rounded-md border border-border-subtle bg-panel" />;
    }

    if (packMeta.source.type === "builtin") {
      const variant = packMeta.source.variant;
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
      <ScrollView className="ui-p-stack-2" showsVerticalScrollIndicator={false}>
        <Text variant="label" className="mb-3">Presets</Text>
        <View className="ui-row-wrap gap-3 mb-8">
          {THEME_PACKS.map((pack) => (
            <Pressable key={pack.id} onPress={() => applyThemePack(pack.id)} className="ui-col items-center flex-1 min-w-[30%]">
              <View className="w-full h-16 rounded-md border border-border-subtle overflow-hidden relative">
                <View style={{ backgroundColor: `hsl(${pack.colors[0]})` }} className="absolute inset-0" />
                <View style={{ backgroundColor: `hsl(${pack.colors[1]})` }} className="absolute bottom-0 h-2 left-0 right-0 opacity-80" />
              </View>
              <Text variant="muted" className="mt-1 text-center text-[11px] font-medium">{pack.name}</Text>
            </Pressable>
          ))}
        </View>

        <View className="h-px bg-border-subtle mb-6" />

        <Text variant="label" className="mb-3">Card Faces</Text>
        <View className="ui-row-wrap gap-3 mb-8">
          {cardFacePackOptions.map((pack) => {
            const packId = pack.id as CardFacePackId;
            const isSelected = cardFacePackId === packId;
            return (
              <Pressable
                key={pack.id}
                onPress={() => setCardFacePackId(packId)}
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

        <View className="h-px bg-border-subtle mb-6" />

        <Text variant="label" className="mb-3">Felt Color</Text>
        <View className="ui-row gap-3 mb-8">
          {FELT_PRESETS.map((p) => (
            <Pressable key={p.value} onPress={() => setFeltColor(p.value)} className="ui-col items-center">
              <View
                className={`w-12 h-12 rounded-full border-2 ${feltColor === p.value ? "border-gold" : "border-transparent"}`}
                style={{ backgroundColor: `hsl(${p.value})` }}
              />
              <Text variant="muted" className="mt-1 text-center text-[10px]">{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text variant="label" className="mb-3">Card Back Pattern</Text>
        <View className="ui-row mb-8 align-center">
          {CARD_BACK_PATTERNS.map((pattern) => (
            <Pressable key={pattern.id} onPress={() => setCardBackPattern(pattern.id)} className="ui-col items-center flex-1 min-w-[20%]">
              <View className={`border-2 ${cardBackPattern === pattern.id ? "border-gold" : "border-transparent"}`}>
                <CardBackPattern
                  pattern={pattern.id}
                  hue={cardBackHue}
                  saturation={cardBackSaturation}
                  lightness={cardBackLightness}
                  width={48}
                  height={64}
                />
              </View>
              <Text variant="muted" numberOfLines={1} className="mt-1 text-center text-[10px]">{pattern.icon} {pattern.name}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ModalSheet>
  );
}
