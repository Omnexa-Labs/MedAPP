'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from './ui';
interface Navigation {
  navigate: (path: string) => void;
  afterSave: (path: string) => void;
  ask: (action: () => void) => void;
  setDirty: (source: string, dirty: boolean) => void;
}
const Context = createContext<Navigation | null>(null);
export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dirty = useRef(new Set<string>());
  const [pending, setPending] = useState<(() => void) | null>(null);
  const setDirty = useCallback((source: string, value: boolean) => {
    if (value) dirty.current.add(source);
    else dirty.current.delete(source);
  }, []);
  const ask = useCallback((action: () => void) => {
    if (dirty.current.size) setPending(() => action);
    else action();
  }, []);
  const navigate = useCallback(
    (path: string) => ask(() => router.push(path)),
    [ask, router],
  );
  const afterSave = useCallback(
    (path: string) => {
      dirty.current.clear();
      router.push(path);
    },
    [router],
  );
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, []);
  return (
    <Context.Provider value={{ navigate, afterSave, ask, setDirty }}>
      {children}
      <ConfirmDialog
        open={Boolean(pending)}
        title="Leave without saving?"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending;
          setPending(null);
          dirty.current.clear();
          action?.();
        }}
        confirm="Leave without saving"
      >
        <p>
          Your unsaved changes will be lost. Your saved application will still
          be available.
        </p>
      </ConfirmDialog>
    </Context.Provider>
  );
}
export function useNavigation() {
  const value = useContext(Context);
  if (!value) throw new Error('Navigation provider missing');
  return value;
}
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useNavigation();
  const source = useId();
  useEffect(() => {
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty, source]);
}
export function AppLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const navigation = useNavigation();
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          navigation.navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}
