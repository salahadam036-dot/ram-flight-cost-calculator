import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/**
 * État vide réutilisable pour les tableaux : affiche un message clair avec une
 * icône et une action optionnelle (au lieu d'une table vide déroutante).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="max-w-sm text-sm text-muted-foreground">{description}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
