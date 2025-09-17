import React, { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { PRODUCTS, priceLine } from "./pricing";
import { copy, downloadJSON, fmt, makeOrderNo } from "./utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Bank details (edit here for now; can move to env-backed function later)
const BANK = {
  beneficiary: "Livvitt Plus N.V.",
  bank: "Your Bank Name",
  account: "000123456789",
  iban: "XX00 0000 0000 0000 0000 00",
  swift: "ABCDEF12",
  currency: "USD"
};

const ACCEPT = ".pdf,.ai,.eps,.svg,.png,.jpg,.jpeg";

function emptyItem() {
  return {
    id: nanoid(6),
    productKey: "banner13oz",
    w: 36, h: 24, unit: "in",
    qty: 1,
    opts: {
      hems: false,
      grommets: false,
      lamination: false,
      doubleSided: false,
      polePockets: { sides: [], sizeIn: 3 }
    },
    uploads: [] // {filename, size, type, path, previewUrl}
  };
}

export default function App() {
  const [orderNo] = useState(makeOrderNo());
  const [items, setItems] = useState([emptyItem()]);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [showCheckout, setShowCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const totals = useMemo(() => {
    const sums = items.map((it) => priceLine({
      productKey: it.productKey, w: it.w, h: it.h, unit: it.unit, qty: it.qty, opts: it.opts
    }));
    const lineTotals = sums.map(s => s?.cents?.total || 0);
    const subtotal = lineTotals.reduce((a,b)=>a+b,0);
    return { sums, subtotal };
  }, [items]);

  const validContact = contact.name.trim() && /\S+@\S+\.\S+/.test(contact.email);

  function updateItem(id, patch) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }

  function updateItemOpts(id, patch) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, opts: { ...it.opts, ...patch } } : it));
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()]);
  }

  function removeItem(id) {
    setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev);
  }

  async function signUpload({ itemId, filename, contentType }) {
    const r = await fetch("/.netlify/functions/sign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNo, itemId, filename, contentType })
    });
    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      throw new Error(`sign-upload failed: ${r.status} ${t}`);
    }
    return r.json();
  }

  async function handleChooseFiles(item) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      const remain = 5 - item.uploads.length;
      const batch = files.slice(0, Math.max(0, remain));

      const uploaded = [];
      for (const file of batch) {
        try {
          const { path, token } = await signUpload({
            itemId: item.id,
            filename: file.name,
            contentType: file.type || "application/octet-stream"
          });
          // PUT to signed upload endpoint
          const uploadUrl = `${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(path)}?token=${encodeURIComponent(token)}`;
          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "x-upsert": "true"
            },
            body: file
          });
          if (!put.ok) {
            const t = await put.text().catch(()=> "");
            throw new Error(`Upload PUT failed: ${put.status} ${t}`);
          }
          uploaded.push({
            filename: file.name,
            size: file.size,
            type: file.type,
            path,
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null
          });
        } catch (err) {
          console.error(err);
          setToast(String(err.message || err));
        }
      }
      if (uploaded.length) {
        updateItem(item.id, { uploads: [...item.uploads, ...uploaded] });
      }
    };
    input.click();
  }

  async function confirmAndSend() {
    setBusy(true);
    try {
      const payload = {
        orderNo,
        contact,
        items: items.map((it) => ({
          id: it.id,
          productKey: it.productKey,
          productName: PRODUCTS[it.productKey].name,
          size: { w: it.w, h: it.h, unit: it.unit },
          qty: it.qty,
          opts: it.opts
        })),
        pricing: {
          lines: totals.sums,
          subtotalCents: totals.subtotal
        },
        uploadedByItem: items.map((it)=>({ itemId: it.id, paths: it.uploads.map(u=>u.path) })),
        bank: BANK
      };

      const r = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok || !data.ok) {
        throw new Error(data?.error || "create-order failed");
      }
      setToast("Order sent! Check your email.");
      setShowCheckout(false);
    } catch (err) {
      console.error(err);
      setToast(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  const grandTotal = totals.subtotal;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Livvitt — Custom Print Order</h1>
        <div className="text-sm text-gray-500">Order No: <span className="font-mono">{orderNo}</span></div>
      </header>

      <div className="grid md:grid-cols-[1fr_360px] gap-6">
        {/* Left column — items */}
        <div className="space-y-4">
          {items.map((it, idx) => {
            const sum = totals.sums[idx];
            const prod = PRODUCTS[it.productKey];

            return (
              <div key={it.id} className="bg-white shadow-sm rounded-xl p-4 border">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">Item {idx + 1}</div>
                  <button onClick={()=>removeItem(it.id)} className="text-sm text-red-600 hover:underline" disabled={items.length===1}>Remove</button>
                </div>

                {/* Product */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block">
                    <div className="text-sm mb-1">Product</div>
                    <select value={it.productKey} onChange={e=>updateItem(it.id,{productKey:e.target.value, opts: emptyItem().opts})}
                            className="w-full border rounded-lg p-2">
                      {Object.values(PRODUCTS).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                    </select>
                  </label>

                  <label className="block">
                    <div className="text-sm mb-1">Quantity</div>
                    <input type="number" min="1" value={it.qty} onChange={e=>updateItem(it.id,{qty: Math.max(1, Number(e.target.value||1))})}
                           className="w-full border rounded-lg p-2"/>
                  </label>

                  <div className="block">
                    <div className="text-sm mb-1">Units</div>
                    <div className="flex gap-2">
                      {["in","ft"].map(u=>(
                        <button key={u}
                          onClick={()=>updateItem(it.id,{unit: u})}
                          className={`px-3 py-2 border rounded-lg ${it.unit===u?"bg-gray-900 text-white":"bg-white"}`}>{u}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Size */}
                <div className="grid sm:grid-cols-3 gap-3 mt-3">
                  <label className="block">
                    <div className="text-sm mb-1">Width ({it.unit})</div>
                    <input type="number" min="0" value={it.w} onChange={e=>updateItem(it.id,{w: Number(e.target.value||0)})}
                           className="w-full border rounded-lg p-2"/>
                  </label>
                  <label className="block">
                    <div className="text-sm mb-1">Height ({it.unit})</div>
                    <input type="number" min="0" value={it.h} onChange={e=>updateItem(it.id,{h: Number(e.target.value||0)})}
                           className="w-full border rounded-lg p-2"/>
                  </label>

                  {/* Quick sizes */}
                  <div className="block">
                    <div className="text-sm mb-1">Quick sizes</div>
                    <div className="flex flex-wrap gap-2">
                      {prod.quickSizes.map((q,i)=>(
                        <button key={i} onClick={()=>updateItem(it.id,{w:q.w, h:q.h, unit:q.unit})}
                          className="text-xs px-2 py-1 border rounded-full hover:bg-gray-100">
                          {q.w}×{q.h} {q.unit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Options (per product) */}
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {prod.options.hems && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={it.opts.hems} onChange={e=>updateItemOpts(it.id,{hems:e.target.checked})}/>
                      <span>Hems <span className="text-xs text-gray-500">($0.50/lf)</span></span>
                    </label>
                  )}
                  {prod.options.grommets && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={it.opts.grommets} onChange={e=>updateItemOpts(it.id,{grommets:e.target.checked})}/>
                      <span>Grommets <span className="text-xs text-gray-500">(est. every 24″, $0.35 each)</span></span>
                    </label>
                  )}
                  {prod.options.lamination && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={it.opts.lamination} onChange={e=>updateItemOpts(it.id,{lamination:e.target.checked})}/>
                      <span>Lamination <span className="text-xs text-gray-500">(+$2.00/sq-ft)</span></span>
                    </label>
                  )}
                  {prod.options.doubleSided && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={it.opts.doubleSided} onChange={e=>updateItemOpts(it.id,{doubleSided:e.target.checked})}/>
                      <span>Double-sided <span className="text-xs text-gray-500">(+60% of base)</span></span>
                    </label>
                  )}
                </div>

                {/* Pole pockets */}
                {prod.options.polePockets && (
                  <div className="mt-3 border rounded-lg p-3">
                    <div className="text-sm font-medium mb-2">Pole pockets</div>
                    <div className="flex flex-wrap gap-3">
                      {["top","bottom","left","right"].map(s=>(
                        <label key={s} className="flex items-center gap-2">
                          <input type="checkbox"
                            checked={it.opts.polePockets.sides.includes(s)}
                            onChange={(e)=>{
                              const sides = new Set(it.opts.polePockets.sides);
                              e.target.checked ? sides.add(s) : sides.delete(s);
                              updateItemOpts(it.id,{ polePockets: { ...it.opts.polePockets, sides: Array.from(sides) }});
                            }}/>
                          <span className="capitalize">{s}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2">
                      <label className="text-sm">Pocket size (in)</label>
                      <input type="number" min="1" step="0.5" value={it.opts.polePockets.sizeIn}
                        onChange={e=>updateItemOpts(it.id,{ polePockets: { ...it.opts.polePockets, sizeIn: Number(e.target.value||3) }})}
                        className="ml-2 w-24 border rounded-lg p-1"/>
                      <span className="text-xs text-gray-500 ml-2">Cost scales vs 3″ baseline</span>
                    </div>
                  </div>
                )}

                {/* Uploads */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Artwork files ({it.uploads.length}/5)</div>
                    <button onClick={()=>handleChooseFiles(it)} className="px-3 py-1.5 text-sm border rounded-lg">
                      Add files
                    </button>
                  </div>
                  <div className="mt-2 grid sm:grid-cols-3 gap-3">
                    {it.uploads.map((u, i)=>(
                      <div key={i} className="border rounded-lg p-2">
                        {u.previewUrl ? (
                          <img src={u.previewUrl} alt={u.filename} className="w-full h-28 object-cover rounded"/>
                        ) : (
                          <div className="h-28 flex items-center justify-center text-xs text-gray-500">No preview</div>
                        )}
                        <div className="mt-1 text-xs truncate">{u.filename}</div>
                        <div className="text-[11px] text-gray-500">{(u.size/1024/1024).toFixed(2)} MB</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Line total */}
                <div className="mt-3 text-sm bg-gray-50 border rounded-lg p-3">
                  {!sum?.error ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span>Per-item price</span>
                        <span className="font-medium">{fmt(sum.cents.oneItem)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Line subtotal</span>
                        <span>{fmt(sum.cents.lineSub)}</span>
                      </div>
                      {sum.volumeRate > 0 && (
                        <div className="flex items-center justify-between">
                          <span>Volume discount ({Math.round(sum.volumeRate*100)}%)</span>
                          <span className="text-green-700">−{fmt(sum.cents.discount)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-lg mt-1">
                        <span className="font-medium">Line total</span>
                        <span className="font-semibold">{fmt(sum.cents.total)}</span>
                      </div>
                      {sum.grommetCount > 0 && it.opts.grommets && (
                        <div className="text-xs text-gray-500 mt-1">Grommets (est.): {sum.grommetCount}</div>
                      )}
                      {sum.breakdown.minApplied && (
                        <div className="text-xs text-gray-500 mt-1">Min charge per item applied.</div>
                      )}
                    </>
                  ) : <div className="text-red-600">{sum.error}</div>}
                </div>
              </div>
            );
          })}

          <div className="flex gap-2">
            <button onClick={addItem} className="px-3 py-2 border rounded-lg">+ Add another item</button>
            <button onClick={()=>downloadJSON(`${orderNo}.json`, {
              orderNo, contact, items, pricing: totals
            })} className="px-3 py-2 border rounded-lg">Download Order JSON</button>
          </div>

          {/* Contact */}
          <div className="bg-white border rounded-xl p-4">
            <div className="text-lg font-medium mb-2">Contact details</div>
            <div className="grid sm:grid-cols-3 gap-3">
              <input placeholder="Full name" className="border rounded-lg p-2" value={contact.name} onChange={e=>setContact({...contact, name:e.target.value})}/>
              <input placeholder="Email" className="border rounded-lg p-2" value={contact.email} onChange={e=>setContact({...contact, email:e.target.value})}/>
              <input placeholder="Phone (optional)" className="border rounded-lg p-2" value={contact.phone} onChange={e=>setContact({...contact, phone:e.target.value})}/>
            </div>
          </div>
        </div>

        {/* Right column — sticky summary */}
        <aside className="md:sticky md:top-4 h-fit bg-white border rounded-xl p-4">
          <div className="text-lg font-semibold mb-2">Order Summary</div>
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span className="font-medium">{fmt(grandTotal)}</span>
          </div>
          <hr className="my-3"/>
          <button
            disabled={!validContact || busy}
            onClick={()=>setShowCheckout(true)}
            className={`w-full py-2 rounded-lg text-white ${validContact ? "bg-gray-900 hover:opacity-90":"bg-gray-400"} `}>
            Checkout (Bank Transfer)
          </button>
          <div className="text-[11px] text-gray-500 mt-2">We’ll email you and the customer a confirmation with file links.</div>
        </aside>
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-4 max-w-lg w-full">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Confirm Order</div>
              <button onClick={()=>setShowCheckout(false)} className="text-gray-500">✕</button>
            </div>
            <div className="mt-2 text-sm">
              <div>Order No: <span className="font-mono">{orderNo}</span></div>
              <div>Total: <span className="font-semibold">{fmt(grandTotal)}</span></div>
            </div>
            <div className="mt-3 border rounded-lg p-3 text-sm">
              <div className="font-medium mb-1">Bank Transfer Details</div>
              <div>Beneficiary: {BANK.beneficiary}</div>
              <div>Bank: {BANK.bank}</div>
              <div>Account: {BANK.account}</div>
              <div>IBAN: {BANK.iban}</div>
              <div>SWIFT: {BANK.swift}</div>
              <div>Currency: {BANK.currency}</div>
              <div className="flex gap-2 mt-2">
                <button
                  className="px-3 py-1.5 border rounded-lg text-xs"
                  onClick={()=>copy(orderNo)}>Copy Order No</button>
                <button
                  className="px-3 py-1.5 border rounded-lg text-xs"
                  onClick={()=>copy(`Beneficiary: ${BANK.beneficiary}\nBank: ${BANK.bank}\nAccount: ${BANK.account}\nIBAN: ${BANK.iban}\nSWIFT: ${BANK.swift}\nCurrency: ${BANK.currency}`)}
                >Copy Bank Details</button>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={()=>setShowCheckout(false)} className="px-3 py-2 border rounded-lg">Cancel</button>
              <button disabled={busy} onClick={confirmAndSend} className="px-3 py-2 rounded-lg bg-gray-900 text-white">
                {busy ? "Sending..." : "Confirm & Send Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white text-sm px-3 py-2 rounded-lg"
             onClick={()=>setToast("")}>
          {toast}
        </div>
      )}
    </div>
  );
}
