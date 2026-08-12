import { ModalSheet } from "@/components/containers/ModalSheet";
import { HandHistorySection } from "@/components/domain/history/HandHistorySection";
import { useProfile } from "@/hooks/useProfile";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Table (and other) on-demand hand history: ModalSheet + shared HandHistorySection. */
export function HandHistorySheet({ visible, onClose }: Props) {
  const profile = useProfile();

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Hand History" heightFraction={0.88}>
      {visible ? <HandHistorySection currentUserId={profile.userId ?? ""} /> : null}
    </ModalSheet>
  );
}
