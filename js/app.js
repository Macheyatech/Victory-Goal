(() => {
  "use strict";

  const supabase = window.vgSupabase;

  let currentUser = null;
  let currentProfile = null;
  let viewerUserId = null;

  let visiblePlans = [];
  let currentPlan = null;
  let currentBoard = [];
  let currentMembership = null;

  let currentProgress = 0;
  let requiredProgress = 0;
  let dashboardProgression = null;

  let pendingApplication = null;
  let legendApplications = [];

  let boardExpanded = true;
  let countdownTimer = null;

  const $ = (selector) =>
    document.querySelector(selector);

  /* =========================================================
     UTILITAIRES
  ========================================================= */

  function escapeHtml(value) {
    if (window.VG_UI?.escapeHtml) {
      return window.VG_UI.escapeHtml(value ?? "");
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function firstRow(data) {
    return Array.isArray(data)
      ? data[0] || null
      : data || null;
  }

  function points(value) {
    if (window.VG_UI?.formatPoints) {
      return window.VG_UI.formatPoints(value);
    }

    const number = Number(value);

    return `V$${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 2
    }).format(
      Number.isFinite(number) ? number : 0
    )}`;
  }

  function countdown(value) {
    if (!value) {
      return "—";
    }

    const target =
      new Date(value).getTime();

    const remaining =
      target - Date.now();

    if (
      !Number.isFinite(remaining) ||
      remaining <= 0
    ) {
      return "Expirée";
    }

    const totalSeconds =
      Math.floor(remaining / 1000);

    const minutes =
      Math.floor(totalSeconds / 60);

    const seconds =
      totalSeconds % 60;

    return `${minutes} min ${String(
      seconds
    ).padStart(2, "0")} s`;
  }

  function notify(
    message,
    type = "info"
  ) {
    if (window.VG_UI?.notify) {
      window.VG_UI.notify(
        message,
        type
      );
      return;
    }

    alert(message);
  }

  function setText(
    selector,
    value
  ) {
    const element =
      $(selector);

    if (element) {
      element.textContent =
        value ?? "";
    }
  }

  function roleLabel(role) {
    if (role === "legend") {
      return "Légende";
    }

    if (role === "constructor") {
      return "Constructeur";
    }

    return "Membre";
  }

  function showLoading(message) {
    const loading =
      $("#dashboard-loading");

    if (!loading) {
      return;
    }

    loading.hidden = false;

    const text =
      $("#dashboard-loading-text");

    if (text) {
      text.textContent =
        message;
    }
  }

  function hideLoading() {
    const loading =
      $("#dashboard-loading");

    if (loading) {
      loading.hidden = true;
    }
  }

  function showApp() {
    const app =
      $("#app");

    if (app) {
      app.hidden = false;
    }
  }

  function hideApp() {
    const app =
      $("#app");

    if (app) {
      app.hidden = true;
    }
  }

  function errorMessage(error) {
    const raw = String(
      error?.message ||
      error?.error_description ||
      error ||
      "Une erreur est survenue."
    );

    const text =
      raw.toLowerCase();

    const translations = [
      [
        "authentication required",
        "Vous devez être connecté."
      ],
      [
        "plan unavailable",
        "Ce niveau n'est pas disponible."
      ],
      [
        "plan is above",
        "Ce niveau n'est pas encore accessible."
      ],
      [
        "already has",
        "Vous avez déjà une inscription active."
      ],
      [
        "target slot is occupied",
        "Cette position est déjà occupée."
      ],
      [
        "only a legend",
        "Seule la Légende du tableau peut approuver cette demande."
      ],
      [
        "first plan table is full",
        "Le premier tableau est complet."
      ],
      [
        "no next plan",
        "Aucun niveau supérieur n'est actuellement disponible."
      ],
      [
        "active legend not found",
        "Aucune Légende active n'a été trouvée."
      ],
      [
        "profile not found",
        "Profil introuvable."
      ],
      [
        "genesis enters the first table automatically",
        "Genesis entre automatiquement dans le premier tableau."
      ],
      [
        "genesis advances automatically",
        "Genesis avance automatiquement vers le niveau suivant."
      ],
      [
        "only genesis can approve applications in the genesis table",
        "Seul Genesis peut approuver les demandes du tableau Genesis."
      ],
      [
        "non-genesis cycles must be opened through the recursive branch engine",
        "Ce tableau doit être créé par le système de progression récursive."
      ]
    ];

    for (
      const [search, translation]
      of translations
    ) {
      if (text.includes(search)) {
        return translation;
      }
    }

    return raw;
  }

  /* =========================================================
     PROFIL
  ========================================================= */

  async function loadProfile() {
    const {
      data,
      error
    } = await supabase.rpc(
      "vg_get_my_profile"
    );

    if (error) {
      throw error;
    }

    currentProfile =
      firstRow(data);

    if (!currentProfile) {
      throw new Error(
        "PROFILE_NOT_FOUND"
      );
    }

    viewerUserId =
      currentProfile.user_id ||
      currentUser?.id ||
      null;

    renderProfile();
  }

  function renderProfile() {
    if (!currentProfile) {
      return;
    }

    setText(
      "#profile-username",
      currentProfile.username || "—"
    );

    setText(
      "#profile-phone",
      currentProfile.phone
        ? `Téléphone : ${currentProfile.phone}`
        : "Téléphone : —"
    );

    setText(
      "#profile-email",
      currentUser?.email
        ? `E-mail : ${currentUser.email}`
        : "E-mail : —"
    );

    setText(
      "#profile-role",
      roleLabel(
        currentProfile.role
      )
    );

    const avatar =
      $("#profile-avatar-letter");

    if (avatar) {
      avatar.textContent =
        String(
          currentProfile.username ||
          "V"
        )
          .charAt(0)
          .toUpperCase();
    }

    setText(
      "#welcome-title",
      `Bienvenue, ${
        currentProfile.username || ""
      }`
    );
  }

  /* =========================================================
     PLANS
  ========================================================= */

  async function loadPlans() {
    const {
      data,
      error
    } = await supabase.rpc(
      "vg_get_visible_plans"
    );

    if (error) {
      throw error;
    }

    visiblePlans =
      Array.isArray(data)
        ? [...data].sort(
            (a, b) =>
              Number(a.sequence_no) -
              Number(b.sequence_no)
          )
        : [];

    renderPlans();
  }

  function getPlanColors(plan) {
    const sequence =
      Number(plan?.sequence_no) || 1;

    /*
     * Chaque plan possède sa propre identité visuelle.
     * Les trois rôles restent distincts à l'intérieur
     * du même plan: Légende, Constructeur et Membres.
     */
    const palettes = {
      1: {
        legend: "#F4B400",
        legendSoft: "#FFE082",
        constructor: "#1598C5",
        constructorSoft: "#8EE7FF",
        member: "#7A8798",
        memberSoft: "#D8DEE7"
      },
      2: {
        legend: "#FF7A00",
        legendSoft: "#FFD08A",
        constructor: "#7C3AED",
        constructorSoft: "#C4B5FD",
        member: "#64748B",
        memberSoft: "#CBD5E1"
      },
      3: {
        legend: "#A855F7",
        legendSoft: "#E9D5FF",
        constructor: "#DB2777",
        constructorSoft: "#F9A8D4",
        member: "#64748B",
        memberSoft: "#CBD5E1"
      },
      4: {
        legend: "#10B981",
        legendSoft: "#A7F3D0",
        constructor: "#0891B2",
        constructorSoft: "#A5F3FC",
        member: "#64748B",
        memberSoft: "#CBD5E1"
      },
      5: {
        legend: "#D4A72C",
        legendSoft: "#FDE68A",
        constructor: "#EA580C",
        constructorSoft: "#FED7AA",
        member: "#475569",
        memberSoft: "#CBD5E1"
      },
      6: {
        legend: "#E11D48",
        legendSoft: "#FECDD3",
        constructor: "#2563EB",
        constructorSoft: "#93C5FD",
        member: "#64748B",
        memberSoft: "#CBD5E1"
      },
      7: {
        legend: "#6366F1",
        legendSoft: "#C7D2FE",
        constructor: "#14B8A6",
        constructorSoft: "#99F6E4",
        member: "#475569",
        memberSoft: "#CBD5E1"
      },
      8: {
        legend: "#C026D3",
        legendSoft: "#F0ABFC",
        constructor: "#65A30D",
        constructorSoft: "#BEF264",
        member: "#57534E",
        memberSoft: "#D6D3D1"
      }
    };

    const palette =
      palettes[sequence] ||
      palettes[
        ((sequence - 1) % 8) + 1
      ];

    return {
      primary:
        plan?.color_primary ||
        palette.legend,

      secondary:
        plan?.color_secondary ||
        palette.legendSoft,

      legend:
        plan?.color_primary ||
        palette.legend,

      legendSoft:
        plan?.color_secondary ||
        palette.legendSoft,

      constructor:
        palette.constructor,

      constructorSoft:
        palette.constructorSoft,

      member:
        palette.member,

      memberSoft:
        palette.memberSoft
    };
  }

  function getNextPlan() {
    if (!currentPlan) {
      return null;
    }

    return (
      visiblePlans.find(
        (plan) =>
          Number(plan.sequence_no) ===
          Number(currentPlan.sequence_no) + 1
      ) || null
    );
  }

  function getPlanRequiredProgress(plan) {
    const isCurrent =
      !!currentMembership &&
      currentPlan?.id === plan?.id;

    if (
      isCurrent &&
      dashboardProgression?.cycle_kind
    ) {
      return dashboardProgression.cycle_kind === "genesis"
        ? 8
        : 7;
    }

    if (
      pendingApplication &&
      currentPlan?.id === plan?.id
    ) {
      return Number(plan?.sequence_no) === 1
        ? 8
        : 7;
    }

    return Number(plan?.sequence_no) === 1
      ? 8
      : 7;
  }

  function applyPlanColors(plan) {
    const colors =
      getPlanColors(plan);

    document.documentElement.style.setProperty(
      "--plan-primary",
      colors.primary
    );

    document.documentElement.style.setProperty(
      "--plan-secondary",
      colors.secondary
    );
  }

  function renderPlans() {
    const container =
      $("#plans-list");

    if (!container) {
      return;
    }

    if (!visiblePlans.length) {
      container.innerHTML = `
        <div class="empty-state">
          Aucun niveau disponible pour le moment.
        </div>
      `;
      return;
    }

    const nextPlan =
      getNextPlan();

    container.innerHTML =
      visiblePlans
        .map((plan) => {
          const isCurrent =
            !!currentMembership &&
            currentPlan?.id === plan.id;

          const isPending =
            !currentMembership &&
            !!pendingApplication &&
            currentPlan?.id === plan.id;

          const isNext =
            !!currentMembership &&
            nextPlan?.id === plan.id;

          const colors =
            getPlanColors(plan);

          return `
            <article
              class="
                plan-card
                ${isCurrent ? "active" : ""}
                ${isPending ? "pending" : ""}
                ${isNext ? "locked" : ""}
              "
              style="
                --card-primary:${escapeHtml(colors.primary)};
                --card-secondary:${escapeHtml(colors.secondary)};
              "
            >

              <div class="plan-card-header">

                <div>
                  <h3>
                    ${escapeHtml(
                      plan.name || "Niveau"
                    )}
                  </h3>

                  <span>
                    Niveau ${Number(
                      plan.sequence_no || 0
                    )}
                  </span>
                </div>

                <strong class="plan-points">
                  ${points(
                    plan.plan_points
                  )}
                </strong>

              </div>

              <div class="plan-card-body">

                ${
                  currentMembership?.member_role === "legend" &&
                  currentPlan?.id === plan.id
                    ? `
                      <p>
                        Progression requise :
                        <strong>
                          ${getPlanRequiredProgress(plan)}
                        </strong>
                      </p>
                    `
                    : ""
                }

                ${
                  isCurrent
                    ? `
                      <div class="plan-status current">
                        Niveau actuel
                      </div>
                    `
                    : isPending
                    ? `
                      <div class="plan-status pending">
                        ⏳ Demande en attente
                      </div>
                    `
                    : isNext
                    ? `
                      <div class="plan-status locked">
                        🔒 Prochain niveau
                      </div>
                    `
                    : `
                      <div class="plan-status completed">
                        Niveau du parcours
                      </div>
                    `
                }

              </div>

            </article>
          `;
        })
        .join("");
  }

  /* =========================================================
     CONTEXTE COMPLET DU DASHBOARD
  ========================================================= */

  async function loadDashboardContext() {
    const {
      data,
      error
    } = await supabase.rpc(
      "vg_get_dashboard_context"
    );

    if (error) {
      throw error;
    }

    const context =
      firstRow(data);

    if (!context) {
      throw new Error(
        "Impossible de charger votre espace."
      );
    }

    currentMembership =
      context.current_membership || null;

    currentPlan =
      context.current_plan ||
      context.pending_plan ||
      null;

    dashboardProgression =
      context.progression || null;

    pendingApplication =
      context.pending_application || null;

    currentBoard =
      Array.isArray(
        context.current_board
      )
        ? context.current_board
        : Array.isArray(
            context.pending_board
          )
        ? context.pending_board
        : [];

    if (currentMembership) {
      currentMembership =
        normalizeMembership(
          currentMembership
        );
    }

    /*
     * Le backend peut retourner plusieurs
     * cycles visibles pour l'utilisateur.
     *
     * Le tableau affiché doit cependant
     * correspondre au tableau actif actuel.
     */
    if (currentMembership?.table_id) {
      currentBoard =
        currentBoard.filter(
          (row) =>
            !row.table_id ||
            row.table_id ===
              currentMembership.table_id
        );
    }

    if (currentPlan) {
      applyPlanColors(
        currentPlan
      );
    }

    calculateProgress();

    renderCurrentPlan();
    renderBoard();
    renderPlans();
  }

  function normalizeMembership(
    membership
  ) {
    if (!membership) {
      return null;
    }

    return {
      ...membership,

      membership_id:
        membership.membership_id ||
        membership.id ||
        null,

      member_role:
        membership.member_role ||
        membership.role ||
        "member",

      membership_status:
        membership.membership_status ||
        membership.status ||
        null
    };
  }

  /* =========================================================
     PROGRESSION
  ========================================================= */

  function calculateProgress() {
    /*
     * La progression personnelle affichée ici
     * appartient uniquement à la Légende active.
     *
     * Le backend est la source de vérité :
     * - legend  -> completed / required
     * - member  -> aucune progression de Légende
     * - pending -> aucune progression
     */
    if (
      !dashboardProgression ||
      dashboardProgression.visible !== true ||
      dashboardProgression.type !== "legend"
    ) {
      currentProgress = 0;
      requiredProgress = 0;
      return;
    }

    currentProgress =
      Number(
        dashboardProgression.completed || 0
      );

    requiredProgress =
      Number(
        dashboardProgression.required ||
        currentPlan?.required_progress ||
        0
      );

    currentProgress =
      Math.min(
        Math.max(currentProgress, 0),
        Math.max(requiredProgress, 0)
      );
  }

  function renderCurrentPlan() {
    const progressCard =
      document.querySelector(".progress-card");

    const isLegend =
      currentMembership?.member_role === "legend";

    if (progressCard) {
      progressCard.hidden =
        !currentPlan ||
        !isLegend;
    }

    if (!currentPlan) {
      setText(
        "#current-plan-name",
        "Aucun niveau actif"
      );

      setText(
        "#current-plan-points",
        "V$0"
      );

      setText(
        "#progress-value",
        "0 / 0"
      );

      setText(
        "#progress-count",
        "0"
      );

      setText(
        "#required-progress",
        "0"
      );

      document
        .querySelectorAll(
          "[data-progress-fill]"
        )
        .forEach(
          (element) => {
            element.style.width =
              "0%";
          }
        );

      document
        .querySelectorAll(
          "[data-progress-percent]"
        )
        .forEach(
          (element) => {
            element.textContent =
              "0%";
          }
        );

      renderNextPlan();
      renderSimulationProgress();

      return;
    }

    const required =
      Number(
        requiredProgress ||
        currentPlan.required_progress ||
        0
      );

    const progress =
      Math.min(
        currentProgress,
        required
      );

    const percentage =
      required > 0
        ? Math.round(
            (progress / required) *
              100
          )
        : 0;

    setText(
      "#current-plan-name",
      currentPlan.name ||
        "—"
    );

    setText(
      "#current-plan-points",
      points(
        currentPlan.plan_points
      )
    );

    setText(
      "#progress-value",
      `${progress} / ${required}`
    );

    setText(
      "#progress-count",
      String(progress)
    );

    setText(
      "#required-progress",
      String(required)
    );

    document
      .querySelectorAll(
        "[data-progress-fill]"
      )
      .forEach(
        (element) => {
          element.style.width =
            `${percentage}%`;
        }
      );

    document
      .querySelectorAll(
        "[data-progress-percent]"
      )
      .forEach(
        (element) => {
          element.textContent =
            `${percentage}%`;
        }
      );

    renderNextPlan();
    renderSimulationProgress();
  }

  function renderSimulationProgress() {
    const area =
      $("#simulation-progress-area");

    if (!area) {
      return;
    }

    const role =
      currentMembership?.member_role;

    if (role !== "legend") {
      area.hidden = true;
      area.innerHTML = "";
      return;
    }

    area.hidden = false;

    const complete =
      currentProgress >=
      requiredProgress;

    area.innerHTML = `
      <div class="simulation-progress-card">

        <div>
          <strong>
            Progression de simulation
          </strong>

          <p>
            ${currentProgress}
            /
            ${requiredProgress}
          </p>
        </div>

        <button
          type="button"
          id="simulation-progress-button"
          class="primary-button"
          ${complete ? "disabled" : ""}
        >
          ${
            complete
              ? "Progression terminée"
              : "Enregistrer une progression"
          }
        </button>

      </div>
    `;

    $("#simulation-progress-button")
      ?.addEventListener(
        "click",
        recordSimulationProgress
      );
  }

  /* =========================================================
     PROCHAIN NIVEAU
  ========================================================= */

  function renderNextPlan() {
    const section =
      $("#next-plan-section");

    const area =
      $("#next-plan-area");

    if (!section || !area) {
      return;
    }

    const next =
      getNextPlan();

    const isLegend =
      currentMembership?.member_role === "legend";

    /*
     * Seule la Légende possède la progression
     * numérique du cycle. Les membres ne doivent
     * jamais utiliser progress_count comme leur
     * propre progression ni déverrouiller un niveau
     * à partir de cette valeur.
     */
    if (!next || !isLegend) {
      section.hidden = true;
      area.innerHTML = "";
      return;
    }

    section.hidden = false;

    const complete =
      currentProgress >=
      requiredProgress;

    const isGenesis =
      currentProfile?.is_genesis === true;

    const canRequest =
      complete &&
      !isGenesis &&
      !currentMembership?.is_passerelle;

    area.innerHTML = `
      <div class="next-plan-card locked">

        <div class="next-plan-lock">
          🔒
        </div>

        <div class="next-plan-details">

          <span class="card-kicker">
            PROCHAIN NIVEAU
          </span>

          <strong>
            ${escapeHtml(
              next.name || "Niveau"
            )}
          </strong>

          <span>
            ${points(
              next.plan_points
            )}
          </span>

          <p>
            ${
              !complete
                ? "Ce niveau reste verrouillé jusqu'à la fin de votre cycle de Légende."
                : isGenesis
                ? "Votre progression est terminée. Genesis avance automatiquement vers le niveau suivant."
                : "Votre progression est terminée. Vous pouvez demander l'entrée au prochain niveau."
            }
          </p>

        </div>

        ${
          canRequest
            ? `
              <button
                type="button"
                id="apply-next-plan-button"
                class="primary-button"
              >
                Demander l'accès
              </button>
            `
            : `
              <span class="next-plan-status">
                ${
                  complete
                    ? isGenesis
                      ? "Avancement automatique"
                      : "Niveau prêt"
                    : "Accès verrouillé"
                }
              </span>
            `
        }

      </div>
    `;

    $("#apply-next-plan-button")
      ?.addEventListener(
        "click",
        applyToNextPlan
      );
  }

  async function applyToNextPlan() {
    const button =
      $("#apply-next-plan-button");

    if (button) {
      button.disabled = true;
      button.textContent =
        "Envoi...";
    }

    try {
      const {
        error
      } = await supabase.rpc(
        "vg_apply_to_next_plan"
      );

      if (error) {
        throw error;
      }

      notify(
        "Votre demande d'accès au prochain niveau a été envoyée.",
        "success"
      );

      await refreshDashboard();

    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Demander l'accès";
      }
    }
  }

  /* =========================================================
     TABLEAU
  ========================================================= */

  function renderBoard() {
    const container =
      $("#board-container");

    if (!container) {
      return;
    }

    if (
      (!currentMembership && !pendingApplication) ||
      !currentPlan ||
      !currentBoard.length
    ) {
      renderNoBoard();
      return;
    }

    const positions =
      new Map();

    currentBoard.forEach(
      (row) => {
        positions.set(
          Number(
            row.position_no
          ),
          row
        );
      }
    );

    /*
     * Genesis = 9 positions.
     * Branche = 11 positions.
     */
    const isBranch =
      currentBoard.some(
        (row) =>
          Number(
            row.position_no
          ) === 11
      );

    const maxPosition =
      isBranch ? 11 : 9;

    const colors =
      getPlanColors(
        currentPlan
      );

    const nodes = [];

    for (
      let position = 1;
      position <= maxPosition;
      position++
    ) {
      nodes.push(
        renderBoardNode(
          positions.get(position),
          position
        )
      );
    }

    container.innerHTML = `
      <div
        class="victory-board"
        style="
          --board-primary:${escapeHtml(
            colors.primary
          )};
          --board-secondary:${escapeHtml(
            colors.secondary
          )};
          --board-legend:${escapeHtml(
            colors.legend
          )};
          --board-legend-soft:${escapeHtml(
            colors.legendSoft
          )};
          --board-constructor:${escapeHtml(
            colors.constructor
          )};
          --board-constructor-soft:${escapeHtml(
            colors.constructorSoft
          )};
          --board-member:${escapeHtml(
            colors.member
          )};
          --board-member-soft:${escapeHtml(
            colors.memberSoft
          )};
        "
      >
        ${nodes.join("")}
      </div>
    `;

    container.hidden =
      !boardExpanded;

    setText(
      "#board-plan-name",
      currentPlan.name ||
        "—"
    );

    setText(
      "#board-division-name",
      isBranch
        ? "Division de branche"
        : "Table Genesis"
    );

    setupBoardToggle();
    bindBoardNames();

    const note =
      $("#board-note");

    if (note) {
      note.textContent =
        pendingApplication && !currentMembership
          ? "Votre demande est en attente. La position reste réservée et vous pouvez consulter les membres du tableau. Cliquez sur la Légende pour voir son numéro de téléphone."
          : "Cliquez sur un nom pour consulter les informations publiques disponibles. Cliquez sur l'en-tête du tableau pour afficher ou masquer la division.";
    }
  }

  function renderBoardNode(
    row,
    position
  ) {
    if (!row) {
      return `
        <div
          class="board-node empty"
          data-position="${position}"
          aria-label="Position libre"
        ></div>
      `;
    }

    if (
      !row.membership_id &&
      row.pending_application_id
    ) {
      const username =
        row.username ||
        "En attente";

      return `
        <div
          class="board-node pending"
          data-position="${position}"
        >

          <span class="board-username">
            ${escapeHtml(
              username
            )}
          </span>

          <span class="board-pending">
            En attente
          </span>

        </div>
      `;
    }

    if (row.membership_id) {
      const username =
        row.username ||
        "Membre";

      const role =
        roleLabel(
          row.member_role
        );

      const roleClass =
        row.member_role === "legend"
          ? "legend"
          : row.member_role === "constructor"
          ? "constructor"
          : "member";

      const isMe =
        row.user_id ===
        viewerUserId;

      if (!isMe) {
        return `
          <div
            class="board-node occupied ${roleClass}"
            data-position="${position}"
          >

            <button
              type="button"
              class="board-username"
              data-public-profile="${escapeHtml(
                row.user_id
              )}"
            >
              ${escapeHtml(
                username
              )}
            </button>

            <span class="board-role">
              ${escapeHtml(
                role
              )}
            </span>

          </div>
        `;
      }

      return `
        <div
          class="
            board-node
            occupied
            current-user
            ${roleClass}
          "
          data-position="${position}"
        >

          <span class="board-username">
            ${escapeHtml(
              username
            )}
          </span>

          <span class="board-role">
            ${escapeHtml(
              role
            )}
          </span>

        </div>
      `;
    }

    return `
      <div
        class="board-node empty"
        data-position="${position}"
      ></div>
    `;
  }

  function setupBoardToggle() {
    const info =
      $("#board-plan-info");

    if (!info) {
      return;
    }

    info.setAttribute(
      "role",
      "button"
    );

    info.setAttribute(
      "tabindex",
      "0"
    );

    info.setAttribute(
      "aria-expanded",
      boardExpanded
        ? "true"
        : "false"
    );

    if (
      info.dataset.bound ===
      "true"
    ) {
      return;
    }

    info.dataset.bound =
      "true";

    info.style.cursor =
      "pointer";

    info.addEventListener(
      "click",
      () => {
        toggleBoard();
      }
    );

    info.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key ===
            "Enter" ||
          event.key ===
            " "
        ) {
          event.preventDefault();
          toggleBoard();
        }
      }
    );
  }

  function toggleBoard() {
    if (
      (!currentMembership && !pendingApplication) ||
      !currentBoard.length
    ) {
      return;
    }

    boardExpanded =
      !boardExpanded;

    const container =
      $("#board-container");

    if (container) {
      container.hidden =
        !boardExpanded;
    }

    const info =
      $("#board-plan-info");

    if (info) {
      info.setAttribute(
        "aria-expanded",
        boardExpanded
          ? "true"
          : "false"
      );
    }
  }

  function renderNoBoard() {
    const container =
      $("#board-container");

    if (!container) {
      return;
    }

    if (
      pendingApplication &&
      currentPlan &&
      currentBoard.length
    ) {
      renderBoard();
      return;
    }

    setText(
      "#board-plan-name",
      "Aucun tableau actif"
    );

    setText(
      "#board-division-name",
      "—"
    );

    const note =
      $("#board-note");

    if (note) {
      note.textContent =
        "Votre tableau apparaîtra ici après votre entrée et sa validation.";
    }

    if (pendingApplication) {
      container.hidden = false;

      container.innerHTML = `
        <div class="join-table-card">

          <div class="join-table-icon">
            ⏳
          </div>

          <div>

            <h3>
              Demande en attente
            </h3>

            <p>
              Votre demande attend l'approbation
              de la Légende responsable.
            </p>

          </div>

        </div>
      `;

      return;
    }

    container.hidden = false;

    /*
     * Genesis ne demande jamais
     * d'entrée dans le premier tableau.
     */
    if (
      currentProfile?.is_genesis === true
    ) {
      container.innerHTML = `
        <div class="join-table-card">

          <div class="join-table-icon">
            ★
          </div>

          <div>

            <h3>
              Genesis
            </h3>

            <p>
              Genesis entre automatiquement
              dans le premier tableau.
            </p>

            <span>
              Niveau V$1
            </span>

          </div>

        </div>
      `;

      return;
    }

    container.innerHTML = `
      <div class="join-table-card">

        <div class="join-table-icon">
          +
        </div>

        <div>

          <h3>
            Rejoindre le premier tableau
          </h3>

          <p>
            Envoyez votre demande à la
            Légende. Vous entrerez uniquement
            après son approbation.
          </p>

          <span>
            Niveau V$1
          </span>

        </div>

        <button
          type="button"
          id="apply-first-plan-button"
          class="primary-button"
        >
          Demander à entrer
        </button>

      </div>
    `;

    $("#apply-first-plan-button")
      ?.addEventListener(
        "click",
        applyToFirstPlan
      );
  }

  /* =========================================================
     DEMANDE PREMIER TABLEAU
  ========================================================= */

  async function applyToFirstPlan() {
    const button =
      $("#apply-first-plan-button");

    if (button) {
      button.disabled = true;
      button.textContent =
        "Envoi...";
    }

    try {
      const {
        error
      } = await supabase.rpc(
        "vg_apply_to_first_plan"
      );

      if (error) {
        throw error;
      }

      notify(
        "Votre demande a été envoyée à la Légende.",
        "success"
      );

      await refreshDashboard();

    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Demander à entrer";
      }
    }
  }

  /* =========================================================
     DEMANDE PERSONNELLE EN ATTENTE
  ========================================================= */

  async function loadPendingApplication() {
    const contextPending =
      pendingApplication;

    pendingApplication = null;

    if (!viewerUserId) {
      pendingApplication =
        contextPending;
      renderPendingApplication();
      return;
      return;
    }

    try {
      const {
        data,
        error
      } = await supabase
        .from("vg_applications")
        .select(`
          id,
          user_id,
          target_plan_id,
          target_cycle_id,
          target_position_no,
          status,
          expires_at,
          created_at
        `)
        .eq(
          "user_id",
          viewerUserId
        )
        .eq(
          "status",
          "pending"
        )
        .gt(
          "expires_at",
          new Date().toISOString()
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(1);

      if (
        !error &&
        Array.isArray(data) &&
        data.length
      ) {
        pendingApplication =
          data[0];
      }

    } catch (error) {
      console.error(
        "Pending:",
        error
      );
    }

    if (!pendingApplication) {
      pendingApplication =
        contextPending;
    }

    renderPendingApplication();
  }

  function renderPendingApplication() {
    const section =
      $("#pending-section");

    const content =
      $("#pending-content");

    if (!section || !content) {
      return;
    }

    if (
      currentMembership ||
      !pendingApplication
    ) {
      section.hidden = true;
      content.innerHTML = "";
      return;
    }

    section.hidden = false;

    content.innerHTML = `
      <div class="pending-card">

        <div class="pending-card-icon">
          ⏳
        </div>

        <div>

          <strong>
            Demande en attente d'approbation
          </strong>

          <p>
            Position demandée :
            <strong>
              ${Number(
                pendingApplication.target_position_no ||
                0
              )}
            </strong>
          </p>

          <span
            data-countdown="${escapeHtml(
              pendingApplication.expires_at
            )}"
          >
            ${countdown(
              pendingApplication.expires_at
            )}
          </span>

        </div>

      </div>
    `;
  }

  /* =========================================================
     DEMANDES À APPROUVER
  ========================================================= */

  async function loadLegendApplications() {
    legendApplications = [];

    if (
      !currentMembership ||
      currentMembership.member_role !==
        "legend"
    ) {
      renderLegendApplications();
      return;
    }

    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_pending_for_legend"
      );

      if (!error) {
        legendApplications =
          Array.isArray(data)
            ? data
            : [];
      }

    } catch (error) {
      console.error(
        "Approvals:",
        error
      );
    }

    renderLegendApplications();
  }

  function renderLegendApplications() {
    const section =
      $("#approval-section");

    const list =
      $("#approval-list");

    if (!section || !list) {
      return;
    }

    if (
      !currentMembership ||
      currentMembership.member_role !==
        "legend"
    ) {
      section.hidden = true;
      list.innerHTML = "";
      return;
    }

    section.hidden = false;

    if (!legendApplications.length) {
      list.innerHTML = `
        <div class="empty-state">
          Aucune demande en attente pour votre tableau.
        </div>
      `;

      return;
    }

    list.innerHTML =
      legendApplications
        .map(
          (application) => `
            <article class="approval-card">

              <div class="approval-card-main">

                <strong>
                  Nouvelle demande
                </strong>

                ${
                  application.username
                    ? `
                      <p>
                        Utilisateur :
                        <strong>
                          ${escapeHtml(
                            application.username
                          )}
                        </strong>
                      </p>
                    `
                    : ""
                }

                <p>
                  Position :
                  <strong>
                    ${Number(
                      application.target_position_no ||
                      0
                    )}
                  </strong>
                </p>

                <small>
                  Expire dans :
                  <span
                    data-countdown="${escapeHtml(
                      application.expires_at
                    )}"
                  >
                    ${countdown(
                      application.expires_at
                    )}
                  </span>
                </small>

              </div>

              <button
                type="button"
                class="primary-button approve-application-button"
                data-application-id="${escapeHtml(
                  application.id
                )}"
              >
                Approuver
              </button>

            </article>
          `
        )
        .join("");

    list
      .querySelectorAll(
        ".approve-application-button"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () =>
              approveApplication(
                button.dataset
                  .applicationId,
                button
              )
          );
        }
      );
  }

  async function approveApplication(
    applicationId,
    button
  ) {
    if (button) {
      button.disabled = true;
      button.textContent =
        "Approbation...";
    }

    try {
      const {
        error
      } = await supabase.rpc(
        "vg_approve_application",
        {
          p_application_id:
            applicationId
        }
      );

      if (error) {
        throw error;
      }

      notify(
        "Demande approuvée.",
        "success"
      );

      await refreshDashboard();

    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Approuver";
      }
    }
  }

  /* =========================================================
     PROGRESSION DE SIMULATION
  ========================================================= */

  async function recordSimulationProgress() {
    if (
      !currentMembership?.membership_id
    ) {
      return;
    }

    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_record_simulation_progress",
        {
          p_legend_membership_id:
            currentMembership.membership_id
        }
      );

      if (error) {
        throw error;
      }

      const result =
        firstRow(data) ||
        data;

      notify(
        result?.completed
          ? "Progression terminée."
          : "Progression enregistrée.",
        "success"
      );

      await refreshDashboard();

    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );
    }
  }

  /* =========================================================
     PROFILS PUBLICS DU TABLEAU
  ========================================================= */

  function bindBoardNames() {
    document
      .querySelectorAll(
        "[data-public-profile]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => {
              openPublicProfile(
                button.dataset
                  .publicProfile
              );
            }
          );
        }
      );
  }

  async function openPublicProfile(
    userId
  ) {
    if (!userId) {
      return;
    }

    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_public_profile",
        {
          p_user_id:
            userId
        }
      );

      if (error) {
        throw error;
      }

      const profile =
        firstRow(data);

      if (!profile) {
        return;
      }

      const modal =
        $("#public-profile-modal");

      if (!modal) {
        return;
      }

      const username =
        modal.querySelector(
          "[data-public-username]"
        );

      const phone =
        modal.querySelector(
          "[data-public-phone]"
        );

      const role =
        modal.querySelector(
          "[data-public-role]"
        );

      if (username) {
        username.textContent =
          profile.username ||
          "—";
      }

      if (phone) {
        phone.textContent =
          profile.phone ||
          "—";
      }

      if (role) {
        role.textContent =
          roleLabel(
            profile.role
          );
      }

      modal.hidden = false;

      modal.classList.add(
        "open"
      );

      modal.setAttribute(
        "aria-hidden",
        "false"
      );

    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );
    }
  }

  function closePublicProfile() {
    const modal =
      $("#public-profile-modal");

    if (!modal) {
      return;
    }

    modal.hidden = true;

    modal.classList.remove(
      "open"
    );

    modal.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  function setupPublicProfile() {
    document
      .querySelectorAll(
        "[data-close-public-profile]"
      )
      .forEach(
        (element) => {
          element.addEventListener(
            "click",
            closePublicProfile
          );
        }
      );
  }

  /* =========================================================
     PARRAINAGE
  ========================================================= */

  async function loadReferral() {
    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_my_referral_link"
      );

      if (error) {
        return;
      }

      const referral =
        firstRow(data);

      if (!referral) {
        return;
      }

      const url =
        referral.referral_url ||
        "";

      const code =
        referral.referral_code ||
        "";

      document
        .querySelectorAll(
          "[data-referral-code]"
        )
        .forEach(
          (element) => {
            element.textContent =
              code;
          }
        );

      document
        .querySelectorAll(
          "[data-referral-link]"
        )
        .forEach(
          (element) => {
            element.value =
              url;
          }
        );

      document
        .querySelectorAll(
          "[data-copy-referral]"
        )
        .forEach(
          (button) => {
            button.onclick =
              async () => {
                try {
                  await navigator.clipboard.writeText(
                    url
                  );

                  notify(
                    "Lien copié.",
                    "success"
                  );
                } catch {
                  notify(
                    "Impossible de copier le lien.",
                    "error"
                  );
                }
              };
          }
        );

    } catch (error) {
      console.error(
        "Referral:",
        error
      );
    }
  }

  /* =========================================================
     INTERFACE
  ========================================================= */

  function setupLogout() {
    const button =
      $("#logout-button");

    if (!button) {
      return;
    }

    if (
      button.dataset.bound ===
      "true"
    ) {
      return;
    }

    button.dataset.bound =
      "true";

    button.addEventListener(
      "click",
      async () => {
        button.disabled = true;

        try {
          await supabase.auth.signOut();
        } finally {
          window.location.replace(
            "index.html"
          );
        }
      }
    );
  }

  function setupRefresh() {
    document
      .querySelectorAll(
        "#refresh-button,#board-refresh-button"
      )
      .forEach(
        (button) => {
          if (
            button.dataset.bound ===
            "true"
          ) {
            return;
          }

          button.dataset.bound =
            "true";

          button.addEventListener(
            "click",
            refreshDashboard
          );
        }
      );
  }

  function updateCountdowns() {
    document
      .querySelectorAll(
        "[data-countdown]"
      )
      .forEach(
        (element) => {
          element.textContent =
            countdown(
              element.dataset
                .countdown
            );
        }
      );
  }

  /* =========================================================
     REFRESH COMPLET
  ========================================================= */

  async function refreshDashboard() {
    showLoading(
      "Actualisation..."
    );

    try {
      const {
        data: {
          session
        }
      } =
        await supabase.auth.getSession();

      if (!session?.user) {
        window.location.replace(
          "index.html"
        );

        return;
      }

      currentUser =
        session.user;

      await loadProfile();

      await loadPlans();

      await loadDashboardContext();

      await loadPendingApplication();

      if (
        !currentMembership &&
        !(pendingApplication && currentBoard.length)
      ) {
        renderNoBoard();
      }

      await loadLegendApplications();

      await loadReferral();

      renderPlans();
      renderCurrentPlan();
      renderPendingApplication();

      setupPublicProfile();
      setupLogout();
      setupRefresh();

      updateCountdowns();

      showApp();

    } catch (error) {
      console.error(
        "Dashboard error:",
        error
      );

      if (
        String(
          error?.message || ""
        ).includes(
          "PROFILE_NOT_FOUND"
        )
      ) {
        await supabase.auth.signOut();

        window.location.replace(
          "index.html?create=1"
        );

        return;
      }

      notify(
        errorMessage(error),
        "error"
      );

    } finally {
      hideLoading();
    }
  }

  /* =========================================================
     INITIALISATION
  ========================================================= */

  async function init() {
    hideApp();

    if (!supabase) {
      console.error(
        "Supabase introuvable."
      );

      hideLoading();

      return;
    }

    showLoading(
      "Chargement de votre espace..."
    );

    try {
      const {
        data: {
          session
        }
      } =
        await supabase.auth.getSession();

      if (!session?.user) {
        window.location.replace(
          "index.html"
        );

        return;
      }

      currentUser =
        session.user;

      await loadProfile();

      await loadPlans();

      await loadDashboardContext();

      await loadPendingApplication();

      if (
        !currentMembership &&
        !(pendingApplication && currentBoard.length)
      ) {
        renderNoBoard();
      }

      await loadLegendApplications();

      await loadReferral();

      renderPlans();
      renderCurrentPlan();
      renderPendingApplication();

      setupPublicProfile();
      setupLogout();
      setupRefresh();

      updateCountdowns();

      if (countdownTimer) {
        clearInterval(
          countdownTimer
        );
      }

      countdownTimer =
        setInterval(
          updateCountdowns,
          1000
        );

      showApp();

    } catch (error) {
      console.error(
        "Dashboard error:",
        error
      );

      notify(
        errorMessage(error),
        "error"
      );

    } finally {
      hideLoading();
    }
  }

  /* =========================================================
     API PUBLIQUE
  ========================================================= */

  window.VG_APP = {
    refresh:
      refreshDashboard,

    openPublicProfile,

    closePublicProfile,

    applyToFirstPlan,

    applyToNextPlan,

    approveApplication,

    recordSimulationProgress,

    toggleBoard
  };

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
