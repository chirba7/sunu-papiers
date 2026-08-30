// Point d'entree des fonctions serverless Vercel.
// Vercel detecte automatiquement le dossier /api ; vercel.json redirige
// toutes les URL vers ce fichier, qui expose l'application Express.
import app from "../src/server-supabase.js";

export default app;
