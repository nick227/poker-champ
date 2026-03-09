import { describe, it, expect, beforeEach } from 'vitest';
import { useTableStore } from '@/stores/table.store';

describe('Table Store - Connection Status Management', () => {
  beforeEach(() => {
    // Reset store state before each test
    useTableStore.setState({
      snapshotsByTableId: {},
      lastSeqByTableId: {},
      connectionStatusByTableId: {},
      statusByTableId: {},
      errorByTableId: {},
    });
  });

  it('should set initial connection status', () => {
    const store = useTableStore.getState();
    
    store.setConnectionStatus('table1', 'CONNECTED');
    
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBe('CONNECTED');
  });

  it('should update connection status to RECONNECTING', () => {
    const store = useTableStore.getState();
    
    store.setConnectionStatus('table1', 'CONNECTED');
    store.setConnectionStatus('table1', 'RECONNECTING');
    
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBe('RECONNECTING');
  });

  it('should update connection status to DISCONNECTED', () => {
    const store = useTableStore.getState();
    
    store.setConnectionStatus('table1', 'CONNECTED');
    store.setConnectionStatus('table1', 'DISCONNECTED');
    
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBe('DISCONNECTED');
  });

  it('should handle multiple tables with different connection statuses', () => {
    const store = useTableStore.getState();
    
    store.setConnectionStatus('table1', 'CONNECTED');
    store.setConnectionStatus('table2', 'RECONNECTING');
    store.setConnectionStatus('table3', 'DISCONNECTED');
    
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBe('CONNECTED');
    expect(useTableStore.getState().connectionStatusByTableId['table2']).toBe('RECONNECTING');
    expect(useTableStore.getState().connectionStatusByTableId['table3']).toBe('DISCONNECTED');
  });

  it('should clear connection status when clearing table', () => {
    const store = useTableStore.getState();
    
    store.setConnectionStatus('table1', 'CONNECTED');
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBe('CONNECTED');
    
    store.clearTable('table1');
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBeUndefined();
  });

  it('should preserve other tables when clearing one table', () => {
    const store = useTableStore.getState();
    
    store.setConnectionStatus('table1', 'CONNECTED');
    store.setConnectionStatus('table2', 'RECONNECTING');
    
    store.clearTable('table1');
    
    expect(useTableStore.getState().connectionStatusByTableId['table1']).toBeUndefined();
    expect(useTableStore.getState().connectionStatusByTableId['table2']).toBe('RECONNECTING');
  });
});
