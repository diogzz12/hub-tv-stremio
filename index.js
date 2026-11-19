const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const ADDONS_ORIGEM = [
  {
    nome: "Meu futebol",
    manifestUrl: "https://meufutebol.oneplayhd.com/manifest.json",
    categoriaPadrao: "Esportes"
  },
  {
    nome: "Brazuca Play",
    manifestUrl: "https://brazuca-play-stremio-y3wf.onrender.com/manifest.json",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "Tvvio",
    manifestUrl: "https://tvvio.megaembed-frost.workers.dev/manifest.json?v=2.3.1&probe=1",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "TvPlay",
    manifestUrl: "https://tvplay.megaembed-frost.workers.dev/manifest.json?v=2.0.3&probe=1",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "ZinTV BR",
    manifestUrl: "https://streambr.onrender.com/manifest.json",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "One Play",
    manifestUrl: "https://da5f663b4690-addonshub2.baby-beamup.club/aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3pvcmV1L29uZXBsYXlfc3RyZW1pby9tYWluL2FwcC5weQ/manifest.json",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "Veyra",
    manifestUrl: "https://veyra.shardweb.app/auto-canais~X6XlXVRgipAtbNpiRAaVpCou1_MSHxKI-tBzD-9w/manifest.json",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "Rede Canais Tv",
    manifestUrl: "https://redecanaistv-addon-stremio.onrender.com/manifest.json",
    categoriaPadrao: "Variedades"
  },
  {
    nome: "Estações de Rádios- Brasil",
    manifestUrl: "https://radiobr-nuvio.onrender.com/manifest.json",
    categoriaPadrao: "Rádios"
  }
];

const MAPA_CATEGORIAS = {
  "filme": "Filmes",
  "filmes": "Filmes",
  "movie": "Filmes",
  "movies": "Filmes",
  "cinema": "Filmes",
  "serie": "Séries",
  "séries": "Séries",
  "series": "Séries",
  "show": "Séries",
  "shows": "Séries",
  "novela": "Séries",
  "novelas": "Séries",
  "esporte": "Esportes",
  "esportes": "Esportes",
  "futebol": "Esportes",
  "sport": "Esportes",
  "sports": "Esportes",
  "ppv": "Esportes",
  "premiere": "Esportes",
  "noticia": "Notícias",
  "notícias": "Notícias",
  "noticias": "Notícias",
  "news": "Notícias",
  "jornalismo": "Notícias",
  "variedades": "Variedades",
  "entretenimento": "Variedades",
  "variety": "Variedades",
  "geral": "Variedades",
  "aberta": "Variedades",
  "canais abertos": "Canais Abertos",
  "tv": "Variedades",
  "canais": "Variedades",
  "infantil": "Infantil",
  "kids": "Infantil",
  "desenhos": "Infantil",
  "documentario": "Documentários",
  "documentários": "Documentários",
  "documentaries": "Documentários",
  "musica": "Música",
  "música": "Música",
  "radio": "Rádios",
  "rádios": "Rádios",
  "radios": "Rádios"
};

const indiceOrigem = new Map();
let cacheAgregado = { timestamp: 0, itens: [], categorias: [] };
const CACHE_TTL_MS = 3 * 60 * 1000;

function construirUrlRecurso(manifestUrl, caminhoRecurso, extraSegment = "") {
  const parsed = new URL(manifestUrl);
  const basePath = parsed.pathname.replace(/\/manifest\.json\/?$/i, "").replace(/\/+$/, "");
  const cleanRecurso = caminhoRecurso.replace(/^\/+/, "").replace(/\.json$/i, "");
  const sufixoExtra = extraSegment ? `/${extraSegment.replace(/^\/+/, "")}` : "";
  parsed.pathname = `${basePath}/${cleanRecurso}${sufixoExtra}.json`.replace(/\/{2,}/g, "/");
  return parsed.toString();
}

function normalizarCategoria(rawCat) {
  if (!rawCat || typeof rawCat !== "string") return null;
  const limpa = rawCat.trim();
  if (!limpa) return null;
  const chave = limpa.toLowerCase();
  if (MAPA_CATEGORIAS[chave]) return MAPA_CATEGORIAS[chave];
  return limpa.charAt(0).toUpperCase() + limpa.slice(1);
}

function extrairCategoriasItem(meta, cat, addon) {
  const encontradas = new Set();

  const candidatos = [
    ...(Array.isArray(meta.genres) ? meta.genres : []),
    ...(Array.isArray(meta.genre) ? meta.genre : []),
    ...(Array.isArray(cat.genres) ? cat.genres : []),
    meta.category,
    cat.name,
    meta.type === "movie" ? "Filmes" : null,
    meta.type === "series" ? "Séries" : null,
    addon.categoriaPadrao
  ];

  for (const c of candidatos) {
    const norm = normalizarCategoria(c);
    if (norm) encontradas.add(norm);
  }

  if (encontradas.size === 0) {
    encontradas.add(addon.categoriaPadrao || "Variedades");
  }

  return Array.from(encontradas);
}

