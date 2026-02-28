// options.js — ClaudeFox settings page

async function loadSettings() {
  const result = await browser.storage.sync.get(["apiKey", "model", "personality", "systemPrompt"]);

  if (result.apiKey) {
    document.getElementById("api-key").value = result.apiKey;
  }
  if (result.model) {
    document.getElementById("model-select").value = result.model;
  }
  // Load personality (fall back to legacy systemPrompt for existing users)
  if (result.personality) {
    document.getElementById("personality").value = result.personality;
  } else if (result.systemPrompt) {
    document.getElementById("personality").value = result.systemPrompt;
  }
}

async function saveSettings() {
  const apiKey = document.getElementById("api-key").value.trim();
  const model = document.getElementById("model-select").value;
  const personality = document.getElementById("personality").value.trim();
  const statusEl = document.getElementById("save-status");

  // Basic key format check
  if (apiKey && !apiKey.startsWith("sk-ant-")) {
    statusEl.textContent = "API key should start with sk-ant-";
    statusEl.className = "error";
    return;
  }

  try {
    await browser.storage.sync.set({ apiKey, model, personality });
    statusEl.textContent = "Saved.";
    statusEl.className = "success";
    setTimeout(function () {
      statusEl.textContent = "";
    }, 3000);
  } catch (err) {
    statusEl.textContent = "Save failed: " + err.message;
    statusEl.className = "error";
  }
}

document.getElementById("btn-save").addEventListener("click", saveSettings);
document.addEventListener("DOMContentLoaded", loadSettings);
