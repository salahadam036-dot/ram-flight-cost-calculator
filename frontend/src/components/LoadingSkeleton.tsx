import { Skeleton } from "@/components/ui/skeleton";

/**
 * État de chargement réutilisable : affiche une grille de cartes fantômes pour
 * indiquer qu'une page charge des données (au lieu d'un simple texte vide).
 */
export function LoadingSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Variante simple pour une ligne de contenu (tableaux / listes). */
export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
