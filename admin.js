let currentProduct = null;
let editingId = null;
let productsCache = [];

const $ = (id) => document.getElementById(id);

function backend() {
  return $("backendUrl").value.trim().replace(/\/$/, "");
}

function setStatus(msg, isError = false) {
  $("status").className = isError ? "error" : "muted";
  $("status").textContent = msg;
}

function setConfigStatus(msg, isError = false) {
  $("configStatus").className = isError ? "error" : "muted";
  $("configStatus").textContent = msg;
}

function formatBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parsePrice(v) {
  const s = String(v || "")
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function detectMarketplace(url) {
  const text = String(url || "").toLowerCase();
  if (text.includes("shopee")) return "Shopee";
  if (text.includes("mercadolivre") || text.includes("meli.la") || text.includes("mlb")) return "Mercado Livre";
  return "Outro";
}

function extractProductId(url) {
  const decoded = decodeURIComponent(String(url || "")).replace(/#/g, "&");
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
    const match = decoded.match(pattern);
    if (!match) continue;
    if (match[2]) return match[2];
    if (match[1]) return match[1].replace("-", "").toUpperCase();
  }
  return null;
}

function showPreview() {
  $("preview").classList.remove("hidden");
}

function hidePreview() {
  $("preview").classList.add("hidden");
}

function normalizeCategory(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (text.includes("suplement")) return "Suplementos";
  if (text.includes("calc") || text.includes("shoe") || text.includes("sapat")) return "Calcados";
  if (text.includes("roup") || text.includes("vest")) return "Roupas";
  if (text.includes("equip") || text.includes("acess") || text.includes("fitness")) return "Equipamentos";
  return "Outros";
}

function setSourceFromUrl(url, target = $("p-source")) {
  if (!target) return;
  const source = detectMarketplace(url);
  target.value = source;
}

function syncSourceSelection() {
  const productUrl = $("productUrl").value.trim();
  const affiliateUrl = $("affiliateUrl").value.trim();
  setSourceFromUrl(productUrl || affiliateUrl);
}

function applyPreviewFields(preview = {}) {
  if (preview.title) {
    $("p-title").value = preview.title;
  }
  if (preview.image) {
    $("p-image-url").value = preview.image;
    $("p-image").src = preview.image;
  }
  if (preview.price) {
    $("p-price").value = formatBRL(preview.price);
    $("p-originalPrice").value = formatBRL(preview.price);
  }
  if (preview.originalPrice) {
    $("p-originalPrice").value = formatBRL(preview.originalPrice);
  }
  if (preview.category) {
    $("p-category").value = normalizeCategory(preview.category);
  }
  if (preview.reviews) {
    $("p-reviews").value = preview.reviews;
  }
}

async function fetchProductPreview(url) {
  if (!backend() || !url) return {};
  const r = await fetch(backend() + "/api/product-preview?url=" + encodeURIComponent(url), {
    credentials: "include"
  });
  const raw = await r.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {}
  if (!r.ok) throw new Error(data.error || data.message || raw || "Erro");
  return data;
}

async function openProduct() {
  const url = $("productUrl").value.trim();
  if (!url) return alert("Cole o link do produto primeiro.");
  try {
    const preview = await fetchProductPreview(url);
    openManual(extractProductId(url), preview);
    setStatus("Campos preenchidos automaticamente quando possivel.");
  } catch (e) {
    openManual(extractProductId(url));
    setStatus("Nao foi possivel extrair nome/foto automaticamente.", true);
  }
}

function openManual(itemId, prefill = {}) {
  editingId = null;
  $("previewTitle").textContent = "Dados do produto";
  currentProduct = {
    affiliate_url: $("affiliateUrl").value.trim(),
    product_url: $("productUrl").value.trim(),
    source: $("p-source").value
  };
  $("p-image").src = "";
  $("p-title").value = "";
  $("p-category").value = "Outros";
  $("p-termo").value = "";
  $("p-price").value = "";
  $("p-originalPrice").value = "";
  $("p-rating").value = "4.7";
  $("p-reviews").value = "0 avaliacoes";
  $("p-image-url").value = prefill.image || "";
  $("p-item-id").value = itemId || extractProductId($("productUrl").value.trim()) || "";
  $("p-badge").value = "NOVO";
  $("p-image-fit").value = "medium";
  syncSourceSelection();
  applyPreviewFields(prefill);
  showPreview();
  setTimeout(() => $("p-title").focus(), 50);
}

function fillForm(p) {
  currentProduct = p;
  $("p-image").src = p.image || "";
  $("p-title").value = p.title || "";
  $("p-category").value = p.category || "Outros";
  $("p-termo").value = p.termo || "";
  $("p-price").value = formatBRL(p.price);
  $("p-originalPrice").value = formatBRL(p.original_price || p.price);
  $("p-rating").value = p.rating || "4.7";
  $("p-reviews").value = p.reviews || "0 avaliacoes";
  $("p-image-url").value = p.image || "";
  $("p-item-id").value = p.item_id || "";
  $("p-source").value = p.source || detectMarketplace(p.product_url || p.affiliate_url);
  $("p-badge").value = p.badge || "NOVO";
  $("p-image-fit").value = p.image_fit || "medium";
  syncSourceSelection();
  const originalUrl = p.product_url || "";
  const affiliateUrl = p.affiliate_url || "";
  const summary = [
    originalUrl ? `Original: ${originalUrl}` : "",
    affiliateUrl ? `Afiliado: ${affiliateUrl}` : ""
  ].filter(Boolean).join(" | ");
  const statusEl = $("status");
  if (statusEl && summary) {
    statusEl.textContent = summary;
    statusEl.className = "muted";
  }
  showPreview();
}

function collectForm() {
  const source = $("p-source").value.trim() || detectMarketplace($("productUrl").value.trim() || $("affiliateUrl").value.trim());

  return {
    title: $("p-title").value.trim(),
    category: $("p-category").value,
    termo: $("p-termo").value.trim(),
    price: parsePrice($("p-price").value),
    original_price: parsePrice($("p-originalPrice").value),
    rating: parseFloat($("p-rating").value) || 4.7,
    reviews: $("p-reviews").value.trim(),
    image: $("p-image-url").value.trim(),
    item_id: $("p-item-id").value.trim() || null,
    source,
    badge: $("p-badge").value.trim() || null,
    image_fit: $("p-image-fit").value || null,
    affiliate_url: $("affiliateUrl").value.trim() || currentProduct?.affiliate_url || "",
    product_url: $("productUrl").value.trim() || currentProduct?.product_url || "",
    available: true
  };
}

function resetForm() {
  currentProduct = null;
  editingId = null;
  hidePreview();
}

async function api(path, opt = {}) {
  const r = await fetch(backend() + path, {
    ...opt,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opt.headers || {})
    }
  });
  const raw = await r.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {}
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data.error || data.message || raw || "Erro"}`);
  return data;
}

async function saveProduct() {
  try {
    const p = collectForm();
    if (!p.title) return alert("Preencha o titulo.");
    if (!p.image) return alert("Preencha a URL da imagem.");
    if (!p.affiliate_url) return alert("Preencha o link afiliado.");
    if (!p.source) return alert("Selecione a origem do produto.");

    if (editingId) {
      await api("/api/products/" + editingId, { method: "PUT", body: JSON.stringify(p) });
      alert("Produto atualizado.");
    } else {
      await api("/api/add-product", {
        method: "POST",
        body: JSON.stringify({ url: p.product_url, affiliateUrl: p.affiliate_url, overrides: p })
      });
      alert("Produto adicionado.");
    }

    resetForm();
    loadProducts();
  } catch (e) {
    alert("Erro: " + e.message);
  }
}

function createProductCard(p) {
  const card = document.createElement("div");
  card.className = "product-mini";

  const img = document.createElement("img");
  img.src = p.image || "";
  img.alt = p.title || "Produto";
  img.addEventListener("error", () => {
    img.src = "";
  });

  const info = document.createElement("div");
  const title = document.createElement("b");
  title.textContent = p.title || "";
  const meta = document.createElement("span");
  meta.className = "muted";
  const parts = [p.source || "", p.category || "", formatBRL(p.price)];
  if (p.item_id) parts.push(p.item_id);
  meta.textContent = parts.filter(Boolean).join(" - ");
  info.appendChild(title);
  info.appendChild(document.createElement("br"));
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "actions";

  const editButton = document.createElement("button");
  editButton.className = "ghost";
  editButton.type = "button";
  editButton.textContent = "Editar";
  editButton.addEventListener("click", () => editProduct(p.id));

  const deleteButton = document.createElement("button");
  deleteButton.className = "danger";
  deleteButton.type = "button";
  deleteButton.textContent = "Excluir";
  deleteButton.addEventListener("click", () => deleteProduct(p.id));

  actions.appendChild(editButton);
  actions.appendChild(deleteButton);

  card.appendChild(img);
  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

async function loadProducts() {
  try {
    if (!backend()) return;
    const d = await fetch(backend() + "/api/products", { credentials: "include" }).then((r) => r.json());
    productsCache = d || [];

    const container = $("products");
    container.replaceChildren();

    if (!productsCache.length) {
      container.innerHTML = "<p class='muted'>Nenhum produto cadastrado.</p>";
      return;
    }

    const frag = document.createDocumentFragment();
    for (const p of productsCache) {
      frag.appendChild(createProductCard(p));
    }
    container.appendChild(frag);
  } catch (e) {
    $("products").innerHTML = "<p class='error'>" + e.message + "</p>";
  }
}

function editProduct(id) {
  const p = productsCache.find((x) => Number(x.id) === Number(id));
  if (!p) return;
  editingId = id;
  $("affiliateUrl").value = p.affiliate_url || "";
  $("productUrl").value = p.product_url || "";
  $("previewTitle").textContent = "Editar produto";
  fillForm(p);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProduct(id) {
  try {
    const product = productsCache.find((x) => Number(x.id) === Number(id));
    const name = product?.title ? `\n\n${product.title}` : "";
    if (!confirm(`Remover este produto da vitrine?${name}\n\nEle sera marcado como indisponivel, nao apagado do banco.`)) return;
    await api("/api/products/" + id, { method: "DELETE" });
    setStatus("Produto removido da vitrine.");
    loadProducts();
  } catch (e) {
    alert("Erro ao excluir: " + e.message);
  }
}

function loadConfig() {
  $("backendUrl").value = localStorage.getItem("pulsefit_backend_url") || "";
  $("adminToken").value = "";
}

function saveConfig() {
  localStorage.setItem("pulsefit_backend_url", $("backendUrl").value.trim());
  setConfigStatus("Configuracao salva.");
  loadProducts();
}

async function loginAdmin() {
  try {
    const tokenValue = $("adminToken").value.trim();
    if (!backend()) return alert("Informe a URL do backend primeiro.");
    if (!tokenValue) return alert("Informe a senha admin.");

    const r = await fetch(backend() + "/api/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token: tokenValue })
    });

    const raw = await r.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {}
    if (!r.ok) throw new Error(data.error || data.message || raw || "Erro");

    $("adminToken").value = "";
    setConfigStatus("Sessao ativa.");
    loadProducts();
  } catch (e) {
    setConfigStatus("Falha no login.", true);
    alert("Erro: " + e.message);
  }
}

async function logoutAdmin() {
  $("adminToken").value = "";
  try {
    if (backend()) {
      await fetch(backend() + "/api/logout", {
        method: "POST",
        credentials: "include"
      });
    }
  } finally {
    setConfigStatus("Sessao removida.");
    loadProducts();
  }
}

async function loadSessionState() {
  try {
    if (!backend()) return;
    const r = await fetch(backend() + "/api/session", { credentials: "include" });
    const data = await r.json();
    if (data?.authenticated) {
      setConfigStatus("Sessao ativa.");
    } else {
      setConfigStatus("Informe a senha e clique em Entrar.");
    }
  } catch {
    setConfigStatus("Nao foi possivel verificar a sessao.", true);
  }
}

function syncPreviewImage() {
  const img = $("p-image");
  img.src = $("p-image-url").value;
  setSourceFromUrl($("productUrl").value.trim());
}


async function refreshPrices() {
  const btn = $("refreshPricesBtn");
  const statusEl = $("refreshStatus");
  const progressWrap = $("refreshProgressWrap");
  const progressBar = $("refreshProgressBar");
  const progressLabel = $("refreshProgressLabel");
  const logEl = $("refreshLog");

  btn.disabled = true;
  btn.textContent = "Atualizando...";
  statusEl.classList.remove("hidden");
  progressWrap.classList.remove("hidden");
  logEl.innerHTML = "";
  progressBar.style.width = "0%";
  progressLabel.textContent = "Iniciando...";

  let total = 0;
  let done = 0;
  let atualizados = 0;
  let hasUpdates = false;

  function updateBar() {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    progressBar.style.width = pct + "%";
    progressLabel.textContent = `${done} de ${total} produtos (${pct}%)`;
  }

  try {
    const r = await fetch(backend() + "/api/refresh-prices-stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Erro desconhecido" }));
      throw new Error(err.error || `HTTP ${r.status}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // guarda linha incompleta

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice(5).trim();
        if (!json) continue;

        let msg;
        try { msg = JSON.parse(json); } catch { continue; }

        if (msg.type === "start") {
          total = msg.total;
          progressLabel.textContent = `0 de ${total} produtos (0%)`;
        }

        if (msg.type === "progress") {
          done = msg.done;
          updateBar();

          const p = msg.result;
          const line = document.createElement("div");
          line.style.padding = "3px 0";

          if (p.status === "atualizado") {
            atualizados++;
            hasUpdates = true;
            line.innerHTML = `✅ <strong>${p.title}</strong> — ${formatBRL(p.preco_anterior)} → <strong>${formatBRL(p.preco_novo)}</strong>`;
          } else if (p.status === "sem_alteracao") {
            line.innerHTML = `⬜ ${p.title} — sem alteração`;
            line.style.opacity = "0.6";
          } else {
            const motivos = {
              url_invalida: "URL inválida",
              sem_resposta: `sem resposta (HTTP ${p.httpStatus || "?"})`,
              preco_nao_encontrado: "preço não encontrado",
              erro_salvar: "erro ao salvar",
              erro: p.erro || "erro"
            };
            line.innerHTML = `❌ ${p.title} — ${motivos[p.status] || p.status}`;
            line.style.color = "var(--error, #f87171)";
          }
          logEl.appendChild(line);
          logEl.scrollTop = logEl.scrollHeight;
        }

        if (msg.type === "done") {
          progressBar.style.width = "100%";
          progressLabel.textContent = `Concluído — ${atualizados} atualizado(s) de ${total}`;
          if (hasUpdates) loadProducts();
        }
      }
    }
  } catch (e) {
    logEl.innerHTML += `<div style="color:var(--error,#f87171)">Erro: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Atualizar Preços";
  }
}

function bindEvents() {
  $("saveConfigBtn").addEventListener("click", saveConfig);
  $("refreshPricesBtn").addEventListener("click", refreshPrices);
  $("loginAdminBtn").addEventListener("click", loginAdmin);
  $("logoutAdminBtn").addEventListener("click", logoutAdmin);
  $("openProductBtn").addEventListener("click", openProduct);
  $("openManualBtn").addEventListener("click", () => openManual());
  $("saveProductBtn").addEventListener("click", saveProduct);
  $("cancelBtn").addEventListener("click", resetForm);
  $("p-image-url").addEventListener("input", syncPreviewImage);
  $("productUrl").addEventListener("input", syncSourceSelection);
  $("affiliateUrl").addEventListener("input", syncSourceSelection);
  $("productUrl").addEventListener("paste", () => setTimeout(syncSourceSelection, 0));
  $("affiliateUrl").addEventListener("paste", () => setTimeout(syncSourceSelection, 0));
}

function init() {
  loadConfig();
  bindEvents();
  loadSessionState();
  loadProducts();
}

window.addEventListener("DOMContentLoaded", init);
