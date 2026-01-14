import { Fragment, useMemo } from "react";
import { ImageRenderer } from "./ImageRenderer";
import { cn } from "@/lib/utils";

interface ContentRendererProps {
  content: string;
  compact?: boolean;
  className?: string;
}

/**
 * Renderiza conteúdo de anotação:
 * - Imagens markdown: ![alt](url) - suporta quebras de linha entre [] e ()
 * - Tags: #tag
 * - Menções: @projeto
 */
export function ContentRenderer({
  content,
  compact = false,
  className,
}: ContentRendererProps) {
  const segments = useMemo(() => parseContent(content), [content]);

  if (!content?.trim()) {
    return (
      <span className="text-muted-foreground/50 text-xs italic">
        clique para escrever...
      </span>
    );
  }

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, idx) => {
        if (segment.type === "image") {
          return (
            <ImageRenderer
              key={`img-${idx}`}
              src={segment.url!}
              alt={segment.alt || "imagem"}
              compact={compact}
            />
          );
        }

        if (segment.type === "tag") {
          return (
            <span key={`tag-${idx}`} className="text-sky-400/80 font-medium">
              {segment.text}
            </span>
          );
        }

        if (segment.type === "mention") {
          return (
            <span key={`mention-${idx}`} className="text-violet-400/80 font-medium">
              {segment.text}
            </span>
          );
        }

        // Texto normal
        return <Fragment key={`text-${idx}`}>{segment.text}</Fragment>;
      })}
    </div>
  );
}

// Types
interface ContentSegment {
  type: "text" | "image" | "tag" | "mention";
  text?: string;
  url?: string;
  alt?: string;
}

/**
 * Parser robusto para conteúdo de anotação
 * Suporta:
 * - ![alt](url)
 * - ![alt]\n(url)  <- com quebra de linha
 * - #tag
 * - @mention
 */
function parseContent(content: string): ContentSegment[] {
  if (!content) return [];

  const segments: ContentSegment[] = [];

  // Regex para imagens markdown - suporta espaços/quebras entre [] e ()
  const imageRegex = /!\[([^\]]*)\]\s*\(([^)]+)\)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(content)) !== null) {
    // Texto antes da imagem
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      segments.push(...parseTextSegment(textBefore));
    }

    // Imagem
    segments.push({
      type: "image",
      alt: match[1],
      url: match[2],
    });

    lastIndex = match.index + match[0].length;
  }

  // Texto restante após última imagem
  if (lastIndex < content.length) {
    segments.push(...parseTextSegment(content.slice(lastIndex)));
  }

  return segments;
}

/**
 * Parseia um segmento de texto para encontrar tags e menções
 */
function parseTextSegment(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];

  // Regex para tags e menções
  const tokenRegex = /(#\w+|@\w+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Texto antes do token
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, match.index),
      });
    }

    // Token
    const token = match[0];
    if (token.startsWith("#")) {
      segments.push({ type: "tag", text: token });
    } else if (token.startsWith("@")) {
      segments.push({ type: "mention", text: token });
    }

    lastIndex = match.index + token.length;
  }

  // Texto restante
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return segments;
}
