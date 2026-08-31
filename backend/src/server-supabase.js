import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  supabaseAdmin,
  supabasePublic,
  requireSupabaseConfig,
} from "./supabase.js";
import {
  DEFAULT_CERTIFICATE_FIELDS,
  generateCertificate,
  normalizeFields,
} from "./certificate.js";

requireSupabaseConfig();
const app = express(),
  port = Number(process.env.PORT) || 4000;
// --- CORS -------------------------------------------------------------
// Origines autorisees : la variable FRONTEND_ORIGINS (liste separee par des
// virgules) si elle existe, sinon la liste par defaut ci-dessous.
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "https://citoyen-alpha.vercel.app",
  "https://delegue.vercel.app",
  "https://administrateur-three.vercel.app",
];
const origins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedOrigins = new Set(origins.length ? origins : DEFAULT_ORIGINS);
// Les deploiements de previsualisation Vercel des 3 apps (ex: citoyen-git-main-xxx.vercel.app)
const PREVIEW_ORIGIN =
  /^https:\/\/(citoyen|delegue|administrateur)[a-z0-9-]*\.vercel\.app$/i;
const isAllowedOrigin = (origin) =>
  !origin ||
  allowedOrigins.has(origin.replace(/\/$/, "")) ||
  PREVIEW_ORIGIN.test(origin) ||
  /^http:\/\/localhost(:\d+)?$/.test(origin) ||
  /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn("Origine CORS refusee :", origin);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
// Reponse immediate aux requetes preflight (OPTIONS) sur toutes les routes.
app.use((req, res, next) =>
  req.method === "OPTIONS" ? res.sendStatus(204) : next(),
);
app.use(express.json({ limit: "2mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});
const files = upload.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
  { name: "signature", maxCount: 1 },
  { name: "stamp", maxCount: 1 },
  { name: "seal", maxCount: 1 },
]);

// L'administrateur importe une seule image contenant signature et cachet.
const sealExtension = (file) =>
  file.mimetype === "image/png" ? "png" : "jpg";
const uploadSeal = async (houseId, file) => {
  const path = `${houseId}/cachet.${sealExtension(file)}`;
  const { error } = await supabaseAdmin.storage
    .from("house-templates")
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
  if (error) throw error;
  return `house-templates/${path}`;
};
const downloadHouseAsset = async (storagePath, destination) => {
  const { data, error } = await supabaseAdmin.storage
    .from("house-templates")
    .download(storagePath.replace(/^house-templates\//, ""));
  if (error) throw error;
  await writeFile(destination, Buffer.from(await data.arrayBuffer()));
};
// Le formulaire envoie les champs du certificat en JSON dans un FormData.
const parseFields = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
};
// --- Cache memoire du compteur de demandes ---------------------------------
// Evite de recalculer les compteurs a chaque sondage du front (toutes les 20 s).
// Cle = identifiant du delegue. TTL court : une nouvelle demande est visible
// au plus tard SUMMARY_TTL apres son depot, et immediatement si le cache est
// invalide par une ecriture (creation ou traitement d'une demande).
const SUMMARY_TTL = 30_000;
const summaryCache = new Map();
const readSummaryCache = (key) => {
  const entry = summaryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    summaryCache.delete(key);
    return null;
  }
  return entry.payload;
};
const writeSummaryCache = (key, payload) => {
  summaryCache.set(key, { payload, expiresAt: Date.now() + SUMMARY_TTL });
  return payload;
};
const clearSummaryCache = (key) => {
  if (key) summaryCache.delete(key);
  else summaryCache.clear();
};

const REJECTION_REASONS = {
  incoherence: "Incohérence des informations fournies",
  mauvaise_maison: "Mauvaise administration de quartier sélectionnée",
  documents_illisibles: "Pièce d’identité illisible ou incomplète",
  autre: "Autre motif",
};

const cleanPhone = (v = "") => String(v).replace(/\D/g, "").slice(0, 9);
const citizenEmail = (phone) => `${cleanPhone(phone)}@citoyen.sunupapier.local`;
const required = (body, keys) =>
  keys.filter((k) => !String(body[k] ?? "").trim());
const fail = (res, error, status = 400) =>
  res.status(status).json({ error: error?.message || String(error) });
const ext = (file, fallback) =>
  extname(file?.originalname || "").toLowerCase() || fallback;

async function bootstrapAdmin() {
  const email = (
    process.env.ADMIN_EMAIL || "admin@sunupapier.sn"
  ).toLowerCase();
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);
  if (error) throw error;
  if (profiles.length) return;
  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: process.env.ADMIN_PASSWORD || "Admin@2026",
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { first_name: "Administrateur", last_name: "Sunu Papier" },
    });
  if (createError) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) throw createError;
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...existing.app_metadata, role: "admin" },
    });
    await supabaseAdmin
      .from("profiles")
      .upsert({
        id: existing.id,
        role: "admin",
        first_name: "Administrateur",
        last_name: "Sunu Papier",
        active: true,
      });
  } else if (created.user) {
    await supabaseAdmin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", created.user.id);
  }
}

