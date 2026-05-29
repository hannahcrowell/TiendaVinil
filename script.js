/* =====================================================
   ONCE UPON A TIME — script.js
   Tienda de Discos de Vinil
   ===================================================== */

/* =====================================================
   SUPABASE CONFIG
   ===================================================== */
const SUPABASE_URL = "https://tpwclkuulgxsiuptvsxo.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwd2Nsa3V1bGd4c2l1cHR2c3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODYwNjYsImV4cCI6MjA5MTI2MjA2Nn0.I7t54c2zDUzD7-2j7mzCHOR0Gx2fqEsh665icr1eIow";

/* Cliente Supabase REST (sin SDK externo) */
const sb = {
  async get(table, params = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async authGet(table, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async authPost(table, body, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const m = await r.text();
      throw new Error(m);
    }
    return r.json();
  },
  async signUp(email, password, meta = {}) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: meta }),
    });
    return r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },
  async signInGoogle() {
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${location.origin}`;
  },
  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
  },
  async getUser(token) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error("token inválido");
    return r.json();
  },
  async authPatch(table, params, body, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async authDelete(table, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) throw new Error(await r.text());
    return r;
  },
};

/* =====================================================
   ESTADO GLOBAL
   ===================================================== */
let authToken = localStorage.getItem("ouat_token") || null;
let cart = JSON.parse(localStorage.getItem("ouat_cart") || "[]");
let currentUser = JSON.parse(localStorage.getItem("ouat_user") || "null");
// NOTA: userOrders NO se inicializa desde localStorage intencionalmente.
// Los pedidos siempre se cargan frescos desde Supabase en loadProfile(),
// filtrados por RLS para el usuario autenticado. Inicializar desde localStorage
// causaría que un nuevo usuario vea los pedidos del usuario anterior.
let userOrders = [];

/** Limpia los pedidos en memoria Y en localStorage.
 *  Llamar siempre que cambia de usuario (login / logout / sesión inválida). */
function clearUserOrders() {
  userOrders = [];
  localStorage.removeItem("ouat_orders");
}
let currentProduct = null;
let currentTicket = null;
let reviewStarSel = 5;
let selectedMSICk = 1;
let selectedPayment = "card";

/* Cache de productos cargados desde Supabase (para addToCart por ID) */
let productsCache = [];

let storeConfig = {
  envio_costo: 120,
  envio_gratis_min: 1500,
  envio_mensaje: "Realizamos envíos a toda la República Mexicana por Estafeta y DHL. El tiempo promedio es de 3 a 7 días hábiles tras confirmarse el pago. Una vez enviado, recibirás por correo y en tu perfil el número de guía para rastrear el paquete en tiempo real."
};

async function loadStoreConfig() {
  try {
    const res = await supa.get("configuracion");
    const json = await res.json();
    if (json && json.length > 0) {
      json.forEach(item => {
        storeConfig[item.clave] = typeof storeConfig[item.clave] === "number" ? parseFloat(item.valor) : item.valor;
      });
    }
  } catch (err) {
    console.error("Error cargando configuración:", err);
  }
}

async function saveStoreConfig() {
  if (!currentUser) return;
  const costo = parseFloat(document.getElementById('configEnvioCosto').value) || 120;
  const gratisMin = parseFloat(document.getElementById('configEnvioGratis').value) || 1500;
  const mensaje = document.getElementById('configEnvioMensaje').value || "";

  try {
    showToast("⏳", "Guardando configuración...");
    const updates = [
      { clave: "envio_costo", valor: costo },
      { clave: "envio_gratis_min", valor: gratisMin },
      { clave: "envio_mensaje", valor: mensaje }
    ];
    
    for (const update of updates) {
      await fetch(`${SUPABASE_URL}/rest/v1/configuracion?clave=eq.${update.clave}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${authToken}`,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ valor: update.valor })
      });
    }
    
    storeConfig.envio_costo = costo;
    storeConfig.envio_gratis_min = gratisMin;
    storeConfig.envio_mensaje = mensaje;
    
    showToast("✅", "Configuración guardada exitosamente");
  } catch (err) {
    console.error(err);
    showToast("❌", "Error al guardar");
  }
}

/* =====================================================
   DATOS DE MUESTRA (fallback sin conexión)
   ===================================================== */
const sampleProducts = [
  {
    id: "1",
    supabaseId: null,
    name: "Dark Side of the Moon",
    artist: "Pink Floyd",
    genre: "rock",
    price: 850,
    format: "LP",
    year: 1973,
    badge: "Clásico",
    rpm: "33 RPM",
    material: "Vinilo negro 180g",
    estado: "Nuevo",
    incluye: "Póster psicodélico + inner sleeve impreso",
    imagen_url: null,
    tracks: [
      { s: "A", n: "Speak to Me / Breathe", d: "3:58" },
      { s: "A", n: "On the Run", d: "3:30" },
      { s: "A", n: "Time", d: "6:53" },
      { s: "A", n: "The Great Gig in the Sky", d: "4:44" },
      { s: "B", n: "Money", d: "6:22" },
      { s: "B", n: "Us and Them", d: "7:49" },
      { s: "B", n: "Any Colour You Like", d: "3:26" },
      { s: "B", n: "Brain Damage", d: "3:46" },
      { s: "B", n: "Eclipse", d: "2:03" },
    ],
    reviews: [
      {
        name: "Ana G.",
        stars: 5,
        date: "10 Mar 2026",
        text: "Increíble calidad. Llegó perfectamente empacado.",
        compra_verificada: true,
      },
      {
        name: "Luis M.",
        stars: 4,
        date: "5 Feb 2026",
        text: "Clásico eterno, excelente prensado.",
        compra_verificada: true,
      },
    ],
  },
  {
    id: "2",
    supabaseId: null,
    name: "Abbey Road",
    artist: "The Beatles",
    genre: "rock",
    price: 780,
    format: "LP",
    year: 1969,
    badge: "Clásico",
    rpm: "33 RPM",
    material: "Vinilo negro 180g",
    estado: "Nuevo",
    incluye: "Inner sleeve original",
    imagen_url: null,
    tracks: [
      { s: "A", n: "Come Together", d: "4:20" },
      { s: "A", n: "Something", d: "3:01" },
      { s: "A", n: "Maxwell's Silver Hammer", d: "3:27" },
      { s: "A", n: "Oh! Darling", d: "3:26" },
      { s: "A", n: "Octopus's Garden", d: "2:51" },
      { s: "A", n: "I Want You (She's So Heavy)", d: "7:44" },
      { s: "B", n: "Here Comes the Sun", d: "3:05" },
      { s: "B", n: "Because", d: "2:45" },
      { s: "B", n: "You Never Give Me Your Money", d: "4:02" },
      { s: "B", n: "The End", d: "2:19" },
    ],
    reviews: [
      {
        name: "Carmen R.",
        stars: 5,
        date: "15 Mar 2026",
        text: "Una maravilla. El sonido es espectacular.",
        compra_verificada: true,
      },
    ],
  },
  {
    id: "3",
    supabaseId: null,
    name: "Random Access Memories",
    artist: "Daft Punk",
    genre: "electronica",
    price: 920,
    format: "Doble LP",
    year: 2013,
    badge: "Popular",
    rpm: "33 RPM",
    material: "Vinilo negro 180g",
    estado: "Nuevo",
    incluye: "Booklet de 24 páginas + 2 LPs",
    imagen_url: null,
    tracks: [
      { s: "A", n: "Give Life Back to Music", d: "4:34" },
      { s: "A", n: "The Game of Love", d: "4:17" },
      { s: "A", n: "Giorgio by Moroder", d: "9:04" },
      { s: "B", n: "Within", d: "3:47" },
      { s: "B", n: "Instant Crush ft. Julian Casablancas", d: "5:37" },
      { s: "B", n: "Lose Yourself to Dance", d: "5:53" },
      { s: "C", n: "Touch ft. Paul Williams", d: "8:18" },
      { s: "C", n: "Get Lucky ft. Pharrell Williams", d: "6:09" },
      { s: "D", n: "Fragments of Time", d: "4:40" },
      { s: "D", n: "Doin' it Right", d: "4:12" },
      { s: "D", n: "Contact", d: "6:21" },
    ],
    reviews: [],
  },
  {
    id: "4",
    supabaseId: null,
    name: "Blonde",
    artist: "Frank Ocean",
    genre: "pop",
    price: 1100,
    format: "LP",
    year: 2016,
    badge: "Especial",
    rpm: "33 RPM",
    material: "Vinilo blanco 140g",
    estado: "Nuevo",
    incluye: "Lyric booklet + poster",
    imagen_url: null,
    tracks: [
      { s: "A", n: "Nikes", d: "5:14" },
      { s: "A", n: "Ivy", d: "4:10" },
      { s: "A", n: "Pink + White", d: "3:29" },
      { s: "A", n: "Be Yourself", d: "1:00" },
      { s: "A", n: "Solo", d: "4:14" },
      { s: "B", n: "Skyline To", d: "3:38" },
      { s: "B", n: "Self Control", d: "4:09" },
      { s: "B", n: "Good Guy", d: "1:55" },
      { s: "B", n: "Nights", d: "5:07" },
      { s: "B", n: "White Ferrari", d: "4:09" },
    ],
    reviews: [
      {
        name: "Diego L.",
        stars: 5,
        date: "20 Mar 2026",
        text: "Vinilo de edición especial impecable.",
        compra_verificada: true,
      },
    ],
  },
  {
    id: "5",
    supabaseId: null,
    name: "Kind of Blue",
    artist: "Miles Davis",
    genre: "jazz",
    price: 650,
    format: "LP",
    year: 1959,
    badge: "Clásico",
    rpm: "33 RPM",
    material: "Vinilo negro 180g",
    estado: "Nuevo",
    incluye: "Inner sleeve con notas del álbum",
    imagen_url: null,
    tracks: [
      { s: "A", n: "So What", d: "9:22" },
      { s: "A", n: "Freddie Freeloader", d: "9:46" },
      { s: "A", n: "Blue in Green", d: "5:37" },
      { s: "B", n: "All Blues", d: "11:33" },
      { s: "B", n: "Flamenco Sketches", d: "9:26" },
    ],
    reviews: [
      {
        name: "Sofía P.",
        stars: 5,
        date: "2 Mar 2026",
        text: "El mejor disco de jazz en vinilo.",
        compra_verificada: true,
      },
    ],
  },
  {
    id: "6",
    supabaseId: null,
    name: "AM",
    artist: "Arctic Monkeys",
    genre: "alternativo",
    price: 720,
    format: "LP",
    year: 2013,
    badge: "Popular",
    rpm: "33 RPM",
    material: "Vinilo negro 140g",
    estado: "Nuevo",
    incluye: "Lyric booklet",
    imagen_url: null,
    tracks: [
      { s: "A", n: "Do I Wanna Know?", d: "4:32" },
      { s: "A", n: "R U Mine?", d: "3:21" },
      { s: "A", n: "One for the Road", d: "3:41" },
      { s: "A", n: "Arabella", d: "3:26" },
      { s: "A", n: "I Want It All", d: "3:04" },
      { s: "B", n: "No. 1 Party Anthem", d: "4:27" },
      { s: "B", n: "Mad Sounds", d: "3:31" },
      { s: "B", n: "Fireside", d: "3:18" },
      { s: "B", n: "Why'd You Only Call Me When You're High?", d: "2:41" },
      { s: "B", n: "Snap Out of It", d: "3:13" },
      { s: "B", n: "Knee Socks", d: "4:17" },
      { s: "B", n: "I Wanna Be Yours", d: "3:03" },
    ],
    reviews: [],
  },
  {
    id: "7",
    supabaseId: null,
    name: "Folklore",
    artist: "Taylor Swift",
    genre: "pop",
    price: 880,
    format: "LP",
    year: 2020,
    badge: "Novedad",
    rpm: "33 RPM",
    material: "Vinilo blanco 140g",
    estado: "Nuevo",
    incluye: "Booklet + lyric insert",
    imagen_url: null,
    tracks: [
      { s: "A", n: "the 1", d: "3:30" },
      { s: "A", n: "cardigan", d: "3:59" },
      { s: "A", n: "the last great american dynasty", d: "3:51" },
      { s: "A", n: "exile ft. Bon Iver", d: "4:44" },
      { s: "A", n: "my tears ricochet", d: "4:15" },
      { s: "B", n: "mirrorball", d: "3:29" },
      { s: "B", n: "seven", d: "3:28" },
      { s: "B", n: "august", d: "4:21" },
      { s: "B", n: "this is me trying", d: "3:10" },
      { s: "C", n: "illicit affairs", d: "3:10" },
      { s: "C", n: "invisible string", d: "4:12" },
      { s: "C", n: "mad woman", d: "3:57" },
      { s: "D", n: "epiphany", d: "4:52" },
      { s: "D", n: "betty", d: "4:54" },
      { s: "D", n: "peace", d: "3:53" },
      { s: "D", n: "hoax", d: "3:40" },
    ],
    reviews: [
      {
        name: "Valeria T.",
        stars: 5,
        date: "22 Mar 2026",
        text: "La edición en vinilo blanco es preciosa.",
        compra_verificada: true,
      },
    ],
  },
  {
    id: "8",
    supabaseId: null,
    name: "Emotion",
    artist: "Carly Rae Jepsen",
    genre: "pop",
    price: 690,
    format: "LP",
    year: 2015,
    badge: null,
    rpm: "33 RPM",
    material: "Vinilo negro 140g",
    estado: "Nuevo",
    incluye: "Inner sleeve",
    imagen_url: null,
    tracks: [
      { s: "A", n: "Run Away with Me", d: "3:52" },
      { s: "A", n: "Emotion", d: "3:28" },
      { s: "A", n: "Hurt So Good", d: "3:32" },
      { s: "A", n: "I Really Like You", d: "3:38" },
      { s: "B", n: "Gimmie Love", d: "3:14" },
      { s: "B", n: "Making the Most of the Night", d: "3:28" },
      { s: "B", n: "Your Type", d: "3:17" },
      { s: "B", n: "Let's Get Lost", d: "3:59" },
      { s: "B", n: "All That", d: "3:38" },
      { s: "B", n: "Boy Problems", d: "3:24" },
    ],
    reviews: [],
  },
];

/* =====================================================
   ADAPTADOR — Supabase row → formato interno
   ===================================================== */
function adaptProduct(row) {
  return {
    id: row.id,
    name: row.nombre,
    artist: row.artista,
    genre: row.genero_nombre || row.genero_slug,
    genreSlug: row.genero_slug,
    price: Number(row.precio || 0),
    format: row.formato,
    year: row.anio,
    rpm: row.rpm,
    material: row.material,
    state: row.estado,
    includes: row.incluye,
    badge: row.badge,
    stock: row.stock,
    isNew: row.es_novedad,
    active: row.activo,

    // Construye la URL pública completa si solo viene el nombre del archivo
    imagen_url: row.imagen_url
      ? row.imagen_url.startsWith("http")
        ? row.imagen_url
        : `${SUPABASE_URL}/storage/v1/object/public/Imagenes/${encodeURIComponent(
            row.imagen_url
          )}`
      : null,

    description: row.descripcion,
    rating: Number(row.rating_promedio || 0),
    reviews: Number(row.total_reseñas || 0),
  };
}

/* =====================================================
   CURSOR PERSONALIZADO
   ===================================================== */
const cursorEl = document.getElementById("cursor");
const cursorFollower = document.getElementById("cursorFollower");

document.addEventListener("mousemove", (e) => {
  const x = e.clientX;
  const y = e.clientY;

  if (cursorEl) {
    cursorEl.style.left = x + "px";
    cursorEl.style.top = y + "px";
  }
  if (cursorFollower) {
    cursorFollower.style.left = x + "px";
    cursorFollower.style.top = y + "px";
  }
});

function addCursorHover(sel) {
  document.querySelectorAll(sel).forEach((el) => {
    el.addEventListener("mouseenter", () => {
      cursorEl?.classList.add("hover");
      cursorFollower?.classList.add("hover");
    });
    el.addEventListener("mouseleave", () => {
      cursorEl?.classList.remove("hover");
      cursorFollower?.classList.remove("hover");
    });
  });
}

/* =====================================================
   NAVEGACIÓN
   ===================================================== */
function showPage(id) {
  if (id === "perfil" && !currentUser) {
    openAuth("login");
    return;
  }

  const pageMapping = {
    'home': 'index.html',
    'tienda': 'tienda.html',
    'product': 'producto.html',
    'envios': 'envios.html',
    'politicas': 'politicas.html',
    'checkout': 'checkout.html',
    'perfil': 'perfil.html'
  };

  const targetPage = pageMapping[id];
  if (!targetPage) return;

  const pageEl = document.getElementById("page-" + id);
  if (pageEl) {
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    pageEl.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (id === "tienda") loadShopProducts();
    if (id === "checkout") updateOrderSummary();
    if (id === "perfil") loadProfile();
  } else {
    window.location.href = targetPage;
  }
}

/* =====================================================
   TARJETAS DE PRODUCTO
   =====================================================
   FIX: Muestra imagen_url si existe; si no, el vinil animado con gradiente.
   FIX: Usa p.id (UUID de Supabase) como identificador en onclick/addToCart.
   ===================================================== */
const gradients = [
  "var(--lila-200), var(--lavanda)",
  "#fce4ec, #f8bbd0",
  "#e3f2fd, #bbdefb",
  "#e8f5e9, #c8e6c9",
  "#fff3e0, #ffe0b2",
];

function productCardHTML(p) {
  // Gradientes fallback
  const gradients = [
    "var(--lila-200), var(--lavanda)",
    "#fce4ec, #f8bbd0",
    "#e3f2fd, #bbdefb",
    "#e8f5e9, #c8e6c9",
    "#fff3e0, #ffe0b2",
  ];

  // Hash simple
  const hashCode = (str) =>
    [...str].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);

  const grad = gradients[Math.abs(hashCode(p.name || "")) % gradients.length];

  return `
    <div class="product-card" onclick="openProduct('${p.id}')">

      <div 
        class="product-img"
        style="background:linear-gradient(135deg,${grad});overflow:hidden;"
      >

        ${
          p.imagen_url
            ? `<img
              src="${p.imagen_url}"
              alt="${p.name}"
              loading="lazy"
              style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"
              onerror="this.style.display='none'"
            >`
            : `<div class="vinyl-thumb" style="position:absolute;inset:0;margin:auto;top:50%;left:50%;transform:translate(-50%,-50%)"></div>`
        }

        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ""}

        <button
          class="product-add-btn"
          onclick="event.stopPropagation();addToCart('${p.id}')"
        >
          +
        </button>

      </div>

      <div class="product-info">

        <div class="product-genre">
          ${p.genre || ""}
        </div>

        <div class="product-name">
          ${p.name}
        </div>

        <div class="product-artist">
          ${p.artist} · ${p.year}
        </div>

        <div class="product-footer">
          <span class="product-price">
            $${p.price}
          </span>

          <span class="product-format">
            ${p.format}
          </span>
        </div>

      </div>

    </div>
  `;
}

/* =====================================================
   CARGAR PRODUCTOS — HOME
   FIX: Formato correcto del query string de Supabase.
        Guarda en cache para que addToCart funcione por UUID.
   ===================================================== */
async function loadHomeProducts() {
  const grid = document.getElementById("homeGrid");
  if (!grid) return;
  grid.innerHTML =
    '<p style="color:var(--texto-suave);padding:1rem">Cargando...</p>';
  try {
    const data = await sb.get(
      "productos_con_rating",
      "?activo=eq.true&order=created_at.desc&limit=4"
    );
    const adapted = data.map(adaptProduct);
    // Guardar en cache
    adapted.forEach((p) => {
      if (!productsCache.find((c) => c.id === p.id)) productsCache.push(p);
    });
    grid.innerHTML = adapted.length
      ? adapted.map(productCardHTML).join("")
      : sampleProducts.slice(0, 4).map(productCardHTML).join("");

    // Cargar imágenes de la sección estática de "Novedades destacadas"
    loadNovedadesImages();
  } catch (e) {
    console.warn("loadHomeProducts fallback:", e.message);
    grid.innerHTML = sampleProducts.slice(0, 4).map(productCardHTML).join("");
    loadNovedadesImages();
  }
}

async function loadNovedadesImages() {
  const mapping = [
    {
      id: "550a7fd2-1596-4ece-a547-3487802dae48",
      elId: "novedad-featured-img",
    },
    { id: "5e418a8e-56d1-49e6-acd1-a50ea20e5b58", elId: "novedad-sm-1-img" },
    { id: "d84478e1-d964-44eb-8673-b2b1e71e1b1e", elId: "novedad-sm-2-img" },
  ];

  for (const item of mapping) {
    const el = document.getElementById(item.elId);
    if (!el) continue;
    try {
      const data = await sb.get(
        "productos_con_rating",
        `?id=eq.${item.id}&limit=1`
      );
      if (data.length) {
        const p = adaptProduct(data[0]);
        if (p.imagen_url) {
          el.innerHTML = `<img src="${p.imagen_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
        }
      }
    } catch (e) {
      console.warn("Error cargando imagen destacada:", e.message);
    }
  }
}

