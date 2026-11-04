// The fragment contains only an opaque one-use code and public state ID.
(() => {
  const values = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);
  const state = values.get("state"),
    code = values.get("code");
  if (
    !/^[a-f0-9]{64}$/.test(state || "") ||
    !/^[a-f0-9]{64}$/.test(code || "")
  ) {
    document.querySelector("p").textContent =
      "This Staff Access link is invalid or expired.";
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/nallin-sso/callback";
  for (const [name, value] of [
    ["state", state],
    ["code", code],
  ]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
})();
