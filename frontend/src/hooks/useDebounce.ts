import { useEffect, useState } from "react";

/**
 * Custom hook to debounce any fast-changing value.
 * Standard implementation from React official documentation and usehooks.
 *
 * @param value The value to debounce
 * @param delay Delay in milliseconds
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
