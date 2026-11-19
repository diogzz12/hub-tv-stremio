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

const CATEGORIAS_PRIORITARIAS = [
  "Filmes",
  "Séries",
  "Variedades",
  "Esportes",
  "Notícias"
];

const MAPA_CATEGORIAS = {
  // Filmes
  "filme": "Filmes",
  "filmes": "Filmes",
  "movie": "Filmes",
  "movies": "Filmes",
  "cinema": "Filmes",
  // Séries
  "serie": "Séries",
  "séries": "Séries",
  "series": "Séries",
  "show": "Séries",
  "shows": "Séries",
  "novela": "Séries",
  "novelas": "Séries",
  // Esportes
  "esporte": "Esportes",
  "esportes": "Esportes",
  "futebol": "Esportes",
  "sport": "Esportes",
  "sports": "Esportes",
  "ppv": "Esportes",
  "premiere": "Esportes",
  // Notícias
  "noticia": "Notícias",
  "notícias": "Notícias",
  "noticias": "Notícias",
  "news": "Notícias",
  "jornalismo": "Notícias",
  // Variedades e outros
  "variedades": "Variedades",
  "entretenimento": "Variedades",
  "variety": "Variedades",
  "geral": "Variedades",
  "aberta": "Variedades",
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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Constrói URLs do Stremio preservando prefixos e query string do manifestUrl
function construirUrlRecurso(manifestUrl, caminhoRecurso) {
  const parsed = new URL(manifestUrl);
  const basePath = parsed.pathname.replace(/\/manifest\.json\/?$/i, "").replace(/\/+$/, "");
  const cleanRecurso = caminhoRecurso.replace(/^\/+/, "");
  parsed.pathname = `${basePath}/${cleanRecurso}`.replace(/\/{2,}/g, "/");
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

async function fetchJsonSeguro(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 Stremio-Hub-Agregador/1.0"
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

async function carregarTudo() {
  const agora = Date.now();
  if (cacheAgregado.itens.length > 0 && agora - cacheAgregado.timestamp < CACHE_TTL_MS) {
    return cacheAgregado;
  }

  const novosItens = [];
  const categoriasDetectadas = new Set(CATEGORIAS_PRIORITARIAS);
  indiceOrigem.clear();

  await Promise.all(
    ADDONS_ORIGEM.map(async (addon) => {
      const manifestOrigem = await fetchJsonSeguro(addon.manifestUrl);
      if (!manifestOrigem || !Array.isArray(manifestOrigem.catalogs)) return;

      for (const cat of manifestOrigem.catalogs) {
        const catType = cat.type || "tv";
        const catId = encodeURIComponent(cat.id);
        const catalogUrl = construirUrlRecurso(
          addon.manifestUrl,
          `catalog/${catType}/${catId}.json`
        );

        const catalogData = await fetchJsonSeguro(catalogUrl);
        const metas = catalogData && Array.isArray(catalogData.metas) ? catalogData.metas : [];

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
    })
  );

  const extrasOrdenadas = Array.from(categoriasDetectadas)
    .filter((c) => !CATEGORIAS_PRIORITARIAS.includes(c))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  cacheAgregado = {
    timestamp: agora,
    itens: novosItens,
    categorias: ["Todas", ...CATEGORIAS_PRIORITARIAS, ...extrasOrdenadas]
  };

  return cacheAgregado;
}

const manifest = {
  id: "com.usuario.tv.hub.unificado.br",
  version: "1.0.0",
  name: "Hub TV Unificado BR",
  description: "Seus addons de TV reunidos em uma única lista por categorias.",
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
          options: ["Todas", ...CATEGORIAS_PRIORITARIAS, "Infantil", "Documentários", "Música", "Rádios"],
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

  return {
    metas: itens.filter(
      (item) => Array.isArray(item.genres) && item.genres.includes(categoriaSelecionada)
    )
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv") return { streams: [] };

  const origem = indiceOrigem.get(id);
  if (!origem) return { streams: [] };

  const streamUrl = construirUrlRecurso(
    origem.manifestUrl,
    `stream/${origem.type}/${encodeURIComponent(origem.originalId)}.json`
  );

  const data = await fetchJsonSeguro(streamUrl);
  return { streams: data && Array.isArray(data.streams) ? data.streams : [] };
});

const PORT = process.env.PORT || 7070;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Hub TV Unificado BR rodando na porta ${PORT}`);
