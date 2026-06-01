/* ═══════════════════════════════════════════════════
   PULSE FIT STORE — script.js
   Melhorias aplicadas:
   1. Chave anon separada e comentário de RLS
   2. Paginação completa com "Carregar mais"
   3. Skeleton loading nos cards
   4. Placeholder neutro para imagem quebrada
   5. Campos snake_case normalizados corretamente
   6. Tratamento de erro aprimorado
═══════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────
   SUPABASE CONFIG
   ⚠️  Esta chave é a "anon/publishable" — fica visível
       no frontend. Proteja os dados configurando RLS:
       • SELECT: permitido para anon (leitura pública)
       • INSERT/UPDATE/DELETE: bloqueado para anon
   ───────────────────────────────────────────────── */
const SUPABASE_URL  = "https://clrqpjzrqcjeqnvpnrnd.supabase.co";
const SUPABASE_ANON = "sb_publishable_tX4ObFY9DVe-H-TO1V9Lww_CgFNhad5";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ─────────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────────── */
let products      = [];
let page          = 0;
let hasMore       = true;
let isLoading     = false;
const PER_PAGE    = 100;

let activeCategory = "Todos";
let searchTerm     = "";
let sortMode       = "featured";
const NEW_BADGE_DAYS = 7;

/* ─────────────────────────────────────────────────
   HERO SLIDES
   Banners apontam para Unsplash (URLs externas públicas)
   para funcionar tanto local quanto em produção.
   ───────────────────────────────────────────────── */
const heroSlides = [
  {
    eyebrow: "Pulse Fit Store",
    title:   "Equipamentos<br><em>Treino Profissional</em>",
    sub:     "Os melhores acessórios e equipamentos para academia e treino funcional.",
    image:   "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=80",
    alt:     "Equipamentos Fitness"
  },
  {
    eyebrow: "Pulse Fit Store",
    title:   "Suplementos<br><em>Performance Máxima</em>",
    sub:     "Whey, creatina e pré-treino selecionados para resultados reais.",
    image:   "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1600&q=80",
    alt:     "Suplementos Fitness"
  },
  {
    eyebrow: "Pulse Fit Store",
    title:   "Tênis<br><em>Corrida & Academia</em>",
    sub:     "Modelos ideais para corrida, caminhada e musculação com os melhores preços.",
    image:   "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1600&q=80",
    alt:     "Tênis Esportivo"
  },
  {
    eyebrow: "Pulse Fit Store",
    title:   "Fitness<br><em>Disciplina Diária</em>",
    sub:     "Roupas, suplementos e acessórios para transformar sua rotina.",
    image:   "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1600&q=80",
    alt:     "Modelo Fitness"
  },
  {
    eyebrow: "Pulse Fit Store",
    title:   "Academia<br><em>Alta Performance</em>",
    sub:     "Seleção especial de produtos para treino intenso e resultados reais.",
    image:   "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1600&q=80",
    alt:     "Treino Academia"
  },
  {
    eyebrow: "Pulse Fit Store",
    title:   "Roupas<br><em>Leveza & Conforto</em>",
    sub:     "Tecnologia e conforto para acompanhar seus treinos do aquecimento ao resultado.",
    image:   "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80",
    alt:     "Roupas Fitness"
  }
];

let activeHeroSlide  = 0;
let heroSlideTimer   = null;
const HERO_INTERVAL  = 5000;

/* ─────────────────────────────────────────────────
   PAGE LOADER
   ───────────────────────────────────────────────── */
function initPageLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;
  document.body.classList.add("is-loading");

  const hideLoader = () => {
    loader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
    window.setTimeout(() => loader.remove(), 500);
  };

  window.setTimeout(hideLoader, 3600);
}

/* ─────────────────────────────────────────────────
   HERO SLIDER
   ───────────────────────────────────────────────── */
