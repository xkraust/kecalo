import { getDocumentProxy, extractText as pdfExtract } from "unpdf";

export interface PageContent {
  page: number;
  text: string;
}

export async function extractText(
  buffer: Uint8Array,
  mimeType: string,
  filename: string
): Promise<{ pages: PageContent[] }> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (mimeType === "application/pdf" || ext === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await pdfExtract(pdf, { mergePages: false });
    const texts = text as unknown as string[];

    const pages: PageContent[] = [];
    for (let i = 0; i < (totalPages ?? texts.length); i++) {
      const t = texts[i]?.trim();
      if (t && t.length > 0) {
        pages.push({ page: i + 1, text: t });
      }
    }

    if (pages.length === 0) {
      throw new Error("PDF neobsahuje žádný čitelný text (možná skenovaný dokument)");
    }

    return { pages };
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    ext === "txt" ||
    ext === "md"
  ) {
    const content = new TextDecoder("utf-8").decode(buffer);
    if (!content.trim()) {
      throw new Error("Soubor je prázdný");
    }
    return { pages: [{ page: 1, text: content }] };
  }

  throw new Error(`Nepodporovaný formát souboru: ${filename}`);
}
