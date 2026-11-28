
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const cfg = window.ZRO_CONFIG || {};
  const setupNotice = $("#setupNotice");
  const loginForm = $("#loginForm");

  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") &&
    !cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  if (!configured || !window.supabase) {
    if (setupNotice) {
      setupNotice.textContent =
        "Setup required: configure Supabase URL and public anon key in config.js. Never use a service_role key here.";
    }

    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
      });
    }
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  if (setupNotice) setupNotice.hidden = true;

  let editing = null;

  function message(selector, text, bad = false) {
    const element = $(selector);
    if (!element) return;

    element.textContent = text;
    element.className =
      "form-message" + (bad ? " error" : " success");
  }

  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  // Password recovery link
  if (loginForm) {
    const forgotButton = document.createElement("button");
    forgotButton.type = "button";
    forgotButton.className = "text-link";
    forgotButton.textContent = "Forgot password?";
    forgotButton.style.marginTop = "12px";
    loginForm.appendChild(forgotButton);

    forgotButton.addEventListener("click", async () => {
      const email = $("#email").value.trim();

      if (!email) {
        message(
          "#loginMessage",
          "Please enter your admin email first.",
          true
        );
        $("#email").focus();
        return;
      }

      forgotButton.disabled = true;
      message("#loginMessage", "Sending recovery email...");

      const redirectTo = new URL(
        "reset-password.html",
        window.location.href
      ).toString();

      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      forgotButton.disabled = false;

      if (error) {
        message("#loginMessage", error.message, true);
        return;
      }

      message(
        "#loginMessage",
        "If the account exists, a password recovery email has been sent. Check your inbox."
      );
    });
  }

  // Load published posts in admin panel
  async function refresh() {
    const list = $("#postList");
    if (!list) return;

    const { data, error } = await db
      .from("zro_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      message("#postMessage", error.message, true);
      return;
    }

    list.innerHTML = "";

    (data || []).forEach((post) => {
      const item = document.createElement("article");
      item.className = "admin-post";

      const preview =
        post.media_type === "video"
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
          <button class="mini-btn edit" type="button">Edit</button>
          <button class="mini-btn delete" type="button">Delete</button>
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

      item.querySelector(".delete").addEventListener(
        "click",
        async () => {
          if (!confirm("Delete this post?")) return;

          const { error: deleteError } = await db
            .from("zro_posts")
            .delete()
            .eq("id", post.id);

          if (deleteError) {
            message("#postMessage", deleteError.message, true);
            return;
          }

          if (post.storage_path) {
            await db.storage
              .from("zro-media")
              .remove([post.storage_path]);
          }

          message("#postMessage", "Post deleted.");
          refresh();
        }
      );

      list.appendChild(item);
    });

    if (!data || data.length === 0) {
      list.innerHTML =
        '<p class="muted">No posts yet. Publish your first activity above.</p>';
    }
  }

  // Load applications for authorized admin review
  async function refreshApplications() {
    const list = $("#applicationList");
    if (!list) return;

    const { data, error } = await db
      .from("zro_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      list.textContent =
        "Could not load applications: " + error.message;
      return;
    }

    list.innerHTML = "";

    (data || []).forEach((app) => {
      const item = document.createElement("article");
      item.className = "admin-post";

      const info = document.createElement("div");
      info.className = "admin-post-info";

      const title = document.createElement("strong");
      title.textContent =
        (app.full_name || "Applicant") +
        " — " +
        (app.application_type || "");

      const detail = document.createElement("p");
      detail.textContent = [
        app.email,
        app.phone,
        app.city,
        app.department,
        "Status: " + app.status
      ].filter(Boolean).join(" · ");

      const docs = document.createElement("div");
      docs.className = "admin-post-actions";

      if (app.cv_file_path) {
        const cv = document.createElement("button");
        cv.type = "button";
        cv.className = "mini-btn";
        cv.textContent = "View CV";

        cv.addEventListener("click", async () => {
          const { data: fileData, error: fileError } =
            await db.storage
              .from("zro-private-applications")
              .createSignedUrl(app.cv_file_path, 60);

          if (fileError) {
            alert(fileError.message);
            return;
          }

          window.open(
            fileData.signedUrl,
            "_blank",
            "noopener"
          );
        });

        docs.appendChild(cv);
      }

      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "mini-btn";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => {
        setApplicationStatus(app.id, "approved");
      });

      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "mini-btn";
      reject.textContent = "Reject";
      reject.addEventListener("click", () => {
        setApplicationStatus(app.id, "rejected");
      });

      docs.append(approve, reject);
      info.append(title, detail);
      item.append(info, docs);
      list.appendChild(item);
    });

    if (!data || data.length === 0) {
      list.textContent = "No applications received yet.";
    }
  }

  async function setApplicationStatus(id, status) {
    if (!confirm("Set this application to " + status + "?")) {
      return;
    }

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

  // Show login or dashboard according to session
  async function showSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
      message("#loginMessage", error.message, true);
      return;
    }

    const session = data.session;

    $("#loginBox").hidden = !!session;
    $("#dashboard").hidden = !session;

    if (session) {
      refresh();
      refreshApplications();
    }
  }

  // Admin login
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    message("#loginMessage", "Signing in...");

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

  // Admin logout
  $("#logout").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
      alert(error.message);
      return;
    }

    showSession();
  });

  // Reset post form
  function resetForm() {
    editing = null;

    $("#postForm").reset();
    $("#postId").value = "";
    $("#mediaFile").required = true;
    $("#savePost").textContent = "Publish post";
    $("#cancelEdit").hidden = true;
  }

  $("#cancelEdit").addEventListener("click", resetForm);

  // Publish or update a post
  $("#postForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    message("#postMessage", "Saving...");

    const file = $("#mediaFile").files[0];

    if (!editing && !file) {
      message(
        "#postMessage",
        "Please choose a photo or video.",
        true
      );
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

      const maxSize = file.type.startsWith("video/")
        ? 40 * 1024 * 1024
        : 8 * 1024 * 1024;

      if (file.size > maxSize) {
        message(
          "#postMessage",
          "File is too large. Images: max 8 MB; videos: max 40 MB.",
          true
        );
        return;
      }

      const extension = (file.name.split(".").pop() || "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      const uniqueName =
        window.crypto?.randomUUID
          ? window.crypto.randomUUID()
          : Date.now().toString();

      storagePath = uniqueName + "." + extension;

      const { error: uploadError } = await db.storage
        .from("zro-media")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        message("#postMessage", uploadError.message, true);
        return;
      }

      const { data: urlData } = db.storage
        .from("zro-media")
        .getPublicUrl(storagePath);

      mediaUrl = urlData.publicUrl;
      mediaType = file.type.startsWith("video/")
        ? "video"
        : "image";
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

  // Refresh the page state when authentication changes
  db.auth.onAuthStateChange(() => {
    setTimeout(showSession, 0);
  });

  showSession();
})();