async function authenticate(req, res, next) {
  try {
    const token =
      req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token;
    if (!token) throw new Error("Authentification requise.");
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) throw error || new Error("Session invalide.");
    const { data: profile, error: pError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .eq("active", true)
      .single();
    if (pError) throw pError;
    req.user = { ...profile, email: user.email };
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: "Authentification requise." });
  }
}
const permit =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Accès refusé." });
async function storageUpload(bucket, path, file) {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
  if (error) throw error;
  return `${bucket}/${path}`;
}

app.get("/api/health", async (_req, res) => {
  const { error } = await supabaseAdmin
    .from("profiles")
    .select("id", { head: true });
  res
    .status(error ? 503 : 200)
    .json({
      status: error ? "error" : "ok",
      database: "supabase",
      error: error?.message,
    });
});
app.get("/uploads/:bucket/*path", authenticate, async (req, res) => {
  const path = Array.isArray(req.params.path)
    ? req.params.path.join("/")
    : req.params.path;
  const { data, error } = await supabaseAdmin.storage
    .from(req.params.bucket)
    .createSignedUrl(path, 60);
  if (error) return fail(res, error, 404);
  res.redirect(data.signedUrl);
});

app.post("/api/auth/citizen/register", async (req, res) => {
  try {
    const m = required(req.body, ["firstName", "lastName", "phone", "pin"]);
    if (m.length)
      return fail(res, new Error(`Champs requis : ${m.join(", ")}`));
    const phone = cleanPhone(req.body.phone);
    if (!/^\d{9}$/.test(phone) || !/^\d{6}$/.test(req.body.pin))
      return fail(res, new Error("Téléphone ou PIN invalide."));
    const email = citizenEmail(phone);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: req.body.pin,
      email_confirm: true,
      user_metadata: {
        first_name: req.body.firstName.trim(),
        last_name: req.body.lastName.trim(),
        phone,
      },
    });
    if (error) throw error;
    const { data: session, error: loginError } =
      await supabasePublic.auth.signInWithPassword({
        email,
        password: req.body.pin,
      });
    if (loginError) throw loginError;
    res
      .status(201)
      .json({
        token: session.session.access_token,
        refreshToken: session.session.refresh_token,
        user: {
          id: data.user.id,
          role: "citizen",
          firstName: req.body.firstName.trim(),
          lastName: req.body.lastName.trim(),
          phone,
        },
      });
  } catch (error) {
    fail(res, error, String(error.message).includes("registered") ? 409 : 400);
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = req.body.phone
      ? citizenEmail(req.body.phone)
      : String(req.body.email || "").toLowerCase();
    const password = req.body.pin || req.body.password || "";
    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    const { data: profile, error: pError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .eq("active", true)
      .single();
    if (pError) throw pError;
    if (req.body.role && profile.role !== req.body.role)
      return fail(
        res,
        new Error("Ce compte ne correspond pas à cet espace."),
        403,
      );
    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: profile.id,
        role: profile.role,
        firstName: profile.first_name,
        lastName: profile.last_name,
        phone: profile.phone,
        email: data.user.email,
      },
    });
  } catch {
    res.status(401).json({ error: "Identifiants incorrects." });
  }
});
app.post("/api/auth/refresh", async (req, res) => {
  const { data, error } = await supabasePublic.auth.refreshSession({
    refresh_token: req.body.refreshToken,
  });
  if (error || !data.session)
    return res.status(401).json({ error: "Session expirée." });
  res.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
});

