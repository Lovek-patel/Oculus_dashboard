// Run this ONCE on your own machine (not in GitHub Actions) to get a refresh
// token for the sync script. Usage:
//
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-refresh-token.js
//
// It will print a URL — open it, sign in with the Google account whose
// calendar/tasks you want, approve access, and you'll be redirected to
// http://localhost:53682/?code=... Paste the FULL redirected URL back into
// the terminal when prompted. The script prints a refresh token at the end —
// save that as the GOOGLE_REFRESH_TOKEN secret in your GitHub repo.

const http = require("http");
const { google } = require("googleapis");

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:53682/";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
];

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // forces a refresh_token every time
  scope: SCOPES,
});

console.log("\nOpen this URL, sign in, and approve access:\n");
console.log(authUrl, "\n");

const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith("/?code=")) return;
    const code = new URL(req.url, REDIRECT_URI).searchParams.get("code");
    res.end("Got it — you can close this tab and go back to the terminal.");
    server.close();

    const { tokens } = await oauth2Client.getToken(code);
    console.log("\nRefresh token (save this as GOOGLE_REFRESH_TOKEN):\n");
    console.log(tokens.refresh_token);
    console.log("\nIf that printed 'undefined', revoke access at https://myaccount.google.com/permissions and run this script again.\n");
    process.exit(0);
  })
  .listen(53682);
