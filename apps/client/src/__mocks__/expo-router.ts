const noop = () => {};

export const Stack = Object.assign(noop, { Screen: noop });
export const Redirect = noop;
export const Link = ({ children }: { children?: unknown }) => children ?? null;

export function useRouter() {
  return {
    push: noop,
    replace: noop,
    back: noop,
    setParams: noop,
    canGoBack: () => false,
  };
}

export function useLocalSearchParams() {
  return {};
}

export function usePathname() {
  return "/";
}
