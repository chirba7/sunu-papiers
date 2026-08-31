import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ink = rgb(0.08, 0.11, 0.16);
const muted = rgb(0.34, 0.38, 0.44);
const rule = rgb(0.82, 0.78, 0.68);

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const FIELDS_TOP = 578;
const FIELDS_BOTTOM = 250;
const MAX_STEP = 42;
const MIN_STEP = 30;

// Catalogue des champs imprimables. La maison (houses.certificate_fields) choisit
// lesquels apparaissent et dans quel ordre ; « parents » est un raccourci pour le
// couple père / mère. Toute clé inconnue est ignorée silencieusement.
const CATALOGUE = {
  birth_date: {
    group: "birth",
    label: "Né(e) le",
    value: (r) => frenchDate(r.birth_date),
  },
  birth_place: {
    group: "birth",
    label: "à",
    value: (r) => r.birth_place,
  },
  father: {
    group: "parents",
    label: "fils/fille de",
    bold: true,
    value: (r) =>
      `${r.father_first_name || ""} ${r.father_last_name || ""}`.trim(),
  },
  mother: {
    group: "parents",
    label: "et de",
    bold: true,
    value: (r) =>
      `${r.mother_first_name || ""} ${r.mother_last_name || ""}`.trim(),
  },
  identity_type: {
    label: "Pièce d’identité présentée :",
    bold: true,
    value: () => "Carte nationale d’identité",
  },
  identity_number: {
    label: "N°",
    value: (r) => r.identity_number,
    maxWidth: 300,
  },
  address: { block: true },
  resident_since: {
    group: "residence",
    label: "Dans le quartier depuis",
    bold: true,
    value: (r) => r.resident_since_year,
  },
  lot_number: {
    group: "residence",
    label: "Lot N°",
    value: (r) => r.lot_number || "N/A",
  },
};

const PAIR_LAYOUT = {
  birth: { left: { x: 60, maxWidth: 205 }, right: { x: 285, maxWidth: 250 } },
  parents: { left: { x: 60, maxWidth: 245 }, right: { x: 320, maxWidth: 215 } },
  residence: { left: { x: 60, maxWidth: 285 }, right: { x: 375, maxWidth: 160 } },
};

export const DEFAULT_CERTIFICATE_FIELDS = [
  "birth_date",
  "birth_place",
  "identity_type",
  "identity_number",
  "address",
  "resident_since",
  "lot_number",
];

