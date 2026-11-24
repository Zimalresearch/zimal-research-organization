(() => {
  const $ = s => document.querySelector(s);
  $("#year").textContent = new Date().getFullYear();
  let lang = "en";
  $("#langToggle").addEventListener("click", () => {
    lang = lang === "en" ? "ur" : "en";
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
    document.querySelectorAll("[data-en]").forEach(el => {
      const value = el.dataset[lang];
      if (value) el.innerHTML = value;
    });
    $("#langToggle").textContent = lang === "en" ? "اردو" : "English";
  });

  const cfg = window.ZRO_CONFIG || {};
  const ready = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  if (!ready || !window.supabase) return;
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  async function loadGallery() {
    const grid = $("#galleryGrid");
    const { data, error } = await db.from("zro_posts").select("*").eq("published", true).order("created_at", {ascending:false});
    if (error || !data || !data.length) return;
    grid.innerHTML = "";
    data.forEach(post => {
      const card = document.createElement("article");
      card.className = "gallery-card";
      const media = document.createElement(post.media_type === "video" ? "video" : "img");
      media.src = post.media_url;
      if (post.media_type === "video") { media.controls = true; media.preload = "metadata"; }
      else { media.alt = post.title || "Zimal Research Organization activity"; media.loading = "lazy"; }
      card.appendChild(media);
      const body = document.createElement("div"); body.className = "gallery-caption";
      const heading = document.createElement("h3"); heading.textContent = post.title || "Activity";
      const desc = document.createElement("p"); desc.textContent = post.description || "";
      body.append(heading, desc); card.appendChild(body); grid.appendChild(card);
    });
  }
  loadGallery();
})();