/* =====================================================
   CARGAR PRODUCTOS — TIENDA
   FIX: Mismo fix de query string.
        Sin fallback a sampleProducts si Supabase responde vacío
        (para no mostrar demos si la tienda ya tiene productos reales).
        Guarda en cache.
   ===================================================== */
async function loadShopProducts(localList) {
  const count = document.getElementById("resultsCount");
  const grid = document.getElementById("shopGrid");
  if (!grid) return;

  const sortSelect = document.querySelector(".sort-select");
  const sortVal = sortSelect ? sortSelect.value : "recent";
  const sortFn = (a, b) => {
    const nameA = a.name || "";
    const nameB = b.name || "";
    if (sortVal === "price_asc") return a.price - b.price;
    if (sortVal === "price_desc") return b.price - a.price;
    if (sortVal === "alpha_asc") return nameA.localeCompare(nameB);
    if (sortVal === "alpha_desc") return nameB.localeCompare(nameA);
    return 0;
  };

  // Lista local (filtros rápidos)
  if (localList) {
    const sortedLocal = [...localList].sort(sortFn);
    if (count)
      count.textContent = `${sortedLocal.length} producto${
        sortedLocal.length !== 1 ? "s" : ""
      }`;
    grid.innerHTML = sortedLocal.map(productCardHTML).join("");
    return;
  }

  grid.innerHTML =
    '<p style="color:var(--texto-suave);padding:1rem">Cargando catálogo...</p>';
  try {
    const data = await sb.get(
      "productos_con_rating",
      "?activo=eq.true&order=created_at.desc"
    );
    const adapted = data.map(adaptProduct);
    // Guardar en cache
    adapted.forEach((p) => {
      if (!productsCache.find((c) => c.id === p.id)) productsCache.push(p);
    });
    
    const sortedAdapted = [...adapted].sort(sortFn);
    
    if (count)
      count.textContent = `${sortedAdapted.length} producto${
        sortedAdapted.length !== 1 ? "s" : ""
      }`;
    grid.innerHTML = sortedAdapted.length
      ? sortedAdapted.map(productCardHTML).join("")
      : '<p style="color:var(--texto-suave)">No hay productos disponibles.</p>';
  } catch (e) {
    console.warn("loadShopProducts fallback:", e.message);
    const sortedSamples = [...sampleProducts].sort(sortFn);
    if (count) count.textContent = `${sortedSamples.length} productos (demo)`;
    grid.innerHTML = sortedSamples.map(productCardHTML).join("");
  }
}

/* =====================================================
   DETALLE DE PRODUCTO
   FIX: Busca primero en cache local antes de ir a Supabase.
        Muestra imagen real en la galería si existe.
        Productos relacionados busca en cache + sampleProducts.
   ===================================================== */