app.get("/api/me", authenticate, async (req, res) => {
  let profile = null,
    house = null;
  if (req.user.role === "citizen") {
    const { data } = await supabaseAdmin
      .from("citizen_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .single();
    profile = data
      ? {
          fatherFirstName: data.father_first_name,
          fatherLastName: data.father_last_name,
          motherFirstName: data.mother_first_name,
          motherLastName: data.mother_last_name,
          birthDate: data.birth_date,
          birthPlace: data.birth_place,
          identityNumber: data.identity_number,
          villaNumber: data.villa_number,
          idFront: data.id_front_path,
          idBack: data.id_back_path,
          quartier: data.quartier,
          residentSinceYear: data.resident_since_year,
        }
      : null;
  }
  if (req.user.role === "delegate") {
    const { data } = await supabaseAdmin
      .from("houses")
      .select("*")
      .eq("delegate_id", req.user.id)
      .eq("active", true)
      .maybeSingle();
    house = data;
  }
  res.json({
    id: req.user.id,
    role: req.user.role,
    firstName: req.user.first_name,
    lastName: req.user.last_name,
    phone: req.user.phone,
    email: req.user.email,
    profile,
    house,
  });
});
app.put(
  "/api/me/citizen",
  authenticate,
  permit("citizen"),
  files,
  async (req, res) => {
    try {
      const b = req.body,
        year = b.residentSinceYear ? Number(b.residentSinceYear) : null;
      if (year && (year < 1900 || year > 2100))
        return fail(res, new Error("Année de domiciliation invalide."));
      let idFront, idBack;
      if (req.files?.idFront?.[0])
        idFront = await storageUpload(
          "identity-documents",
          `${req.user.id}/recto${ext(req.files.idFront[0], ".jpg")}`,
          req.files.idFront[0],
        );
      if (req.files?.idBack?.[0])
        idBack = await storageUpload(
          "identity-documents",
          `${req.user.id}/verso${ext(req.files.idBack[0], ".jpg")}`,
          req.files.idBack[0],
        );
      const { error: pError } = await supabaseAdmin
        .from("profiles")
        .update({
          first_name: b.firstName || req.user.first_name,
          last_name: b.lastName || req.user.last_name,
          phone: cleanPhone(b.phone || req.user.phone),
        })
        .eq("id", req.user.id);
      if (pError) throw pError;
      const changes = {
        father_first_name: b.fatherFirstName || "",
        father_last_name: b.fatherLastName || "",
        mother_first_name: b.motherFirstName || "",
        mother_last_name: b.motherLastName || "",
        birth_date: b.birthDate || null,
        birth_place: String(b.birthPlace || "").trim(),
        identity_number: String(b.identityNumber || "").trim(),
        villa_number: String(b.villaNumber || "").trim(),
        quartier: b.quartier || "",
        resident_since_year: year,
      };
      if (idFront) changes.id_front_path = idFront;
      if (idBack) changes.id_back_path = idBack;
      const { error } = await supabaseAdmin
        .from("citizen_profiles")
        .update(changes)
        .eq("user_id", req.user.id);
      if (error) throw error;
      res.json({ message: "Profil mis à jour." });
    } catch (error) {
      fail(res, error);
    }
  },
);

app.get(
  "/api/admin/dashboard",
  authenticate,
  permit("admin"),
  async (_req, res) => {
    const [
      { count: citizens },
      { count: delegates },
      { count: houses },
      { count: requests },
      { count: pending },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "citizen")
        .eq("active", true),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "delegate")
        .eq("active", true),
      supabaseAdmin
        .from("houses")
        .select("*", { count: "exact", head: true })
        .eq("active", true),
      supabaseAdmin
        .from("document_requests")
        .select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("document_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    res.json({ citizens, delegates, houses, requests, pending });
  },
);
app.get(
  "/api/admin/delegates",
  authenticate,
  permit("admin"),
  async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,first_name,last_name,phone,active")
      .eq("role", "delegate")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) return fail(res, error);
    const ids = data.map((x) => x.id);
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const { data: assignedHouses, error: housesError } = ids.length
      ? await supabaseAdmin
          .from("houses")
          .select("delegate_id,quartier")
          .in("delegate_id", ids)
          .eq("active", true)
      : { data: [], error: null };
    if (housesError) return fail(res, housesError);
    const quartierByDelegate = new Map(
      assignedHouses.map((house) => [house.delegate_id, house.quartier]),
    );
    res.json(
      data.map((d) => {
        const u = users.users.find((x) => x.id === d.id);
        return {
          id: d.id,
          firstName: d.first_name,
          lastName: d.last_name,
          email: u?.email,
          active: d.active,
          quartier: quartierByDelegate.get(d.id) || null,
        };
      }),
    );
  },
);
app.post(
  "/api/admin/delegates",
  authenticate,
  permit("admin"),
  async (req, res) => {
    try {
      const m = required(req.body, [
        "firstName",
        "lastName",
        "email",
        "password",
      ]);
      if (m.length) return fail(res, new Error("Tous les champs sont requis."));
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: req.body.email.toLowerCase(),
        password: req.body.password,
        email_confirm: true,
        app_metadata: { role: "delegate" },
        user_metadata: {
          first_name: req.body.firstName.trim(),
          last_name: req.body.lastName.trim(),
        },
      });
      if (error) throw error;
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          role: "delegate",
          first_name: req.body.firstName.trim(),
          last_name: req.body.lastName.trim(),
          active: true,
        })
        .eq("id", data.user.id);
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      res
        .status(201)
        .json({
          id: data.user.id,
          firstName: req.body.firstName.trim(),
          lastName: req.body.lastName.trim(),
          email: req.body.email.toLowerCase(),
          active: true,
        });
    } catch (error) {
      fail(res, error, 409);
    }
  },
);
app.put(
  "/api/admin/delegates/:id",
  authenticate,
  permit("admin"),
  async (req, res) => {
    try {
      const attrs = {
        email: req.body.email.toLowerCase(),
        user_metadata: {
          first_name: req.body.firstName,
          last_name: req.body.lastName,
        },
      };
      if (req.body.password) attrs.password = req.body.password;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        req.params.id,
        attrs,
      );
      if (error) throw error;
      const { error: pError } = await supabaseAdmin
        .from("profiles")
        .update({
          first_name: req.body.firstName,
          last_name: req.body.lastName,
        })
        .eq("id", req.params.id);
      if (pError) throw pError;
      res.json({
        id: req.params.id,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        active: true,
      });
    } catch (error) {
      fail(res, error);
    }
  },
);
app.delete(
  "/api/admin/delegates/:id",
  authenticate,
  permit("admin"),
  async (req, res) => {
    await supabaseAdmin
      .from("houses")
      .update({ delegate_id: null })
      .eq("delegate_id", req.params.id);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ active: false })
      .eq("id", req.params.id);
    if (error) return fail(res, error);
    res.json({ message: "Délégué désactivé." });
  },
);

