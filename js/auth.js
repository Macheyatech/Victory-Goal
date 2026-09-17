const supabaseClient = window.vgSupabase;

const loginForm = document.getElementById("login-panel");
const signupForm = document.getElementById("signup-panel");

const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");

const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authMessage = document.getElementById("auth-message");

const loginButton = document.getElementById("login-button");
const signupButton = document.getElementById("signup-button");

function showMessage(message, type = "info") {
  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
}

function clearMessage() {
  authMessage.textContent = "";
  authMessage.className = "auth-message";
}

function setLoading(button, loading) {
  if (!button) return;

  button.disabled = loading;
  button.classList.toggle("loading", loading);
}

function switchTab(tab) {
  clearMessage();

  const isLogin = tab === "login";

  loginTab.classList.toggle("active", isLogin);
  signupTab.classList.toggle("active", !isLogin);

  loginTab.setAttribute("aria-selected", String(isLogin));
  signupTab.setAttribute("aria-selected", String(!isLogin));

  loginForm.classList.toggle("active", isLogin);
  signupForm.classList.toggle("active", !isLogin);

  authTitle.textContent = isLogin
    ? "Connexion"
    : "Créer un compte";

  authSubtitle.textContent = isLogin
    ? "Connectez-vous à votre compte Victory Goal."
    : "Créez votre compte pour commencer votre parcours.";
}

function translateAuthError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }

  if (message.includes("email not confirmed")) {
    return "Votre adresse e-mail n'est pas encore confirmée.";
  }

  if (message.includes("user already registered")) {
    return "Cette adresse e-mail est déjà utilisée.";
  }

  if (message.includes("password")) {
    return "Le mot de passe doit respecter les exigences de sécurité.";
  }

  if (message.includes("rate limit")) {
    return "Trop de tentatives. Veuillez patienter quelques instants.";
  }

  if (message.includes("network")) {
    return "Problème de connexion. Vérifiez votre Internet puis réessayez.";
  }

  return "Une erreur est survenue. Veuillez réessayer.";
}

async function redirectIfAuthenticated() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session?.user) {
    window.location.replace("dashboard.html");
  }
}

loginTab.addEventListener("click", () => {
  switchTab("login");
});

signupTab.addEventListener("click", () => {
  switchTab("signup");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage();

  const email = document
    .getElementById("login-email")
    .value
    .trim();

  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showMessage(
      "Veuillez remplir tous les champs.",
      "error"
    );
    return;
  }

  setLoading(loginButton, true);

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error("Session introuvable.");
    }

    showMessage(
      "Connexion réussie. Redirection...",
      "success"
    );

    window.location.replace("dashboard.html");
  } catch (error) {
    showMessage(
      translateAuthError(error),
      "error"
    );
  } finally {
    setLoading(loginButton, false);
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage();

  const username = document
    .getElementById("signup-username")
    .value
    .trim();

  const phone = document
    .getElementById("signup-phone")
    .value
    .trim();

  const email = document
    .getElementById("signup-email")
    .value
    .trim();

  const password =
    document.getElementById("signup-password").value;

  const passwordConfirm =
    document.getElementById("signup-password-confirm").value;

  if (!username || !phone || !email || !password || !passwordConfirm) {
    showMessage(
      "Veuillez remplir tous les champs.",
      "error"
    );
    return;
  }

  if (username.length < 3 || username.length > 30) {
    showMessage(
      "Le nom d'utilisateur doit contenir entre 3 et 30 caractères.",
      "error"
    );
    return;
  }

  if (password.length < 8) {
    showMessage(
      "Le mot de passe doit contenir au moins 8 caractères.",
      "error"
    );
    return;
  }

  if (password !== passwordConfirm) {
    showMessage(
      "Les deux mots de passe ne correspondent pas.",
      "error"
    );
    return;
  }

  setLoading(signupButton, true);

  try {
    const redirectUrl =
      `${window.location.origin}/dashboard.html`;

    const { data, error } =
      await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            phone
          },
          emailRedirectTo: redirectUrl
        }
      });

    if (error) {
      throw error;
    }

    if (data.session) {
      showMessage(
        "Compte créé avec succès. Redirection...",
        "success"
      );

      window.location.replace("dashboard.html");
      return;
    }

    showMessage(
      "Votre compte a été créé. Vérifiez votre adresse e-mail pour confirmer votre compte, puis connectez-vous.",
      "success"
    );

    signupForm.reset();
  } catch (error) {
    showMessage(
      translateAuthError(error),
      "error"
    );
  } finally {
    setLoading(signupButton, false);
  }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (
    session?.user &&
    (
      event === "SIGNED_IN" ||
      event === "INITIAL_SESSION"
    )
  ) {
    if (!window.location.pathname.endsWith("dashboard.html")) {
      window.location.replace("dashboard.html");
    }
  }
});

redirectIfAuthenticated();