async function openProduct(idOrObj) {
  let p = typeof idOrObj === "object" ? idOrObj : null;

  if (!p) {
    // 1. Buscar en cache primero
    p = productsCache.find((x) => x.id === idOrObj);

    // 2. Si no está en cache, ir a Supabase
    if (!p) {
      try {
        const rows = await sb.get(
          "productos_con_rating",
          `?id=eq.${idOrObj}&limit=1`
        );
        if (rows.length) {
          p = adaptProduct(rows[0]);
          productsCache.push(p);
        }
      } catch (e) {
        console.warn("openProduct Supabase error:", e.message);
      }
    }

    // 3. Fallback a sampleProducts (solo si id es numérico corto)
    if (!p) {
      p = sampleProducts.find((x) => x.id === idOrObj);
    }
  }
  if (!p) return;

  localStorage.setItem("ouat_current_product_id", p.id);

  if (!document.getElementById("page-product")) {
    window.location.href = "producto.html";
    return;
  }

  // Cargar tracklist desde Supabase
  try {
    const tracks = await sb.get(
      "tracks",
      `?producto_id=eq.${p.supabaseId || p.id}&order=numero.asc`
    );
    if (tracks.length)
      p.tracks = tracks.map((t) => ({
        s: t.lado,
        n: t.nombre,
        d: t.duracion || "",
      }));
  } catch (e) {
    /* usa tracks del objeto local */
  }

  // Cargar reseñas desde Supabase
  try {
    const reviews = await sb.get(
      "reseñas",
      `?producto_id=eq.${
        p.supabaseId || p.id
      }&order=created_at.desc`
    );
    if (reviews.length) p.reviews = reviews;
  } catch (e) {
    /* usa reviews locales */
  }

  currentProduct = p;
  showPage("product");

  // Breadcrumb y cabecera
  document.getElementById("pdBreadcrumb").textContent = p.name;
  document.getElementById("pdGenre").textContent = (
    p.genre || ""
  ).toUpperCase();
  document.getElementById("pdTitle").textContent = p.name;
  document.getElementById("pdArtist").textContent = `${p.artist} · ${p.year}`;

  // Rating
  const reviews = p.reviews || [];
  const avg = reviews.length
    ? (
        reviews.reduce((s, r) => s + (r.estrellas || r.stars || 5), 0) /
        reviews.length
      ).toFixed(1)
    : null;
  document.getElementById("pdStars").textContent = avg ? renderStars(avg) : "—";
  document.getElementById("pdRatingCount").textContent = `(${
    reviews.length
  } reseña${reviews.length !== 1 ? "s" : ""})`;

  // Precio y envío
  document.getElementById("pdPrice").textContent = `$${p.price} MXN`;
  document.getElementById("pdPriceSub").textContent =
    "Precio unitario · IVA incluido";
  document.getElementById("pdShipping").innerHTML =
    p.price >= 1000
      ? `📦 <span class="ship-free">Envío gratis incluido (compra mayor a $1,000)</span>`
      : `📦 <span class="ship-cost">Envío calculado al checkout · Gratis en compras +$1,000</span>`;

  // MSI default (3 meses)
  document
    .querySelectorAll(".msi-chip")
    .forEach((c) => c.classList.remove("active"));
  const firstChip = document.querySelector(".msi-chip");
  if (firstChip) firstChip.classList.add("active");
  updateMSIDetail(3);

  // Características
  const specs = [
    ["Artista", p.artist],
    ["Año", p.year],
    ["Género", p.genre],
    ["Formato", p.format],
    ["RPM", p.rpm],
    ["Material", p.material],
    ["Estado", p.estado],
    ["Incluye", p.incluye],
  ];
  document.getElementById("pdSpecs").innerHTML = specs
    .map(
      ([k, v]) =>
        `<div class="spec-item"><span class="spec-key">${k}</span><span class="spec-val">${
          v || "—"
        }</span></div>`
    )
    .join("");

  // Miniaturas — muestra imagen real si existe, sino vinil
  document.getElementById("pdThumbs").innerHTML = [1, 2, 3]
    .map((_, i) => {
      const imgInner = p.imagen_url
        ? `<img src="${p.imagen_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">`
        : `<div class="pd-thumb-vinyl"></div>`;
      return `<div class="pd-thumb ${
        i === 0 ? "active" : ""
      }" onclick="selectThumb(this)">${imgInner}</div>`;
    })
    .join("");

  // Imagen principal en galería
  const mainImg = document.getElementById("pdMainImg");
  if (mainImg) {
    if (p.imagen_url) {
      mainImg.innerHTML = `<img src="${p.imagen_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
    } else {
      mainImg.innerHTML = `<div class="vinyl-spin"></div>`;
    }
  }

  // Tracklist
  buildTracklist(p.tracks || []);

  // Reseñas — cargar pedidos frescos antes de evaluar si el usuario compró el producto
  await loadUserOrders();
  renderReviews(p.reviews || []);
  renderReviewForm();

  // Relacionados — busca en cache y sampleProducts
  const allProducts = [
    ...productsCache,
    ...sampleProducts.filter((s) => !productsCache.find((c) => c.id === s.id)),
  ];
  const related = allProducts
    .filter((x) => x.id !== p.id && x.genre === p.genre)
    .slice(0, 3);
  document.getElementById("relatedGrid").innerHTML = related.length
    ? related.map(productCardHTML).join("")
    : '<p style="color:var(--texto-suave)">Sin productos relacionados.</p>';

  // Reset pestaña
  switchPdTab("tracks", document.querySelector(".pd-tab"));
}

function selectThumb(el) {
  document
    .querySelectorAll(".pd-thumb")
    .forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
}

function renderStars(avg) {
  const n = parseFloat(avg);
  if (isNaN(n)) return "—";
  return (
    "★".repeat(Math.floor(n)) +
    (n % 1 >= 0.5 ? "½" : "") +
    "☆".repeat(5 - Math.ceil(n))
  );
}

function buildTracklist(tracks) {
  if (!tracks.length) {
    document.getElementById("pdTrackList").innerHTML =
      '<p style="color:var(--texto-suave);font-size:0.87rem;padding:1rem">Sin información de tracklist.</p>';
    return;
  }
  let currentSide = "";
  const html = tracks
    .map((t, i) => {
      let header = "";
      if (t.s !== currentSide) {
        currentSide = t.s;
        header = `<div style="padding:0.5rem 1rem;font-size:0.7rem;text-transform:uppercase;
                letter-spacing:0.1em;color:var(--lila-500);font-weight:700;
                margin-top:${i > 0 ? "0.5rem" : "0"}">Lado ${t.s}</div>`;
      }
      return `${header}
      <div class="track-item">
        <span class="track-num">${i + 1}</span>
        <span class="track-name">${t.n}</span>
        <span class="track-dur">${t.d}</span>
      </div>`;
    })
    .join("");
  document.getElementById("pdTrackList").innerHTML = html;
}

function switchPdTab(tab, el) {
  document
    .querySelectorAll(".pd-tab")
    .forEach((t) => t.classList.remove("active"));
  if (el) el.classList.add("active");
  document.getElementById("pdTabTracks").style.display =
    tab === "tracks" ? "block" : "none";
  document.getElementById("pdTabReviews").style.display =
    tab === "reviews" ? "block" : "none";
  document.getElementById("pdTabRelated").style.display =
    tab === "related" ? "block" : "none";
}

/* MSI en detalle de producto */
function selectMSI(el, months) {
  document
    .querySelectorAll(".msi-chip")
    .forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  updateMSIDetail(months);
}
function updateMSIDetail(months) {
  const price = currentProduct ? currentProduct.price : 0;
  const detail = document.getElementById("msiDetail");
  if (!detail) return;
  detail.innerHTML =
    months <= 1
      ? `Pago único de <strong>$${price} MXN</strong>`
      : `<strong>${months} pagos</strong> de <strong>$${(
          price / months
        ).toFixed(2)} MXN/mes</strong>
       · Total <strong>$${price} MXN</strong> sin intereses`;
  detail.classList.add("show");
}

/* =====================================================
   RESEÑAS
   ===================================================== */