app.get(
  "/api/admin/houses",
  authenticate,
  permit("admin"),
  async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("houses")
      .select(
        "*,delegate:profiles!houses_delegate_id_fkey(first_name,last_name)",
      )
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) return fail(res, error);
    res.json(
      data.map((h) => ({
        ...h,
        delegateName: h.delegate
          ? `${h.delegate.first_name} ${h.delegate.last_name}`
          : null,
      })),
    );
  },
);
app.post(
  "/api/admin/houses",
  authenticate,
  permit("admin"),
  files,
  async (req, res) => {
    try {
      const b = req.body,
        m = required(b, [
          "region",
          "departement",
          "commune",
          "quartier",
          "delegateId",
        ]);
      if (m.length)
        return fail(res, new Error("Localisation et délégué requis."));
      if (!req.files?.seal?.[0])
        return fail(
          res,
          new Error("L’image de la signature et du cachet est obligatoire."),
        );
      const values = {
        region: b.region.toUpperCase(),
        departement: b.departement.toUpperCase(),
        commune: b.commune.toUpperCase(),
        quartier: b.quartier.toUpperCase(),
        delegate_id: b.delegateId,
        certificate_fields: parseFields(b.fields) || DEFAULT_CERTIFICATE_FIELDS,
        certificate_path: null,
        seal_path: null,
        active: true,
      };
      let { data: house, error } = await supabaseAdmin
        .from("houses")
        .insert(values)
        .select()
        .single();
      if (error && error.code === "23505") {
        const archived = await supabaseAdmin
          .from("houses")
          .select("*")
          .eq("quartier", values.quartier)
          .eq("active", false)
          .maybeSingle();
        if (archived.data) {
          const result = await supabaseAdmin
            .from("houses")
            .update(values)
            .eq("id", archived.data.id)
            .select()
            .single();
          house = result.data;
          error = result.error;
        }
      }
      if (error) throw error;
      const sealPath = await uploadSeal(house.id, req.files.seal[0]);
      await supabaseAdmin
        .from("houses")
        .update({ seal_path: sealPath })
        .eq("id", house.id);
      res.status(201).json({ id: house.id });
    } catch (error) {
      fail(res, error, error.code === "23505" ? 409 : 400);
    }
  },
);
app.put(
  "/api/admin/houses/:id",
  authenticate,
  permit("admin"),
  files,
  async (req, res) => {
    try {
      const b = req.body,
        changes = {
          region: b.region.toUpperCase(),
          departement: b.departement.toUpperCase(),
          commune: b.commune.toUpperCase(),
          quartier: b.quartier.toUpperCase(),
          delegate_id: b.delegateId,
        };
      const fields = parseFields(b.fields);
      if (fields) changes.certificate_fields = fields;
      if (req.files?.seal?.[0])
        changes.seal_path = await uploadSeal(req.params.id, req.files.seal[0]);
      const { error } = await supabaseAdmin
        .from("houses")
        .update(changes)
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ message: "Maison mise à jour." });
    } catch (error) {
      fail(res, error);
    }
  },
);
app.delete(
  "/api/admin/houses/:id",
  authenticate,
  permit("admin"),
  async (req, res) => {
    const { error } = await supabaseAdmin
      .from("houses")
      .update({ active: false, delegate_id: null })
      .eq("id", req.params.id);
    if (error) return fail(res, error);
    res.json({ message: "Maison archivée. Les demandes sont conservées." });
  },
);

