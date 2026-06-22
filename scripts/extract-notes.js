const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const downloads = "C:\\Users\\simon\\Downloads\\Sales_trainer_website";

// Original study notes — extracted verbatim (existing grounding, unchanged).
const files = [
  "05174b5a-febd-4a10-8eea-308a66d8b65e_Selling_to_identity.pdf",
  "09cf1985-6b39-46cf-b833-1063c96dc5ee_Limiting_beliefs.pdf",
  "207e13cc-4789-49a3-99f4-d7952a899f1c_The_one_call_close.pdf",
  "2279322d-a9b8-4971-897c-92f88b301f78_Language_fixing.pdf",
  "6b828e54-220b-4d79-9f3a-0d49dd91bb72_Structure_Training_(Recap).pdf",
  "87082cb2-f1b1-4b4e-9627-9c4d500c1b5e_Tonal_training.pdf",
  "8833c84b-d9ae-43b3-a76f-267fa8800d90_Objection_training_(recap).pdf",
  "d1fe1783-f796-4ae5-93ad-729e77e1d472_How_to_pre_handle_every_objection.pdf",
];

const titles = {
  "05174b5a-febd-4a10-8eea-308a66d8b65e_Selling_to_identity.pdf": "Selling to Identity",
  "09cf1985-6b39-46cf-b833-1063c96dc5ee_Limiting_beliefs.pdf": "Limiting Beliefs",
  "207e13cc-4789-49a3-99f4-d7952a899f1c_The_one_call_close.pdf": "The One Call Close",
  "2279322d-a9b8-4971-897c-92f88b301f78_Language_fixing.pdf": "Language Fixing",
  "6b828e54-220b-4d79-9f3a-0d49dd91bb72_Structure_Training_(Recap).pdf": "Structure Training (Recap)",
  "87082cb2-f1b1-4b4e-9627-9c4d500c1b5e_Tonal_training.pdf": "Tonal Training",
  "8833c84b-d9ae-43b3-a76f-267fa8800d90_Objection_training_(recap).pdf": "Objection Training (Recap)",
  "d1fe1783-f796-4ae5-93ad-729e77e1d472_How_to_pre_handle_every_objection.pdf": "How to Pre-Handle Every Objection",
};

// Newer course-note modules. These end with a "Drills" chapter that is NOT part
// of the knowledge the AI should draw on, so we strip it out (keeping the short
// Module Summary that follows). We also clean the PDF page furniture so the
// grounding text reads cleanly.
const newFiles = [
  "01_objection_handling.pdf",
  "02_remote_high_ticket.pdf",
  "03_discovery_calls.pdf",
];

const newTitles = {
  "01_objection_handling.pdf": "Objection Handling (Working Framework)",
  "02_remote_high_ticket.pdf": "Remote & High-Ticket Selling",
  "03_discovery_calls.pdf": "Discovery Call Mastery",
};

// Remove the "Drills" chapter and tidy up extracted PDF text.
function cleanNewModule(raw) {
  let t = raw;

  // Drop the drills body (every drill line is marked with the ✎ glyph) up to the
  // Module Summary, which we keep.
  t = t.replace(/✎[\s\S]*?(?=MODULE SUMMARY)/i, "");
  // Drop the leftover "PART FIVE / Drills" heading (letters are space-separated
  // in the source PDF, e.g. "PA R T  F I V E").
  t = t.replace(/P\s*A\s*R\s*T\s*F\s*I\s*V\s*E\s*\n?\s*Drills\s*\n?/i, "");
  // Drop the "05 — Drills" entry from the table of contents on the title page.
  t = t.replace(/^\s*0?5\s*[—–-]\s*Drills\s*$/gim, "");

  // Strip PDF furniture: page markers, running header, module footer, lone page numbers.
  t = t.replace(/^-- \d+ of \d+ --\s*$/gm, "");
  t = t.replace(/^S\s*A\s*L\s*E\s*S.*COURSE\s*N\s*O\s*T\s*E\s*S\s*$/gim, "");
  t = t.replace(/^S A L E S T R A I N E R.*$/gm, "");
  t = t.replace(/^Module \d+ of \d+.*$/gm, "");
  t = t.replace(/^\s*\d{1,2}\s*$/gm, ""); // standalone page numbers
  t = t.replace(/^\s*•\s*$/gm, ""); // orphaned bullet glyphs

  // Collapse excess blank lines.
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

(async () => {
  let out =
    "# Sales Knowledge Base\n\nThis file is auto-extracted from Simon's sales study notes. It is used as grounding context for the Sales Camp Games AI coach.\n\n";

  for (const file of files) {
    const filePath = path.join(downloads, file);
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    out += `\n\n---\n\n## ${titles[file]}\n\n${data.text.trim()}\n`;
    console.log(`Extracted ${titles[file]} (${data.text.length} chars)`);
    await parser.destroy();
  }

  for (const file of newFiles) {
    const filePath = path.join(downloads, file);
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    const cleaned = cleanNewModule(data.text);
    out += `\n\n---\n\n## ${newTitles[file]}\n\n${cleaned}\n`;
    console.log(`Extracted ${newTitles[file]} (${data.text.length} chars raw -> ${cleaned.length} chars, drills removed)`);
    await parser.destroy();
  }

  const outDir = path.join(__dirname, "..", "knowledge");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "sales_notes.md"), out, "utf-8");
  console.log("Done. Total chars:", out.length);
})();