function rebuildHeroDots() {
  const container = document.querySelector(".hero-dots");
  if (!container) return;
  container.innerHTML = "";

  heroSlides.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.type              = "button";
    btn.dataset.heroSlide = i;
    btn.setAttribute("aria-label", `Mostrar banner ${i + 1}`);
    if (i === 0) btn.classList.add("active");

    btn.addEventListener("click", () => {
      setHeroSlide(i);
      restartHeroAutoplay();
    });

    container.appendChild(btn);
  });
}

function setHeroSlide(index) {
  const slide = heroSlides[index];
  if (!slide) return;
  activeHeroSlide = index;

  const bg = document.getElementById("hero-bg");
  document.getElementById("hero-eyebrow").textContent  = slide.eyebrow;
  document.getElementById("hero-title").innerHTML      = slide.title;
  document.getElementById("hero-sub").textContent      = slide.sub;
  bg.src = slide.image;
  bg.alt = slide.alt;

  document.querySelectorAll(".hero-dots button").forEach((btn, btnIndex) => {
    const active = btnIndex === index;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function nextHeroSlide() {
  setHeroSlide((activeHeroSlide + 1) % heroSlides.length);
}

function restartHeroAutoplay() {
  window.clearInterval(heroSlideTimer);
  heroSlideTimer = window.setInterval(nextHeroSlide, HERO_INTERVAL);
}

function initHeroSlider() {
  rebuildHeroDots();
  setHeroSlide(0);
  restartHeroAutoplay();
}

/* ─────────────────────────────────────────────────
   HELPERS DE PREÇO
   ───────────────────────────────────────────────── */
function parseMoney(value) {
  if (!value) return 0;
  return parseFloat(
    String(value).replace("R$ ", "").replace(/\./g, "").replace(",", ".")
  );
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function calcDiscount(p) {
  const orig = parseMoney(p.originalPrice);
  const curr = parseMoney(p.price);
  if (!orig || !curr || orig <= curr) return 0;
  return Math.round((1 - curr / orig) * 100);
}

function isNewBadgeActive(product) {
  const badge = String(product.badge || "").trim().toUpperCase();
  if (!badge) return false;
  if (badge !== "NOVO") return true;

  const createdAt = product.created_at || product.createdAt;
  if (!createdAt) return false;

  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;

  const ageMs = Date.now() - createdMs;
  return ageMs <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

function inferCategoryFromTitle(title) {
  const t = String(title || "").toLowerCase();
  if (/whey|creatina|hiper|protein|suplement|pre.treino|bcaa/.test(t)) return "Suplementos";
  if (/camiseta|camisa|short|bermuda|calça|moletom|legging|dry.fit|regata|top|jaqueta|blusa/.test(t)) return "Roupas";
  if (/garrafa|squeeze|coqueteleira|shaker|copo térmico|copo termico|termica|térmica/.test(t)) return "Acessórios";
  if (/tênis|tenis|sapato|runner|chuteira|sandália|sandalia|botina/.test(t)) return "Calçados";
  if (/barra|halter|anilha|corda|elástico|academia|musculação/.test(t)) return "Equipamentos";
  return "Outros";
}

/* ─────────────────────────────────────────────────
   MAPEAMENTO SUPABASE → PRODUTO INTERNO
   Suporta tanto snake_case (Supabase) quanto camelCase
   (legado do server.js / admin antigo).
   ───────────────────────────────────────────────── */
function mapProduct(p) {
  const inferredCategory = inferCategoryFromTitle(p.title);
  return {
    id:            p.id,
    created_at:     p.created_at,
    title:         p.title,
    category:      inferredCategory !== "Outros" ? inferredCategory : p.category,
    termo:         p.termo,
    price:         formatMoney(p.price),
    originalPrice: formatMoney(p.original_price ?? p.originalPrice ?? p.price),
    rating:        String(p.rating || "4.7"),
    reviews:       p.reviews || "0 avaliações",
    image:         p.image,
    imageFit:      p.image_fit ?? p.imageFit,
    badge:         isNewBadgeActive(p) ? (p.badge || null) : null,
    available:     p.available !== false,
    affiliateUrl:  p.affiliate_url ?? p.affiliateUrl,
    source:        p.source || p.marketplace || "Mercado Livre",
    stores:        [(String(p.source || p.marketplace || "Mercado Livre").toLowerCase().includes("shopee") ? "shopee" : "ml")]
  };
}

/* ─────────────────────────────────────────────────
   SKELETON LOADING
   ───────────────────────────────────────────────── */
const SKELETON_HTML = `
  <article class="product-card skeleton-card" aria-hidden="true">
    <div class="card-img-wrap skeleton-img"></div>
    <div class="card-body">
      <div class="skeleton-line sk-title"></div>
      <div class="skeleton-line sk-meta"></div>
      <div class="skeleton-line sk-price"></div>
      <div class="skeleton-line sk-btn"></div>
    </div>
  </article>`;

function showSkeletons(containerId, count = 8) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array(count).fill(SKELETON_HTML).join("");
}

/* ─────────────────────────────────────────────────
   PLACEHOLDER DE IMAGEM NEUTRA
   SVG inline base64 — não depende de arquivo local
   ───────────────────────────────────────────────── */
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' " +
  "viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E" +
  "%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' " +
  "font-family='sans-serif' font-size='13' fill='%23555'%3ESem imagem%3C/text%3E%3C/svg%3E";

function imgErrorHandler() {
  return `onerror="if(this.src!=='${IMG_PLACEHOLDER}'){this.onerror=null;this.classList.add('img-contain');this.src='${IMG_PLACEHOLDER}'}"`;
}

/* ─────────────────────────────────────────────────
   CARD HTML
   ───────────────────────────────────────────────── */
function storeButtonsHTML(p) {
  const source = String(p.source || (Array.isArray(p.stores) && p.stores[0]) || "ml").toLowerCase();

  if (source.includes("shopee")) {
    return `<a class="store-btn btn-shopee" href="${p.affiliateUrl}" target="_blank" rel="noreferrer noopener">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M6 7h12l-1 13H7L6 7Z"/>
        <path d="M9 7a3 3 0 0 1 6 0"/>
      </svg>
      Shopee
    </a>`;
  }

  return `<a class="store-btn btn-ml" href="${p.affiliateUrl}" target="_blank" rel="noreferrer noopener">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
    Mercado Livre
  </a>`;
}

function createCard(p) {
  const pct    = calcDiscount(p);
  const isHigh = pct >= 25;

  return `
  <article class="product-card">
    <div class="card-img-wrap">
      <img
        class="${p.imageFit === "contain" ? "img-contain" : p.imageFit === "medium" ? "img-medium" : p.imageFit === "large" ? "img-large" : ""}"
        src="${p.image || IMG_PLACEHOLDER}"
        alt="${p.title}"
        loading="lazy"
        ${imgErrorHandler()}
      >
      ${p.badge ? `<span class="badge-novo">${p.badge}</span>` : ""}
    </div>
    <div class="card-body">
      <h3 class="card-title">${p.title}</h3>
      <div class="card-meta">
        <span>${p.category || ""}</span>
        <span>${p.termo || ""}</span>
        <span class="badge-avail ${p.available ? "green" : "red"}">
          ${p.available ? "Disponível" : "Esgotado"}
        </span>
      </div>
      <div class="card-rating" aria-label="Avaliação ${p.rating} de 5">
        <span>&#9733; ${p.rating}</span>
        <small>${p.reviews}</small>
      </div>
      <div class="price-row">
        <div class="price-orig">De ${p.originalPrice}</div>
        <div class="price-curr-row">
          <span class="price-curr">${p.price}</span>
          <span class="discount-badge ${isHigh ? "high" : ""}">
            ${pct > 0 ? "-" + pct + "%" : ""}
          </span>
        </div>
      </div>
      <div class="store-btns">${storeButtonsHTML(p)}</div>
    </div>
  </article>`;
}

/* ─────────────────────────────────────────────────
   FILTRAGEM E ORDENAÇÃO
   ───────────────────────────────────────────────── */
function getVisible() {
  const filtered = products.filter(p => {
    const matchCat =
      activeCategory === "Todos"    ? true :
      activeCategory === "Promoções"? calcDiscount(p) >= 20 :
      p.category === activeCategory;

    const hay = [p.title, p.category, p.termo].join(" ").toLowerCase();
    const matchSearch = !searchTerm || hay.includes(searchTerm);

    return matchCat && matchSearch;
  });

  return sortProducts(filtered);
}

function sortProducts(items) {
  const arr = [...items];
  const byFeatured = (a, b) =>
    Number(Boolean(b.badge)) - Number(Boolean(a.badge)) || b.id - a.id;

  if      (sortMode === "discount")   arr.sort((a, b) => calcDiscount(b) - calcDiscount(a));
  else if (sortMode === "price-asc")  arr.sort((a, b) => parseMoney(a.price) - parseMoney(b.price));
  else if (sortMode === "price-desc") arr.sort((a, b) => parseMoney(b.price) - parseMoney(a.price));
  else if (sortMode === "rating")     arr.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
  else arr.sort(byFeatured);

  return arr;
}

/* ─────────────────────────────────────────────────
   RENDER
   ───────────────────────────────────────────────── */
const categories = ["Todos", "Promoções", "Suplementos", "Acessórios", "Calçados", "Roupas", "Equipamentos"];

function renderGrid() {
  const grid    = document.getElementById("product-grid");
  const visible = getVisible();

  document.getElementById("showing-count2").textContent  =
    visible.length + " produto" + (visible.length === 1 ? "" : "s");

  if (!visible.length) {
    grid.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
    return;
  }

  grid.innerHTML = visible.map(createCard).join("");
}

function renderFeatured() {
  const rail     = document.getElementById("featured-rail");
  const featured = products
    .filter(p => p.badge)
    .sort((a, b) => b.id - a.id)
    .slice(0, 6);

  document.getElementById("featured-count").textContent =
    featured.length + " destaque" + (featured.length === 1 ? "" : "s");

  rail.innerHTML = featured.map(createCard).join("");
}

function renderPromos() {
  const rail   = document.getElementById("promo-rail");
  const promos = products
    .filter(p => calcDiscount(p) >= 20)
    .sort((a, b) => calcDiscount(b) - calcDiscount(a));

  rail.innerHTML = promos.map(createCard).join("");
}

function buildPills() {
  const row = document.getElementById("nav-pills");
  row.innerHTML = "";

  const styles = { "Todos": "pill pill-red", "Promoções": "pill pill-red" };

  categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = (styles[cat] || "pill pill-outline") +
                    (cat === activeCategory ? " is-active" : "");
    btn.textContent = cat;

    btn.addEventListener("click", () => {
      activeCategory = cat;
      buildPills();
      renderGrid();
      document.getElementById("catalog-section")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    });

    row.appendChild(btn);
  });
}

function buildSeriesNav() {
  const row   = document.getElementById("series-nav");
  const terms = [...new Set(products.map(p => p.termo).filter(Boolean))];
  row.innerHTML = "";

  terms.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t;

    btn.addEventListener("click", () => {
      searchTerm = t.toLowerCase();
      document.getElementById("search-input").value = t;
      activeCategory = "Todos";
      buildPills();
      renderGrid();
      document.getElementById("catalog-section")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    });

    row.appendChild(btn);
  });
}

