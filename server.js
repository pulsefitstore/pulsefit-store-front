const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_TOKEN;
const ADMIN_SESSION_COOKIE = "pulsefit_admin_session";
const ADMIN_SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 8);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

function parseCookies(header = "") {
  return header.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) acc[name] = value;
    return acc;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function signSession(payload) {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(payload)
    .digest("base64url");
}

function createSessionValue() {
  const payload = JSON.stringify({
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString("hex")
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = signSession(encoded);
  return `${encoded}.${signature}`;
}

function verifySessionValue(value) {
  if (!value || !ADMIN_SESSION_SECRET) return false;
  const [encoded, signature] = String(value).split(".");
  if (!encoded || !signature) return false;

  const expected = signSession(encoded);
  if (expected.length !== signature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return Boolean(payload.exp && Date.now() <= payload.exp);
  } catch {
    return false;
  }
}

function getAdminSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[ADMIN_SESSION_COOKIE];
}

function isAuthed(req) {
  return verifySessionValue(getAdminSession(req));
}

function auth(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN nao configurado." });
  }
  if (isAuthed(req)) {
    return next();
  }
  return res.status(401).json({ error: "Nao autenticado." });
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function parsePrice(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value)
    .replace("R$", "")
    .replace(/\s/g, "");

  // Detecta formato brasileiro: 1.234,56 ou 65,90
  // Detecta formato americano:  1234.56 ou 65.90
  let normalized;
  const hasDotAndComma = text.includes(".") && text.includes(",");
  const onlyComma = !text.includes(".") && text.includes(",");

  if (hasDotAndComma) {
    // ex: 1.234,56 -> ponto é milhar, vírgula é decimal
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (onlyComma) {
    // ex: 65,90 -> vírgula é decimal
    normalized = text.replace(",", ".");
  } else {
    // ex: 65.90 ou 1234 -> já está no formato correto
    normalized = text;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function detectMarketplace(value = "") {
  const text = String(value || "").toLowerCase();
  if (text.includes("shopee")) return "Shopee";
  if (text.includes("mercadolivre") || text.includes("mercado livre") || text.includes("meli.la") || text.includes("mlb")) {
    return "Mercado Livre";
  }
  return "Outro";
}

function extractProductId(value = "") {
  const text = decodeURIComponent(String(value || "").trim()).replace(/#/g, "&");
  const patterns = [
    /wid=(MLB\d{6,})/i,
    /item_id[=:](MLB\d{6,})/i,
    /itemId=(MLB\d{6,})/i,
    /\/(MLB-\d{6,})/i,
    /(MLB-\d{6,})/i,
    /\/(MLB\d{6,})/i,
    /(MLB\d{6,})/i,
    /\/product\/(?:[^/]+\/)?(\d{6,})/i,
    /\/i\.(\d{6,})\.(\d{6,})/i,
    /item(?:_id|Id)?[=:](\d{6,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (match[2]) return match[2];
    if (match[1]) return match[1].replace("-", "").toUpperCase();
  }

  return null;
}

function normalizeProduct(body = {}) {
  const productUrl = cleanText(body.product_url || body.productUrl);
  const affiliateUrl = cleanText(body.affiliate_url || body.affiliateUrl);
  const source =
    cleanText(body.source) ||
    detectMarketplace(productUrl || affiliateUrl);

  const product = {
    title: cleanText(body.title),
    category: cleanText(body.category) || "Outros",
    termo: cleanText(body.termo),
    price: parsePrice(body.price),
    original_price: parsePrice(body.original_price || body.originalPrice),
    rating: Number(body.rating) || 4.7,
    reviews: cleanText(body.reviews) || "0 avaliacoes",
    image: cleanText(body.image),
    item_id: cleanText(body.item_id) || extractProductId(productUrl || affiliateUrl) || null,
    source,
    badge: cleanText(body.badge) || "NOVO",
    image_fit: cleanText(body.image_fit) || "contain",
    affiliate_url: affiliateUrl,
    product_url: productUrl,
    available: body.available !== false
  };

  if (!product.original_price) product.original_price = product.price;
  return product;
}

function stripSourceField(payload = {}) {
  const { source, ...rest } = payload;
  return rest;
}

function shouldRetryWithoutSource(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("source") && (message.includes("column") || message.includes("does not exist"));
}

function validateProduct(payload) {
  if (!payload.title) {
    return "Titulo obrigatorio.";
  }
  if (!payload.image) {
    return "Imagem obrigatoria.";
  }
  if (!payload.affiliate_url) {
    return "Link afiliado obrigatorio.";
  }
  return null;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractMetaTags(html) {
  const tags = [];
  const metaRe = /<meta\b[^>]*>/gi;
  const attrRe = /([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g;
  const matches = String(html || "").match(metaRe) || [];

  for (const tag of matches) {
    const attrs = {};
    attrRe.lastIndex = 0;
    let match;
    while ((match = attrRe.exec(tag))) {
      attrs[match[1].toLowerCase()] = match[2];
    }
    tags.push(attrs);
  }

  return tags;
}

function extractJsonLdObjects(html) {
  const objects = [];
  const scriptRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = String(html || "").matchAll(scriptRe);

  for (const match of matches) {
    const raw = decodeHtmlEntities(String(match[1] || "").trim())
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        objects.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        objects.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return objects;
}

function pickProductFromJsonLd(objects = []) {
  const product = objects.find((item) => {
    const type = item?.["@type"];
    if (Array.isArray(type)) return type.some((t) => String(t).toLowerCase() === "product");
    return String(type || "").toLowerCase() === "product";
  });

  if (!product) return {};

  const imageValue = Array.isArray(product.image) ? product.image[0] : product.image;
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const aggregate = product.aggregateRating || {};

  return {
    title: cleanText(product.name),
    image: cleanText(imageValue),
    price: parsePrice(offer?.price ?? offer?.lowPrice ?? product?.price ?? ""),
    originalPrice: parsePrice(offer?.highPrice ?? offer?.price ?? product?.price ?? ""),
    reviews: aggregate.reviewCount ? `${String(aggregate.reviewCount).replace(/[^\d]/g, "")} avaliacoes` : ""
  };
}

function pickMeta(tags, keys) {
  for (const key of keys) {
    const found = tags.find((tag) => {
      const prop = (tag.property || tag.name || tag["itemprop"] || "").toLowerCase();
      return prop === key.toLowerCase() && tag.content;
    });
    if (found?.content) return decodeHtmlEntities(found.content).trim();
  }
  return "";
}

function extractPreviewFromHtml(html) {
  const tags = extractMetaTags(html);
  const jsonLdObjects = extractJsonLdObjects(html);
  const jsonLdProduct = pickProductFromJsonLd(jsonLdObjects);
  const titleTag = String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  const title =
    pickMeta(tags, ["og:title", "twitter:title", "title", "itemprop=name"]) ||
    jsonLdProduct.title ||
    decodeHtmlEntities(titleTag?.[1] || "").trim();
  const image =
    pickMeta(tags, ["og:image", "twitter:image", "twitter:image:src", "image", "itemprop=image"]) ||
    jsonLdProduct.image ||
    "";
  const priceRaw =
    pickMeta(tags, [
      "product:price:amount",
      "og:price:amount",
      "product:price:standard_amount",
      "og:price:standard_amount",
      "twitter:data1",
      "price",
      "product:price"
    ]) || String(jsonLdProduct.price || "");
  const originalPriceRaw =
    pickMeta(tags, [
      "product:price:standard_amount",
      "og:price:standard_amount",
      "product:price:amount",
      "og:price:amount"
    ]) || String(jsonLdProduct.originalPrice || "");
  const categoryRaw =
    pickMeta(tags, [
      "product:category",
      "og:category",
      "article:section",
      "section",
      "category"
    ]) || "";
  const reviewsRaw =
    pickMeta(tags, [
      "review_count",
      "og:review_count",
      "product:review_count",
      "rating_count",
      "og:rating_count",
      "product:rating_count"
    ]) || jsonLdProduct.reviews || "";

  const price = parsePrice(priceRaw);
  const originalPrice = parsePrice(originalPriceRaw);
  const category = cleanText(categoryRaw);
  const reviewsNumber = Number(String(reviewsRaw).replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."));

  return {
    title: title.replace(/\s+/g, " ").trim(),
    image: image.trim(),
    price: Number.isFinite(price) && price > 0 ? price : 0,
    originalPrice: Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : 0,
    category: category || "",
    reviews: Number.isFinite(reviewsNumber) && reviewsNumber > 0 ? `${Math.trunc(reviewsNumber).toLocaleString("pt-BR")} avaliações` : ""
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Pulse Fit Backend",
    mode: "manual"
  });
});

app.get("/api/products", async (req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("available", true)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get("/api/session", (req, res) => {
  res.json({
    ok: true,
    authenticated: isAuthed(req)
  });
});

app.get("/api/product-preview", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    if (!rawUrl) {
      return res.status(400).json({ error: "URL obrigatoria." });
    }

    let targetUrl;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: "URL invalida." });
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return res.status(400).json({ error: "Protocolo invalido." });
    }

    // Bloqueia SSRF: impede requisicoes para IPs internos/loopback
    const hostname = targetUrl.hostname;
    if (
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(hostname) ||
      /^(::1|::ffff:127\.|localhost)$/i.test(hostname)
    ) {
      return res.status(400).json({ error: "URL nao permitida." });
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        referer: `${targetUrl.origin}/`
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Falha ao ler a pagina (${response.status}).` });
    }

    const html = await response.text();
    const preview = extractPreviewFromHtml(html);

    res.json({
      ok: true,
      title: preview.title,
      image: preview.image,
      price: preview.price || 0,
      originalPrice: preview.originalPrice || 0,
      category: preview.category || "",
      reviews: preview.reviews || ""
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/login", (req, res) => {
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN nao configurado." });
  }

  const token = String(req.body?.token || req.body?.password || "").trim();
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token invalido." });
  }

  const sessionValue = createSessionValue();
  res.setHeader(
    "Set-Cookie",
    serializeCookie(ADMIN_SESSION_COOKIE, sessionValue, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS
    })
  );

  res.json({ ok: true, authenticated: true });
});

app.post("/api/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 0
    })
  );

  res.json({ ok: true });
});

app.post("/api/add-product", auth, async (req, res) => {
  try {
    const payload = normalizeProduct({
      ...(req.body?.overrides || {}),
      affiliate_url: req.body?.affiliateUrl || req.body?.affiliate_url,
      product_url: req.body?.url || req.body?.product_url,
      available: true
    });

    const validationError = validateProduct(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    let { data, error } = await supabase.from("products").insert(payload).select().single();
    if (error && shouldRetryWithoutSource(error)) {
      ({ data, error } = await supabase.from("products").insert(stripSourceField(payload)).select().single());
    }
    if (error) throw error;

    res.json({ ok: true, product: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/products/:id", auth, async (req, res) => {
  try {
    const payload = normalizeProduct(req.body);
    const validationError = validateProduct(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    let { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error && shouldRetryWithoutSource(error)) {
      ({ data, error } = await supabase
        .from("products")
        .update(stripSourceField(payload))
        .eq("id", req.params.id)
        .select()
        .single());
    }

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, product: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/products/:id", auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .update({ available: false })
      .eq("id", req.params.id)
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Produto nao encontrado." });

    res.json({ ok: true, removed: true, id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



app.post("/api/refresh-prices-stream", auth, async (req, res) => {
  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, title, price, original_price, product_url")
    .not("product_url", "is", null)
    .neq("product_url", "");

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }

  if (!products || products.length === 0) {
    return res.status(200).json({ error: "Nenhum produto com URL cadastrada." });
  }

  // Inicia SSE (Server-Sent Events)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(obj) {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  send({ type: "start", total: products.length });

  let done = 0;

  for (const product of products) {
    const result = { id: product.id, title: product.title, status: "ok" };

    try {
      let targetUrl;
      try { targetUrl = new URL(product.product_url); } catch {
        result.status = "url_invalida";
        done++;
        send({ type: "progress", done, result });
        continue;
      }

      if (!["http:", "https:"].includes(targetUrl.protocol)) {
        result.status = "url_invalida";
        done++;
        send({ type: "progress", done, result });
        continue;
      }

      const hostname = targetUrl.hostname;
      if (
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(hostname) ||
        /^(::1|::ffff:127\.|localhost)$/i.test(hostname)
      ) {
        result.status = "url_invalida";
        done++;
        send({ type: "progress", done, result });
        continue;
      }

      const response = await fetch(targetUrl.toString(), {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
          referer: `${targetUrl.origin}/`
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        result.status = "sem_resposta";
        result.httpStatus = response.status;
        done++;
        send({ type: "progress", done, result });
        continue;
      }

      const html = await response.text();
      const preview = extractPreviewFromHtml(html);

      if (!preview.price || preview.price <= 0) {
        result.status = "preco_nao_encontrado";
        done++;
        send({ type: "progress", done, result });
        continue;
      }

      result.preco_anterior = product.price;
      result.preco_novo = preview.price;

      if (preview.price === product.price) {
        result.status = "sem_alteracao";
        done++;
        send({ type: "progress", done, result });
        continue;
      }

      const newOriginalPrice = preview.originalPrice > 0 ? preview.originalPrice : preview.price;

      const { error: updateError } = await supabase
        .from("products")
        .update({
          price: preview.price,
          original_price: newOriginalPrice,
          last_checked_at: new Date().toISOString()
        })
        .eq("id", product.id);

      result.status = updateError ? "erro_salvar" : "atualizado";
      if (updateError) result.erro = updateError.message;

    } catch (e) {
      result.status = "erro";
      result.erro = e.message;
    }

    done++;
    send({ type: "progress", done, result });
    await new Promise((r) => setTimeout(r, 800));
  }

  send({ type: "done", total: products.length });
  res.end();
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /

Sitemap: https://pulsefitstore.online/sitemap.xml
`);
});

app.get("/sitemap.xml", (req, res) => {
  res.set("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://pulsefitstore.online/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>`);
});

app.listen(PORT, () => console.log("Pulse Fit Backend rodando na porta " + PORT));
