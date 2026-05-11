#!/usr/bin/env node

const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { basename, dirname, extname, join, resolve } = require("node:path");

const DEFAULT_API_URL = "http://localhost:4000";
const DEFAULT_USE_PRICE_IN_MERIT = 0.1;

function usage() {
  return `Merit Agent Access

Usage:
  node scripts/merit-agent.js login --wallet <wallet>
  node scripts/merit-agent.js status
  node scripts/merit-agent.js list [--status LISTED] [--query text] [--limit 20] [--offset 0]
  node scripts/merit-agent.js detail <skill-id-or-slug>
  node scripts/merit-agent.js upload <package.zip|package.tgz|package.tar.gz>
  node scripts/merit-agent.js submit --package-upload-id <id> [--creator-wallet <wallet>]
  node scripts/merit-agent.js submit-package <package.zip|package.tgz|package.tar.gz> [--creator-wallet <wallet>]
  node scripts/merit-agent.js use <skill-id-or-slug> [--wallet <wallet>] [--merit 0.1]
  node scripts/merit-agent.js download <skill-id-or-slug> --output <file-or-directory>
  node scripts/merit-agent.js whoami

Options:
  --api-url <url>       Merit API URL. Defaults to MERIT_API_URL or ${DEFAULT_API_URL}.
  --token <token>       Wallet session token. Defaults to MERIT_SESSION_TOKEN.
  --pretty              Pretty-print JSON output.

Environment:
  MERIT_API_URL
  MERIT_SESSION_TOKEN
`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];

    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }

    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    if (inlineValue != null) {
      options[key] = inlineValue;
      continue;
    }

    const next = rest[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return {
    command,
    positional,
    options
  };
}

function getApiUrl(options) {
  return String(options.apiUrl ?? process.env.MERIT_API_URL ?? DEFAULT_API_URL).replace(/\/+$/g, "");
}

function getToken(options, required = false) {
  const token = options.token ?? process.env.MERIT_SESSION_TOKEN;

  if (required && !token) {
    throw new Error("Missing wallet session token. Set MERIT_SESSION_TOKEN or pass --token.");
  }

  return token ? String(token) : undefined;
}

function decodeSessionToken(token) {
  const [, encodedPayload] = token.split(".");

  if (!encodedPayload) {
    throw new Error("Session token does not look like a Merit session token.");
  }

  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
}

function walletFromToken(options) {
  const token = getToken(options, true);
  const payload = decodeSessionToken(token);

  if (!payload.walletAddress) {
    throw new Error("Session token payload does not include walletAddress.");
  }

  return String(payload.walletAddress);
}

function output(value, options) {
  const spacing = options.pretty ? 2 : 0;
  process.stdout.write(`${JSON.stringify(value, null, spacing)}\n`);
}

