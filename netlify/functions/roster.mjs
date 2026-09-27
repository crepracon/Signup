import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { RACES, SERVER_TYPES, ROLES } from "../../game.mjs";

// One blob per player keeps simultaneous sign-ups from overwriting each other.
const MAX_PLAYERS = 250;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const store = () => getStore({ name: "roster", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function clean(s, max) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validate(input) {
  const p = {
    name: clean(input.name, 40),
    faction: clean(input.faction, 10),
    race: clean(input.race, 20),
    cls: clean(input.cls, 20),
    role: clean(input.role, 10),
    server: clean(input.server, 20),
    note: clean(input.note, 80),
  };
  if (!p.name) return { error: "Add your Discord name." };
  if (!RACES[p.faction]) return { error: "Choose Horde or Alliance." };
  if (!RACES[p.faction][p.race]) return { error: "That race isn't available for your faction." };
  if (!RACES[p.faction][p.race].includes(p.cls)) return { error: `${p.race} can't be a ${p.cls} in Forever.` };
  if (!ROLES.includes(p.role)) return { error: "Choose a main role." };
  if (!SERVER_TYPES.includes(p.server)) return { error: "Choose a server type." };
  return { player: p };
}

async function loadAll(s) {
  const { blobs } = await s.list();
  const all = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return all.filter(Boolean);
}

const publicView = ({ keyHash, ...rest }) => rest;

function authorized(req, entry) {
  const admin = process.env.ADMIN_KEY;
  const given = req.headers.get("x-admin-key");
  if (admin && given && sameSecret(given, admin)) return true;
  const key = req.headers.get("x-edit-key");
  return !!key && sameSecret(hash(key), entry.keyHash);
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      if (url.searchParams.has("checkAdmin")) {
        const admin = process.env.ADMIN_KEY;
        return json({ ok: !!admin && sameSecret(req.headers.get("x-admin-key"), admin) });
      }
      const players = (await loadAll(s)).map(publicView);
      players.sort((a, b) => a.name.localeCompare(b.name));
      return json({ players });
    }

    if (req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return json({ error: "Couldn't read that sign-up." }, 400); }
      const { player, error } = validate(body);
      if (error) return json({ error }, 400);

      const all = await loadAll(s);
      if (all.length >= MAX_PLAYERS) return json({ error: "The roster is full." }, 409);
      if (all.some((p) => p.name.toLowerCase() === player.name.toLowerCase()))
        return json({ error: `${player.name} is already on the roll. Edit that entry instead.` }, 409);

      const newId = randomUUID();
      const editKey = randomBytes(24).toString("base64url");
      const now = new Date().toISOString();
      const entry = { id: newId, ...player, createdAt: now, updatedAt: now, keyHash: hash(editKey) };
      await s.setJSON(newId, entry);
      return json({ player: publicView(entry), editKey }, 201);
    }

    if (req.method === "PUT" || req.method === "DELETE") {
      if (!id || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Unknown entry." }, 400);
      const entry = await s.get(id, { type: "json" });
      if (!entry) return json({ error: "That entry no longer exists." }, 404);
      if (!authorized(req, entry)) return json({ error: "Only the person who signed this entry can change it." }, 403);

      if (req.method === "DELETE") {
        await s.delete(id);
        return json({ ok: true });
      }

      let body;
      try { body = await req.json(); } catch { return json({ error: "Couldn't read those changes." }, 400); }
      const { player, error } = validate(body);
      if (error) return json({ error }, 400);
      const all = await loadAll(s);
      if (all.some((p) => p.id !== id && p.name.toLowerCase() === player.name.toLowerCase()))
        return json({ error: `${player.name} is already on the roll.` }, 409);

      const updated = { ...entry, ...player, updatedAt: new Date().toISOString() };
      await s.setJSON(id, updated);
      return json({ player: publicView(updated) });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (err) {
    console.error(err);
    return json({ error: "The roster couldn't be reached. Try again in a moment." }, 500);
  }
};

export const config = { path: "/api/roster" };
