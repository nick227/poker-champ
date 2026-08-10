import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import type { InstantGamePresetId } from "@/features/lobby";
import {
  buildInstantCreateTableConfig,
  getInstantGamePreset,
} from "@/features/lobby";
import type { CreateGameConfig } from "@/features/lobby/components/lobby/CreateGameModal";
import { useJoiningTableState } from "@/hooks/useJoiningTableState";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import { loginPathWithNext, tablePath } from "@/lib/nav";
import { postCreateInstantGame, postCreateTable } from "@/services/post/lobby.post";
import { useToastStore } from "@/stores/toast.store";

type OpenTable = (
  tableId: string,
  opts?: { buyInCents?: number },
) => void;

type Params = {
  authToken: string | null;
  bankroll: number;
  openTable: OpenTable;
  setRoomForTable: (tableId: string, roomId: string) => void;
  setTableName: (tableId: string, name: string) => void;
  refresh: (opts?: { background?: boolean }) => Promise<unknown> | void;
};

/** Cash create / join / instant-game handlers for the lobby. */
export function useLobbyCashActions({
  authToken,
  bankroll,
  openTable,
  setRoomForTable,
  setTableName,
  refresh,
}: Params) {
  const router = useRouter();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [instantStartInFlightPreset, setInstantStartInFlightPreset] =
    useState<InstantGamePresetId | null>(null);
  const [chooseTableModal, setChooseTableModal] = useState<{
    id: string;
    name: string;
    roomId?: string;
    minBuyInCents: number;
    maxBuyInCents: number;
  } | null>(null);
  const { beginJoining, clearJoining, isJoining } = useJoiningTableState();

  const openCreateTable = useCallback(() => {
    if (!authToken) {
      router.push(loginPathWithNext("/lobby"));
      return;
    }
    setCreateModalVisible(true);
  }, [authToken, router]);

  const openJoinModal = useCallback(
    (t: LobbyTableRow) => {
      if (isJoining(t.id)) return;
      if (!authToken) {
        router.push(loginPathWithNext(tablePath(t.id, { buyInCents: t.minBuyInCents })));
        return;
      }
      setChooseTableModal({
        id: t.id,
        name: t.name,
        roomId: t.roomId,
        minBuyInCents: t.minBuyInCents,
        maxBuyInCents: t.maxBuyInCents,
      });
    },
    [authToken, isJoining, router],
  );

  const handleCreateGame = useCallback(
    async (config: CreateGameConfig) => {
      if (!authToken) {
        router.push(loginPathWithNext("/lobby"));
        return;
      }
      try {
        await postCreateTable(config);
        refresh();
      } catch (e) {
        useToastStore.getState().show((e as Error).message ?? "Failed to create game", "danger");
      }
    },
    [authToken, refresh, router],
  );

  const handleStartInstantGame = useCallback(
    async (presetId: InstantGamePresetId) => {
      if (!authToken) {
        router.push(loginPathWithNext("/lobby"));
        return;
      }
      if (instantStartInFlightPreset) return;
      const createConfig = buildInstantCreateTableConfig(presetId);
      const preset = getInstantGamePreset(presetId);
      if (bankroll < createConfig.minBuyInCents) {
        useToastStore
          .getState()
          .show(
            "Insufficient bankroll for instant game. Deposit or choose a lower-stakes table.",
            "danger",
          );
        return;
      }
      setInstantStartInFlightPreset(presetId);
      const unlockTimer = setTimeout(() => setInstantStartInFlightPreset(null), 15000);
      try {
        const created = await postCreateInstantGame({
          presetId,
          config: createConfig,
          targetBotCount: preset.targetBotCount,
        });
        const tableId = String((created as { tableId?: string })?.tableId ?? "");
        if (!tableId) throw new Error("Failed to create instant game");
        const createdRoomId =
          typeof (created as { roomId?: string }).roomId === "string"
            ? (created as { roomId: string }).roomId
            : "";
        if (createdRoomId) setRoomForTable(tableId, createdRoomId);
        setTableName(tableId, createConfig.name ?? presetId);
        openTable(tableId, { buyInCents: createConfig.minBuyInCents });
        router.push(tablePath(tableId, { buyInCents: createConfig.minBuyInCents }));
        refresh();
      } catch (e) {
        useToastStore
          .getState()
          .show((e as Error).message ?? "Failed to start instant game", "danger");
      } finally {
        clearTimeout(unlockTimer);
        setInstantStartInFlightPreset(null);
      }
    },
    [
      authToken,
      bankroll,
      instantStartInFlightPreset,
      openTable,
      refresh,
      router,
      setRoomForTable,
      setTableName,
    ],
  );

  const handleJoinApply = useCallback(
    (opts: { buyInCents: number }) => {
      if (!chooseTableModal) return;
      const targetTableId = chooseTableModal.id;
      beginJoining(targetTableId);
      try {
        if (chooseTableModal.roomId) setRoomForTable(targetTableId, chooseTableModal.roomId);
        setTableName(targetTableId, chooseTableModal.name);
        openTable(targetTableId, { buyInCents: opts.buyInCents });
        router.push(tablePath(targetTableId, { buyInCents: opts.buyInCents }));
        setChooseTableModal(null);
        clearJoining(targetTableId);
      } catch (e) {
        clearJoining(targetTableId);
        useToastStore.getState().show((e as Error).message ?? "Failed to join table", "danger");
      }
    },
    [beginJoining, chooseTableModal, clearJoining, openTable, router, setRoomForTable, setTableName],
  );

  return {
    createModalVisible,
    setCreateModalVisible,
    instantStartInFlightPreset,
    chooseTableModal,
    setChooseTableModal,
    isJoining,
    openCreateTable,
    openJoinModal,
    handleCreateGame,
    handleStartInstantGame,
    handleJoinApply,
  };
}