function buildHeaders(options, extra = {}) {
  const headers = {
    ...extra
  };
  const token = getToken(options);

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function requestJson(apiUrl, path, options, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: buildHeaders(options, {
      accept: "application/json",
      ...(init.body == null ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {})
    })
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed with HTTP ${response.status}`);
  }

  return payload;
}

async function commandLogin(apiUrl, options) {
  const wallet = options.wallet;

  if (!wallet) {
    throw new Error("login requires --wallet <wallet-address>.");
  }

  const challenge = await requestJson(apiUrl, "/v1/auth/challenge", options, {
    method: "POST",
    body: JSON.stringify({
      walletAddress: wallet
    })
  });
  const verified = await requestJson(apiUrl, "/v1/auth/verify", options, {
    method: "POST",
    body: JSON.stringify({
      walletAddress: wallet,
      challenge: challenge.challenge,
      displayName: options.displayName
    })
  });

  return {
    ...verified,
    exportCommand: `export MERIT_SESSION_TOKEN=${verified.session.token}`
  };
}

async function commandStatus(apiUrl, options) {
  const [health, solanaConfig] = await Promise.all([
    requestJson(apiUrl, "/health", options),
    requestJson(apiUrl, "/v1/solana/config", options)
  ]);

  return {
    health,
    solanaConfig
  };
}

async function commandList(apiUrl, options) {
  const params = new URLSearchParams();

  if (options.status) {
    params.set("status", String(options.status));
  }

  if (options.query) {
    params.set("q", String(options.query));
  }

  if (options.category) {
    params.set("category", String(options.category));
  }

  params.set("limit", String(options.limit ?? 20));
  params.set("offset", String(options.offset ?? 0));

  return requestJson(apiUrl, `/v1/skills?${params.toString()}`, options);
}

async function commandDetail(apiUrl, options, skillId) {
  if (!skillId) {
    throw new Error("detail requires <skill-id-or-slug>.");
  }

  return requestJson(apiUrl, `/v1/skills/${encodeURIComponent(skillId)}`, options);
}

function contentTypeForArchive(path) {
  if (path.endsWith(".zip")) {
    return "application/zip";
  }

  if (path.endsWith(".tgz") || path.endsWith(".tar.gz")) {
    return "application/gzip";
  }

  throw new Error("Package must be .zip, .tgz, or .tar.gz.");
}

async function commandUpload(apiUrl, options, packagePath) {
  getToken(options, true);

  if (!packagePath) {
    throw new Error("upload requires a package archive path.");
  }

  const absolutePath = resolve(packagePath);
  const archive = await readFile(absolutePath);
  const form = new FormData();
  form.append("file", new Blob([archive], { type: contentTypeForArchive(absolutePath) }), basename(absolutePath));

  const response = await fetch(`${apiUrl}/v1/skills/package-upload`, {
    method: "POST",
    headers: buildHeaders(options, {
      accept: "application/json"
    }),
    body: form
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? `Upload failed with HTTP ${response.status}`);
  }

  return payload;
}

async function commandSubmit(apiUrl, options) {
  getToken(options, true);

  const packageUploadId = options.packageUploadId;

  if (!packageUploadId) {
    throw new Error("submit requires --package-upload-id <id>.");
  }

  const creatorWallet = options.creatorWallet ?? walletFromToken(options);

  return requestJson(apiUrl, "/v1/skills", options, {
    method: "POST",
    body: JSON.stringify({
      creatorWallet,
      packageUploadId,
      deliveryMode: "package_download"
    })
  });
}

async function commandSubmitPackage(apiUrl, options, packagePath) {
  const upload = await commandUpload(apiUrl, options, packagePath);
  const submitted = await commandSubmit(apiUrl, {
    ...options,
    packageUploadId: upload.packageUploadId
  });

  return {
    upload,
    submitted
  };
}

async function commandUse(apiUrl, options, skillId) {
  if (!skillId) {
    throw new Error("use requires <skill-id-or-slug>.");
  }

  const userWallet = options.wallet ?? walletFromToken(options);
  const meritPaid = Number(options.merit ?? DEFAULT_USE_PRICE_IN_MERIT);

  if (!Number.isFinite(meritPaid) || meritPaid <= 0) {
    throw new Error("--merit must be a positive number.");
  }

  return requestJson(apiUrl, `/v1/skills/${encodeURIComponent(skillId)}/use`, options, {
    method: "POST",
    body: JSON.stringify({
      userWallet,
      meritPaid
    })
  });
}

function filenameFromContentDisposition(value) {
  const match = value?.match(/filename="?([^";]+)"?/i);
  return match?.[1];
}

async function commandDownload(apiUrl, options, skillId) {
  getToken(options, true);

  if (!skillId) {
    throw new Error("download requires <skill-id-or-slug>.");
  }

  if (!options.output) {
    throw new Error("download requires --output <file-or-directory>.");
  }

  const response = await fetch(`${apiUrl}/v1/skills/${encodeURIComponent(skillId)}/package`, {
    headers: buildHeaders(options)
  });

  if (!response.ok) {
    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    throw new Error(payload?.message ?? `Download failed with HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = resolve(String(options.output));
  const outputLooksLikeDirectory = !extname(outputPath);
  const filename = filenameFromContentDisposition(response.headers.get("content-disposition")) ?? `${skillId}.zip`;
  const targetPath = outputLooksLikeDirectory ? join(outputPath, filename) : outputPath;

  await mkdir(dirname(targetPath), {
    recursive: true
  });
  await writeFile(targetPath, buffer);

  return {
    skillId,
    outputPath: targetPath,
    outputDirectory: dirname(targetPath),
    fileName: filename,
    bytes: buffer.length,
    contentType: response.headers.get("content-type") ?? undefined
  };
}

async function main() {
  const { command, positional, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || options.help) {
    process.stdout.write(usage());
    return;
  }

  const apiUrl = getApiUrl(options);
  let result;

  switch (command) {
    case "login":
      result = await commandLogin(apiUrl, options);
      break;
    case "status":
      result = await commandStatus(apiUrl, options);
      break;
    case "list":
      result = await commandList(apiUrl, options);
      break;
    case "detail":
      result = await commandDetail(apiUrl, options, positional[0]);
      break;
    case "upload":
      result = await commandUpload(apiUrl, options, positional[0]);
      break;
    case "submit":
      result = await commandSubmit(apiUrl, options);
      break;
    case "submit-package":
      result = await commandSubmitPackage(apiUrl, options, positional[0]);
      break;
    case "use":
      result = await commandUse(apiUrl, options, positional[0]);
      break;
    case "download":
      result = await commandDownload(apiUrl, options, positional[0]);
      break;
    case "whoami": {
      const token = getToken(options, true);
      result = decodeSessionToken(token);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  output(result, options);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
