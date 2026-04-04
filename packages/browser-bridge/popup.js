// Popup status: check if native messaging host is reachable
(function () {
  const dot = document.getElementById("dot");
  const text = document.getElementById("status-text");

  chrome.runtime.sendMessage({ type: "bridge:get-status" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      text.textContent = "Wren not running";
      return;
    }
    if (resp.connected) {
      dot.classList.add("connected");
      text.textContent = `Connected · ${resp.windowCount} window${resp.windowCount !== 1 ? "s" : ""}`;
    } else {
      text.textContent = "Wren not running";
    }
  });
})();
