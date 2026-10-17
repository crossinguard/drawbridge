import mammoth from "mammoth";
import type { ExtractedTable } from "../rubric/types";
import { extractHtmlTables } from "./html";

/**
 * Extract all tables from a .docx file, entirely in the browser.
 * mammoth converts the document to HTML, then we normalize the tables.
 */
export async function extractTablesFromDocx(file: File): Promise<ExtractedTable[]> {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return extractHtmlTables(html, file.name);
}
