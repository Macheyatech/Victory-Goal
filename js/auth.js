const VG_AUTH = {
  dashboardUrl: "https://victory-goal.vercel.app/dashboard.html",

  loginForm: null,
  signupForm: null,
  loginTab: null,
  signupTab: null,
  authTitle: null,
  authSubtitle: null,
  authMessage: null,
  loginButton: null,
  signupButton: null,

  init() {
    this.loginForm = document.getElementById("login-panel");
    this.signupForm = document.getElementById("signup-panel");
    this.loginTab = document.getElementById("login-tab");
    this.signupTab = document.getElementById("signup-tab");
    this.authTitle = document.getElementById("auth-title");
    this.authSubtitle = document.getElementById("auth-subtitle");
    this.authMessage = document.getElementById("auth-message");
    this.loginButton = document.getElementById("login-button");
    this.signupButton = document.getElementById("signup-button");

    this.bindEvents();
    this.handleAuthState();
    this.redirectIfAuthenticated();
  },

  bindEvents() {
    this.loginTab?.addEventListener("click", () => {
      this.showTab("login");
    });

    this.signupTab?.addEventListener("click", () => {
      this.showTab("signup");
    });

    this.loginForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.login();
    });

    this.signupForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.signup();
    });
  },

  showTab(tab) {
    const isLogin = tab === "login";

    this.loginTab?.classList.toggle("active", isLogin);
    this.signupTab?.classList.toggle("active", !isLogin);

    this.loginTab?.setAttribute(
      "aria-selected",
      String(isLogin)
    );

    this.signupTab?.setAttribute(
      "aria-selected",
      String(!isLogin)
    );

    this.loginForm?.classList.toggle("active", isLogin);
    this.signupForm?.classList.toggle("active", !isLogin);

    if (this.authTitle) {
      this.authTitle.textContent = isLogin
        ? "Connexion"
        : "Créer un compte";
    }

    if (this.authSubtitle) {
      this.authSubtitle.textContent = isLogin
        ? "Connectez-vous à votre compte Victory Goal."
        : "Créez votre compte pour commencer votre parcours.";
    }

    this.clearMessage();
  },

  async login() {
    const email = document
      .getElementById("login-email")
      ?.value
      .trim();

    const password = document
      .getElementById("login-password")
      ?.value;

    if (!email || !password) {
      this.showMessage(
        "Veuillez remplir tous les champs.",
        "error"
      );
      return;
    }

    VG_UI.loading(this.loginButton, true);
    this.clearMessage();

    try {
      const { error } =
        await window.vgSupabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        throw error;
      }

      window.location.replace(this.dashboardUrl);
    } catch (error) {
      this.showMessage(
        this.translateError(error),
        "error"
      );
    } finally {
      VG_UI.loading(this.loginButton, false);
    }
  },

  async signup() {
    const username = document
      .getElementById("signup-username")
      ?.value
      .trim();

    const phone = document
      .getElementById("signup-phone")
      ?.value
      .trim();

    const email = document
      .getElementById("signup-email")
      ?.value
      .trim();

    const password = document
      .getElementById("signup-password")
      ?.value;

    const passwordConfirm = document
      .getElementById("signup-password-confirm")
      ?.value;

    if (!username || !phone || !email || !password || !passwordConfirm) {
      this.showMessage(
        "Veuillez remplir tous les champs.",
        "error"
      );
      return;
    }

    if (username.length < 3 || username.length > 30) {
      this.showMessage(
        "Le nom d'utilisateur doit contenir entre 3 et 30 caractères.",
        "error"
      );
      return;
    }

    if (password.length < 8) {
      this.showMessage(
        "Le mot de passe doit contenir au moins 8 caractères.",
        "error"
      );
      return;
    }

    if (password !== passwordConfirm) {
      this.showMessage(
        "Les deux mots de passe ne correspondent pas.",
        "error"
      );
      return;
    }

    VG_UI.loading(this.signupButton, true);
    this.clearMessage();

    try {
      const { data, error } =
        await window.vgSupabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: this.dashboardUrl,
            data: {
              username,
              phone
            }
          }
        });

      if (error) {
        throw error;
      }

      if (data?.session) {
        window.location.replace(this.dashboardUrl);
        return;
      }

      this.showMessage(
        "Votre compte a été créé. Vérifiez votre adresse e-mail, puis cliquez sur le lien reçu pour confirmer votre compte.",
        "success"
      );

      this.signupForm?.reset();
    } catch (error) {
      this.showMessage(
        this.translateError(error),
        "error"
      );
    } finally {
      VG_UI.loading(this.signupButton, false);
    }
  },

  async redirectIfAuthenticated() {
    try {
      const { data, error } =
        await window.vgSupabase.auth.getSession();

      if (error) {
        return;
      }

      if (data?.session) {
        const currentPage =
          window.location.pathname.split("/").pop();

        if (currentPage !== "dashboard.html") {
          window.location.replace(this.dashboardUrl);
        }
      }
    } catch (error) {
      console.error(
        "Erreur de vérification de session:",
        error
      );
    }
  },

  handleAuthState() {
    window.vgSupabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_IN" &&
          session &&
          !window.location.pathname.endsWith("dashboard.html")
        ) {
          window.location.replace(this.dashboardUrl);
        }
      }
    );
  },

  showMessage(message, type = "info") {
    if (!this.authMessage) {
      return;
    }

    VG_UI.message(
      this.authMessage,
      message,
      type
    );
  },

  clearMessage() {
    if (!this.authMessage) {
      return;
    }

    VG_UI.clearMessage(this.authMessage);
  },

  translateError(error) {
    const message =
      error?.message ||
      error?.error_description ||
      "";

    const normalized = message.toLowerCase();

    if (
      normalized.includes("invalid login credentials")
    ) {
      return "Adresse e-mail ou mot de passe incorrect.";
    }

    if (
      normalized.includes("email not confirmed")
    ) {
      return "Votre adresse e-mail n'est pas encore confirmée. Vérifiez votre boîte e-mail.";
    }

    if (
      normalized.includes("user already registered")
    ) {
      return "Cette adresse e-mail est déjà utilisée.";
    }

    if (
      normalized.includes("email address") &&
      normalized.includes("invalid")
    ) {
      return "Veuillez saisir une adresse e-mail valide.";
    }

    if (
      normalized.includes("password") &&
      normalized.includes("at least")
    ) {
      return "Le mot de passe ne respecte pas les exigences minimales.";
    }

    if (
      normalized.includes("rate limit")
    ) {
      return "Trop de tentatives. Veuillez patienter avant de réessayer.";
    }

    if (
      normalized.includes("username")
    ) {
      return "Ce nom d'utilisateur est peut-être déjà utilisé.";
    }

    if (message) {
      return message;
    }

    return "Une erreur est survenue. Veuillez réessayer.";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (!window.vgSupabase) {
    console.error(
      "Supabase n'est pas disponible."
    );
    return;
  }

  VG_AUTH.init();
});
