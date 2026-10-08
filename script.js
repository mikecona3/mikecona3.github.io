/* =========================================================
   Portfolio — script.js
   Liquid-glass nav: the blob that tracks the current section,
   plus edge refraction in browsers that support it.
   ========================================================= */

(() => {
  const nav = document.querySelector(".nav");
  const blob = nav?.querySelector(".nav__blob");
  if (!nav || !blob) return;

  /* ---------- Section tracking ---------- */
  // Every in-page nav link whose target exists, in page order.
  const items = [...nav.querySelectorAll('a[href^="#"]')]
    .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")), shift: 0 }))
    .filter((item) => item.section);

  let current = null;
  let drag = null; // set while the blob is being dragged
  let lockedUntilScrollEnds = false;
  let moveTimer;

  // A link's box where the layout put it, ignoring the nudge centreLabels() gives it,
  // so the blob's size and position don't depend on where the label has been moved to.
  function layoutBox(item) {
    const box = item.link.getBoundingClientRect();
    return { left: box.left - item.shift, right: box.right - item.shift, top: box.top, bottom: box.bottom, width: box.width };
  }

  // Where the blob should sit to cover a link, as insets from the nav's edges.
  function insetsFor(item, navBox = nav.getBoundingClientRect()) {
    const box = layoutBox(item);
    const grow = 2; // blob sits slightly proud of the link it marks
    const stretch = 1.6; // blob aims for this many times the link's width
    const edge = 6; // closest the blob gets to the nav's ends, and the space kept between neighbouring links' blobs
    const reach = ((box.width + grow * 2) * (stretch - 1)) / 2;

    // Each link owns the bar up to halfway to its neighbours. The blob stretches out into that space
    // but stays inside it, and centreLabels() slides each label to the middle of its own blob, so
    // labels stay inside their own space too and the blob can never run into a neighbouring label.
    const i = items.indexOf(item);
    const prev = items[i - 1] && layoutBox(items[i - 1]);
    const next = items[i + 1] && layoutBox(items[i + 1]);
    const leftLimit = prev ? (prev.right + box.left) / 2 + edge / 2 : navBox.left + edge;
    const rightLimit = next ? (box.right + next.left) / 2 - edge / 2 : navBox.right - edge;
    const left = Math.max(box.left - grow - reach, Math.min(box.left - grow, leftLimit));
    const right = Math.min(box.right + grow + reach, Math.max(box.right + grow, rightLimit));

    return {
      l: left - navBox.left,
      r: navBox.right - right,
      t: box.top - navBox.top - grow,
      b: navBox.bottom - box.bottom - grow,
    };
  }

  // The blob can only stretch inward on the end links, so it isn't always centred on its link.
  // Slide each label to the middle of its own blob instead, whichever one is selected.
  function centreLabels() {
    const navBox = nav.getBoundingClientRect();
    for (const item of items) {
      const { l, r } = insetsFor(item, navBox);
      const box = layoutBox(item);
      const blobCentre = navBox.left + l + (navBox.width - l - r) / 2;
      item.shift = blobCentre - (box.left + box.width / 2);
      item.link.style.translate = `${item.shift}px 0`;
    }
  }

  function setBlobInsets({ l, r, t, b }) {
    blob.style.setProperty("--blob-l", `${l}px`);
    blob.style.setProperty("--blob-r", `${r}px`);
    blob.style.setProperty("--blob-t", `${t}px`);
    blob.style.setProperty("--blob-b", `${b}px`);
  }

  function placeBlob(item, animate = true) {
    const insets = insetsFor(item);

    if (animate) {
      const prevLeft = parseFloat(blob.style.getPropertyValue("--blob-l")) || 0;
      blob.dataset.dir = insets.l < prevLeft ? "left" : "right";
      blob.classList.add("is-moving");
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => blob.classList.remove("is-moving"), 220);
    }

    setBlobInsets(insets);
  }

  function setActive(item, animate = true) {
    if (item === current) return;
    placeBlob(item, animate);
    current?.link.removeAttribute("aria-current");
    item.link.setAttribute("aria-current", "location");
    current = item;
  }

  function activeFromScroll() {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) return items[items.length - 1];

    // The last section whose top has passed ~a third of the way down the viewport.
    // items[0] is the logo (#top), which wraps the whole page, so it's only the fallback.
    const probe = window.innerHeight * 0.35;
    let active = items[0];
    for (const item of items.slice(1)) {
      if (item.section.getBoundingClientRect().top <= probe) active = item;
    }
    return active;
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (lockedUntilScrollEnds || drag || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setActive(activeFromScroll());
      ticking = false;
    });
  }, { passive: true });

  // On click, glide straight to the destination instead of visiting every section in between.
  let unlockTimer;
  const unlock = () => {
    lockedUntilScrollEnds = false;
    setActive(activeFromScroll());
  };
  function goTo(item) {
    setActive(item);
    lockedUntilScrollEnds = true;
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(unlock, 1200); // fallback for browsers without scrollend
  }
  for (const item of items) {
    item.link.addEventListener("click", () => goTo(item));
  }
  window.addEventListener("scrollend", () => {
    if (!lockedUntilScrollEnds) return;
    clearTimeout(unlockTimer);
    unlock();
  });

  /* ---------- Dragging the blob ---------- */
  // Grab the blob and slide it along the bar: it reshapes to fit whichever link it passes over,
  // then snaps to the nearest one on release and scrolls to that section.
  let suppressClick = false;
  const lerp = (a, b, t) => a + (b - a) * t;

  nav.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !current) return;
    const box = blob.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return;

    const navBox = nav.getBoundingClientRect();
    const spots = items.map((item) => {
      const insets = insetsFor(item, navBox);
      const width = navBox.width - insets.l - insets.r;
      return { item, ...insets, width, center: insets.l + width / 2 };
    });
    const start = spots.find((spot) => spot.item === current);
    drag = { pointerId: e.pointerId, startX: e.clientX, navWidth: navBox.width, spots, center: start.center, moved: false, startCenter: start.center };
  });

  nav.addEventListener("pointermove", (e) => {
    if (e.pointerId !== drag?.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < 4) return; // still just a click
      drag.moved = true;
      nav.setPointerCapture(e.pointerId);
      nav.classList.add("is-dragging");
    }

    const { spots } = drag;
    const raw = drag.startCenter + dx;
    const clamped = Math.min(Math.max(raw, spots[0].center), spots[spots.length - 1].center);
    const center = clamped + (raw - clamped) * 0.2; // rubber-band a little past either end
    drag.center = center;

    // Blend the blob's size between the two links it's currently between.
    let i = 0;
    while (i < spots.length - 2 && center > spots[i + 1].center) i++;
    const a = spots[i];
    const b = spots[i + 1];
    const t = Math.min(Math.max((center - a.center) / (b.center - a.center), 0), 1);
    const width = lerp(a.width, b.width, t);
    setBlobInsets({
      l: center - width / 2,
      r: drag.navWidth - center - width / 2,
      t: lerp(a.t, b.t, t),
      b: lerp(a.b, b.b, t),
    });
  });

  function endDrag(e) {
    if (e.pointerId !== drag?.pointerId) return;
    const { moved, spots, center } = drag;
    drag = null;
    if (!moved) return;

    nav.classList.remove("is-dragging");
    // Swallow the click that follows the release so the link under the pointer doesn't also fire.
    suppressClick = true;
    setTimeout(() => (suppressClick = false));

    const nearest = spots.reduce((best, spot) =>
      Math.abs(spot.center - center) < Math.abs(best.center - center) ? spot : best).item;
    if (nearest === current) {
      placeBlob(current);
    } else {
      goTo(nearest);
      nearest.section.scrollIntoView();
    }
  }
  nav.addEventListener("pointerup", endDrag);
  nav.addEventListener("pointercancel", endDrag);
  nav.addEventListener("click", (e) => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // Stop the browser's native link dragging from hijacking the gesture.
  nav.addEventListener("dragstart", (e) => e.preventDefault());

  /* ---------- Layout ---------- */
  // Re-measure when the nav changes size (fonts loading, breakpoints, window resize).
  new ResizeObserver(() => {
    centreLabels();
    if (current) placeBlob(current, false);
  }).observe(nav);

  centreLabels();
  setActive(activeFromScroll(), false);
  // Enable transitions only after the first placement so the blob doesn't slide in from the corner.
  requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add("is-ready")));
})();

