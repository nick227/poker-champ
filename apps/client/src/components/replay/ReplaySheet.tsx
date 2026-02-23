import { ScrollView } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { ReplayContent } from "./ReplayContent";
import type { ReplaySource } from "./replay.types";

interface ReplaySheetProps {
  visible: boolean;
  source: ReplaySource | null;
  onClose: () => void;
}

/**
 * Container: sheet that shows replay. Container controls height (ModalSheet max-h-[80%]).
 * ReplayContent/ReplaySurface do not use flex:1 on root.
 */
export function ReplaySheet({ visible, source, onClose }: ReplaySheetProps) {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Replay"
    >
      {source ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={true}
        >
          <ReplayContent source={source} onClose={onClose} />
        </ScrollView>
      ) : null}
    </ModalSheet>
  );
}
