import type { PageContent } from "./extract";

const CHUNK_SIZE = 3600;
const CHUNK_OVERLAP = 600;
const MIN_CHUNK_LENGTH = 50;

export interface ChunkInput {
  document_id: string;
  chunk_index: number;
  page: number | null;
  content: string;
}

export function chunkText(
  pages: PageContent[],
  documentId: string
): ChunkInput[] {
  const pageBreaks: Array<{ offset: number; page: number }> = [];
  let fullText = "";

  for (const p of pages) {
    pageBreaks.push({ offset: fullText.length, page: p.page });
    fullText += (fullText.length > 0 ? "\n\n" : "") + p.text;
  }

  if (fullText.trim().length < MIN_CHUNK_LENGTH) return [];

  const chunks: ChunkInput[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  let start = 0;

  while (start < fullText.length) {
    let end = Math.min(start + CHUNK_SIZE, fullText.length);

    if (end < fullText.length) {
      const searchFrom = Math.max(end - 200, start);
      const slice = fullText.slice(searchFrom, end);
      const breakPoints = [
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(" "),
      ];
      for (const bp of breakPoints) {
        if (bp !== -1) {
          end = searchFrom + bp + 1;
          break;
        }
      }
    }

    const content = fullText.slice(start, end).trim();
    if (content.length >= MIN_CHUNK_LENGTH) {
      let page: number | null = null;
      for (let i = pageBreaks.length - 1; i >= 0; i--) {
        if (pageBreaks[i].offset <= start) {
          page = pageBreaks[i].page;
          break;
        }
      }

      chunks.push({
        document_id: documentId,
        chunk_index: chunks.length,
        page,
        content,
      });
    }

    start = start + step;
    if (start >= end && end < fullText.length) {
      start = end;
    }
  }

  return chunks;
}