function renderReviews(reviews) {
  const list = document.getElementById("reviewsList");
  if (!reviews.length) {
    list.innerHTML =
      '<p style="color:var(--texto-suave);font-size:0.87rem">Aún no hay reseñas. ¡Sé el primero!</p>';
    updateReviewStats([]);
    return;
  }
  list.innerHTML = reviews
    .map((r) => {
      const nombre = r.nombre || r.name || "Usuario";
      const estrellas = r.estrellas || r.stars || 5;
      const texto = r.texto || r.text || "";
      const fecha = r.created_at
        ? new Date(r.created_at).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : r.date || "";
      const verificada = r.compra_verificada !== false;
      return `
      <div class="review-card">
        <div class="reviewer-row">
          <div>
            <div class="reviewer-name" style="display:flex;align-items:center;gap:0.5rem">
              ${nombre}
              ${
                verificada
                  ? `<span style="background:#dcfce7;color:#166534;font-size:0.62rem;
                font-weight:700;padding:0.15rem 0.5rem;border-radius:50px">✓ Compra verificada</span>`
                  : ""
              }
            </div>
            <div class="stars" style="font-size:0.85rem;margin-top:2px">
              ${"★".repeat(estrellas)}${"☆".repeat(5 - estrellas)}
            </div>
          </div>
          <div class="review-date">${fecha}</div>
        </div>
        <p class="review-text">${texto}</p>
      </div>`;
    })
    .join("");
  updateReviewStats(reviews);
}

function updateReviewStats(reviews) {
  const el = document.getElementById("reviewAvg");
  const tot = document.getElementById("reviewTotal");
  if (!reviews.length) {
    if (el) el.textContent = "—";
    if (tot) tot.textContent = "0 reseñas";
    return;
  }
  const getS = (r) => r.estrellas || r.stars || 5;
  const avg = (
    reviews.reduce((s, r) => s + getS(r), 0) / reviews.length
  ).toFixed(1);
  if (el) el.textContent = avg;
  if (tot)
    tot.textContent = `${reviews.length} reseña${
      reviews.length !== 1 ? "s" : ""
    }`;
  [5, 4, 3, 2, 1].forEach((stars, i) => {
    const pct = Math.round(
      (reviews.filter((r) => getS(r) === stars).length / reviews.length) * 100
    );
    const bars = document.querySelectorAll(".bar-fill");
    if (bars[i]) bars[i].style.width = pct + "%";
  });
}

function userBoughtCurrentProduct() {
  if (!currentUser || !currentProduct) return false;
  return userOrders.some(
    (o) =>
      o.status !== "cancelled" &&
      o.status !== "pendiente_pago" &&
      (o.items || []).some(
        (i) =>
          i.id === currentProduct.id ||
          i.id === currentProduct.supabaseId ||
          i.producto_id === currentProduct.supabaseId ||
          i.producto_id === currentProduct.id
      )
  );
}

function renderReviewForm() {
  const form = document.getElementById("reviewForm");
  if (!form) return;
  const hasBought = userBoughtCurrentProduct();
  const hasReviewed = (currentProduct?.reviews || []).some(
    (r) => (r.nombre || r.name) === currentUser?.name
  );

  if (!currentUser) {
    form.innerHTML = `
      <div style="text-align:center;padding:1.5rem 0">
        <div style="font-size:2rem;margin-bottom:0.5rem">🔒</div>
        <p style="color:var(--texto-suave);font-size:0.88rem;margin-bottom:1rem">
          Inicia sesión para dejar una reseña</p>
        <button class="btn-primary" onclick="openAuth('login')">Iniciar sesión</button>
      </div>`;
    return;
  }
  if (!hasBought) {
    form.innerHTML = `
      <div style="background:var(--lila-100);border-radius:var(--radius-sm);padding:1.2rem 1.5rem;text-align:center">
        <div style="font-size:1.5rem;margin-bottom:0.4rem">🛒</div>
        <p style="color:var(--morado-700);font-size:0.88rem;font-weight:600;margin-bottom:0.2rem">
          Solo compradores verificados</p>
        <p style="color:var(--texto-suave);font-size:0.82rem">
          Adquiere este disco para poder dejar tu reseña.</p>
        <button class="btn-primary" style="margin-top:1rem;padding:0.6rem 1.5rem"
          onclick="addCurrentToCart()">Añadir al carrito</button>
      </div>`;
    return;
  }
  if (hasReviewed) {
    form.innerHTML = `
      <div style="background:#dcfce7;border-radius:var(--radius-sm);padding:1.2rem 1.5rem;text-align:center">
        <div style="font-size:1.5rem;margin-bottom:0.4rem">✅</div>
        <p style="color:#166534;font-size:0.88rem;font-weight:600">
          Ya dejaste tu reseña para este disco. ¡Gracias!</p>
      </div>`;
    return;
  }
  form.innerHTML = `
    <h4>Deja tu reseña
      <span style="background:#dcfce7;color:#166534;font-size:0.62rem;font-weight:700;
        padding:0.2rem 0.6rem;border-radius:50px;vertical-align:middle;margin-left:6px">
        ✓ Compra verificada</span>
    </h4>
    <div style="margin-bottom:0.8rem">
      <div style="font-size:0.75rem;font-weight:600;color:var(--texto);
        text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem">Calificación</div>
      <div class="star-select" id="starSelect">
        <span onclick="setReviewStar(1)">☆</span><span onclick="setReviewStar(2)">☆</span>
        <span onclick="setReviewStar(3)">☆</span><span onclick="setReviewStar(4)">☆</span>
        <span onclick="setReviewStar(5)">☆</span>
      </div>
    </div>
    <div class="form-group">
      <label>Tu nombre</label>
      <input type="text" id="reviewName" value="${
        currentUser.name || ""
      }" placeholder="Nombre"/>
    </div>
    <div class="form-group">
      <label>Reseña</label>
      <textarea id="reviewText" placeholder="¿Qué te pareció este disco?"></textarea>
    </div>
    <button class="btn-primary" onclick="submitReview()">Publicar reseña</button>`;
}

function setReviewStar(n) {
  reviewStarSel = n;
  document
    .querySelectorAll("#starSelect span")
    .forEach((s, i) => (s.textContent = i < n ? "★" : "☆"));
}

async function submitReview() {
  if (!currentUser) {
    openAuth("login");
    return;
  }
  if (!userBoughtCurrentProduct()) {
    showToast("🛒", "Solo puedes reseñar discos que hayas comprado");
    return;
  }
  const name =
    document.getElementById("reviewName")?.value.trim() || currentUser.name;
  const text = document.getElementById("reviewText")?.value.trim();
  if (!text) {
    showToast("⚠️", "Escribe algo en tu reseña");
    return;
  }

  if (authToken && currentProduct.supabaseId) {
    try {
      await sb.authPost(
        "reseñas",
        {
          producto_id: currentProduct.supabaseId,
          usuario_id: currentUser.supabaseId || null,
          nombre: name,
          estrellas: reviewStarSel,
          texto: text,
          aprobada: true,
          compra_verificada: true,
        },
        authToken
      );
    } catch (e) {
      console.error("Error al guardar reseña en Supabase:", e.message);
      const msg = e.message.includes("Solo puedes")
        ? "Solo puedes reseñar discos que hayas comprado"
        : `Error al publicar la reseña: ${e.message}`;
      showToast("⚠️", msg);
      return;
    }
  }

  const review = {
    name,
    stars: reviewStarSel,
    text,
    compra_verificada: true,
    date: new Date().toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  };
  if (!currentProduct.reviews) currentProduct.reviews = [];
  currentProduct.reviews.unshift(review);
  renderReviews(currentProduct.reviews);
  renderReviewForm();
  showToast("⭐", "¡Reseña publicada! Gracias por tu opinión.");
}

/* =====================================================
   CARRITO
   FIX: Busca producto en productsCache (UUID) antes de sampleProducts.
   ===================================================== */
function addToCart(idOrObj) {
  let p;
  if (typeof idOrObj === "object") {
    p = idOrObj;
  } else {
    // Buscar en cache de Supabase primero, luego en samples
    p =
      productsCache.find((x) => x.id === idOrObj) ||
      sampleProducts.find((x) => x.id === idOrObj) ||
      currentProduct;
  }
  if (!p) return;

  const existing = cart.find((i) => i.id === p.id);
  if (existing) existing.qty++;
  else
    cart.push({
      id: p.id,
      supabaseId: p.supabaseId || null,
      name: p.name,
      artist: p.artist,
      price: p.price,
      qty: 1,
    });
  saveCart();
  updateCartCount();
  showToast("🎵", `"${p.name}" añadido al carrito`);
  renderCart();
}

function addCurrentToCart() {
  if (currentProduct) addToCart(currentProduct);
}

function removeFromCart(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
  updateCartCount();
  renderCart();
}

function saveCart() {
  localStorage.setItem("ouat_cart", JSON.stringify(cart));
}
function saveOrders() {
  localStorage.setItem("ouat_orders", JSON.stringify(userOrders));
}
function updateCartCount() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById("cartCount").textContent = n;
}

function renderCart() {
  const container = document.getElementById("cartItems");
  const footer = document.getElementById("cartFooter");
  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <span class="empty-icon">🎵</span>
        <p>Tu carrito está vacío.<br/>¡Explora el catálogo!</p>
      </div>`;
    footer.style.display = "none";
    return;
  }
  footer.style.display = "block";
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  container.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item">
      <div class="cart-item-img">
        <div class="vinyl-thumb" style="width:36px;height:36px"></div>
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-artist">${item.artist} · ×${item.qty}</div>
        <div class="cart-item-price">$${(item.price * item.qty).toFixed(
          2
        )}</div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${
        item.id
      }')">✕</button>
    </div>`
    )
    .join("");
  document.getElementById("cartTotal").textContent = `$${total.toFixed(2)}`;
}

function toggleCart() {
  document.getElementById("cartOverlay").classList.toggle("open");
  renderCart();
}
function closeCartBg(e) {
  if (e.target === document.getElementById("cartOverlay")) toggleCart();
}
function goToCheckout() {
  toggleCart();
  showPage("checkout");
}

/* =====================================================
   CHECKOUT
   ===================================================== */
function updateOrderSummary() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= storeConfig.envio_gratis_min ? 0 : storeConfig.envio_costo;
  document.getElementById("orderItems").innerHTML = cart.length
    ? cart
        .map(
          (i) => `
        <div class="order-line">
          <span>${i.name} ×${i.qty}</span>
          <span>$${(i.price * i.qty).toFixed(2)}</span>
        </div>`
        )
        .join("")
    : '<p style="color:var(--texto-suave);font-size:0.83rem">Tu carrito está vacío.</p>';
  document.getElementById("orderSubtotal").textContent = `$${subtotal.toFixed(
    2
  )}`;
  document.getElementById("orderShipping").textContent =
    shipping === 0 ? "Gratis 🎉" : `$${shipping}.00`;
  document.getElementById("orderTotal").textContent = `$${(
    subtotal + shipping
  ).toFixed(2)}`;
}

function selectPayment(el, method) {
  document
    .querySelectorAll(".payment-method")
    .forEach((m) => m.classList.remove("selected"));
  el.classList.add("selected");
  selectedPayment = method;
  ["card", "transfer", "paypal", "oxxo"].forEach((m) => {
    const f = document.getElementById(m + "Fields");
    if (f) f.style.display = m === method ? "block" : "none";
  });
  const msiSel = document.getElementById("msiSelectorCk");
  if (msiSel && method !== "card") msiSel.style.display = "none";
}

function updateMSIPreview() {
  const isCredit = document.getElementById("cardType")?.value === "credit";
  const msiSel = document.getElementById("msiSelectorCk");
  if (msiSel) msiSel.style.display = isCredit ? "block" : "none";
}

function selectMSICk(el, months) {
  document
    .querySelectorAll(".msi-btn")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  selectedMSICk = months;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + (subtotal >= 1000 ? 0 : 120);
  const preview = document.getElementById("msiPreviewCk");
  if (!preview) return;
  preview.style.display = "block";
  preview.innerHTML =
    months === 1
      ? `Pago único: <strong>$${total.toFixed(2)} MXN</strong>`
      : `<strong>${months} pagos</strong> de <strong>$${(
          total / months
        ).toFixed(2)} MXN/mes</strong>
       · Total: <strong>$${total.toFixed(2)} MXN</strong> sin intereses`;
}

function buildAddress() {
  const v = (id) => document.getElementById(id)?.value.trim() || "";
  return [
    v("ckStreet"),
    v("ckColonia"),
    `CP ${v("ckCP")}`,
    v("ckCity"),
    v("ckState"),
  ]
    .filter(Boolean)
    .join(", ");
}

async function processOrder() {
  if (!cart.length) {
    showToast("⚠️", "Tu carrito está vacío");
    return;
  }
  const name = document.getElementById("ckName")?.value.trim();
  const email = document.getElementById("ckEmail")?.value.trim();
  if (!name || !email) {
    showToast("⚠️", "Completa tus datos de contacto");
    return;
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= storeConfig.envio_gratis_min ? 0 : storeConfig.envio_costo;
  const total = subtotal + shipping;
  const orderId = "OUAT-" + Date.now().toString().slice(-6);
  const isOxxo = selectedPayment === "oxxo";
  const oxxoRef = isOxxo ? generateOxxoRef() : null;
  const oxxoExpiry = isOxxo ? getOxxoExpiry() : null;

  const isCredit = document.getElementById("cardType")?.value === "credit";
  const payLabels = {
    card: isCredit
      ? `Tarjeta de crédito${
          selectedMSICk > 1 ? ` · ${selectedMSICk} MSI` : ""
        }`
      : "Tarjeta de débito",
    transfer: "Transferencia SPEI",
    paypal: "PayPal",
    oxxo: "OXXO Pay",
  };
  const paymentLabel = payLabels[selectedPayment] || selectedPayment;

  const order = {
    id: orderId,
    date: new Date().toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    name,
    email,
    address: buildAddress(),
    items: [...cart],
    subtotal,
    shipping,
    total,
    payment: paymentLabel,
    status: isOxxo ? "pendiente_pago" : "processing",
    msi: selectedMSICk,
    isOxxo,
    oxxoRef,
    oxxoExpiry,
  };

  if (authToken) {
    try {
      const body = {
        numero: order.id,
        usuario_id: currentUser?.supabaseId || null,
        cliente_nombre: name,
        cliente_email: email,
        cliente_telefono:
          document.getElementById("ckPhone")?.value.trim() || null,
        envio_calle: document.getElementById("ckStreet")?.value || "",
        envio_colonia: document.getElementById("ckColonia")?.value || "",
        envio_cp: document.getElementById("ckCP")?.value || "",
        envio_ciudad: document.getElementById("ckCity")?.value || "",
        envio_estado: document.getElementById("ckState")?.value || "",
        envio_referencias: document.getElementById("ckRef")?.value || "",
        subtotal,
        costo_envio: shipping,
        total,
        metodo_pago: paymentLabel,
        msi: selectedMSICk,
        estado: order.status,
        oxxo_referencia: oxxoRef,
        oxxo_vence_at: isOxxo
          ? new Date(Date.now() + 72 * 3600 * 1000).toISOString()
          : null,
      };
      const [pedidoDB] = await sb.authPost("pedidos", body, authToken);
      if (pedidoDB?.id) {
        const itemsBody = cart.map((i) => ({
          pedido_id: pedidoDB.id,
          producto_id: i.supabaseId || null,
          nombre: i.name,
          artista: i.artist,
          precio_unitario: i.price,
          cantidad: i.qty,
        }));
        await sb.authPost("pedido_items", itemsBody, authToken);
        order.supabaseId = pedidoDB.id;
      }
    } catch (e) {
      console.warn("No se pudo guardar en Supabase:", e.message);
    }
  }

  userOrders.unshift(order);
  saveOrders();
  currentTicket = order;
  cart = [];
  saveCart();
  updateCartCount();

  showToast("🎉", `¡Pedido ${orderId} confirmado!`);
  setTimeout(() => {
    openTicketModal(order);
    simulateSendEmail(order);
  }, 800);
}

/* =====================================================
   OXXO — Referencia y QR
   ===================================================== */
function generateOxxoRef() {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return (ts + rand)
    .slice(-18)
    .replace(/(\d{4})(\d{4})(\d{4})(\d{6})/, "$1 $2 $3 $4");
}
function getOxxoExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + 72);
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function buildOxxoQR(ref, container, size = 130) {
  const clean = ref.replace(/\s/g, "");
  const img = document.createElement("img");
  img.src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    clean
  )}&size=${size}x${size}&color=ea580c&bgcolor=ffffff&margin=2`;
  img.alt = "Código QR OXXO";
  img.width = size;
  img.height = size;
  img.style.borderRadius = "4px";
  container.appendChild(img);
}

/* =====================================================
   TICKET MODAL
   ===================================================== */
