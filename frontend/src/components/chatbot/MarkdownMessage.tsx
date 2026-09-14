import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

// Le backend renvoie du texte au format markdown (listes, gras, code). Sans
// interpretation, les etoiles et les tirets s'affichent tels quels et les
// reponses de l'assistant deviennent penibles a lire.
//
// Le style des elements produits est applique depuis ce conteneur, avec les
// variantes arbitraires de Tailwind : plus simple a maintenir que de surcharger
// chaque balise une par une via la prop `components` de ReactMarkdown.
export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div
      className={cn(
        // La preflight de Tailwind supprime les marges et les puces par defaut :
        // il faut donc les retablir ici.
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul:last-child]:mb-0",
        "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol:last-child]:mb-0",
        "[&_li]:mb-1 [&_li]:leading-snug [&_li:last-child]:mb-0",
        "[&_li>ul]:mt-1 [&_li>ol]:mt-1",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5",
        "[&_code]:font-mono [&_code]:text-[12px]",
        "[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-foreground/10 [&_pre]:p-2",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:font-semibold",
        "[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:font-semibold",
        "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold",
        "[&_blockquote]:mb-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border",
        "[&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-2 [&_hr]:border-border",
        "[&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]",
        "[&_th]:border-b [&_th]:border-border [&_th]:px-1.5 [&_th]:py-1",
        "[&_th]:text-left [&_th]:font-semibold [&_td]:px-1.5 [&_td]:py-1",
        "[&_td]:border-b [&_td]:border-border/50",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
