
(() => {
  const $ = s => document.querySelector(s);
  const cfg = window.ZRO_CONFIG || {};

  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") &&
    !cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  if (!configured || !window.supabase) {
    $("#setupNotice").textContent =
      "Setup required: add your Supabase Project URL and PUBLIC anon/publishable key to config.js, then complete SETUP_GUIDE.md. Never use a service_role key here.";

    $("#loginForm").addEventListener("submit", e => e.preventDefault());
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  let editing = null;

  const message = (id, text, bad = false) => {
    $(id).textContent = text;
    $(id).className = "form-message" + (bad ? " error" : " success");
  };

  const safe = value =>
    String(value || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  async function refresh() {
    const { data, error } = await db
      .from("zro_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      message("#postMessage", error.message, true);
      return;
    }

    const list = $("#postList");
    list.innerHTML = "";

    (data || []).forEach(post => {
      const item = document.createElement("article");
      item.className = "admin-post";

      const preview = post.media_type === "video"
        ? `<video src="${safe(post.media_url)}" controls></video>`
        : `<img src="${safe(post.media_url)}" alt="">`;

      item.innerHTML = `
        <div class="admin-thumb">${preview}</div>
        <div class="admin-post-info">
          <strong>${safe(post.title)}</strong>
          <p>${safe(post.description)}</p>
          <small>${post.published ? "Published" : "Draft"}</small>
        </div>
        <div class="admin-post-actions">
          <button class="mini-btn edit">Edit</button>
          <button class="mini-btn delete">Delete</button>
        </div>
      `;

      item.querySelector(".edit").addEventListener("click", () => {
        editing = post;
        $("#postId").value = post.id;
        $("#title").value = post.title || "";
        $("#description").value = post.description || "";
        $("#mediaFile").required = false;
        $("#savePost").textContent = "Save changes";
        $("#cancelEdit").hidden = false;

        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      item.querySelector(".delete").addEventListener("click", async () => {
        if (!confirm("Delete this post?")) return;

        const path = post.storage_path;

        const { error: delErr } = await db
          .from("zro_posts")
          .delete()
          .eq("id", post.id);

        if (delErr) {
          message("#postMessage", delErr.message, true);
          return;
        }

        if (path) {
          await db.storage.from("zro-media").remove([path]);
        }

        refresh();
      });

      list.appendChild(item);
    });

    if (!data || !data.length) {
      list.innerHTML =
        '<p class="muted">No posts yet. Publish your first activity above.</p>';
    }
  }

  async function refreshApplications() {
    const list = $("#applicationList");
    if (!list) return;

    const { data, error } = await db
      .from("zro_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      list.textContent = "Could not load applications: " + error.message;
      return;
    }

    list.innerHTML = "";

    (data || []).forEach(app => {
      const item = document.createElement("article");
      item.className = "admin-post";

      const info = document.createElement("div");
      info.className = "admin-post-info";

      const title = document.createElement("strong");
      title.textContent = app.full_name + " — " + app.application_type;

      const detail = document.createElement("p");
      detail.textContent = [
        app.email,
        app.phone,
        app.city,
        app.department,
        "Status: " + app.status
      ].join(" · ");

      const docs = document.createElement("div");
      docs.className = "admin-post-actions";

      if (app.cv_file_path) {
        const cv = document.createElement("button");
        cv.className = "mini-btn";
        cv.textContent = "View CV";

        cv.addEventListener("click", async () => {
          const { data, error } = await db
            .storage
            .from("zro-private-applications")
            .createSignedUrl(app.cv_file_path, 60);

          if (error) {
            alert(error.message);
            return;
          }

          window.open(data.signedUrl, "_blank", "noopener");
        });

        docs.appendChild(cv);
      }

      const approve = document.createElement("button");
      approve.className = "mini-btn";
      approve.textContent = "Approve";
      approve.addEventListener("click", () =>
        setApplicationStatus(app.id, "approved")
      );

      const reject = document.createElement("button");
      reject.className = "mini-btn";
      reject.textContent = "Reject";
      reject.addEventListener("click", () =>
        setApplicationStatus(app.id, "rejected")
      );

      docs.append(approve, reject);
      info.append(title, detail);
      item.append(info, docs);
      list.append(item);
    });

    if (!data || !data.length) {
      list.textContent = "No applications received yet.";
    }
  }

  async function setApplicationStatus(id, status) {
    if (!confirm("Set this application to " + status + "?")) return;

    const { error } = await db
      .from("zro_applications")
      .update({
        status,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    refreshApplications();
  }

  async function showSession() {
    const { data } = await db.auth.getSession();
    const session = data.session;

    $("#loginBox").hidden = !!session;
    $("#dashboard").hidden = !session;

    if (session) {
      refresh();
      refreshApplications();
    }
  }

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    message("#loginMessage", "Signing in…");

    const { error } = await db.auth.signInWithPassword({
      email: $("#email").value.trim(),
      password: $("#password").value
    });

    if (error) {
      message("#loginMessage", error.message, true);
      return;
    }

    message("#loginMessage", "Signed in.");
    showSession();
  });

  $("#logout").addEventListener("click", async () => {
    await db.auth.signOut();
    showSession();
  });

  $("#cancelEdit").addEventListener("click", resetForm);

  function resetForm() {
    editing = null;
    $("#postForm").reset();
    $("#postId").value = "";
    $("#mediaFile").required = true;
    $("#savePost").textContent = "Publish post";
    $("#cancelEdit").hidden = true;
  }

  $("#postForm").addEventListener("submit", async e => {
    e.preventDefault();
    message("#postMessage", "Saving…");

    const file = $("#mediaFile").files[0];

    if (!editing && !file) {
      message("#postMessage", "Please choose a photo or video.", true);
      return;
    }

    let mediaUrl = editing?.media_url || "";
    let storagePath = editing?.storage_path || "";
    let mediaType = editing?.media_type || "";

    if (file) {
      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "video/quicktime"
      ];

      if (!allowed.includes(file.type)) {
        message(
          "#postMessage",
          "Please choose a supported image or video file.",
          true
        );
        return;
      }

      const max = file.type.startsWith("video/")
        ? 40 * 1024 * 1024
        : 8 * 1024 * 1024;

      if (file.size > max) {
        message(
          "#postMessage",
          "File is too large. Images: max 8 MB; videos: max 40 MB.",
          true
        );
        return;
      }

      const ext = (file.name.split(".").pop() || "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      storagePath = `${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await db
        .storage
        .from("zro-media")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        message("#postMessage", uploadError.message, true);
        return;
      }

      const { data: urlData } = db
        .storage
        .from("zro-media")
        .getPublicUrl(storagePath);

      mediaUrl = urlData.publicUrl;
      mediaType = file.type.startsWith("video/") ? "video" : "image";
    }

    const payload = {
      title: $("#title").value.trim(),
      description: $("#description").value.trim(),
      media_url: mediaUrl,
      storage_path: storagePath,
      media_type: mediaType,
      published: true
    };

    let result;

    if (editing) {
      result = await db
        .from("zro_posts")
        .update(payload)
        .eq("id", editing.id);
    } else {
      result = await db
        .from("zro_posts")
        .insert(payload);
    }

    if (result.error) {
      message("#postMessage", result.error.message, true);
      return;
    }

    resetForm();
    message("#postMessage", "Post saved successfully.");
    refresh();
  });

  db.auth.onAuthStateChange(() => setTimeout(showSession, 0));
  showSession();
})();
