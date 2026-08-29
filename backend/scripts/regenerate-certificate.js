import "dotenv/config";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { supabaseAdmin, requireSupabaseConfig } from "../src/supabase.js";
import { generateCertificate } from "../src/certificate.js";

requireSupabaseConfig();
const reference = process.argv[2];
if (!reference) throw new Error("Référence du dossier requise.");

const { data: request, error } = await supabaseAdmin
  .from("document_requests")
  .select("*,citizen:profiles!document_requests_citizen_id_fkey(*),house:houses!document_requests_house_id_fkey(*)")
  .eq("reference", reference)
  .single();
if (error) throw error;

const { data: citizenProfile, error: profileError } = await supabaseAdmin
  .from("citizen_profiles")
  .select("*")
  .eq("user_id", request.citizen_id)
  .single();
if (profileError) throw profileError;

const modelRef = request.house.certificate_path.replace(/^house-templates\//, "");
const { data: model, error: downloadError } = await supabaseAdmin.storage
  .from("house-templates")
  .download(modelRef);
if (downloadError) throw downloadError;

const directory = await mkdtemp(join(tmpdir(), "sunu-regenerate-"));
try {
  await writeFile(join(directory, "modele.pdf"), Buffer.from(await model.arrayBuffer()));
  const filename = await generateCertificate({
    uploadDir: directory,
    request: {
      ...request,
      firstName: request.citizen.first_name,
      lastName: request.citizen.last_name,
      father_first_name: citizenProfile.father_first_name,
      father_last_name: citizenProfile.father_last_name,
      mother_first_name: citizenProfile.mother_first_name,
      mother_last_name: citizenProfile.mother_last_name,
      resident_since_year: citizenProfile.resident_since_year,
      certificate_path: "modele.pdf",
      signature_path: null,
      stamp_path: null,
    },
  });
  const output = await readFile(join(directory, filename));
  const storagePath = `${request.citizen_id}/${request.reference}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("generated-certificates")
    .upload(storagePath, output, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;
  const certificatePath = `generated-certificates/${storagePath}`;
  const { error: updateError } = await supabaseAdmin
    .from("document_requests")
    .update({ certificate_path: certificatePath })
    .eq("id", request.id);
  if (updateError) throw updateError;
  console.log(`${reference} régénéré.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
