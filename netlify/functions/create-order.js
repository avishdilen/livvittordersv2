import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const resend = new Resend(process.env.RESEND_API_KEY);

function fmtUSD(cents) {
  return `$${(cents/100).toFixed(2)}`;
}

function renderEmail({ orderNo, contact, items, pricing, filesByItem, bank }) {
  const lines = items.map((it, i) => {
    const p = pricing?.lines?.[i];
    const files = filesByItem[it.id] || [];
    const size = `${it.size.w}×${it.size.h} ${it.size.unit}`;
    const price = p ? fmtUSD(p.cents.total) : "";
    const f = files.length ? files.map(x=>`<li><a href="${x.url}">${x.name}</a> (${Math.round(x.expires/86400)} days)</li>`).join("") : "<li>(no file)</li>";
    return `
      <tr>
        <td style="padding:6px 8px;border:1px solid #eee;">${i+1}</td>
        <td style="padding:6px 8px;border:1px solid #eee;">${it.productName}</td>
        <td style="padding:6px 8px;border:1px solid #eee;">${size}</td>
        <td style="padding:6px 8px;border:1px solid #eee;">${it.qty}</td>
        <td style="padding:6px 8px;border:1px solid #eee;">${price}</td>
      </tr>
      <tr>
        <td colspan="5" style="padding:4px 8px;border:1px solid #eee;">
          <div style="font-size:12px;color:#444">Files:</div>
          <ul style="margin:4px 0 0 16px;padding:0">${f}</ul>
        </td>
      </tr>
    `;
  }).join("");

  const total = fmtUSD(pricing?.subtotalCents || 0);

  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.4;color:#111">
    <h2>Order ${orderNo}</h2>
    <p><b>Customer</b><br/>
    ${contact.name}<br/>
    ${contact.email}${contact.phone ? " · "+contact.phone : ""}</p>

    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin-top:8px">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 8px;border:1px solid #eee;">#</th>
          <th style="text-align:left;padding:6px 8px;border:1px solid #eee;">Product</th>
          <th style="text-align:left;padding:6px 8px;border:1px solid #eee;">Size</th>
          <th style="text-align:left;padding:6px 8px;border:1px solid #eee;">Qty</th>
          <th style="text-align:left;padding:6px 8px;border:1px solid #eee;">Line Total</th>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>

    <p style="margin-top:8px"><b>Order Total:</b> ${total}</p>

    <h3>Bank Transfer Instructions</h3>
    <p>
      Beneficiary: ${bank.beneficiary}<br/>
      Bank: ${bank.bank}<br/>
      Account: ${bank.account}<br/>
      IBAN: ${bank.iban}<br/>
      SWIFT: ${bank.swift}<br/>
      Currency: ${bank.currency}
    </p>

    <p style="font-size:12px;color:#666">Signed links expire in 7 days.</p>
  </div>`;
}

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
    const body = await req.json();
    const { orderNo, contact, items, pricing, uploadedByItem = [], bank } = body || {};
    if (!orderNo || !contact?.email || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "Missing orderNo, contact.email, or items" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Create signed read URLs (7 days)
    const filesByItem = {};
    for (const row of uploadedByItem) {
      const list = [];
      for (const path of row.paths || []) {
        const { data, error } = await supabase.storage.from("orders").createSignedUrl(path, 60 * 60 * 24 * 7);
        if (!error && data?.signedUrl) {
          list.push({ url: data.signedUrl, name: path.split("/").pop(), expires: 60*60*24*7 });
        }
      }
      filesByItem[row.itemId] = list;
    }

    const html = renderEmail({ orderNo, contact, items, pricing, filesByItem, bank });

    const toList = [process.env.ORDERS_EMAIL_TO, contact.email].filter(Boolean);
    const subject = `Order ${orderNo} — Files & Details`;

    // Send with Resend
    const r = await resend.emails.send({
      from: process.env.ORDERS_EMAIL_FROM,
      to: toList,
      subject,
      html
    });

    if (r.error) {
      console.error(r.error);
      return new Response(JSON.stringify({ error: r.error.message || "Email failed" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, filesByItem }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
};