function openTicketModal(order) {
  ["oxxoTicketBlock", "ticketTracking"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  document.getElementById("ticketOrderId").textContent = "#" + order.id;
  document.getElementById("tDate").textContent = order.date;
  document.getElementById("tName").textContent = order.name;
  document.getElementById("tEmail").textContent = order.email;
  document.getElementById("tPayment").textContent = order.payment;
  document.getElementById("tAddress").textContent = order.address || "—";
  document.getElementById("tStatus").textContent = order.isOxxo
    ? "Pendiente de pago 🟡"
    : "En proceso ⏳";
  document.getElementById("tItems").innerHTML = [
    ...order.items.map(
      (i) => `
      <div class="ticket-item">
        <span>${i.name} (${i.artist}) ×${i.qty}</span>
        <span>$${(i.price * i.qty).toFixed(2)}</span>
      </div>`
    ),
    `<div class="ticket-item">
       <span>Envío</span>
       <span>${
         order.shipping === 0 ? "Gratis" : "$" + order.shipping + ".00"
       }</span>
     </div>`,
  ].join("");
  document.getElementById("tTotal").textContent = `$${order.total.toFixed(
    2
  )} MXN`;

  if (order.isOxxo && order.oxxoRef) {
    const block = document.createElement("div");
    block.id = "oxxoTicketBlock";
    block.innerHTML = `
      <div class="oxxo-block">
        <div class="oxxo-logo">🏪 OXXO Pay</div>
        <div class="oxxo-label">Referencia de pago</div>
        <div class="oxxo-ref">${order.oxxoRef}</div>
        <div class="oxxo-amount-label">Monto a pagar</div>
        <div class="oxxo-amount">$${order.total.toFixed(2)} MXN</div>
        <div class="oxxo-qr-wrapper" id="oxxoQRWrap"></div>
        <div style="font-size:0.78rem;opacity:0.9;margin-top:0.3rem">Escanea el QR o da tu referencia en caja</div>
        <div class="oxxo-expiry">⏰ Vence: ${order.oxxoExpiry}</div>
        <div class="oxxo-instructions">
          <strong>¿Cómo pagar?</strong><br>
          1. Acude a cualquier tienda OXXO del país<br>
          2. Indica en caja que quieres realizar un pago <strong>OXXOPay</strong><br>
          3. Da tu número de referencia o muestra el QR<br>
          4. Realiza el pago en efectivo por <strong>$${order.total.toFixed(
            2
          )} MXN</strong><br>
          5. Conserva tu comprobante OXXO<br>
          6. Tu pedido se procesará al confirmarse el pago
        </div>
      </div>`;
    document.querySelector(".ticket-total-row").after(block);
    buildOxxoQR(order.oxxoRef, document.getElementById("oxxoQRWrap"), 130);
  }

  document.getElementById("ticketModal").classList.add("open");
}

function closeTicketModal() {
  document.getElementById("ticketModal").classList.remove("open");
  ["oxxoTicketBlock", "ticketTracking"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  if (currentUser) showPage("perfil");
  else showPage("home");
}

function downloadTicketPDF() {
  const order = currentTicket;
  if (!order) return;
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // Configuración de márgenes y colores
    const margin = 20;
    const pageWidth = 210;

    // Encabezado
    doc.setFillColor(46, 16, 87);
    doc.rect(0, 0, pageWidth, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Once Upon a Time", margin, 18);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 180, 240);
    doc.text("Boutique de Viniles · hola@onceuponatime.mx", margin, 25);

    // Etiqueta de ID y Estado (Arriba derecha)
    doc.setFillColor(108, 53, 181);
    doc.roundedRect(145, 10, 45, 12, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("#" + order.id, 167.5, 18, { align: "center" });

    const statusColor = order.isOxxo ? [251, 191, 36] : [34, 197, 94];
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(145, 24, 45, 8, 1.5, 1.5, "F");

    if (order.isOxxo) doc.setTextColor(100, 70, 0);
    else doc.setTextColor(255, 255, 255);

    doc.setFontSize(7);
    doc.text(order.isOxxo ? "PENDIENTE DE PAGO" : "CONFIRMADO", 167.5, 29.5, {
      align: "center",
    });

    let y = 52;

    // Bloque: Información del Pedido
    doc.setFillColor(248, 247, 255);
    doc.roundedRect(margin, y - 5, pageWidth - margin * 2, 28, 2, 2, "F");

    doc.setTextColor(46, 16, 87);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Detalles de la compra", margin + 5, y + 2);

    doc.setFontSize(8);
    doc.setTextColor(100, 80, 140);
    doc.text("Fecha:", margin + 5, y + 10);
    doc.text("Cliente:", margin + 5, y + 16);
    doc.text("Correo:", margin + 75, y + 10);
    doc.text("Método:", margin + 75, y + 16);

    doc.setTextColor(46, 16, 87);
    doc.setFont("helvetica", "normal");
    doc.text(String(order.date || ""), margin + 20, y + 10);
    doc.text(String(order.name || ""), margin + 20, y + 16);
    doc.text(String(order.email || ""), margin + 90, y + 10);
    doc.text(String(order.payment || ""), margin + 90, y + 16);

    y += 38;

    // Tabla de Productos
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(46, 16, 87);
    doc.text("Productos", margin, y);

    y += 4;
    doc.setFillColor(76, 32, 133);
    doc.rect(margin, y, pageWidth - margin * 2, 8, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Descripción", margin + 4, y + 5.5);
    doc.text("Cant.", 155, y + 5.5, { align: "right" });
    doc.text("Total", 185, y + 5.5, { align: "right" });

    y += 8;
    doc.setFontSize(8);
    (order.items || []).forEach((item, idx) => {
      const name = item.nombre || item.name || "Producto";
      const artist = item.artista || item.artist || "Varios";
      const qty = parseInt(item.cantidad || item.qty || 1);
      const price = parseFloat(item.precio_unitario || item.price || 0);

      if (idx % 2 === 0) {
        doc.setFillColor(252, 251, 255);
        doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
      }
      doc.setTextColor(46, 16, 87);
      doc.setFont("helvetica", "normal");
      doc.text(`${name} - ${artist}`, margin + 4, y + 5.5);
      doc.text(String(qty), 155, y + 5.5, { align: "right" });
      doc.text("$" + (price * qty).toFixed(2), 185, y + 5.5, {
        align: "right",
      });
      y += 8;
    });

    // Subtotales
    y += 5;
    doc.setDrawColor(230, 220, 250);
    doc.line(130, y, 190, y);
    y += 5;

    doc.setFontSize(8);
    doc.setTextColor(120, 100, 160);
    doc.text("Subtotal:", 140, y);
    const st = parseFloat(order.subtotal || 0);
    doc.text("$" + st.toFixed(2), 190, y, { align: "right" });

    y += 5;
    doc.text("Costo de envío:", 140, y);
    const ship = parseFloat(order.shipping || 0);
    doc.text(ship === 0 ? "GRATIS" : "$" + ship.toFixed(2), 190, y, {
      align: "right",
    });

    y += 4;
    doc.setFillColor(46, 16, 87);
    doc.rect(130, y, 60, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("TOTAL:", 135, y + 6.5);
    const tot = parseFloat(order.total || 0);
    doc.text("$" + tot.toFixed(2) + " MXN", 185, y + 6.5, { align: "right" });

    y += 20;

    // Dirección
    if (order.address) {
      doc.setFillColor(245, 240, 255);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 15, 2, 2, "F");
      doc.setTextColor(46, 16, 87);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Dirección de envío:", margin + 5, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 80, 140);
      const splitAddress = doc.splitTextToSize(
        String(order.address),
        pageWidth - margin * 2 - 40
      );
      doc.text(splitAddress, margin + 35, y + 6);
      y += 22;
    }

    // OXXO
    if (order.isOxxo && order.oxxoRef) {
      doc.setFillColor(255, 248, 240);
      doc.setDrawColor(249, 115, 22);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 40, 3, 3, "FD");

      doc.setTextColor(154, 52, 18);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("REFERENCIA DE PAGO OXXO", 105, y + 10, { align: "center" });

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Monto a pagar: $" + tot.toFixed(2) + " MXN", 105, y + 16, {
        align: "center",
      });

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(65, y + 20, 80, 10, 1.5, 1.5, "F");
      doc.setTextColor(46, 16, 87);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(String(order.oxxoRef), 105, y + 27, { align: "center" });

      doc.setFontSize(7);
      doc.setTextColor(154, 52, 18);
      doc.text("Vence: " + String(order.oxxoExpiry || "—"), 105, y + 35, {
        align: "center",
      });
      y += 50;
    }

    // Footer
    const footerY = 285;
    doc.setFontSize(7);
    doc.setTextColor(160, 140, 190);
    doc.text(
      "Once Upon a Time · Gracias por tu preferencia · www.onceuponatime.mx",
      105,
      footerY,
      { align: "center" }
    );

    doc.save(`ticket-${order.id}.pdf`);
    showToast("📄", "PDF descargado correctamente");
  } catch (e) {
    console.error("PDF error:", e);
    showToast("⚠️", "Error al generar el PDF");
  }
}

function simulateSendEmail(order) {
  // TODO: Integrar con Resend / SendGrid via Supabase Edge Functions
  console.log(`[EMAIL] Ticket ${order.id} → ${order.email}`);
  showToast("📧", `Ticket enviado a ${order.email}`);
}
function resendTicketEmail() {
  if (currentTicket) simulateSendEmail(currentTicket);
}

/* =====================================================
   PERFIL DE USUARIO
   ===================================================== */
function isAdmin() {
  return currentUser && (currentUser.email === "mfhm1316@gmail.com" || currentUser.email === "mfhm1316@gmial.com");
}

/* Carga (o recarga) los pedidos del usuario desde Supabase.
   Se llama desde loadProfile() Y desde openProduct() para que
   la página de producto siempre tenga los pedidos actualizados
   antes de decidir si mostrar el formulario de reseña. */
async function loadUserOrders() {
  if (!authToken) return;
  try {
    const pedidos = await sb.authGet(
      "pedidos_con_items",
      "?order=created_at.desc",
      authToken
    );
    userOrders = Array.isArray(pedidos)
      ? pedidos.map((p) => ({
          id: p.numero,
          supabaseId: p.id,
          date: new Date(p.created_at).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          name: p.cliente_nombre,
          email: p.cliente_email,
          address: [p.envio_calle, p.envio_colonia, p.envio_ciudad]
            .filter(Boolean)
            .join(", "),
          items: Array.isArray(p.items) ? p.items : [],
          subtotal: parseFloat(p.subtotal),
          shipping: parseFloat(p.costo_envio),
          total: parseFloat(p.total),
          payment: p.metodo_pago,
          status: p.estado,
          isOxxo: p.metodo_pago === "OXXO Pay",
          oxxoRef: p.oxxo_referencia,
        }))
      : [];
    saveOrders();
  } catch (e) {
    console.warn("Pedidos no disponibles desde Supabase:", e.message);
  }
}

async function loadProfile() {
  if (!currentUser) return;
  document.getElementById("profileName").textContent =
    currentUser.name || "Usuario";
  document.getElementById("profileEmail").textContent = currentUser.email || "";
  document.getElementById("profileAvatar").textContent = (currentUser.name ||
    "U")[0].toUpperCase();
  
  const navAdmin = document.getElementById("nav-admin");
  const navAdminConfig = document.getElementById("nav-admin-config");
  const navAdminOrders = document.getElementById("nav-admin-orders");
  if (navAdmin) {
    navAdmin.style.display = isAdmin() ? "flex" : "none";
  }
  if (navAdminConfig) {
    navAdminConfig.style.display = isAdmin() ? "flex" : "none";
  }
  if (navAdminOrders) {
    navAdminOrders.style.display = isAdmin() ? "flex" : "none";
  }
  
  if (isAdmin()) {
    const cfCosto = document.getElementById("configEnvioCosto");
    const cfGratis = document.getElementById("configEnvioGratis");
    const cfMsg = document.getElementById("configEnvioMensaje");
    if(cfCosto) cfCosto.value = storeConfig.envio_costo;
    if(cfGratis) cfGratis.value = storeConfig.envio_gratis_min;
    if(cfMsg) cfMsg.value = storeConfig.envio_mensaje;
    
    loadAdminOrders();
  }

  const sName = document.getElementById("settingName");
  const sLast = document.getElementById("settingLast");
  const sEmail = document.getElementById("settingEmail");
  const sPhone = document.getElementById("settingPhone");

  if (sName) sName.value = currentUser.name || "";
  if (sLast) sLast.value = currentUser.apellido || "";
  if (sEmail) sEmail.value = currentUser.email || "";
  if (sPhone) sPhone.value = currentUser.telefono || "";

  if (authToken) {
    try {
      const perfiles = await sb.authGet("perfiles", `?id=eq.${currentUser.supabaseId}`, authToken);
      if (perfiles && perfiles.length) {
        const profile = perfiles[0];
        if (sName) sName.value = profile.nombre || "";
        if (sLast) sLast.value = profile.apellido || "";
        if (sEmail) sEmail.value = profile.email || "";
        if (sPhone) sPhone.value = profile.telefono || "";
        
        currentUser.name = profile.nombre || currentUser.name;
        currentUser.apellido = profile.apellido || "";
        currentUser.telefono = profile.telefono || "";
        currentUser.email = profile.email || currentUser.email;
        localStorage.setItem("ouat_user", JSON.stringify(currentUser));
        
        document.getElementById("profileName").textContent = currentUser.name + (profile.apellido ? " " + profile.apellido : "");
        document.getElementById("profileAvatar").textContent = (currentUser.name || "U")[0].toUpperCase();
      }
    } catch (e) {
      console.warn("No se pudo obtener el perfil de Supabase:", e.message);
    }
  }

  await loadUserOrders();
  renderOrdersList();
  renderTicketsList();
}

async function saveUserProfile() {
  if (!currentUser || !authToken) {
    showToast("⚠️", "Debes iniciar sesión");
    return;
  }
  const sName = document.getElementById("settingName")?.value.trim();
  const sLast = document.getElementById("settingLast")?.value.trim() || "";
  const sEmail = document.getElementById("settingEmail")?.value.trim();
  const sPhone = document.getElementById("settingPhone")?.value.trim() || "";
  const sPass = document.querySelector("#panel-settings input[type=password]")?.value;

  if (!sName || !sEmail) {
    showToast("⚠️", "Nombre y correo son requeridos");
    return;
  }

  try {
    showToast("⏳", "Guardando cambios...");
    
    // 1. Update the 'perfiles' table
    await sb.authPatch("perfiles", `?id=eq.${currentUser.supabaseId}`, {
      nombre: sName,
      apellido: sLast,
      email: sEmail,
      telefono: sPhone,
      updated_at: new Date().toISOString()
    }, authToken);

    // 2. Update auth user metadata/password if password is provided
    if (sPass && sPass.trim().length > 0) {
      if (sPass.length < 8) {
        showToast("⚠️", "La nueva contraseña debe tener al menos 8 caracteres");
        return;
      }
      const authUpdateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password: sPass })
      });
      if (!authUpdateRes.ok) {
        throw new Error("No se pudo actualizar la contraseña: " + await authUpdateRes.text());
      }
    }

    // Update local state
    currentUser.name = sName;
    currentUser.apellido = sLast;
    currentUser.email = sEmail;
    currentUser.telefono = sPhone;
    setUser(currentUser);

    // Reload UI
    loadProfile();
    showToast("✅", "Perfil actualizado correctamente");
  } catch (e) {
    console.error("Error al guardar perfil:", e);
    showToast("⚠️", "Error al guardar el perfil: " + e.message);
  }
}