/* =========================================================
   Liquid-glass refraction for the nav and the social rail.
   Chromium is the only engine that applies SVG filters inside backdrop-filter;
   everywhere else the glass keeps the frosted fallback from styles.css.
   ========================================================= */
(() => {
  const supportsRefraction = !!window.chrome && !matchMedia("(prefers-reduced-transparency: reduce)").matches;
  if (!supportsRefraction) return;

  // Each glass surface gets its own filter, because the displacement map is drawn to its size.
  const surfaces = [
    { el: document.querySelector(".nav"), id: "nav-glass" },
    { el: document.querySelector(".social-rail"), id: "rail-glass" },
  ].filter((surface) => surface.el);

  // A lens filter: displaces the backdrop by a generated map, splitting red, green and blue
  // by slightly different amounts so the bent edges pick up a faint prism fringe.
  function lensFilter(id, scale) {
    const channel = (name, amount, matrix) => `
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${amount}" xChannelSelector="R" yChannelSelector="G" />
      <feColorMatrix type="matrix" values="${matrix}" result="${name}" />`;
    return `
      <filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feImage result="map" preserveAspectRatio="none" />
        ${channel("r", scale, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0")}
        ${channel("g", scale * 0.9, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0")}
        ${channel("b", scale * 0.8, "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0")}
        <feBlend in="r" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b" mode="screen" />
      </filter>`;
  }

  // Paints a displacement map for a pill of the given size: neutral grey in the middle,
  // pushing samples inward near the rim so the backdrop bends like the edge of a lens.
  function buildDisplacementMap(lensImage, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);

    const radius = Math.min(w, h) / 2;
    const band = radius * 0.8; // how far in from the rim the bending reaches
    const halfW = w / 2 - radius;
    const halfH = h / 2 - radius;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Distance in from the pill outline, and the outward normal at that point.
        const px = x + 0.5 - w / 2;
        const py = y + 0.5 - h / 2;
        const qx = Math.max(Math.abs(px) - halfW, 0);
        const qy = Math.max(Math.abs(py) - halfH, 0);
        const len = Math.hypot(qx, qy) || 1;
        const depth = radius - Math.hypot(qx, qy); // 0 at the rim, grows toward the centre
        const nx = (qx / len) * Math.sign(px);
        const ny = (qy / len) * Math.sign(py);

        const strength = depth < band ? (1 - Math.max(depth, 0) / band) ** 2 : 0;
        const i = (y * w + x) * 4;
        img.data[i] = 128 - nx * strength * 127;
        img.data[i + 1] = 128 - ny * strength * 127;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    lensImage.setAttribute("width", w);
    lensImage.setAttribute("height", h);
    lensImage.setAttribute("href", canvas.toDataURL());
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = surfaces.map(({ id }) => lensFilter(id, 56)).join("");
  document.body.append(svg);

  for (const { el, id } of surfaces) {
    const lensImage = svg.querySelector(`#${id} feImage`);
    // Redraw the map whenever the surface changes size (fonts loading, breakpoints, window resize).
    new ResizeObserver(([entry]) => {
      const { width, height } = entry.borderBoxSize?.[0]
        ? { width: entry.borderBoxSize[0].inlineSize, height: entry.borderBoxSize[0].blockSize }
        : el.getBoundingClientRect();
      buildDisplacementMap(lensImage, width, height);
    }).observe(el);
    el.classList.add("has-refraction");
  }
})();

