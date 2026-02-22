/** Mock for vitest - expo-secure-store may pull in react-native */
export const getItemAsync = async (_key: string): Promise<string | null> => null;
export const setItemAsync = async (_key: string, _value: string): Promise<void> => {};
export const deleteItemAsync = async (_key: string): Promise<void> => {};
export default { getItemAsync, setItemAsync, deleteItemAsync };
