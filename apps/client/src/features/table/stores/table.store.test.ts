import { describe, it, expect, beforeEach } from 'vitest';
import type { TableSnapshotPayload } from '@poker-champ/realtime-contract';
import { useTableStore } from '@/features/table/stores/table.store';
import { getHeroStackCents } from "@/features/table/components/table/table.adapter";

describe('Table Store - Snapshot Sequence Validation', () => {
  beforeEach(() => {
    // Reset store state before each test
    useTableStore.setState({
      snapshotsByTableId: {},
      lastSeqByTableId: {},
      statusByTableId: {},
      errorByTableId: {},
    });
  });

  const createMockSnapshot = (seq: number, tableId = 'table1'): TableSnapshotPayload => ({
    version: 1,
    snapshotId: `snap-${seq}`,
    snapshotSeq: seq,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: `hash-${seq}`,
    reason: 'ACTION_ACCEPTED',
    table: {
      tableId,
      tableName: 'Test Table',
      visibility: 'PUBLIC',
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
      showStats: true,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: 'user1',
        name: 'Hero',
        stackCents: 2500,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: 'ACTIVE',
        isToAct: false,
        isBot: false,
      },
    ],
    hero: {
      userId: 'user1',
      youAreSeated: true,
      seat: 0,
    },
  });

  it('should accept first snapshot', () => {
    const snapshot = createMockSnapshot(1);
    const store = useTableStore.getState();
    
    store.setSnapshot('table1', snapshot);
    
    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(snapshot);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(1);
  });

  it('should accept snapshots in increasing order', () => {
    const store = useTableStore.getState();
    const snapshot1 = createMockSnapshot(1);
    const snapshot2 = createMockSnapshot(2);
    
    store.setSnapshot('table1', snapshot1);
    store.setSnapshot('table1', snapshot2);
    
    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(snapshot2);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(2);
  });

  it('should reject out-of-order snapshots', () => {
    const store = useTableStore.getState();
    const snapshot1 = createMockSnapshot(1);
    const snapshot3 = createMockSnapshot(3);
    const snapshot2 = createMockSnapshot(2);
    
    store.setSnapshot('table1', snapshot1);
    store.setSnapshot('table1', snapshot3);
    store.setSnapshot('table1', snapshot2); // Should be rejected
    
    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(snapshot3);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(3);
  });

  it('should reject duplicate snapshots', () => {
    const store = useTableStore.getState();
    const snapshot1 = createMockSnapshot(1);
    const snapshot1Duplicate = createMockSnapshot(1);
    
    store.setSnapshot('table1', snapshot1);
    store.setSnapshot('table1', snapshot1Duplicate); // Should be rejected
    
    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(snapshot1);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(1);
  });

  it('should handle multiple tables independently', () => {
    const store = useTableStore.getState();
    const table1Snapshot1 = createMockSnapshot(1, 'table1');
    const table1Snapshot2 = createMockSnapshot(2, 'table1');
    const table2Snapshot1 = createMockSnapshot(1, 'table2');
    const table2Snapshot3 = createMockSnapshot(3, 'table2');
    
    store.setSnapshot('table1', table1Snapshot1);
    store.setSnapshot('table2', table2Snapshot1);
    store.setSnapshot('table1', table1Snapshot2);
    store.setSnapshot('table2', table2Snapshot3);
    
    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(table1Snapshot2);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(2);
    expect(useTableStore.getState().snapshotsByTableId['table2']).toEqual(table2Snapshot3);
    expect(useTableStore.getState().lastSeqByTableId['table2']).toBe(3);
  });

  it('should clear table including sequence tracking', () => {
    const store = useTableStore.getState();
    const snapshot = createMockSnapshot(1);
    
    store.setSnapshot('table1', snapshot);
    expect(useTableStore.getState().snapshotsByTableId['table1']).toBeDefined();
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(1);
    
    store.clearTable('table1');
    expect(useTableStore.getState().snapshotsByTableId['table1']).toBeUndefined();
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBeUndefined();
  });

  it('should accept seq=1 when stream restarts after higher sequence', () => {
    const store = useTableStore.getState();
    const snapshot2 = createMockSnapshot(2);
    const snapshot3 = createMockSnapshot(3);
    const restartedSnapshot1 = createMockSnapshot(1);

    store.setSnapshot('table1', snapshot2);
    store.setSnapshot('table1', snapshot3);
    store.setSnapshot('table1', restartedSnapshot1);

    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(restartedSnapshot1);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(1);
  });

  it('should accept seq=1 after explicit stream reset (WELCOME NEW behavior)', () => {
    const store = useTableStore.getState();
    const snapshot5 = createMockSnapshot(5);
    const restartedSnapshot1 = createMockSnapshot(1);

    store.setSnapshot('table1', snapshot5);
    store.resetSnapshotStream('table1');
    store.setSnapshot('table1', restartedSnapshot1);

    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(restartedSnapshot1);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(1);
  });

  it('should recover from stale cursor on WELCOME NEW flow', () => {
    const store = useTableStore.getState();
    const staleSeq5 = createMockSnapshot(5);
    const freshSeq1 = createMockSnapshot(1);

    store.setSnapshot('table1', staleSeq5);
    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(5);

    // Simulates useTableRealtime handling WELCOME { joinMode: "NEW" }.
    store.resetSnapshotStream('table1');
    store.setSnapshot('table1', freshSeq1);

    expect(useTableStore.getState().lastSeqByTableId['table1']).toBe(1);
    expect(useTableStore.getState().snapshotsByTableId['table1']).toEqual(freshSeq1);
  });

  it('should keep hero stack non-zero across stream restart with missing hero.seat', () => {
    const store = useTableStore.getState();
    const staleSeq5 = createMockSnapshot(5);
    const freshSeq1: TableSnapshotPayload = {
      ...createMockSnapshot(1),
      hero: {
        userId: 'user1',
        youAreSeated: true,
        seat: undefined,
      },
    };

    store.setSnapshot('table1', staleSeq5);
    store.resetSnapshotStream('table1');
    store.setSnapshot('table1', freshSeq1);

    const latest = useTableStore.getState().snapshotsByTableId['table1'];
    expect(latest).toEqual(freshSeq1);
    expect(getHeroStackCents(latest!)).toBe(2500);
  });
});