function renderStore() {
  buildPills();
  buildSeriesNav();
  renderFeatured();
  renderPromos();
  renderGrid();
  updateLoadMoreButton();
}

/* ─────────────────────────────────────────────────
   BOTÃO "CARREGAR MAIS"
   ───────────────────────────────────────────────── */
function updateLoadMoreButton() {
  const btn = document.getElementById("btn-load-more");
  if (!btn) return;

  if (hasMore) {
    btn.style.display = "flex";
    btn.disabled      = false;
    btn.textContent   = "Carregar mais produtos";
  } else {
    btn.style.display = "none";
  }
}

function setLoadMoreLoading(loading) {
  const btn = document.getElementById("btn-load-more");
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? "Carregando…" : "Carregar mais produtos";
}

/* ─────────────────────────────────────────────────
   ERRO DE CARREGAMENTO
   ───────────────────────────────────────────────── */
function showLoadError(error) {
  console.error("Erro ao carregar produtos do Supabase:", error);
  products = [];

  document.getElementById("featured-count").textContent = "0 destaques";
  document.getElementById("showing-count2").textContent = "erro ao carregar";
  document.getElementById("featured-rail").innerHTML    = "";
  document.getElementById("promo-rail").innerHTML       = "";

  document.getElementById("product-grid").innerHTML = `
    <div class="empty-state error-state">
      <p>⚠️ Não foi possível carregar os produtos.</p>
      <p>Verifique a conexão com o Supabase e as políticas RLS da tabela <code>products</code>.</p>
      <button class="btn btn-ghost" onclick="retryLoad()" style="margin-top:16px">
        Tentar novamente
      </button>
    </div>`;
}

