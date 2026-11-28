(() => {
  "use strict";

  const scriptUrl = document.currentScript.src;

  // Charts use the guide's type and colours. Charts drawn before this script runs pick them up on load.
  if (window.Chart) {
    Chart.defaults.font.family = '"Public Sans", system-ui, sans-serif';
    Chart.defaults.font.size = window.matchMedia("(max-width: 36rem)").matches ? 12 : 13;
    Chart.defaults.color = "#4E5B83";
    Chart.defaults.borderColor = "rgba(98, 114, 164, 0.18)";
    window.addEventListener("load", () => Object.values(Chart.instances || {}).forEach(chart => chart.update("none")));
  }

  const menuToggle = document.querySelector(".mg-menu-toggle");
  const menu = document.getElementById("guide-navigation");
  const sections = [...menu.querySelectorAll(".mg-menu")];
  menuToggle.hidden = false;

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    menuToggle.textContent = expanded ? "Menu" : "Close";
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
        panel.tabIndex = panel.querySelector("a[href], button, input, select, textarea, summary") ? -1 : 0;
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

    // Site search loads its index on first use. Results link to sections, which followFragment opens.
    const search = document.querySelector(".mg-search");
    if (search) {
      const input = search.querySelector("input");
      const status = search.querySelector(".mg-search-status");
      const results = search.querySelector(".mg-search-results");
      const kinds = { page: 0, section: 1, tool: 2, term: 3 };
      const fold = text => ` ${text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
      let index = null;

      const load = () => index ||= fetch(new URL("search-index.json", scriptUrl))
        .then(response => {
          if (!response.ok) throw new Error(`Search index: ${response.status}`);
          return response.json();
        })
        .then(entries => entries.map((entry, order) => ({ ...entry, order, fields: [fold(entry.h), fold(entry.p), fold(entry.t)] })))
        .catch(error => {
          index = null;
          throw error;
        });

      // Every word must start a word in the heading, page title or text. Headings count most.
      const rank = (entries, words, phrase) => entries.flatMap(entry => {
        const [heading, page, text] = entry.fields;
        let score = 0;
        for (const word of words) {
          const start = ` ${word}`;
          const inText = Math.min(text.split(start).length - 1, 5);
          if (!heading.includes(start) && !page.includes(start) && !inText) return [];
          score += 5 * heading.includes(start) + 3 * page.includes(start) + inText;
        }
        if (heading.includes(phrase)) score += 8;
        else if (text.includes(phrase.trimEnd())) score += 3;
        return [{ entry, score }];
      }).sort((a, b) => b.score - a.score || kinds[a.entry.k] - kinds[b.entry.k] || a.entry.order - b.entry.order);

      const highlight = (target, text, words) => {
        let last = 0;
        for (const match of text.matchAll(new RegExp(`\\b(?:${words.join("|")})`, "gi"))) {
          const mark = document.createElement("mark");
          mark.textContent = match[0];
          target.append(text.slice(last, match.index), mark);
          last = match.index + match[0].length;
        }
        target.append(text.slice(last));
      };

      const excerpt = (text, words) => {
        const lower = text.toLowerCase();
        const first = Math.min(...words.map(word => lower.indexOf(word)).filter(position => position >= 0));
        let start = Number.isFinite(first) ? Math.max(0, first - 60) : 0;
        if (start > 0) start = text.indexOf(" ", start) + 1;
        const end = text.length > start + 180 ? text.lastIndexOf(" ", start + 180) : text.length;
        return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
      };

      const show = query => {
        const phrase = fold(query);
        const words = phrase.trim().split(" ").filter(Boolean);
        results.replaceChildren();
        if (!words.length) {
          status.textContent = "";
          return;
        }
        load().then(entries => {
          if (input.value !== query) return;
          const matches = rank(entries, words, phrase);
          const perPage = new Map();
          const shown = [];
          for (const { entry } of matches) {
            const path = entry.u.split("#")[0];
            if ((perPage.get(path) || 0) >= 3) continue;
            perPage.set(path, (perPage.get(path) || 0) + 1);
            shown.push(entry);
            if (shown.length === 8) break;
          }
          const count = `${matches.length} ${matches.length === 1 ? "result" : "results"}`;
          status.textContent = !matches.length ? "No results"
            : shown.length < matches.length ? `${count}, showing the top ${shown.length}` : count;
          for (const entry of shown) {
            const link = document.createElement("a");
            link.href = new URL(entry.u, new URL("../", scriptUrl)).href;
            const title = document.createElement("strong");
            highlight(title, entry.h, words);
            link.append(title);
            if (entry.p !== entry.h) {
              const context = document.createElement("span");
              context.className = "mg-search-context";
              context.textContent = entry.p;
              link.append(context);
            }
            if (entry.t) {
              const snippet = document.createElement("span");
              snippet.className = "mg-search-snippet";
              highlight(snippet, excerpt(entry.t, words), words);
              link.append(snippet);
            }
            const item = document.createElement("li");
            item.append(link);
            results.append(item);
          }
        }).catch(() => {
          if (input.value === query) status.textContent = "Search is unavailable. Reload the page to try again.";
        });
      };

      search.hidden = false;
      search.addEventListener("toggle", () => {
        if (!search.open) return;
        load().catch(() => {});
        input.focus();
      });
      input.addEventListener("input", () => show(input.value));
      input.addEventListener("keydown", event => {
        const first = results.querySelector("a");
        if (!first || (event.key !== "Enter" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        if (event.key === "Enter") first.click();
        else first.focus();
      });
      results.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const links = [...results.querySelectorAll("a")];
        const position = links.indexOf(document.activeElement);
        if (position < 0) return;
        event.preventDefault();
        (links[position + (event.key === "ArrowDown" ? 1 : -1)] || (event.key === "ArrowUp" ? input : links[position])).focus();
      });
      results.addEventListener("click", event => {
        const link = event.target.closest("a");
        if (!link) return;
        search.open = false;
        if (menuToggle.getAttribute("aria-expanded") === "true") menuToggle.click();
        const target = new URL(link.href);
        if (target.pathname === location.pathname && target.hash === location.hash) {
          event.preventDefault();
          followFragment();
        }
      });
      const openSearch = () => {
        if (menuToggle.offsetWidth && menuToggle.getAttribute("aria-expanded") !== "true") menuToggle.click();
        search.open = true;
        input.focus();
      };
      const followSearchLink = () => {
        if (location.hash === "#guide-search") openSearch();
      };
      window.addEventListener("hashchange", followSearchLink);
      followSearchLink();
      document.addEventListener("keydown", event => {
        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
        event.preventDefault();
        openSearch();
      });
    }

    // Regions that scroll sideways fade on the side that hides content (see guide.css).
    const scrollRegions = new Set();
    const updateRegion = region => {
      const overflow = region.scrollWidth - region.clientWidth > 2;
      region.classList.toggle("mg-scroll-x", overflow);
      region.classList.toggle("mg-at-start", region.scrollLeft <= 1);
      region.classList.toggle("mg-at-end", region.scrollLeft + region.clientWidth >= region.scrollWidth - 1);
    };
    const findRegions = () => {
      for (const strip of document.querySelectorAll("#guide-main :is([data-guide-tablist]:not(.step-progress), .model-selector, .view-selector, .ex-tabs, #mmm-tabs)")) {
        if (scrollRegions.has(strip) || !/^(auto|scroll)$/.test(getComputedStyle(strip).overflowX)) continue;
        scrollRegions.add(strip);
        strip.addEventListener("scroll", () => updateRegion(strip), { passive: true });
      }
      for (const content of document.querySelectorAll("#guide-main :is(table, svg, canvas)")) {
        let region = content.parentElement;
        while (region && region.id !== "guide-main" && !/^(auto|scroll)$/.test(getComputedStyle(region).overflowX)) {
          region = region.parentElement;
        }
        if (!region || region.id === "guide-main" || scrollRegions.has(region)) continue;
        scrollRegions.add(region);
        region.addEventListener("scroll", () => updateRegion(region), { passive: true });
      }
      scrollRegions.forEach(updateRegion);
    };
    let pending = 0;
    const scheduleRegions = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => requestAnimationFrame(findRegions));
    };
    window.addEventListener("load", scheduleRegions);
    window.addEventListener("resize", scheduleRegions);
    document.getElementById("guide-main").addEventListener("click", scheduleRegions);
    document.getElementById("guide-main").addEventListener("input", scheduleRegions);
    scheduleRegions();
  });
})();
