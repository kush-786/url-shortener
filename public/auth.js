const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSub = document.getElementById("authSub");
const authError = document.getElementById("authError");
const authButton = document.getElementById("authButton");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const toggleButton = document.getElementById("toggleButton");
const toggleText = document.getElementById("toggleText");

let mode = "login";

function setMode(next) {
  mode = next;
  const login = mode === "login";
  authTitle.textContent = login ? "Log in" : "Create account";
  authSub.textContent = login
    ? "Welcome back — manage your links."
    : "Create an account to save your links.";
  authButton.textContent = login ? "Log in" : "Sign up";
  toggleText.textContent = login ? "No account?" : "Already have an account?";
  toggleButton.textContent = login ? "Sign up" : "Log in";
  passwordInput.setAttribute("autocomplete", login ? "current-password" : "new-password");
  authError.hidden = true;
}

toggleButton.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

async function init() {
  const res = await fetch("/api/config");
  const config = await res.json();

  if (!config.authEnabled) {
    authError.textContent = "This server has auth disabled. Nothing to log into.";
    authError.hidden = false;
    authForm.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    return;
  }

  const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.hidden = true;
    authButton.disabled = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    authButton.disabled = false;

    if (error) {
      authError.textContent = error.message;
      authError.hidden = false;
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      location.href = "/";
    } else {
      authError.textContent = "Check your inbox to confirm your email, then log in.";
      authError.hidden = false;
    }
  });
}

init();