function statusLabel(s) {
  return (
    {
      processing: "En proceso",
      pendiente_pago: "Pendiente de pago",
      shipped: "Enviado",
      delivered: "Entregado",
      cancelled: "Cancelado",
    }[s] || s
  );
}

function renderOrdersList() {
  const container = document.getElementById("ordersList");
  if (!container) return;
  if (!userOrders.length) {
    container.innerHTML =
      '<p style="color:var(--texto-suave);font-size:0.88rem">No tienes pedidos aún.</p>';
    return;
  }
  container.innerHTML = userOrders
    .map(
      (o) => `
    <div class="order-card" onclick="viewOrderDetail('${o.id}')">
      <div class="order-card-header">
        <div>
          <div class="order-num">#${o.id}</div>
          <div class="order-date">${o.date}</div>
        </div>
        <span class="order-status status-${o.status}">${statusLabel(
        o.status
      )}</span>
      </div>
      <div class="order-items-preview">
        ${(o.items || []).map((i) => i.nombre || i.name).join(" · ") || "—"}
      </div>
      <div class="order-footer">
        <span class="order-total">$${o.total.toFixed(2)} MXN</span>
        <div class="order-actions">
          <button class="btn-ghost" onclick="event.stopPropagation();viewTicket('${
            o.id
          }')">🧾 Ticket</button>
          <button class="btn-primary" style="padding:0.4rem 0.9rem;font-size:0.78rem"
            onclick="event.stopPropagation();viewOrderDetail('${
              o.id
            }')">Ver detalle →</button>
        </div>
      </div>
    </div>`
    )
    .join("");
}

function renderTicketsList() {
  const container = document.getElementById("ticketsList");
  if (!container) return;
  if (!userOrders.length) {
    container.innerHTML =
      '<p style="color:var(--texto-suave);font-size:0.88rem">No hay tickets disponibles.</p>';
    return;
  }
  container.innerHTML = userOrders
    .map(
      (o) => `
    <div class="order-card">
      <div class="order-card-header">
        <div>
          <div class="order-num">🧾 Ticket #${o.id}</div>
          <div class="order-date">${o.date} · ${o.payment}</div>
        </div>
        <span class="order-status status-${o.status}">${statusLabel(
        o.status
      )}</span>
      </div>
      <div class="order-items-preview">
        ${(o.items || []).length} producto${
        (o.items || []).length !== 1 ? "s" : ""
      }
        · Total: $${o.total.toFixed(2)} MXN
        ${
          o.isOxxo
            ? ' · <strong style="color:#ea580c">Pago OXXO pendiente</strong>'
            : ""
        }
      </div>
      <div class="order-footer">
        <span></span>
        <div class="order-actions">
          <button class="btn-ghost" onclick="resendFromList('${
            o.id
          }')">📧 Reenviar</button>
          <button class="btn-primary" style="padding:0.4rem 0.9rem;font-size:0.78rem" onclick="viewTicket('${
            o.id
          }')">👁 Ver ticket</button>
          <button class="btn-primary" style="padding:0.4rem 0.9rem;font-size:0.78rem;background:var(--lila-600)" onclick="downloadFromList('${
            o.id
          }')">⬇ PDF</button>
        </div>
      </div>
    </div>`
    )
    .join("");
}

function viewOrderDetail(id) {
  const order = userOrders.find((o) => o.id === id);
  if (!order) return;
  currentTicket = order;
  openTicketModal(order);

  const tm = document.querySelector(".ticket-modal");
  const oldT = document.getElementById("ticketTracking");
  if (oldT) oldT.remove();
  const stDone = (s) => ["processing", "shipped", "delivered"].includes(s);
  const stShipped = (s) => ["shipped", "delivered"].includes(s);
  const stDel = (s) => s === "delivered";
  const trackDiv = document.createElement("div");
  trackDiv.id = "ticketTracking";
  trackDiv.innerHTML = `
    <div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px dashed var(--lila-200)">
      <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;
        color:var(--texto-suave);font-weight:700;margin-bottom:1rem">Seguimiento del envío</div>
      <div class="tracking-steps">
        <div class="tracking-step done">
          <div class="tracking-dot">✓</div>
          <div class="tracking-info"><div class="tracking-label">Pedido confirmado</div><div class="tracking-date">${
            order.date
          }</div></div>
        </div>
        <div class="tracking-step ${
          order.isOxxo ? "" : stDone(order.status) ? "current" : ""
        }">
          <div class="tracking-dot">${order.isOxxo ? "○" : "●"}</div>
          <div class="tracking-info">
            <div class="tracking-label">${
              order.isOxxo ? "Esperando pago OXXO" : "En preparación"
            }</div>
            <div class="tracking-date">${
              order.isOxxo ? "Pendiente" : "En proceso..."
            }</div>
          </div>
        </div>
        <div class="tracking-step ${stShipped(order.status) ? "done" : ""}">
          <div class="tracking-dot">${stShipped(order.status) ? "✓" : "○"}</div>
          <div class="tracking-info"><div class="tracking-label">Enviado con paquetería</div><div class="tracking-date">${
            stShipped(order.status) ? "—" : "Pendiente"
          }</div></div>
        </div>
        <div class="tracking-step ${stDel(order.status) ? "done" : ""}">
          <div class="tracking-dot">${stDel(order.status) ? "✓" : "○"}</div>
          <div class="tracking-info"><div class="tracking-label">Entregado</div><div class="tracking-date">${
            stDel(order.status) ? "—" : "Pendiente"
          }</div></div>
        </div>
      </div>
    </div>`;
  tm.appendChild(trackDiv);
}

function viewTicket(id) {
  const order = userOrders.find((o) => o.id === id);
  if (order) {
    currentTicket = order;
    openTicketModal(order);
  }
}
function downloadFromList(id) {
  const order = userOrders.find((o) => o.id === id);
  if (order) {
    currentTicket = order;
    downloadTicketPDF();
  }
}
function resendFromList(id) {
  const order = userOrders.find((o) => o.id === id);
  if (order) simulateSendEmail(order);
}

function switchProfileTab(tab, el) {
  document
    .querySelectorAll(".profile-nav-item")
    .forEach((n) => n.classList.remove("active"));
  if (el) el.classList.add("active");
  document
    .querySelectorAll(".profile-panel")
    .forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById("panel-" + tab);
  if (panel) panel.classList.add("active");

  if (tab === "admin") {
    loadAdminCatalog();
    loadAdminOrders();
  }
}

/* =====================================================
   ADMIN: PEDIDOS
   ===================================================== */