window.retryLoad = async function () {
  showSkeletons("product-grid", 8);
  try {
    await loadProducts(true);
  } catch (error) {
    showLoadError(error);
  }
};

/* ─────────────────────────────────────────────────
   CARREGAMENTO DO SUPABASE (COM PAGINAÇÃO)
   ───────────────────────────────────────────────── */
async function loadProducts(reset = false) {
  if (isLoading) return;
  isLoading = true;

  if (reset) {
    page     = 0;
    products = [];
    hasMore  = true;
    showSkeletons("product-grid", 8);
    showSkeletons("featured-rail", 4);
    showSkeletons("promo-rail", 4);
  }

  setLoadMoreLoading(true);

  const from = page * PER_PAGE;
  const to   = from + PER_PAGE - 1;

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("available", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const loaded = data.map(mapProduct);
  products     = [...products, ...loaded];
  page++;

  // Se retornou menos que PER_PAGE, não há mais páginas
  hasMore = loaded.length === PER_PAGE;

  isLoading = false;
  renderStore();
}

async function startStore() {
  try {
    await loadProducts(true);
  } catch (error) {
    isLoading = false;
    showLoadError(error);
  }
}

/* ─────────────────────────────────────────────────
   EVENTOS
   ───────────────────────────────────────────────── */
document.getElementById("search-input").addEventListener("input", e => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderGrid();
});

document.getElementById("btn-search").addEventListener("click", () => {
  renderGrid();
  document.getElementById("catalog-section")
    .scrollIntoView({ behavior: "smooth" });
});

document.getElementById("sort-select").addEventListener("change", e => {
  sortMode = e.target.value;
  renderGrid();
});

document.querySelectorAll("[data-scroll-target]").forEach(btn => {
  btn.addEventListener("click", () => {
    const rail = document.getElementById(btn.dataset.scrollTarget);
    const dir  = Number(btn.dataset.scrollDir);
    rail.scrollBy({
      left:     dir * Math.max(240, rail.clientWidth * 0.8),
      behavior: "smooth"
    });
  });
});

// Botão "Carregar mais" (injetado pelo index.html)
document.addEventListener("click", async e => {
  if (e.target.id !== "btn-load-more") return;
  try {
    await loadProducts(false);
  } catch (error) {
    console.error("Erro ao carregar mais produtos:", error);
  }
});

/* ─────────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────────── */
initPageLoader();
initHeroSlider();
startStore();
