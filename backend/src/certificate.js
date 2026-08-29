import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ink = rgb(0.08, 0.11, 0.16);
const muted = rgb(0.34, 0.38, 0.44);
const rule = rgb(0.82, 0.78, 0.68);

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

function fieldLine(page, labelFont, valueFont, label, value, y, options = {}) {
  const x = options.x || 60;
  const maxWidth = options.maxWidth || 475;
  const labelSize = options.labelSize || 13;
  page.drawText(label, { x, y, size: labelSize, font: labelFont, color: ink });
  const labelWidth = labelFont.widthOfTextAtSize(label, labelSize);
  const valueX = x + labelWidth + 8;
  const available = maxWidth - labelWidth - 8;
  const shown = String(value || "Non renseigné").trim();
  const size = fitSize(valueFont, shown, options.valueSize || 13, available);
  page.drawText(shown, { x: valueX, y, size, font: valueFont, color: ink });
  page.drawLine({ start: { x: valueX, y: y - 4 }, end: { x: x + maxWidth, y: y - 4 }, thickness: 0.7, color: muted });
}

export async function generateCertificate({ request, uploadDir }) {
  if (!request.certificate_path)
    throw new Error("Le modèle du certificat doit être configuré pour cette maison.");

  const templateBytes = await readFile(join(uploadDir, request.certificate_path));
  const template = await PDFDocument.load(templateBytes);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
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
  const dossierNumber = String(request.id || request.reference?.split("-").pop() || "").padStart(4, "0");

  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.995, 0.992, 0.982) });
  const header = [
    `RÉGION : ${region}`,
    `DÉPARTEMENT : ${departement}`,
    `COMMUNE : ${commune}`,
    `QUARTIER : ${quartier}`,
  ];
  header.forEach((text, index) => page.drawText(text, { x: 52, y: 784 - index * 20, size: 11, font: sansBold, color: ink }));
  page.drawText(`${commune}, le ${today}`, { x: 385, y: 784, size: 10.5, font: sansBold, color: muted });
  page.drawText(`Dossier N° ${dossierNumber}`, { x: 429, y: 744, size: 10.5, font: sansBold, color: muted });
  page.drawText("Certificat de domicile", { x: 52, y: 696, size: 11, font: sans, color: muted });
  page.drawLine({ start: { x: 52, y: 676 }, end: { x: 543, y: 676 }, thickness: 0.8, color: rule });

  const title = "CERTIFICAT DE DOMICILE";
  page.drawText(title, { x: (595.28 - sansBold.widthOfTextAtSize(title, 18)) / 2, y: 625, size: 18, font: sansBold, color: ink });

  fieldLine(page, serif, serifBold, "Mr/Mme/Mlle", `${request.firstName} ${request.lastName}`, 568);
  fieldLine(page, serif, serif, "Né(e) le", frenchDate(request.birth_date), 526, { maxWidth: 205 });
  fieldLine(page, serif, serif, "à", request.birth_place, 526, { x: 285, maxWidth: 250 });
  fieldLine(page, serif, serifBold, "fils/fille de", `${request.father_first_name || ""} ${request.father_last_name || ""}`, 484, { maxWidth: 245 });
  fieldLine(page, serif, serifBold, "et de", `${request.mother_first_name || ""} ${request.mother_last_name || ""}`, 484, { x: 320, maxWidth: 215 });
  fieldLine(page, serif, serifBold, "Pièce d’identité présentée :", "Carte nationale d’identité", 442);
  fieldLine(page, serif, serif, "N°", request.identity_number, 400, { maxWidth: 300 });

  page.drawText("Est domicilié(e) à :", { x: 60, y: 354, size: 13, font: serif, color: ink });
  const address = String(request.address || quartier || "Non renseignée").trim();
  const addressLines = wrap(serifBold, address, 13, 450);
  addressLines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, { x: 60, y: 328 - index * 21, size: 13, font: serifBold, color: ink });
    page.drawLine({ start: { x: 60, y: 323 - index * 21 }, end: { x: 535, y: 323 - index * 21 }, thickness: 0.7, color: muted });
  });
  const residenceY = addressLines.length > 1 ? 277 : 298;
  fieldLine(page, serif, serifBold, "Dans le quartier depuis", request.resident_since_year, residenceY, { maxWidth: 285 });
  fieldLine(page, serif, serif, "Lot N°", request.lot_number || "N/A", residenceY, { x: 375, maxWidth: 160 });

  page.drawText("Le présent certificat est délivré à l’intéressé(e) pour servir et valoir ce que de droit.", { x: 60, y: residenceY - 43, size: 10.5, font: serif, color: muted });

  const signatureX = 360;
  const signatureY = 68;
  page.drawText("LE DÉLÉGUÉ DE QUARTIER", { x: 383, y: 205, size: 10.5, font: sansBold, color: ink });
  if (request.signature_path) {
    const signature = await embedImage(pdf, join(uploadDir, request.signature_path));
    const size = signature.scaleToFit(145, 95);
    page.drawImage(signature, { x: signatureX, y: signatureY + 20, width: size.width, height: size.height });
  }
  if (request.stamp_path) {
    const stamp = await embedImage(pdf, join(uploadDir, request.stamp_path));
    const size = stamp.scaleToFit(105, 105);
    page.drawImage(stamp, { x: signatureX + 62, y: signatureY + 13, width: size.width, height: size.height, opacity: 0.86 });
  } else if (!request.signature_path && template.getPageCount()) {
    const source = template.getPages()[0];
    const crop = await pdf.embedPage(source, { left: 320, bottom: 300, right: 560, top: 500 });
    page.drawPage(crop, { x: 345, y: 45, width: 210, height: 175 });
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