async function loadAdminOrders() {
  const container = document.getElementById("adminOrdersList");
  if (!container) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?order=created_at.desc`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${authToken}`
      }
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    
    container.innerHTML = data.length === 0 
      ? '<tr><td colspan="7" style="text-align:center;color:#666;padding:2rem;">No hay pedidos.</td></tr>' 
      : "";
      
    data.forEach(order => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <div style="font-weight:600">${new Date(order.created_at).toLocaleDateString()}</div>
          <div style="font-size:0.75rem; color:var(--texto-suave)">${order.numero}</div>
        </td>
        <td>
          <div style="font-weight:600">${order.cliente_nombre}</div>
          <div style="font-size:0.75rem; color:var(--texto-suave)">${order.cliente_email}</div>
        </td>
        <td>$${Number(order.total || 0).toFixed(2)}</td>
        <td>
          <select id="estado-${order.id}" style="padding:0.3rem; border-radius:6px; font-size: 0.8rem; border: 1px solid var(--lila-200);">
            <option value="pendiente_pago" ${order.estado === 'pendiente_pago' ? 'selected' : ''}>Pendiente Pago</option>
            <option value="processing" ${order.estado === 'processing' ? 'selected' : ''}>Procesando</option>
            <option value="shipped" ${order.estado === 'shipped' ? 'selected' : ''}>Enviado</option>
            <option value="delivered" ${order.estado === 'delivered' ? 'selected' : ''}>Entregado</option>
            <option value="cancelled" ${order.estado === 'cancelled' ? 'selected' : ''}>Cancelado</option>
          </select>
        </td>
        <td>
          <input type="text" id="paq-${order.id}" value="${order.paqueteria || ''}" placeholder="Ej. DHL" style="width:100px; padding:0.3rem; border-radius:6px; border:1px solid var(--lila-200); font-size:0.8rem;" />
        </td>
        <td>
          <input type="text" id="guia-${order.id}" value="${order.guia_numero || ''}" placeholder="Núm. Guía" style="width:120px; padding:0.3rem; border-radius:6px; border:1px solid var(--lila-200); font-size:0.8rem;" />
        </td>
        <td>
          <button class="btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; border-radius: 6px;" onclick="updateAdminOrder('${order.id}')">Guardar</button>
        </td>
      `;
      container.appendChild(row);
    });
  } catch(err) {
    console.error(err);
    container.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;padding:2rem;">Error cargando pedidos.</td></tr>';
  }
}

async function updateAdminOrder(id) {
  const estado = document.getElementById(`estado-${id}`).value;
  const paqueteria = document.getElementById(`paq-${id}`).value;
  const guia_numero = document.getElementById(`guia-${id}`).value;
  try {
    showToast("⏳", "Actualizando pedido...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${authToken}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ estado, paqueteria, guia_numero })
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("✅", "Pedido actualizado correctamente");
  } catch(err) {
    console.error(err);
    showToast("❌", "Error al actualizar");
  }
}

/* =====================================================
   ADMINISTRACIÓN DE CATÁLOGO & PRODUCTOS (CRUD)
   ===================================================== */
async function loadAdminCatalog() {
  const container = document.getElementById("adminProductsList");
  if (!container) return;

  container.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--texto-suave);padding:2rem;">Cargando catálogo...</td></tr>`;

  try {
    const products = await sb.authGet("productos", "?order=created_at.desc", authToken);
    
    if (!products || !products.length) {
      container.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--texto-suave);padding:2rem;">No hay productos en la tienda.</td></tr>`;
      return;
    }

    container.innerHTML = products.map((p) => {
      const img = p.imagen_url ? 
        (p.imagen_url.startsWith("http") ? p.imagen_url : `img/${p.imagen_url}`) : 
        "img/cover_placeholder.png";

      return `
        <tr>
          <td>
            <div style="font-weight:700;color:var(--morado-800);font-size:0.92rem;">${p.nombre}</div>
            <div style="font-size:0.75rem;color:var(--texto-suave)">ID: ${p.id}</div>
          </td>
          <td>${p.artista}</td>
          <td style="text-transform:capitalize;">${p.genero_slug || p.genero || "Sin género"}</td>
          <td><strong>$${parseFloat(p.precio).toFixed(2)} MXN</strong></td>
          <td>${p.stock}</td>
          <td>
            <span class="status-badge ${p.activo ? "active" : "inactive"}">
              ${p.activo ? "● Activo" : "● Inactivo"}
            </span>
          </td>
          <td>
            <div class="admin-actions-cell">
              <button class="btn-action" onclick="openAdminProductForm('${p.id}')" title="Editar producto">✏️</button>
              <button class="btn-action btn-delete" onclick="toggleProductStatus('${p.id}', ${p.activo})" title="${p.activo ? "Desactivar" : "Activar"}">
                ${p.activo ? "🗑️" : "✅"}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    console.error("Error cargando catálogo admin:", e);
    container.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--error);padding:2rem;">Error al cargar el catálogo: ${e.message}</td></tr>`;
  }
}

async function toggleProductStatus(productId, currentlyActive) {
  const action = currentlyActive ? "desactivar" : "activar";
  if (!confirm(`¿Estás seguro de que deseas ${action} este producto?`)) {
    return;
  }
  try {
    await sb.authPatch("productos", `?id=eq.${productId}`, { activo: !currentlyActive }, authToken);
    showToast("✅", `Producto ${currentlyActive ? 'desactivado' : 'activado'} con éxito`);
    loadAdminCatalog();
  } catch (e) {
    console.error("Error al cambiar estado del producto:", e);
    showToast("⚠️", `Error: ${e.message}`);
  }
}

async function openAdminProductForm(productId = null) {
  const modal = document.getElementById("adminProductModal");
  if (!modal) return;

  const form = document.getElementById("productForm");
  if (form) form.reset();

  const container = document.getElementById("formTracksContainer");
  if (container) container.innerHTML = "";

  document.getElementById("formProductId").value = productId || "";
  
  if (productId) {
    document.getElementById("adminFormTitle").textContent = "Editar Producto";
    document.getElementById("adminFormSub").textContent = "Modifica los detalles del vinilo y su tracklist";
    document.getElementById("btnSaveProduct").textContent = "Guardar Cambios";

    try {
      showToast("⏳", "Cargando datos del producto...");
      const res = await sb.authGet("productos", `?id=eq.${productId}`, authToken);
      if (!res || !res.length) {
        showToast("⚠️", "No se encontró el producto");
        return;
      }
      const p = res[0];
      
      document.getElementById("prodName").value = p.nombre || "";
      document.getElementById("prodArtist").value = p.artista || "";
      document.getElementById("prodGenre").value = p.genero_slug || "otros";
      document.getElementById("prodPrice").value = p.precio || "";
      document.getElementById("prodStock").value = p.stock || 0;
      document.getElementById("prodYear").value = p.anio || "";
      document.getElementById("prodFormat").value = p.formato || "LP";
      document.getElementById("prodRPM").value = p.rpm || "33 RPM";
      document.getElementById("prodMaterial").value = p.material || "Vinilo negro 180g";
      document.getElementById("prodEstado").value = p.estado || "Nuevo";
      document.getElementById("prodBadge").value = p.badge || "";
      document.getElementById("prodImage").value = p.imagen_url || "";
      document.getElementById("prodIncludes").value = p.incluye || "";
      document.getElementById("prodDesc").value = p.descripcion || "";
      document.getElementById("prodIsNew").checked = !!p.es_novedad;
      document.getElementById("prodActive").checked = !!p.activo;

      // Cargar canciones
      const tracks = await sb.authGet("tracks", `?producto_id=eq.${productId}&order=lado.asc,numero.asc`, authToken);
      if (tracks && tracks.length) {
        tracks.forEach((t) => {
          addTrackRowForm(t.lado, t.numero, t.nombre, t.duracion);
        });
      } else {
        addTrackRowForm();
      }
    } catch (e) {
      console.error("Error al cargar producto:", e);
      showToast("⚠️", `Error: ${e.message}`);
    }
  } else {
    document.getElementById("adminFormTitle").textContent = "Agregar Nuevo Producto";
    document.getElementById("adminFormSub").textContent = "Llena los detalles del vinilo para publicarlo en la tienda";
    document.getElementById("btnSaveProduct").textContent = "Guardar Producto";
    document.getElementById("prodIsNew").checked = false;
    document.getElementById("prodActive").checked = true;
    
    addTrackRowForm();
  }

  modal.classList.add("open");
}

function closeAdminProductForm() {
  const modal = document.getElementById("adminProductModal");
  if (modal) modal.classList.remove("open");
}

function addTrackRowForm(lado = "A", numero = "", nombre = "", duracion = "") {
  const container = document.getElementById("formTracksContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "track-row-form";
  row.style.display = "grid";
  row.style.gridTemplateColumns = "80px 70px 1fr 100px 50px";
  row.style.gap = "0.5rem";
  row.style.alignItems = "center";
  row.style.marginBottom = "0.5rem";

  row.innerHTML = `
    <select class="track-lado" required style="padding:0.45rem 0.65rem !important;border-radius:8px !important;font-size:0.85rem !important;height:34px !important;margin:0 !important;">
      <option value="A" ${lado === "A" ? "selected" : ""}>A</option>
      <option value="B" ${lado === "B" ? "selected" : ""}>B</option>
      <option value="C" ${lado === "C" ? "selected" : ""}>C</option>
      <option value="D" ${lado === "D" ? "selected" : ""}>D</option>
    </select>
    <input type="number" class="track-numero" required placeholder="Nº" value="${numero || (container.children.length + 1)}" style="padding:0.45rem 0.65rem !important;border-radius:8px !important;font-size:0.85rem !important;height:34px !important;margin:0 !important;" />
    <input type="text" class="track-nombre" required placeholder="Nombre de la pista" value="${nombre}" style="padding:0.45rem 0.65rem !important;border-radius:8px !important;font-size:0.85rem !important;height:34px !important;margin:0 !important;" />
    <input type="text" class="track-duracion" placeholder="Min:Seg" value="${duracion}" style="padding:0.45rem 0.65rem !important;border-radius:8px !important;font-size:0.85rem !important;height:34px !important;margin:0 !important;" />
    <button type="button" class="btn-action btn-delete" onclick="removeTrackRowForm(this)" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.85rem;">✕</button>
  `;
  container.appendChild(row);
}

function removeTrackRowForm(btn) {
  const row = btn.closest(".track-row-form");
  if (row) row.remove();
}

async function saveAdminProduct() {
  const productId = document.getElementById("formProductId").value;
  const isEdit = !!productId;

  const productData = {
    nombre: document.getElementById("prodName").value.trim(),
    artista: document.getElementById("prodArtist").value.trim(),
    genero_slug: document.getElementById("prodGenre").value,
    precio: parseFloat(document.getElementById("prodPrice").value),
    stock: parseInt(document.getElementById("prodStock").value),
    anio: document.getElementById("prodYear").value ? parseInt(document.getElementById("prodYear").value) : null,
    formato: document.getElementById("prodFormat").value.trim() || "LP",
    rpm: document.getElementById("prodRPM").value.trim() || "33 RPM",
    material: document.getElementById("prodMaterial").value.trim() || "Vinilo negro 180g",
    estado: document.getElementById("prodEstado").value.trim() || "Nuevo",
    badge: document.getElementById("prodBadge").value.trim() || null,
    imagen_url: document.getElementById("prodImage").value.trim() || null,
    incluye: document.getElementById("prodIncludes").value.trim() || null,
    descripcion: document.getElementById("prodDesc").value.trim() || null,
    es_novedad: document.getElementById("prodIsNew").checked,
    activo: document.getElementById("prodActive").checked
  };

  const btn = document.getElementById("btnSaveProduct");
  const origText = btn.textContent;
  btn.textContent = "Guardando...";
  btn.disabled = true;

  try {
    let pid = productId;
    if (isEdit) {
      await sb.authPatch("productos", `?id=eq.${productId}`, productData, authToken);
      showToast("✅", "Producto actualizado con éxito");
    } else {
      const res = await sb.authPost("productos", productData, authToken);
      if (!res || !res.length) {
        throw new Error("No se pudo crear el producto");
      }
      pid = res[0].id;
      showToast("✅", "Producto creado con éxito");
    }

    const trackRows = document.querySelectorAll("#formTracksContainer .track-row-form");
    const tracksData = [];
    trackRows.forEach((row) => {
      const lado = row.querySelector(".track-lado").value;
      const numero = parseInt(row.querySelector(".track-numero").value);
      const nombre = row.querySelector(".track-nombre").value.trim();
      const duracion = row.querySelector(".track-duracion").value.trim();
      
      if (nombre) {
        tracksData.push({
          producto_id: pid,
          lado,
          numero,
          nombre,
          duracion: duracion || null
        });
      }
    });

    if (isEdit) {
      await sb.authDelete("tracks", `?producto_id=eq.${pid}`, authToken);
    }

    if (tracksData.length) {
      await sb.authPost("tracks", tracksData, authToken);
    }

    closeAdminProductForm();
    loadAdminCatalog();
  } catch (e) {
    console.error("Error al guardar producto:", e);
    showToast("⚠️", `Error al guardar: ${e.message}`);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

/* =====================================================
   AUTENTICACIÓN
   ===================================================== */

function openAuth(mode) {
  document.getElementById("authModal").classList.add("open");
  switchAuthMode(mode);
}

function closeAuth() {
  document.getElementById("authModal").classList.remove("open");
}

function switchAuthMode(mode) {
  const isLogin = mode === "login";

  document.getElementById("authTitle").textContent = isLogin
    ? "Bienvenida"
    : "Crear cuenta";

  document.getElementById("authSub").textContent = isLogin
    ? "Inicia sesión para acceder"
    : "Únete a Once Upon a Time";

  document.getElementById("loginForm").style.display = isLogin
    ? "block"
    : "none";

  document.getElementById("registerForm").style.display = isLogin
    ? "none"
    : "block";
}

/* =====================================================
   LOGIN GOOGLE
   ===================================================== */

async function loginWithGoogle() {
  await sb.signInGoogle();
}

/* =====================================================
   LOGIN EMAIL
   ===================================================== */

async function loginWithEmail() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;

  if (!email || !pass) {
    showToast("⚠️", "Completa todos los campos");
    return;
  }

  const btn = document.querySelector("#loginForm .btn-primary");

  if (btn) {
    btn.textContent = "Entrando...";
    btn.disabled = true;
  }

  try {
    const data = await sb.signIn(email, pass);

    console.log("LOGIN DATA:", data);

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    // Limpiar pedidos del usuario anterior ANTES de establecer la nueva sesión.
    clearUserOrders();

    authToken = data?.session?.access_token || data?.access_token;

    localStorage.setItem("ouat_token", authToken);

    const nombre = data?.user?.user_metadata?.name || email.split("@")[0];

    let profileData = {};
    try {
      const perfiles = await sb.authGet("perfiles", `?id=eq.${data.user.id}`, authToken);
      if (perfiles && perfiles.length) {
        profileData = perfiles[0];
      }
    } catch (err) {
      console.warn("Error al cargar perfil durante login:", err);
    }

    setUser({
      name: profileData.nombre || nombre,
      apellido: profileData.apellido || "",
      telefono: profileData.telefono || "",
      email: data.user.email,
      supabaseId: data.user.id,
    });

    closeAuth();

    showToast("👋", `¡Bienvenida de nuevo, ${nombre}!`);
  } catch (e) {
    console.error("LOGIN ERROR:", e);

    showToast("⚠️", e.message || "Correo o contraseña incorrectos");
  } finally {
    if (btn) {
      btn.textContent = "Iniciar sesión";
      btn.disabled = false;
    }
  }
}

/* =====================================================
   REGISTER
   ===================================================== */

async function registerUser() {
  const name = document.getElementById("regName").value.trim();
  const last = document.getElementById("regLast")?.value.trim() || "";
  const email = document.getElementById("regEmail").value.trim();
  const pass = document.getElementById("regPass").value;

  // VALIDACIONES
  if (!name || !email || !pass) {
    showToast("⚠️", "Completa todos los campos");
    return;
  }

  if (pass.length < 8) {
    showToast("⚠️", "La contraseña debe tener al menos 8 caracteres");
    return;
  }

  // BOTÓN
  const btn = document.querySelector("#registerForm .btn-primary");

  if (btn) {
    btn.textContent = "Creando cuenta...";
    btn.disabled = true;
  }

  try {
    console.log("REGISTRANDO USUARIO...");

    const data = await sb.signUp(email, pass, {
      name: name,
      nombre: name,
      apellido: last,
      nombre_completo: `${name} ${last}`.trim(),
    });

    console.log("DATA REGISTER:", data);

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    // LOGIN AUTOMÁTICO INSTANTÁNEO
    let sessionData = data;
    if (!sessionData?.session && !sessionData?.access_token && sessionData?.user) {
      // El trigger en BD ya confirmó la cuenta, así que iniciamos sesión al instante de forma transparente
      try {
        sessionData = await sb.signIn(email, pass);
      } catch (signInErr) {
        console.warn("Auto-signin fallido tras el registro:", signInErr);
      }
    }

    if (sessionData?.session || sessionData?.access_token) {
      // Limpiar pedidos de cualquier sesión anterior ANTES de establecer la nueva.
      clearUserOrders();

      authToken = sessionData?.session?.access_token || sessionData?.access_token;

      localStorage.setItem("ouat_token", authToken);

      setUser({
        name: name,
        apellido: last,
        telefono: "",
        email: sessionData.user.email,
        supabaseId: sessionData.user.id,
      });

      closeAuth();

      showToast("🎉", `¡Cuenta creada con éxito! Bienvenida, ${name}`);
    } else {
      closeAuth();
      showToast("📧", "Cuenta creada. Por favor inicia sesión con tu contraseña.");
    }
  } catch (e) {
    console.error("REGISTER ERROR:", e);

    let msg = e.message || "Error al crear cuenta";

    if (msg.toLowerCase().includes("already")) {
      msg = "Este correo ya está registrado";
    }

    if (msg.toLowerCase().includes("password")) {
      msg = "La contraseña no es válida";
    }

    if (msg.toLowerCase().includes("email")) {
      msg = "Correo electrónico no válido";
    }

    showToast("⚠️", msg);
  } finally {
    if (btn) {
      btn.textContent = "Crear cuenta";
      btn.disabled = false;
    }
  }
}

/* =====================================================
   SET USER
   ===================================================== */

function setUser(user) {
  currentUser = user;

  localStorage.setItem("ouat_user", JSON.stringify(user));

  renderNavAuth();
}

/* =====================================================
   LOGOUT
   ===================================================== */

async function logout() {
  if (authToken) {
    try {
      await sb.signOut(authToken);
    } catch (e) {
      console.error(e);
    }
  }

  authToken = null;
  currentUser = null;
  clearUserOrders(); // limpia pedidos en memoria y localStorage

  localStorage.removeItem("ouat_token");
  localStorage.removeItem("ouat_user");

  renderNavAuth();

  showPage("home");

  showToast("👋", "Sesión cerrada");
}

/* =====================================================
   NAV AUTH
   ===================================================== */

function renderNavAuth() {
  const area = document.getElementById("navAuthArea");

  if (!area) return;

  area.innerHTML = currentUser
    ? `
      <button
        class="user-avatar"
        onclick="showPage('perfil')"
        title="${currentUser.email}"
      >
        ${(currentUser.name || "U")[0].toUpperCase()}
      </button>
    `
    : `
      <button
        class="auth-btn"
        onclick="openAuth('login')"
      >
        Iniciar sesión
      </button>
    `;
}

/* =====================================================
   VERIFICAR SESIÓN AL CARGAR
   ===================================================== */
async function checkAuthSession() {
  const hash = window.location.hash;
  if (hash.includes("access_token")) {
    const params = new URLSearchParams(hash.replace("#", ""));
    const token = params.get("access_token");
    if (token) {
      // Nuevo inicio de sesión via URL hash (ej. OAuth). Limpiar pedidos previos.
      clearUserOrders();
      authToken = token;
      localStorage.setItem("ouat_token", token);
      window.history.replaceState({}, "", window.location.pathname);
      try {
        const u = await sb.getUser(token);
        let profileData = {};
        try {
          const perfiles = await sb.authGet("perfiles", `?id=eq.${u.id}`, token);
          if (perfiles && perfiles.length) {
            profileData = perfiles[0];
          }
        } catch (profileErr) {
          console.warn("No se pudo obtener el perfil de Supabase en hash token:", profileErr);
        }
        setUser({
          name: profileData.nombre || u.user_metadata?.name || u.email.split("@")[0],
          apellido: profileData.apellido || "",
          telefono: profileData.telefono || "",
          email: u.email,
          supabaseId: u.id,
        });
        showToast("👋", `¡Bienvenida, ${currentUser.name}!`);
      } catch (e) {}
    }
    return;
  }
  if (authToken) {
    // Siempre limpiar orders al iniciar/restaurar sesión.
    // loadProfile() los recargará desde Supabase filtrados por RLS para el usuario correcto.
    clearUserOrders();
    try {
      const u = await sb.getUser(authToken);
      const saved = JSON.parse(localStorage.getItem("ouat_user") || "null");

      let profileData = {};
      try {
        const perfiles = await sb.authGet("perfiles", `?id=eq.${u.id}`, authToken);
        if (perfiles && perfiles.length) {
          profileData = perfiles[0];
        }
      } catch (profileErr) {
        console.warn("No se pudo obtener el perfil de Supabase en session check:", profileErr);
      }
      setUser({
        name: profileData.nombre || saved?.name || u.user_metadata?.name || u.email.split("@")[0],
        apellido: profileData.apellido || saved?.apellido || "",
        telefono: profileData.telefono || saved?.telefono || "",
        email: u.email,
        supabaseId: u.id,
      });
    } catch (e) {
      // Token inválido: limpiar todo para no dejar datos de la sesión anterior.
      clearUserOrders();
      authToken = null;
      currentUser = null;
      localStorage.removeItem("ouat_token");
      localStorage.removeItem("ouat_user");
    }
  }
}

/* =====================================================
   POLÍTICAS — Tabs
   ===================================================== */
function switchPolicyTab(tab) {
  const tabs = [
    "devoluciones",
    "privacidad",
    "terminos",
  ];
  document
    .querySelectorAll(".policy-tabs-bar .policy-tab")
    .forEach((t, i) => t.classList.toggle("active", tabs[i] === tab));
  document
    .querySelectorAll(".policy-section")
    .forEach((s) => s.classList.remove("active"));
  const el = document.getElementById("pol-" + tab);
  if (el) el.classList.add("active");
}
function showPolicyTab(tab) {
  localStorage.setItem("ouat_target_policy_tab", tab);
  showPage("politicas");
}

/* =====================================================
   FILTROS — Tienda
   FIX: Mismo fix de query string para filtros.
   ===================================================== */
async function filterGenre(genre) {
  if (!document.getElementById("page-tienda")) {
    localStorage.setItem("ouat_target_genre", genre);
    showPage("tienda");
    return;
  }
  const checkbox = document.querySelector(`.filter-options input[value="${genre}"]`);
  if (checkbox) {
    document.querySelectorAll(".filter-options input[type=checkbox]").forEach((cb) => cb.checked = false);
    checkbox.checked = true;
  }
  const grid = document.getElementById("shopGrid");
  const count = document.getElementById("resultsCount");
  if (grid)
    grid.innerHTML =
      '<p style="color:var(--texto-suave);padding:1rem">Filtrando...</p>';
  try {
    const data = await sb.get(
      "productos_con_rating",
      `?activo=eq.true&genero_slug=eq.${genre}&order=created_at.desc`
    );
    const adapted = data.map(adaptProduct);
    adapted.forEach((p) => {
      if (!productsCache.find((c) => c.id === p.id)) productsCache.push(p);
    });
    const sortSelect = document.querySelector(".sort-select");
    const sortVal = sortSelect ? sortSelect.value : "recent";
    const sortFn = (a, b) => {
      const nameA = a.name || "";
      const nameB = b.name || "";
      if (sortVal === "price_asc") return a.price - b.price;
      if (sortVal === "price_desc") return b.price - a.price;
      if (sortVal === "alpha_asc") return nameA.localeCompare(nameB);
      if (sortVal === "alpha_desc") return nameB.localeCompare(nameA);
      return 0;
    };
    const sortedAdapted = [...adapted].sort(sortFn);

    if (count)
      count.textContent = `${sortedAdapted.length} producto${
        sortedAdapted.length !== 1 ? "s" : ""
      }`;
    if (grid)
      grid.innerHTML = sortedAdapted.length
        ? sortedAdapted.map(productCardHTML).join("")
        : '<p style="color:var(--texto-suave)">Sin productos en este género.</p>';
  } catch (e) {
    const fb = sampleProducts.filter((p) => p.genre === genre);
    loadShopProducts(fb.length ? fb : sampleProducts);
  }
}

async function applyFilters() {
  const checked = [
    ...document.querySelectorAll(
      ".filter-options input[type=checkbox]:checked"
    ),
  ].map((c) => c.value);
  const generos = checked.filter((v) =>
    [
      "rock",
      "pop",
      "jazz",
      "clasico",
      "alternativo",
      "electronica",
      "latin",
    ].includes(v)
  );
  const precios = checked.filter((v) => ["low", "mid", "high"].includes(v));

  let params = "?activo=eq.true";
  if (generos.length === 1) params += `&genero_slug=eq.${generos[0]}`;

  const grid = document.getElementById("shopGrid");
  const count = document.getElementById("resultsCount");
  if (grid)
    grid.innerHTML =
      '<p style="color:var(--texto-suave);padding:1rem">Aplicando filtros...</p>';
  try {
    let data = await sb.get(
      "productos_con_rating",
      params + "&order=created_at.desc"
    );
    let adapted = data.map(adaptProduct);
    adapted.forEach((p) => {
      if (!productsCache.find((c) => c.id === p.id)) productsCache.push(p);
    });
    if (generos.length > 1)
      adapted = adapted.filter((p) => generos.includes(p.genre));
    if (precios.length)
      adapted = adapted.filter((p) => {
        if (precios.includes("low") && p.price < 400) return true;
        if (precios.includes("mid") && p.price >= 400 && p.price <= 800)
          return true;
        if (precios.includes("high") && p.price > 800) return true;
        return false;
      });
    const sortSelect = document.querySelector(".sort-select");
    const sortVal = sortSelect ? sortSelect.value : "recent";
    const sortFn = (a, b) => {
      const nameA = a.name || "";
      const nameB = b.name || "";
      if (sortVal === "price_asc") return a.price - b.price;
      if (sortVal === "price_desc") return b.price - a.price;
      if (sortVal === "alpha_asc") return nameA.localeCompare(nameB);
      if (sortVal === "alpha_desc") return nameB.localeCompare(nameA);
      return 0;
    };
    const sortedAdapted = [...adapted].sort(sortFn);

    if (count)
      count.textContent = `${sortedAdapted.length} producto${
        sortedAdapted.length !== 1 ? "s" : ""
      }`;
    if (grid)
      grid.innerHTML = sortedAdapted.length
        ? sortedAdapted.map(productCardHTML).join("")
        : '<p style="color:var(--texto-suave)">Sin resultados con estos filtros.</p>';
  } catch (e) {
    loadShopProducts();
  }
}

/* =====================================================
   TOAST
   ===================================================== */
function showToast(icon, msg) {
  document.getElementById("toastIcon").textContent = icon;
  document.getElementById("toastMsg").textContent = msg;
  const t = document.getElementById("toast");
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadStoreConfig();
  updateCartCount();
  await checkAuthSession();
  renderNavAuth();

  if (document.getElementById("page-home")) {
    loadHomeProducts();
  }
  if (document.getElementById("page-tienda")) {
    const targetGenre = localStorage.getItem("ouat_target_genre");
    if (targetGenre) {
      localStorage.removeItem("ouat_target_genre");
      filterGenre(targetGenre);
    } else {
      loadShopProducts();
    }
  }
  if (document.getElementById("page-product")) {
    const savedProductId = localStorage.getItem("ouat_current_product_id");
    if (savedProductId) {
      await openProduct(savedProductId);
    } else {
      window.location.href = "index.html";
    }
  }
  if (document.getElementById("page-politicas")) {
    const targetTab = localStorage.getItem("ouat_target_policy_tab") || "devoluciones";
    switchPolicyTab(targetTab);
    localStorage.removeItem("ouat_target_policy_tab");
  }
  if (document.getElementById("page-checkout")) {
    updateOrderSummary();
  }
  if (document.getElementById("page-perfil")) {
    if (!currentUser) {
      window.location.href = "index.html";
    } else {
      loadProfile();
    }
  }
  if (document.getElementById("page-envios")) {
    const txt = document.getElementById("shippingText");
    const cst = document.getElementById("shippingCostText");
    if(txt) txt.textContent = storeConfig.envio_mensaje;
    if(cst) cst.textContent = `El envío estándar a cualquier parte de México tiene un costo de $${storeConfig.envio_costo} MXN. ¡Y es gratis en compras mayores a $${storeConfig.envio_gratis_min} MXN!`;
  }

  setTimeout(
    () =>
      addCursorHover(
        "a,button,.product-card,.genero-card,.novedad-sm,.novedad-featured," +
          ".filter-option,.policy-tab,.pd-tab,.profile-nav-item,.order-card"
      ),
    300
  );
});