app.get("/api/houses", authenticate, permit("citizen"), async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("houses")
    .select("id,region,departement,commune,quartier")
    .eq("active", true)
    .not("delegate_id", "is", null)
    .order("quartier");
  if (error) return fail(res, error);
  res.json(data);
});
app.post("/api/requests", authenticate, permit("citizen"), async (req, res) => {
  const { data: citizenProfile, error: profileError } = await supabaseAdmin
    .from("citizen_profiles")
    .select("birth_date,birth_place,identity_number,villa_number,resident_since_year,father_first_name,father_last_name,mother_first_name,mother_last_name")
    .eq("user_id", req.user.id)
    .single();
  if (profileError) return fail(res, profileError);
  if (!citizenProfile.birth_date || !citizenProfile.birth_place || !citizenProfile.identity_number || !citizenProfile.villa_number || !citizenProfile.resident_since_year || !citizenProfile.father_first_name || !citizenProfile.father_last_name || !citizenProfile.mother_first_name || !citizenProfile.mother_last_name)
    return fail(res, new Error("Complétez d’abord votre date et lieu de naissance, votre CNI, votre numéro de villa, vos parents et votre année de domiciliation dans Mon compte."));
  const { data: house, error: houseError } = await supabaseAdmin
    .from("houses")
    .select("id,region,departement,commune,quartier,delegate_id")
    .eq("id", req.body.houseId)
    .eq("active", true)
    .not("delegate_id", "is", null)
    .maybeSingle();
  if (houseError) return fail(res, houseError);
  if (!house)
    return fail(res, new Error("Cette administration n'est pas disponible."));
  const address = [
    `Villa ${citizenProfile.villa_number}`,
    house.quartier,
    house.commune,
    house.departement,
    house.region,
  ]
    .filter(Boolean)
    .join(", ");
  const { data, error } = await supabaseAdmin
    .from("document_requests")
    .insert({
      citizen_id: req.user.id,
      house_id: req.body.houseId,
      address,
    })
    .select()
    .single();
  if (error) return fail(res, error);
  // Une nouvelle demande arrive : le compteur du delegue concerne doit etre recalcule.
  clearSummaryCache(house.delegate_id);
  res
    .status(201)
    .json({ id: data.id, reference: data.reference, status: data.status });
});
app.get(
  "/api/requests/mine",
  authenticate,
  permit("citizen"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("document_requests")
      .select("*")
      .eq("citizen_id", req.user.id)
      .order("submitted_at", { ascending: false });
    if (error) return fail(res, error);
    res.json(
      data.map((r) => ({
        id: r.id,
        reference: r.reference,
        type: r.document_type,
        status: r.status,
        address: r.address,
        certificatePath: r.certificate_path,
        submittedAt: r.submitted_at,
        processedAt: r.processed_at,
        rejectionCode: r.rejection_code,
        rejectionReason: r.rejection_reason,
      })),
    );
  },
);
// Compteur leger sonde par le front toutes les 20 s.
// Une seule requete, deux colonnes, et un cache memoire de 30 s : la base n'est
// pas sollicitee a chaque sondage.
app.get(
  "/api/delegate/requests/summary",
  authenticate,
  permit("delegate"),
  async (req, res) => {
    res.set("Cache-Control", "private, max-age=10");
    const force = req.query.refresh === "1";
    const cached = force ? null : readSummaryCache(req.user.id);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }
    const { data, error } = await supabaseAdmin
      .from("document_requests")
      .select("status,submitted_at")
      .eq("delegate_id", req.user.id);
    if (error) return fail(res, error);
    const count = (status) => data.filter((r) => r.status === status).length;
    const latest = data.reduce(
      (max, r) => (r.submitted_at > max ? r.submitted_at : max),
      "",
    );
    const payload = {
      pending: count("pending") + count("processing"),
      approved: count("approved"),
      rejected: count("rejected"),
      total: data.length,
      latestSubmittedAt: latest || null,
    };
    // Signature comparee cote client : tant qu'elle ne bouge pas, la liste
    // complete n'est pas rechargee.
    payload.signature = `${payload.total}:${payload.pending}:${payload.approved}:${payload.rejected}:${latest}`;
    res.set("X-Cache", "MISS");
    res.json(writeSummaryCache(req.user.id, payload));
  },
);
app.get(
  "/api/delegate/requests",
  authenticate,
  permit("delegate"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("document_requests")
      .select(
        "*,citizen:profiles!document_requests_citizen_id_fkey(first_name,last_name,phone,citizen_profiles(*)),house:houses!document_requests_house_id_fkey(*)",
      )
      .eq("delegate_id", req.user.id)
      .order("submitted_at", { ascending: false });
    if (error) return fail(res, error);
    res.json(
      data.map((r) => {
        const p = Array.isArray(r.citizen.citizen_profiles)
          ? r.citizen.citizen_profiles[0]
          : r.citizen.citizen_profiles || {};
        return {
          ...r,
          firstName: r.citizen.first_name,
          lastName: r.citizen.last_name,
          phone: r.citizen.phone,
          father:
            `${p.father_first_name || ""} ${p.father_last_name || ""}`.trim(),
          mother:
            `${p.mother_first_name || ""} ${p.mother_last_name || ""}`.trim(),
          idFront: p.id_front_path,
          idBack: p.id_back_path,
          birth_date: r.birth_date || p.birth_date,
          birth_place: r.birth_place || p.birth_place,
          identity_number: r.identity_number || p.identity_number,
          lot_number: r.lot_number || p.villa_number,
          residentSinceYear: p.resident_since_year,
          region: r.house.region,
          departement: r.house.departement,
          commune: r.house.commune,
          quartier: r.house.quartier,
          delegateSequence: r.delegate_sequence,
          certificateFields: normalizeFields(r.house.certificate_fields),
        };
      }),
    );
  },
);
app.patch(
  "/api/delegate/requests/:id",
  authenticate,
  permit("delegate"),
  async (req, res) => {
    try {
      const { data: r, error } = await supabaseAdmin
        .from("document_requests")
        .select(
          "*,citizen:profiles!document_requests_citizen_id_fkey(*,citizen_profiles(*)),house:houses!document_requests_house_id_fkey(*)",
        )
        .eq("id", req.params.id)
        .eq("delegate_id", req.user.id)
        .single();
      if (error) throw error;
      r.citizen_profile = Array.isArray(r.citizen.citizen_profiles)
        ? r.citizen.citizen_profiles[0]
        : r.citizen.citizen_profiles;
      const b = req.body;
      // --- Desapprobation -------------------------------------------------
      if (b.status === "rejected") {
        const code = REJECTION_REASONS[b.rejectionCode]
          ? b.rejectionCode
          : "autre";
        const message = String(b.rejectionReason || "").trim();
        if (!message)
          return fail(
            res,
            new Error(
              "Expliquez au citoyen la raison du refus (message obligatoire).",
            ),
          );
        if (message.length > 600)
          return fail(res, new Error("Le message ne doit pas dépasser 600 caractères."));
        const { error: rejectError } = await supabaseAdmin
          .from("document_requests")
          .update({
            status: "rejected",
            rejection_code: code,
            rejection_reason: message,
            certificate_path: null,
            processed_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        if (rejectError) throw rejectError;
        clearSummaryCache(req.user.id);
        return res.json({
          message: "Demande désapprouvée. Le citoyen a été informé du motif.",
          status: "rejected",
          rejectionCode: code,
          rejectionReason: message,
        });
      }
      if (
        b.status === "approved" &&
        (!b.birthDate ||
          !b.birthPlace ||
          !b.identityNumber ||
          !r.citizen_profile.resident_since_year)
      )
        return fail(
          res,
          new Error(
            "Date, lieu de naissance, numéro CNI et année de domiciliation obligatoires.",
          ),
        );
      let certificatePath = r.certificate_path;
      if (b.status === "approved") {
        const dir = await mkdtemp(join(tmpdir(), "sunu-cert-"));
        try {
          await mkdir(dir, { recursive: true });
          let sealFile = null;
          let legacyTemplate = null;
          if (r.house.seal_path) {
            sealFile = `cachet${extname(r.house.seal_path) || ".png"}`;
            await downloadHouseAsset(r.house.seal_path, join(dir, sealFile));
          } else if (r.house.certificate_path) {
            // Maison créée avant le 31/08/2026 : la zone signature est encore
            // recadrée depuis l'ancien modèle PDF.
            legacyTemplate = "modele.pdf";
            await downloadHouseAsset(
              r.house.certificate_path,
              join(dir, legacyTemplate),
            );
          }
          const request = {
            ...r,
            id: r.id,
            reference: r.reference,
            firstName: r.citizen.first_name,
            lastName: r.citizen.last_name,
            phone: r.citizen.phone,
            father_first_name: r.citizen_profile.father_first_name,
            father_last_name: r.citizen_profile.father_last_name,
            mother_first_name: r.citizen_profile.mother_first_name,
            mother_last_name: r.citizen_profile.mother_last_name,
            resident_since_year: r.citizen_profile.resident_since_year,
            certificate_fields: r.house.certificate_fields,
            delegate_sequence: r.delegate_sequence,
            seal_path: sealFile,
            certificate_path: legacyTemplate,
            birth_date: b.birthDate,
            birth_place: b.birthPlace,
            identity_number: b.identityNumber,
            lot_number: b.lotNumber,
            address: b.address || r.address,
          };
          const filename = await generateCertificate({
            request,
            uploadDir: dir,
          });
          const output = await readFile(join(dir, filename));
          const path = `${r.citizen_id}/${r.reference}.pdf`;
          const { error: uError } = await supabaseAdmin.storage
            .from("generated-certificates")
            .upload(path, output, {
              contentType: "application/pdf",
              upsert: true,
            });
          if (uError) throw uError;
          certificatePath = `generated-certificates/${path}`;
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
      const { error: updateError } = await supabaseAdmin
        .from("document_requests")
        .update({
          status: b.status || "approved",
          birth_date: b.birthDate,
          birth_place: b.birthPlace,
          identity_number: b.identityNumber,
          lot_number: b.lotNumber,
          address: b.address || r.address,
          certificate_path: certificatePath,
          rejection_code: null,
          rejection_reason: null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (updateError) throw updateError;
      clearSummaryCache(req.user.id);
      res.json({
        message: "Demande mise à jour.",
        status: b.status || "approved",
        certificatePath,
      });
    } catch (error) {
      fail(res, error);
    }
  },
);

app.use((error, _req, res, _next) => {
  console.error(error);
  fail(res, error, error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
});
// Ne jamais faire echouer le demarrage du serveur a cause du bootstrap admin :
// sur Vercel une exception ici rendrait TOUTES les routes indisponibles
// (500 sans en-tetes CORS, ce qui ressemble a une erreur CORS cote navigateur).
bootstrapAdmin().catch((error) =>
  console.error("bootstrapAdmin a echoue :", error?.message || error),
);
if (!process.env.VERCEL) {
  app.listen(port, () =>
    console.log(`API Sunu Papier (Supabase) : http://localhost:${port}`),
  );
}
export default app;
