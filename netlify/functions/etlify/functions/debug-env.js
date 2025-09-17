export default async () => {
  const mask = (v) => v ? v.slice(0,6) + "…" : "";
  const out = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: mask(process.env.SUPABASE_SERVICE_ROLE),
    RESEND_API_KEY: mask(process.env.RESEND_API_KEY),
    ORDERS_EMAIL_FROM: process.env.ORDERS_EMAIL_FROM,
    ORDERS_EMAIL_TO: process.env.ORDERS_EMAIL_TO,
    NODE_VERSION: process.env.NODE_VERSION
  };
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" }});
};
