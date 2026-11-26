import { useCallback, useEffect, useRef, useState } from "react";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";

/**
 * Hook for persisting a boolean value to localStorage.
 * Syncs across components in the same window via a custom event,
 * and across windows via the native storage event.
 * @param storageKey - The key to use for localStorage
 * @param fallback - The default value if no stored value exists (defaults to false)
 * @returns A tuple of [value, setValue] similar to useState
 */
export interface UseStoredBooleanOptions {
    /**
     * While true, changes made elsewhere are remembered but do not re-render
     * this consumer; it catches up in the render that clears the flag. Lets a
     * hidden terminal pane ignore a shared UI toggle (search bar, compose bar)
     * instead of re-rendering every open tab on each click.
     */
    deferExternalUpdates?: boolean;
}

export const useStoredBoolean = (
    storageKey: string,
    fallback: boolean = false,
    options?: UseStoredBooleanOptions,
) => {
    const deferExternalUpdates = options?.deferExternalUpdates === true;
    const deferExternalUpdatesRef = useRef(deferExternalUpdates);
    deferExternalUpdatesRef.current = deferExternalUpdates;
    const [value, setValue] = useState<boolean>(() => {
        const stored = localStorageAdapter.readBoolean(storageKey);
        return stored ?? fallback;
    });
    const valueRef = useRef(value);

    const setAndPersist = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        // Resolve functional updates before scheduling React state. The updater
        // must stay pure because React may evaluate it while rendering.
        const resolved = typeof next === "function" ? next(valueRef.current) : next;
        valueRef.current = resolved;
        setValue(resolved);
        localStorageAdapter.writeBoolean(storageKey, resolved);
        // Notify other same-window consumers outside the state updater.
        window.dispatchEvent(
            new CustomEvent("stored-boolean-change", { detail: { key: storageKey, value: resolved } }),
        );
    }, [storageKey]);

    useEffect(() => {
        // Sync from other components in the same window
        const handleCustom = (e: Event) => {
            const { key, value: newValue } = (e as CustomEvent).detail;
            if (key === storageKey) {
                valueRef.current = newValue;
                if (!deferExternalUpdatesRef.current) setValue(newValue);
            }
        };
        // Sync from other windows
        const handleStorage = (e: StorageEvent) => {
            if (e.key === storageKey) {
                const stored = localStorageAdapter.readBoolean(storageKey);
                const nextValue = stored ?? fallback;
                valueRef.current = nextValue;
                if (!deferExternalUpdatesRef.current) setValue(nextValue);
            }
        };
        window.addEventListener("stored-boolean-change", handleCustom);
        window.addEventListener("storage", handleStorage);
        return () => {
            window.removeEventListener("stored-boolean-change", handleCustom);
            window.removeEventListener("storage", handleStorage);
        };
    }, [storageKey, fallback]);

    // Catch up on anything that changed while deferred. The current value is
    // returned straight from the ref so the first undeferred render is already
    // correct; the effect only realigns React state with it.
    useEffect(() => {
        if (deferExternalUpdates) return;
        setValue((prev) => (prev === valueRef.current ? prev : valueRef.current));
    }, [deferExternalUpdates]);

    return [deferExternalUpdates ? value : valueRef.current, setAndPersist] as const;
};
