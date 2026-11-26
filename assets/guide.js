(() => {
  "use strict";

  const menuToggle = document.querySelector(".mg-menu-toggle");
  const menu = document.getElementById("guide-navigation");
  const sections = [...menu.querySelectorAll(".mg-menu")];
  menuToggle.hidden = false;

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    if (expanded) sections.forEach(section => { section.open = false; });
  });
  menu.addEventListener("toggle", event => {
    if (!sections.includes(event.target) || !event.target.open) return;
    sections.filter(section => section !== event.target).forEach(section => { section.open = false; });
  }, true);
  document.addEventListener("click", event => {
    if (!menu.contains(event.target) && event.target !== menuToggle) {
      sections.forEach(section => { section.open = false; });
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const openSection = sections.find(section => section.open);
    if (openSection) {
      openSection.open = false;
      openSection.querySelector("summary").focus();
    } else if (menuToggle.getAttribute("aria-expanded") === "true" && menuToggle.offsetWidth) {
      menuToggle.click();
      menuToggle.focus();
    }
  });

  // The original click handlers update the panels, redraw charts, and own lesson data.
  // Add keyboard and URL navigation after those handlers have been installed.
  document.addEventListener("DOMContentLoaded", () => {
    let updatingFromUrl = false;
    const groups = [];

    for (const list of document.querySelectorAll("[data-guide-tablist]")) {
      const tabs = [...list.querySelectorAll("[data-guide-tab]")];
      const panels = tabs.map(tab => document.getElementById(tab.dataset.guideTab));
      const fallback = Math.max(0, tabs.findIndex(tab => tab.classList.contains("active")));
      list.setAttribute("role", "tablist");
      list.setAttribute("aria-label", list.dataset.guideTablist);

      tabs.forEach((tab, index) => {
        const panel = panels[index];
        tab.id ||= `${panel.id}-tab`;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panel.tabIndex = 0;
      });

      function sync(index) {
        tabs.forEach((tab, position) => {
          tab.setAttribute("aria-selected", String(index === position));
          tab.tabIndex = index === position ? 0 : -1;
        });
      }

      list.addEventListener("click", event => {
        const tab = event.target.closest("[data-guide-tab]");
        const index = tabs.indexOf(tab);
        if (index < 0) return;
        sync(index);
        const hash = `#${encodeURIComponent(panels[index].id)}`;
        if (!updatingFromUrl && location.hash !== hash) history.pushState(null, "", hash);
      });

      list.addEventListener("keydown", event => {
        const current = tabs.indexOf(event.target);
        if (current < 0) return;
        const positions = {
          ArrowLeft: (current + tabs.length - 1) % tabs.length,
          ArrowRight: (current + 1) % tabs.length,
          Home: 0,
          End: tabs.length - 1,
        };
        if (!(event.key in positions)) return;
        event.preventDefault();
        const tab = tabs[positions[event.key]];
        tab.focus();
        tab.click();
      });

      sync(fallback);
      groups.push({ tabs, panels, fallback });
    }

    for (const header of document.querySelectorAll("[data-guide-accordion]")) {
      const item = header.parentElement;
      const sync = () => header.setAttribute("aria-expanded", String(item.classList.contains("open")));
      header.setAttribute("role", "button");
      header.tabIndex = 0;
      header.addEventListener("click", sync);
      header.addEventListener("keydown", event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        header.click();
      });
      sync();
    }

    function followFragment() {
      let id;
      try {
        id = decodeURIComponent(location.hash.slice(1));
      } catch {
        return;
      }
      const target = id ? document.getElementById(id) : null;
      if (id && !target) return;

      updatingFromUrl = true;
      try {
        for (const { tabs, panels, fallback } of groups) {
          const index = target ? panels.findIndex(panel => panel.contains(target)) : fallback;
          if (index >= 0 && tabs[index].getAttribute("aria-selected") !== "true") tabs[index].click();
        }
      } finally {
        updatingFromUrl = false;
      }

      if (target) {
        if (target.matches("details")) target.open = true;
        for (let disclosure = target.parentElement?.closest("details"); disclosure; disclosure = disclosure.parentElement?.closest("details")) {
          disclosure.open = true;
        }
        const collapsed = target.closest(".accordion-content")?.parentElement;
        if (collapsed && !collapsed.classList.contains("open")) {
          collapsed.querySelector("[data-guide-accordion]")?.click();
        }
        requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      }
    }

    window.addEventListener("hashchange", followFragment);
    followFragment();
  });
})();
