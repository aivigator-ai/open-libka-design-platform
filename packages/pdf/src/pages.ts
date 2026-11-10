/** The number of pages of a PDF a document offers for download (none when the file cannot be read as a PDF). */
import { PDFDocument } from 'pdf-lib';

export async function pageCount(pdf: Uint8Array): Promise<number | undefined> {
  try {
    return (await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return undefined;
  }
}
