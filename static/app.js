const art = [
  "photo-1474511320723-9a56873867b5",
  "photo-1441974231531-c6227db57b76",
  "photo-1511497584788-876760111969",
  "photo-1470770841072-f978cf4d019e",
];

const sample = {
  title: "The Little Fox & the Lost Song",
  panels: [
    { title: "A sound in the roots", narration: "Pip heard a tiny tune beneath the oldest oak. It hummed like a secret waiting to be found.", image: `https://images.unsplash.com/${art[0]}?auto=format&fit=crop&w=960&q=85` },
    { title: "Down, down, deeper", narration: "Past the ferns and the foxglove bells, a golden glow danced in the dark.", image: `https://images.unsplash.com/${art[1]}?auto=format&fit=crop&w=960&q=85` },
    { title: "The forest orchestra", narration: "Mushroom drummers, beetle fiddlers, and crickets on the keys. The whole forest was making music!", image: `https://images.unsplash.com/${art[2]}?auto=format&fit=crop&w=960&q=85` },
    { title: "A song for everyone", narration: "Pip sang along. By morning, even the birds knew the tune by heart.", image: `https://images.unsplash.com/${art[3]}?auto=format&fit=crop&w=960&q=85` },
  ],
};

const form = document.querySelector("#comic-form");
const promptField = document.querySelector("#story-prompt");
const countLabel = document.querySelector("#character-count");
const grid = document.querySelector("#panel-grid");
const toast = document.querySelector("#toast");
let currentComic = structuredClone(sample);
let selectedTone = "Adventurous";
let toastTimer;

function icons() {
  window.lucide?.createIcons();
}

function renderComic(comic, mode = "SAMPLE COMIC") {
  currentComic = comic;
  document.querySelector("#comic-title").textContent = comic.title;
  document.querySelector("#panel-count").textContent = `${comic.panels.length} PANELS`;
  document.querySelector("#canvas-mode").textContent = mode;
  grid.replaceChildren(...comic.panels.map((panel, index) => {
    const card = document.createElement("article");
    card.className = "comic-panel";
    const imageBox = document.createElement("div");
    imageBox.className = "panel-image";
    const number = document.createElement("span");
    number.className = "panel-number";
    number.textContent = String(index + 1).padStart(2, "0");
    imageBox.append(number);
    if (panel.image) {
      const image = document.createElement("img");
      image.src = panel.image;
      image.alt = panel.image_prompt || `Illustration for ${panel.title}`;
      image.loading = index > 1 ? "lazy" : "eager";
      image.referrerPolicy = "no-referrer";
      imageBox.prepend(image);
    }
    const copy = document.createElement("div");
    copy.className = "panel-copy";
    const heading = document.createElement("h3");
    heading.textContent = panel.title;
    const narration = document.createElement("p");
    narration.textContent = panel.narration;
    copy.append(heading, narration);
    card.append(imageBox, copy);
    return card;
  }));
  icons();
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

function makeDemoComic(fields) {
  const hero = fields.character.trim() || "Pip";
  const place = fields.setting.trim() || "an enchanted forest";
  const idea = fields.prompt.trim().replace(/[.!?]+$/, "");
  const beats = [
    ["A curious beginning", `${hero} set off on a little adventure: ${idea}.`],
    ["Something unexpected", `Around a bend in ${place}, the world was more wonderful than ${hero} imagined.`],
    ["A clever idea", `One small, bright idea was all ${hero} needed to turn things around.`],
    ["Home, changed forever", `${hero} carried a brand-new story home. The best adventures always leave a little magic behind.`],
  ];
  return {
    title: `${hero} & the ${fields.tone.toLowerCase()} adventure`,
    panels: beats.map(([title, narration], index) => ({
      title,
      narration,
      image_prompt: `${fields.style} illustration of ${hero} in ${place}, panel ${index + 1}`,
      image: `https://images.unsplash.com/${art[index]}?auto=format&fit=crop&w=960&q=85`,
    })),
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector(".generate-button");
  const buttonText = button.querySelector("span");
  const fields = {
    prompt: promptField.value.trim(),
    character: form.elements.character.value,
    setting: form.elements.setting.value,
    tone: selectedTone,
    style: form.elements.style.value,
  };
  if (fields.prompt.length < 8) {
    notify("Give your story idea a few more details first.");
    promptField.focus();
    return;
  }

  button.disabled = true;
  buttonText.textContent = "Building your story...";
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!response.ok) throw new Error("demo");
    renderComic(await response.json(), "AI-GENERATED COMIC");
    notify("Your new comic is ready.");
  } catch {
    renderComic(makeDemoComic(fields), "DEMO PREVIEW");
    notify("Demo preview ready. Add your Gemini API key for live story generation.");
  } finally {
    button.disabled = false;
    buttonText.textContent = "Make my comic";
    icons();
  }
});

document.querySelectorAll(".tone-choices .choice").forEach((button) => {
  button.addEventListener("click", () => {
    selectedTone = button.dataset.tone;
    document.querySelectorAll(".tone-choices .choice").forEach((choice) => {
      choice.classList.toggle("is-selected", choice === button);
      choice.setAttribute("aria-pressed", String(choice === button));
    });
  });
});

promptField.addEventListener("input", () => {
  countLabel.textContent = `${promptField.value.length} / 1000`;
});

document.querySelector("#refresh-button").addEventListener("click", () => {
  renderComic(structuredClone(sample));
  notify("Sample comic restored.");
});

document.querySelector("#download-button").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: currentComic.title, panels: currentComic.panels }),
    });
    if (!response.ok) throw new Error("The PDF could not be created.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = `${currentComic.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "comiccraft-story"}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Your comic PDF is downloading.");
  } catch (error) {
    notify(error.message || "Start the ComicCraft server to export a PDF.");
  }
});

async function updateStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    if (status.gemini) {
      document.querySelector("#provider-status").textContent = status.images ? "GEMINI + IMAGE STUDIO" : "GEMINI STUDIO";
      document.querySelector("#canvas-mode").textContent = "READY TO CREATE";
    }
  } catch { /* The demo remains available without the API server. */ }
}

countLabel.textContent = `${promptField.value.length} / 1000`;
renderComic(sample);
updateStatus();