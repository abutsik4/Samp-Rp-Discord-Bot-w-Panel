async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

function setResult(el, ok, msg) {
  el.textContent = msg;
  el.className = ok ? "result-message result-success" : "result-message result-error";
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 5000);
}

document.getElementById("msgSend").addEventListener("click", async () => {
  const channelId = document.getElementById("msgChannel").value.trim();
  const content = document.getElementById("msgContent").value;
  const el = document.getElementById("msgSendResult");
  try {
    const json = await postJSON(`/api/${window.BOT_KEY}/message/send`, { channelId, content });
    setResult(el, true, `Sent. Message ID: ${json.messageId}`);
  } catch (e) {
    setResult(el, false, `Error: ${e.message}`);
  }
});

document.getElementById("msgEdit").addEventListener("click", async () => {
  const channelId = document.getElementById("msgEditChannel").value.trim();
  const messageId = document.getElementById("msgEditId").value.trim();
  const content = document.getElementById("msgEditContent").value;
  const el = document.getElementById("msgEditResult");
  try {
    await postJSON(`/api/${window.BOT_KEY}/message/edit`, { channelId, messageId, content });
    setResult(el, true, "Updated.");
  } catch (e) {
    setResult(el, false, `Error: ${e.message}`);
  }
});

document.getElementById("embSend").addEventListener("click", async () => {
  const channelId = document.getElementById("embChannel").value.trim();
  const title = document.getElementById("embTitle").value;
  const description = document.getElementById("embDesc").value;
  const color = document.getElementById("embColor").value;
  const footer = document.getElementById("embFooter").value;
  const el = document.getElementById("embSendResult");
  try {
    const json = await postJSON(`/api/${window.BOT_KEY}/embed/send`, {
      channelId, title, description, color, footer
    });
    setResult(el, true, `Embed sent. Message ID: ${json.messageId}`);
  } catch (e) {
    setResult(el, false, `Error: ${e.message}`);
  }
});

document.getElementById("embEdit").addEventListener("click", async () => {
  const channelId = document.getElementById("embEditChannel").value.trim();
  const messageId = document.getElementById("embEditId").value.trim();
  const title = document.getElementById("embEditTitle").value;
  const description = document.getElementById("embEditDesc").value;
  const color = document.getElementById("embEditColor").value;
  const footer = document.getElementById("embEditFooter").value;
  const el = document.getElementById("embEditResult");
  try {
    await postJSON(`/api/${window.BOT_KEY}/embed/edit`, {
      channelId, messageId, title, description, color, footer
    });
    setResult(el, true, "Embed updated.");
  } catch (e) {
    setResult(el, false, `Error: ${e.message}`);
  }
});