async function fetchJsonSeguro(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Stremio/4.4"
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function buscarMetasCatalogo(addon, cat) {
  const catType = cat.type || "tv";
  const catId = encodeURIComponent(cat.id);

  const urlPadrao = construirUrlRecurso(addon.manifestUrl, `catalog/${catType}/${catId}`);
  let data = await fetchJsonSeguro(urlPadrao);

  if (!data || !Array.isArray(data.metas) || data.metas.length === 0) {
    const urlComSkip = construirUrlRecurso(addon.manifestUrl, `catalog/${catType}/${catId}`, "skip=0");
    const dataSkip = await fetchJsonSeguro(urlComSkip);
    if (dataSkip && Array.isArray(dataSkip.metas) && dataSkip.metas.length > 0) {
      data = dataSkip;
    }
  }

  const metas = data && Array.isArray(data.metas) ? data.metas : [];
  console.log(`[Hub] ${addon.nome} (${cat.id}): ${metas.length} itens`);
  return { catType, metas };
}

async function carregarTudo() {
  const agora = Date.now();
  if (cacheAgregado.itens.length > 0 && agora - cacheAgregado.timestamp < CACHE_TTL_MS) {
    return cacheAgregado;
  }

  const novosItens = [];
  const categoriasDetectadas = new Set();
  indiceOrigem.clear();

  for (const addon of ADDONS_ORIGEM) {
    const manifestOrigem = await fetchJsonSeguro(addon.manifestUrl, 15000);
    if (!manifestOrigem || !Array.isArray(manifestOrigem.catalogs)) {
      console.log(`[Hub] Sem manifest ou catálogos: ${addon.nome}`);
      continue;
    }

    for (const cat of manifestOrigem.catalogs) {
      const { catType, metas } = await buscarMetasCatalogo(addon, cat);

      for (const meta of metas) {
        if (!meta || !meta.id || !meta.name) continue;

        const categoriasItem = extrairCategoriasItem(meta, cat, addon);
        categoriasItem.forEach((c) => categoriasDetectadas.add(c));

        const compositeId = `agg:${encodeURIComponent(addon.nome)}:${encodeURIComponent(catType)}:${encodeURIComponent(meta.id)}`;

        indiceOrigem.set(compositeId, {
          manifestUrl: addon.manifestUrl,
          type: catType,
          originalId: meta.id
        });

        novosItens.push({
          id: compositeId,
          type: "tv",
          name: meta.name,
          poster: meta.poster,
          posterShape: meta.posterShape || "landscape",
          background: meta.background,
          logo: meta.logo,
          description: meta.description
            ? `${meta.description} • Fonte: ${addon.nome}`
            : `Fonte: ${addon.nome}`,
          genres: categoriasItem
        });
      }
    }
  }

  const ordenadas = Array.from(categoriasDetectadas).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  console.log(`[Hub] Total carregado: ${novosItens.length} itens | Categorias: ${ordenadas.join(", ")}`);

  cacheAgregado = {
    timestamp: agora,
    itens: novosItens,
    categorias: ["Todas", ...ordenadas]
  };

  return cacheAgregado;
}

const manifest = {
  id: "com.usuario.tv.hub.unificado.br",
  version: "1.0.3",
  name: "Hub TV Unificado BR",
  description: "Seus addons de TV reunidos em uma única lista com todas as categorias disponíveis.",
  resources: ["catalog", "stream"],
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "hub_tv_categorias",
      name: "TV Unificada",
      extra: [
        {
          name: "genre",
          options: [
            "Todas",
            "Filmes",
            "Séries",
            "Variedades",
            "Esportes",
            "Notícias",
            "Infantil",
            "Documentários",
            "Música",
            "Rádios",
            "Canais Abertos",
            "Entretenimento",
            "Cultura",
            "Religioso",
            "Outros"
          ],
          isRequired: false
        }
      ]
    }
  ]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, extra }) => {
  if (type !== "tv") return { metas: [] };

  const { itens } = await carregarTudo();
  const categoriaSelecionada = extra && extra.genre;

  if (!categoriaSelecionada || categoriaSelecionada === "Todas") {
    return { metas: itens };
  }

  const alvo = categoriaSelecionada.toLowerCase().trim();

  return {
    metas: itens.filter(
      (item) =>
        Array.isArray(item.genres) &&
        item.genres.some((g) => String(g).toLowerCase().trim() === alvo)
    )
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv") return { streams: [] };

  const origem = indiceOrigem.get(id);
  if (!origem) return { streams: [] };

  const streamUrl = construirUrlRecurso(
    origem.manifestUrl,
    `stream/${origem.type}/${encodeURIComponent(origem.originalId)}`
  );

  const data = await fetchJsonSeguro(streamUrl, 15000);
  return { streams: data && Array.isArray(data.streams) ? data.streams : [] };
});

const PORT = process.env.PORT || 7070;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Hub TV Unificado BR rodando na porta ${PORT}`);
