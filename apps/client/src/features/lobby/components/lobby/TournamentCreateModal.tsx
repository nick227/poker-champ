import { ScrollView } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { TournamentCreateForm } from "@/features/tournaments/components/TournamentCreateForm";
import { TOURNAMENT } from "@/constants/copy";

type TournamentCreateModalProps = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
};

export function TournamentCreateModal({ visible, onClose, onCreated }: TournamentCreateModalProps) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title={TOURNAMENT.create} heightFraction={0.92}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        <TournamentCreateForm
          showBotPreset={false}
          onCreated={async () => {
            await onCreated?.();
            onClose();
          }}
        />
      </ScrollView>
    </ModalSheet>
  );
}
