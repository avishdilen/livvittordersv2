import { createClient } from "@supabase/supabase-js";

// CORS
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return new Response(JSON.stringify({ error: `Unsupported content type: ${ct}` }), { status: 415, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const { orderNo, itemId, filename, contentType } = await req.json();
    if (!orderNo || !itemId || !filename) {
      return new Response(JSON.stringify({ error: "Missing orderNo, itemId or filename" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const safeName = String(filename).replace(/[^\w.\- ]+/g, "_");
    const path = `orders/${orderNo}/${itemId}/${safeName}`;

    const { data, error } = await supabase.storage.createSignedUploadUrl("orders", path, { contentType: contentType || "application/octet-stream", upsert: true });
    if (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // data: { path, token }
    return new Response(JSON.stringify({ path: data.path, token: data.token }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
};
