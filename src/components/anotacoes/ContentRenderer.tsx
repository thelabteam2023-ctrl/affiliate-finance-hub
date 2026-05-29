import { Fragment, useMemo } from "react";
import { ImageRenderer } from "./ImageRenderer";
import { CopyableLine } from "./CopyableLine";
import { CopyableBlock } from "./CopyableBlock";
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
    <div
      className={cn(
        "whitespace-pre-wrap break-words min-w-0 max-w-full",
        "[overflow-wrap:anywhere]",
        className,
      )}
    >
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

        if (segment.type === "copy-inline") {
          return (
            <CopyableLine
              key={`copy-${idx}`}
              value={segment.value!}
              label={segment.label}
              compact={compact}
            />
          );
        }

        if (segment.type === "copy-block") {
          return (
            <CopyableBlock
              key={`block-${idx}`}
              label={segment.label}
              lines={segment.lines!}
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
  type: "text" | "image" | "tag" | "mention" | "copy-inline" | "copy-block";
  text?: string;
  url?: string;
  alt?: string;
  value?: string;
  label?: string;
  lines?: string[];
}

/**
 * Parser robusto para conteúdo de anotação
 * Suporta:
 * - ![alt](url)
 * - ![alt]\n(url)  <- com quebra de linha
 * - #tag
 * - @mention
 * - ```label\nvalue1\nvalue2\n```  (bloco copiável; label opcional na 1ª linha)
 * - `value`  (chip copiável inline)
 */
function parseContent(content: string): ContentSegment[] {
  if (!content) return [];

  const segments: ContentSegment[] = [];

  // Ordem: blocos copiáveis ``` ... ``` → imagens → inline.
  // Regex combinado para fence + imagem; processamos por prioridade.
  const fenceRegex = /```([^\n`]*)\n([\s\S]*?)\n?```/g;
  const imageRegex = /!\[([^\]]*)\]\s*\(([^)]+)\)/g;

  // Coleta matches de fence e imagem com posições.
  type Token = { start: number; end: number; seg: ContentSegment };
  const tokens: Token[] = [];

  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(content)) !== null) {
    const rawLabel = m[1].trim();
    const rawLines = m[2].split("\n").map((l) => l.replace(/\r$/, ""));
    const lines = rawLines.filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      seg: {
        type: "copy-block",
        label: rawLabel || undefined,
        lines,
      },
    });
  }
  while ((m = imageRegex.exec(content)) !== null) {
    // Pular se estiver dentro de um fence
    if (tokens.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      seg: { type: "image", alt: m[1], url: m[2] },
    });
  }

  tokens.sort((a, b) => a.start - b.start);

  let lastIndex = 0;
  for (const tk of tokens) {
    if (tk.start > lastIndex) {
      segments.push(...parseTextSegment(content.slice(lastIndex, tk.start)));
    }
    segments.push(tk.seg);
    lastIndex = tk.end;
  }
  if (lastIndex < content.length) {
    segments.push(...parseTextSegment(content.slice(lastIndex)));
  }

  return segments;
}

/**
 * Parseia um segmento de texto para encontrar tags, menções e chips copiáveis inline.
 */
function parseTextSegment(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];

  // `value` (chip copiável) | #tag | @mention
  const tokenRegex = /(`[^`\n]+`|#\w+|@\w+)/g;

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
    if (token.startsWith("`") && token.endsWith("`")) {
      const value = token.slice(1, -1);
      segments.push({ type: "copy-inline", value });
    } else if (token.startsWith("#")) {
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