/* =========================================================
   Social rail: flip each icon to the light-on-dark colour
   as the inverted footer slides in behind it.
   ========================================================= */
(() => {
  const rail = document.querySelector(".social-rail");
  const footer = document.querySelector(".footer");
  if (!rail || !footer) return;
  const icons = [...rail.querySelectorAll("a")];

  let ticking = false;
  function update() {
    const footerTop = footer.getBoundingClientRect().top;
    for (const icon of icons) {
      const box = icon.getBoundingClientRect();
      icon.classList.toggle("is-on-dark", footerTop < box.top + box.height / 2);
    }
    ticking = false;
  }
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
})();

/* =========================================================
   Contact chat: a short scripted conversation in the footer.
   It asks for a name, email, project type and a few details,
   then sends them to Formspree, which emails them to you.
   ========================================================= */
(() => {
  // Paste your Formspree form ID here: the part after /f/ in your form's endpoint,
  // e.g. "xyzabcde" from https://formspree.io/f/xyzabcde
  const FORMSPREE_ID = "xnpjpvpo";
  // Shown to visitors if sending fails.
  const CONTACT_EMAIL = "mikecona2@gmail.com";

  const chat = document.querySelector("[data-chat]");
  if (!chat) return;
  const log = chat.querySelector(".chat__log");
  // Quick-reply buttons ride at the end of the conversation, so they scroll with it.
  const choiceBar = document.createElement("li");
  choiceBar.className = "chat__choices";
  const form = chat.querySelector(".chat__form");
  const input = chat.querySelector(".chat__input");
  const send = chat.querySelector(".chat__send");

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms));

  function addBubble(content, from) {
    const bubble = document.createElement("li");
    bubble.className = `chat__msg chat__msg--${from}`;
    bubble.append(content);
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  // Mike's side: a typing indicator for a beat that scales with the message, then the message.
  async function say(...messages) {
    for (const message of messages) {
      const typing = addBubble("", "bot");
      typing.classList.add("is-typing");
      typing.setAttribute("aria-hidden", "true");
      typing.innerHTML = "<span></span><span></span><span></span>";
      const length = typeof message === "string" ? message.length : message.textContent.length;
      await wait(Math.min(450 + length * 16, 1400));
      typing.remove();
      addBubble(message, "bot");
      await wait(250);
    }
  }

  // The visitor's side. ask() waits for their next reply, typed or picked from the choice buttons.
  let pending = null;
  let interacted = false; // don't grab focus (and scroll the page) until they've joined in

  function ask({ placeholder = "Type your reply…", choices = [], choicesOnly = false, inputMode = "text" } = {}) {
    input.placeholder = choicesOnly ? "Pick an option above" : placeholder;
    input.inputMode = inputMode;
    input.disabled = choicesOnly;
    choiceBar.replaceChildren(...choices.map((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat__choice";
      button.textContent = label;
      button.addEventListener("click", () => reply(label));
      return button;
    }));
    if (choices.length) {
      log.append(choiceBar);
      log.scrollTop = log.scrollHeight;
    } else {
      choiceBar.remove();
    }
    if (interacted && !choicesOnly) input.focus({ preventScroll: true });
    updateSend();
    return new Promise((resolve) => (pending = resolve));
  }

  function reply(text) {
    text = text.trim();
    if (!pending || !text) return;
    const resolve = pending;
    pending = null;
    interacted = true;
    addBubble(text, "me");
    input.value = "";
    autosize();
    choiceBar.remove();
    updateSend();
    resolve(text);
  }

  function updateSend() {
    send.disabled = !pending || input.disabled || !input.value.trim();
  }
  function autosize() {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    reply(input.value);
  });
  // Enter sends, Shift+Enter adds a new line.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      reply(input.value);
    }
  });
  input.addEventListener("input", () => {
    autosize();
    updateSend();
  });

  async function askEmail() {
    for (;;) {
      const email = await ask({ placeholder: "name@email.com", inputMode: "email" });
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
      await say("Hmm, that doesn't look like an email address. Mind checking it?");
    }
  }

  async function submit(fields) {
    if (!FORMSPREE_ID) {
      console.warn("Contact chat: set FORMSPREE_ID in script.js to receive messages.");
      return false;
    }
    try {
      const response = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, _subject: `New project enquiry from ${fields.name}` }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function emailLink() {
    const link = document.createElement("a");
    link.href = `mailto:${CONTACT_EMAIL}`;
    link.textContent = CONTACT_EMAIL;
    const text = document.createElement("span");
    text.append("Sorry, something went wrong sending that. You can email me directly at ", link, ".");
    return text;
  }

  async function converse() {
    await say("Hello👋! Ready to move forward with your project?", "Let's start with your name...");
    const name = await ask({ placeholder: "Your name" });
    const firstName = name.split(/\s+/)[0];

    await say(`Awesome! It's good to meet you, ${firstName}!`, "What's a good email to reach you?");
    const email = await askEmail();

    await say("Fantastic. Now tell me about your project?");
    const project = await ask({ choices: ["Website (New)", "iOS App", "Website (Existing)", "Other"], placeholder: "Pick one or type your own" });

    await say("Great! Any details to add? What it's for, your timeline, budget, etc.");
    const message = await ask({ placeholder: "Tell me about your project" });

    await say("Alright. All set. Ready to send?");
    if ((await ask({ choices: ["Send it", "Start over"], choicesOnly: true })) === "Start over") return restart();

    for (;;) {
      const typing = say("Sending…");
      const [sent] = await Promise.all([submit({ name, email, project, message }), typing]);
      if (sent) {
        await say(`Alright all set, ${firstName}! You'll hear from me soon!`);
        break;
      }
      await say(emailLink());
      if ((await ask({ choices: ["Try again", "Start over"], choicesOnly: true })) === "Start over") return restart();
    }

    if ((await ask({ choices: ["Send another message"], choicesOnly: true }))) restart();
  }

  function restart() {
    log.replaceChildren();
    converse();
  }

  // Measure everything in the footer except the chat, plus the gap the "Say hi" jump leaves under the nav.
  // styles.css gives the chat the rest of the screen, so the landing spot is also the end of the page.
  const footer = chat.closest(".footer");
  function measureFooter() {
    const scrollPad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    footer.style.setProperty("--footer-rest", `${scrollPad + footer.offsetHeight - chat.offsetHeight}px`);
  }
  new ResizeObserver(measureFooter).observe(footer);

  // Start the conversation when the chat scrolls into view, not on page load.
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    converse();
  }, { threshold: 0.4 }).observe(chat);
})();
