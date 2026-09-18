const VG_UI = {
  message(element, text, type = "info") {
    if (!element) return;

    element.textContent = text;
    element.className = `auth-message ${type}`;
  },

  clearMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.className = "auth-message";
  },

  loading(button, isLoading) {
    if (!button) return;

    button.disabled = isLoading;
    button.classList.toggle("loading", isLoading);
  },

  formatPoints(points) {
    const value = Number(points);

    if (!Number.isFinite(value)) {
      return "V$0";
    }

    return (
      "V$" +
      new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(value)
    );
  },

  formatAmount(points) {
    return this.formatPoints(points);
  },

  formatDate(date) {
    if (!date) return "—";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed);
  },

  formatCountdown(date) {
    if (!date) return "—";

    const target = new Date(date).getTime();

    if (!Number.isFinite(target)) {
      return "—";
    }

    const update = () => {
      const remaining = target - Date.now();

      if (remaining <= 0) {
        return "Expirée";
      }

      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
    };

    return update();
  },

  escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  },

  show(element) {
    if (!element) return;

    element.hidden = false;
  },

  hide(element) {
    if (!element) return;

    element.hidden = true;
  },

  toggle(element, visible) {
    if (!element) return;

    element.hidden = !visible;
  },

  setText(element, value) {
    if (!element) return;

    element.textContent = value ?? "";
  },

  setHTML(element, value) {
    if (!element) return;

    element.innerHTML = value ?? "";
  },

  notify(message, type = "info") {
    let container =
      document.getElementById("vg-notifications");

    if (!container) {
      container = document.createElement("div");
      container.id = "vg-notifications";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");

      document.body.appendChild(container);
    }

    const notification =
      document.createElement("div");

    notification.className =
      `vg-notification ${type}`;

    notification.textContent =
      message;

    container.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add("show");
    });

    setTimeout(() => {
      notification.classList.remove("show");

      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3500);
  },

  openModal(content) {
    let modal =
      document.getElementById("vg-modal");

    if (!modal) {
      modal = document.createElement("div");

      modal.id = "vg-modal";
      modal.className = "vg-modal";

      modal.innerHTML = `
        <div class="vg-modal-backdrop"></div>

        <div class="vg-modal-content">

          <button
            type="button"
            class="vg-modal-close"
            aria-label="Fermer">
            ×
          </button>

          <div class="vg-modal-body"></div>

        </div>
      `;

      document.body.appendChild(modal);

      modal
        .querySelector(".vg-modal-backdrop")
        .addEventListener(
          "click",
          () => {
            this.closeModal();
          }
        );

      modal
        .querySelector(".vg-modal-close")
        .addEventListener(
          "click",
          () => {
            this.closeModal();
          }
        );
    }

    modal
      .querySelector(".vg-modal-body")
      .innerHTML = content ?? "";

    modal.classList.add("open");

    document.body.classList.add(
      "modal-open"
    );
  },

  closeModal() {
    const modal =
      document.getElementById("vg-modal");

    if (!modal) return;

    modal.classList.remove("open");

    document.body.classList.remove(
      "modal-open"
    );
  },

  confirm(message) {
    return window.confirm(message);
  }
};

window.VG_UI = VG_UI;
