/**
 * Generates scripts/fixtures/sample-rubric.docx — a Word document containing a
 * realistic rubric table (plus a small second table to exercise the multi-table
 * picker). Run with: bun run sample
 *
 * The same builder feeds the automated integration test, so the fixture and
 * the tests never drift apart.
 */
import JSZip from "jszip";

export const FIXTURE_PATH = new URL("./fixtures/sample-rubric.docx", import.meta.url);

function escXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraph(text: string, opts: { bold?: boolean; sizeHalfPt?: number } = {}): string {
  const rpr = opts.bold || opts.sizeHalfPt ? `<w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.sizeHalfPt ? `<w:sz w:val="${opts.sizeHalfPt}"/>` : ""}</w:rPr>` : "";
  return `<w:p><w:r>${rpr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

function table(rows: string[][], opts: { boldFirstRow?: boolean } = {}): string {
  const borders = `
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>`;
  const trs = rows
    .map((cells, rowIdx) => {
      const bold = opts.boldFirstRow && rowIdx === 0;
      const tcs = cells
        .map(
          (text) =>
            `<w:tc><w:tcPr/><w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p></w:tc>`,
        )
        .join("");
      return `<w:tr>${tcs}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr><w:tblGrid>${rows[0]
    .map(() => "<w:gridCol/>")
    .join("")}</w:tblGrid>${trs}</w:tbl>`;
}

export async function buildSampleDocx(): Promise<Uint8Array> {
  const rubricTable = table(
    [
      ["Criterion Name", "Points", "Rating A", "Rating B", "Rating C", "Rating D"],
      [
        "Thesis",
        "5",
        "Clear, focused thesis",
        "Vague thesis",
        "Missing",
        "Missing",
      ],
      [
        "Evidence",
        "4",
        'Strong evidence; uses "show, don\'t tell"',
        "Some evidence",
        "Little evidence",
        "None",
      ],
      ["Organization & clarity", "3", "Logical flow throughout", "Mostly clear", "Disorganized", "Disorganized"],
      ["Style", "2", "Polished prose", "Minor issues", "", ""],
    ],
    { boldFirstRow: true },
  );

  const courseTable = table([
    ["Course info", ""],
    ["Semester", "Fall 2026"],
    ["Section", "ENGL 101"],
  ]);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph("Essay Rubric", { bold: true, sizeHalfPt: 32 })}
    ${paragraph("Score each criterion with the level that best fits the essay.")}
    ${rubricTable}
    ${paragraph("")}
    ${courseTable}
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file("word/document.xml", documentXml);

  return zip.generateAsync({ type: "uint8array" });
}

if (import.meta.main) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(FIXTURE_PATH.pathname), { recursive: true });
  writeFileSync(FIXTURE_PATH, await buildSampleDocx());
  console.log(`Wrote ${FIXTURE_PATH.pathname}`);
}