export function normalizeFields(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? safeParse(value)
      : null;
  if (!Array.isArray(raw) || !raw.length) return [...DEFAULT_CERTIFICATE_FIELDS];
  const expanded = [];
  for (const entry of raw) {
    const key = String(entry || "").trim();
    if (key === "parents") expanded.push("father", "mother");
    else if (CATALOGUE[key]) expanded.push(key);
  }
  return expanded.filter((key, index) => expanded.indexOf(key) === index);
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function embedImage(pdf, path) {
  const bytes = await readFile(path);
  return /\.png$/i.test(extname(path)) ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

function frenchDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "Non renseignée";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function fitSize(font, text, preferred, maxWidth, minimum = 9) {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function wrap(font, text, size, maxWidth) {
  const words = String(text || "Non renseigné").trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// « de Grand-Yoff » mais « d’Aïnoumady 03 ».
function elide(name) {
  const label = String(name || "").trim();
  if (!label) return "de quartier";
  return /^[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜaeiouy]/.test(label) ? `d’${label}` : `de ${label}`;
}

function fieldLine(page, labelFont, valueFont, label, value, y, options = {}) {
  const x = options.x || 60;
  const maxWidth = options.maxWidth || 475;
  const labelSize = options.labelSize || 13;
  page.drawText(label, { x, y, size: labelSize, font: labelFont, color: ink });
  const labelWidth = labelFont.widthOfTextAtSize(label, labelSize);
  const valueX = x + labelWidth + 8;
  const available = maxWidth - labelWidth - 8;
  const shown = String(value || "Non renseigné").trim() || "Non renseigné";
  const size = fitSize(valueFont, shown, options.valueSize || 13, available);
  page.drawText(shown, { x: valueX, y, size, font: valueFont, color: ink });
  page.drawLine({ start: { x: valueX, y: y - 4 }, end: { x: x + maxWidth, y: y - 4 }, thickness: 0.7, color: muted });
}

// Regroupe les champs déclarés en lignes : deux champs d'un même groupe qui se
// suivent partagent une ligne, l'adresse occupe la hauteur de deux lignes.
function buildRows(fields) {
  const rows = [{ type: "name", slots: 1 }];
  let index = 0;
  while (index < fields.length) {
    const key = fields[index];
    const spec = CATALOGUE[key];
    if (!spec) {
      index += 1;
      continue;
    }
    if (spec.block) {
      rows.push({ type: "address", slots: 2 });
      index += 1;
      continue;
    }
    const next = fields[index + 1];
    if (spec.group && next && CATALOGUE[next]?.group === spec.group) {
      rows.push({ type: "pair", group: spec.group, left: key, right: next, slots: 1 });
      index += 2;
      continue;
    }
    rows.push({ type: "single", key, slots: 1 });
    index += 1;
  }
  return rows;
}

export async function generateCertificate({ request, uploadDir }) {
  const fields = normalizeFields(request.certificate_fields);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const house = request.house || {};
  const region = request.region || house.region || "";
  const departement = request.departement || house.departement || "";
  const commune = request.commune || house.commune || "";
  const quartier = request.quartier || house.quartier || "";
  const today = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Dakar", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const dossierNumber = String(
    request.delegate_sequence || request.reference?.split("-").pop() || "",
  ).padStart(3, "0");

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: rgb(1, 1, 1) });
  const header = [
    `RÉGION : ${region}`,
    `DÉPARTEMENT : ${departement}`,
    `COMMUNE : ${commune}`,
    `QUARTIER : ${quartier}`,
  ];
  header.forEach((text, index) => page.drawText(text, { x: 52, y: 784 - index * 20, size: 11, font: sansBold, color: ink }));
  page.drawText(`${commune}, le ${today}`, { x: 385, y: 784, size: 10.5, font: sansBold, color: muted });
  page.drawText(`Dossier N° ${dossierNumber}`, { x: 429, y: 744, size: 10.5, font: sansBold, color: muted });
  page.drawLine({ start: { x: 52, y: 700 }, end: { x: 543, y: 700 }, thickness: 0.8, color: rule });

  const title = "CERTIFICAT DE DOMICILE";
  page.drawText(title, { x: (PAGE_WIDTH - sansBold.widthOfTextAtSize(title, 18)) / 2, y: 641, size: 18, font: sansBold, color: ink });

  const intro = `Je soussigné(e), Chef de quartier ${elide(quartier)}, certifie que :`;
  page.drawText(intro, { x: 60, y: 612, size: fitSize(serif, intro, 12, 475), font: serif, color: muted });

  const rows = buildRows(fields);
  const slots = rows.reduce((total, row) => total + row.slots, 0);
  const step = Math.max(
    MIN_STEP,
    Math.min(MAX_STEP, Math.floor((FIELDS_TOP - FIELDS_BOTTOM) / Math.max(slots, 1))),
  );

  let y = FIELDS_TOP;
  for (const row of rows) {
    if (row.type === "name") {
      fieldLine(page, serif, serifBold, "Mr/Mme/Mlle", `${request.firstName} ${request.lastName}`, y);
    } else if (row.type === "pair") {
      const layout = PAIR_LAYOUT[row.group] || {
        left: { x: 60, maxWidth: 230 },
        right: { x: 305, maxWidth: 230 },
      };
      drawField(page, serif, serifBold, row.left, request, y, layout.left);
      drawField(page, serif, serifBold, row.right, request, y, layout.right);
    } else if (row.type === "single") {
      const spec = CATALOGUE[row.key];
      drawField(page, serif, serifBold, row.key, request, y, { x: 60, maxWidth: spec.maxWidth || 475 });
    } else if (row.type === "address") {
      const address = String(request.address || quartier || "Non renseignée").trim();
      page.drawText("Est domicilié(e) à :", { x: 60, y, size: 13, font: serif, color: ink });
      const lines = wrap(serifBold, address, 13, 450).slice(0, 2);
      lines.forEach((line, index) => {
        const lineY = y - 26 - index * 21;
        page.drawText(line, { x: 60, y: lineY, size: 13, font: serifBold, color: ink });
        page.drawLine({ start: { x: 60, y: lineY - 5 }, end: { x: 535, y: lineY - 5 }, thickness: 0.7, color: muted });
      });
    }
    y -= step * row.slots;
  }

  const closing = "Le présent certificat est délivré à l’intéressé(e) pour servir et valoir ce que de droit.";
  page.drawText(closing, { x: 60, y: Math.max(y - 8, 232), size: 10.5, font: serif, color: muted });

  const signatureBox = { x: 355, y: 62, width: 190, height: 128 };
  page.drawText("LE DÉLÉGUÉ DE QUARTIER", { x: 383, y: 208, size: 10.5, font: sansBold, color: ink });
  if (request.seal_path) {
    // Image unique signature + cachet fournie par l'administrateur.
    const seal = await embedImage(pdf, join(uploadDir, request.seal_path));
    const size = seal.scaleToFit(signatureBox.width, signatureBox.height);
    page.drawImage(seal, {
      x: signatureBox.x + (signatureBox.width - size.width) / 2,
      y: signatureBox.y,
      width: size.width,
      height: size.height,
    });
  }

  page.drawLine({ start: { x: 52, y: 38 }, end: { x: 543, y: 38 }, thickness: 0.6, color: rule });
  page.drawText(`Référence : ${request.reference}`, { x: 52, y: 21, size: 8.5, font: sans, color: muted });
  page.drawText("Document généré par Sunu Papier", { x: 409, y: 21, size: 8.5, font: sans, color: muted });

  pdf.setTitle(`Certificat de domicile ${request.reference}`);
  pdf.setSubject("Certificat de domicile");
  pdf.setProducer("Sunu Papier");
  const filename = `certificat-${request.reference}.pdf`;
  await writeFile(join(uploadDir, filename), await pdf.save());
  return filename;
}

function drawField(page, labelFont, boldFont, key, request, y, geometry) {
  const spec = CATALOGUE[key];
  if (!spec) return;
  fieldLine(
    page,
    labelFont,
    spec.bold ? boldFont : labelFont,
    spec.label,
    spec.value(request),
    y,
    geometry,
  );
}
