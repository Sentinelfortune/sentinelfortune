const crypto = require("node:crypto");

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "sentinel-fortune-editorial-corridor";
const REPOSITORY = "Sentinelfortune/sentinelfortune";
const REF = "refs/heads/feature/public-experience-v2";
const WORKFLOW_SUFFIX = "/.github/workflows/editorial-corridor.yml@" + REF;
const JWKS_URL = ISSUER + "/.well-known/jwks";

let jwksCache = { at: 0, keys: [] };

function parseJsonPart(part) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function jwks() {
  const now = Date.now();
  if (jwksCache.keys.length && now - jwksCache.at < 10 * 60 * 1000) {
    return jwksCache.keys;
  }
  const response = await fetch(JWKS_URL, {
    headers: { "User-Agent": "Sentinel-Fortune-Editorial-Corridor" },
  });
  if (!response.ok) throw new Error("github oidc jwks unavailable");
  const body = await response.json();
  const keys = Array.isArray(body && body.keys) ? body.keys : [];
  jwksCache = { at: now, keys };
  return keys;
}

function audienceMatches(aud) {
  if (typeof aud === "string") return aud === AUDIENCE;
  return Array.isArray(aud) && aud.includes(AUDIENCE);
}

async function verifyGitHubActionsToken(token) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = parseJsonPart(parts[0]);
  const payload = parseJsonPart(parts[1]);
  if (!header || !payload) return false;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false;

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== ISSUER) return false;
  if (!audienceMatches(payload.aud)) return false;
  if (payload.repository !== REPOSITORY) return false;
  if (payload.ref !== REF) return false;
  if (payload.sub !== "repo:" + REPOSITORY + ":ref:" + REF) return false;
  if (typeof payload.workflow_ref !== "string" || !payload.workflow_ref.endsWith(WORKFLOW_SUFFIX)) return false;
  if (typeof payload.exp !== "number" || payload.exp < now - 30) return false;
  if (typeof payload.nbf === "number" && payload.nbf > now + 30) return false;
  if (typeof payload.iat === "number" && payload.iat > now + 30) return false;

  const keys = await jwks();
  const jwk = keys.find((key) => key && key.kid === header.kid && key.kty === "RSA");
  if (!jwk) return false;

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    return false;
  }

  const signed = Buffer.from(parts[0] + "." + parts[1], "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  try {
    return crypto.verify("RSA-SHA256", signed, publicKey, signature);
  } catch {
    return false;
  }
}

module.exports = { verifyGitHubActionsToken };
