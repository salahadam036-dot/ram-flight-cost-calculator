import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface UseSortOptions<T, K extends keyof T> {
  key: K;
  dir: SortDir;
}

/**
 * Hook de tri cote client, generique. Permet de trier une liste en cliquant sur
 * les en-tetes de colonnes (tri ascendant/descendant). Le tri est stable et
 * gere les valeurs null/undefined (placees en dernier).
 */
export function useSort<T, K extends keyof T>(
  rows: T[],
  defaultKey: K,
  defaultDir: SortDir = "asc",
) {
  const [sortKey, setSortKey] = useState<K | string>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortKey as K;
    return [...rows].sort((a, b) => {
      const av = a[key] as unknown;
      const bv = b[key] as unknown;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
      return String(av).localeCompare(String(bv), "fr", { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const toggle = (key: K | string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return {
    sorted,
    sortKey,
    sortDir,
    toggle,
  };
}
