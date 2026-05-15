require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

const JOB_STORE_DIR = path.join(__dirname, ".ai_creator_runtime");
const JOB_STORE_FILE = path.join(JOB_STORE_DIR, "pending_image_jobs.json");

function ensureJobStoreDir() {
  try {
    fs.mkdirSync(JOB_STORE_DIR, { recursive: true });
  } catch {}
}

function readBackendJobs() {
  try {
    ensureJobStoreDir();
    const raw = fs.readFileSync(JOB_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBackendJobs(jobs) {
  try {
    ensureJobStoreDir();
    fs.writeFileSync(JOB_STORE_FILE, JSON.stringify(jobs || {}, null, 2));
  } catch {}
}

function saveBackendImageJob(clientJobId, patch) {
  if (!clientJobId) return;
  const jobs = readBackendJobs();
  const prev = jobs[clientJobId] || {};
  jobs[clientJobId] = {
    ...prev,
    ...patch,
    clientJobId,
    updatedAt: Date.now(),
    createdAt: prev.createdAt || patch.createdAt || Date.now(),
  };
  writeBackendJobs(jobs);
}

function getBackendImageJob(clientJobId) {
  if (!clientJobId) return null;
  const jobs = readBackendJobs();
  return jobs[clientJobId] || null;
}

function cleanupOldBackendJobs() {
  const jobs = readBackendJobs();
  const now = Date.now();
  let changed = false;

  for (const [key, job] of Object.entries(jobs)) {
    const age = now - Number(job.createdAt || job.updatedAt || 0);
    if (age > 24 * 60 * 60 * 1000) {
      delete jobs[key];
      changed = true;
    }
  }

  if (changed) writeBackendJobs(jobs);
}


const IMAGE_MODELS = {
  flux_kontext: {
    label: "FLUX.1 Kontext",
    apiVersion: "v1",
    modelId: "28aeddf8-bd19-4803-80fc-79602d1a9989",
    supportsImageReference: true,
    referenceMode: "contextImages",
    maxReferenceImages: 4,
    supportsStyles: true,
    supportsQuality: false,
  },
  nano_banana_2: {
    label: "Nano Banana 2",
    apiVersion: "v2",
    model: "nano-banana-2",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 6,
    supportsStyles: true,
    supportsQuality: false,
  },
  gpt_image_2: {
    label: "GPT Image 2",
    apiVersion: "v2",
    model: "gpt-image-2",
    supportsImageReference: true,
    referenceMode: "image_reference_no_strength",
    maxReferenceImages: 6,
    supportsStyles: false,
    supportsQuality: true,
  },
  nano_banana_pro: {
    label: "Nano Banana Pro",
    apiVersion: "v2",
    model: "gemini-image-2",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 6,
    supportsStyles: true,
    supportsQuality: false,
  },
  nano_banana: {
    label: "Nano Banana",
    apiVersion: "v2",
    model: "gemini-2.5-flash-image",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 6,
    supportsStyles: true,
    supportsQuality: false,
  },
  gpt_image_15: {
    label: "GPT Image-1.5",
    apiVersion: "v2",
    model: "gpt-image-1.5",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 6,
    supportsStyles: false,
    supportsQuality: true,
  },
  flux_2_pro: {
    label: "FLUX.2 Pro",
    apiVersion: "v2",
    model: "flux-pro-2.0",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 4,
    supportsStyles: true,
    supportsQuality: false,
  },
  seedream_45: {
    label: "Seedream 4.5",
    apiVersion: "v2",
    model: "seedream-4.5",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 6,
    supportsStyles: true,
    supportsQuality: false,
  },
  seedream_40: {
    label: "Seedream 4.0",
    apiVersion: "v2",
    model: "seedream-4.0",
    supportsImageReference: true,
    referenceMode: "image_reference",
    maxReferenceImages: 6,
    supportsStyles: true,
    supportsQuality: false,
  },
  lucid_origin: {
    label: "Lucid Origin",
    apiVersion: "v1",
    modelId: "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",
    supportsImageReference: false,
    referenceMode: null,
    maxReferenceImages: 0,
    supportsStyles: true,
    supportsQuality: false,
  },
  lucid_realism: {
    label: "Lucid Realism",
    apiVersion: "v1",
    modelId: "05ce0082-2d80-4a2d-8653-4d1c85e2418e",
    supportsImageReference: false,
    referenceMode: null,
    maxReferenceImages: 0,
    supportsStyles: true,
    supportsQuality: false,
  },
  phoenix_10: {
    label: "Phoenix 1.0",
    apiVersion: "v1",
    modelId: "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3",
    supportsImageReference: false,
    referenceMode: null,
    maxReferenceImages: 0,
    supportsStyles: true,
    supportsQuality: false,
  },
  flux_dev: {
    label: "Flux Dev",
    apiVersion: "v1",
    modelId: "b2614463-296c-462a-9586-aafdb8f00e36",
    supportsImageReference: false,
    referenceMode: null,
    maxReferenceImages: 0,
    supportsStyles: true,
    supportsQuality: false,
  },
  flux_schnell: {
    label: "Flux Schnell",
    apiVersion: "v1",
    modelId: "1dd50843-d653-4516-a8e3-f0238ee453ff",
    supportsImageReference: false,
    referenceMode: null,
    maxReferenceImages: 0,
    supportsStyles: true,
    supportsQuality: false,
  },
  phoenix_09: {
    label: "Phoenix 0.9",
    apiVersion: "v1",
    modelId: "6b645e3a-d64f-4341-a6d8-7a3690fbf042",
    supportsImageReference: false,
    referenceMode: null,
    maxReferenceImages: 0,
    supportsStyles: true,
    supportsQuality: false,
  },
};

const LEONARDO_V1_VALID_SIZE_PAIRS = [
  [1024, 1024],
  [1456, 720],
  [720, 1456],
  [1248, 832],
  [832, 1248],
  [1184, 880],
  [880, 1184],
  [1104, 944],
  [944, 1104],
  [1568, 672],
  [672, 1568],
  [1392, 752],
  [752, 1392],
];

const LEONARDO_V1_RATIO_SIZES = {
  "1:1": [1024, 1024],
  "9:16": [752, 1392],
  "16:9": [1392, 752],
  "2:3": [832, 1248],
  "3:2": [1248, 832],
};

function sanitizeImageDimensions(width, height) {
  const rawWidth = Number(width) || 1024;
  const rawHeight = Number(height) || 1024;

  const exactPair = LEONARDO_V1_VALID_SIZE_PAIRS.find(
    ([validWidth, validHeight]) => validWidth === rawWidth && validHeight === rawHeight
  );

  if (exactPair) {
    return { width: exactPair[0], height: exactPair[1] };
  }

  const requestedRatio = rawWidth / rawHeight;
  const best = LEONARDO_V1_VALID_SIZE_PAIRS.reduce((winner, size) => {
    const winnerDiff = Math.abs(winner[0] / winner[1] - requestedRatio);
    const sizeDiff = Math.abs(size[0] / size[1] - requestedRatio);
    return sizeDiff < winnerDiff ? size : winner;
  }, LEONARDO_V1_RATIO_SIZES["1:1"]);

  return { width: best[0], height: best[1] };
}

const VIDEO_MODELS = {
  motion2: {
    apiModel: "MOTION2",
    apiVersion: "v1",
    supportsText: true,
    supportsEndFrame: false,
  },
  motion2fast: {
    apiModel: "MOTION2FAST",
    apiVersion: "v1",
    supportsText: true,
    supportsEndFrame: false,
  },
  veo3: {
    apiModel: "VEO3",
    apiVersion: "v1",
    supportsText: false,
    supportsEndFrame: false,
  },
  veo3fast: {
    apiModel: "VEO3FAST",
    apiVersion: "v1",
    supportsText: false,
    supportsEndFrame: false,
  },
  veo31: {
    apiModel: "VEO3_1",
    apiVersion: "v1",
    supportsText: false,
    supportsEndFrame: true,
  },
  veo31fast: {
    apiModel: "VEO3_1FAST",
    apiVersion: "v1",
    supportsText: false,
    supportsEndFrame: true,
  },
  kling21: {
    apiModel: "KLING2_1",
    apiVersion: "v1",
    supportsText: false,
    supportsEndFrame: true,
  },
  kling25: {
    apiModel: "Kling2_5",
    apiVersion: "v1",
    supportsText: false,
    supportsEndFrame: true,
  },
  hailuo23: {
    apiModel: "hailuo-2_3",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: false,
  },
  hailuo23fast: {
    apiModel: "hailuo-2_3-fast",
    apiVersion: "v2",
    supportsText: false,
    supportsEndFrame: false,
  },
  kling26: {
    apiModel: "kling-2.6",
    apiVersion: "v2",
    supportsText: false,
    supportsEndFrame: false,
  },
  kling30: {
    apiModel: "kling-3.0",
    apiVersion: "v2",
    supportsText: false,
    supportsEndFrame: true,
  },
  klingo1: {
    apiModel: "kling-video-o-1",
    apiVersion: "v2",
    supportsText: false,
    supportsEndFrame: true,
  },
  klingo3: {
    apiModel: "kling-video-o-3",
    apiVersion: "v2",
    supportsText: false,
    supportsEndFrame: true,
  },
  ltx23pro: {
    apiModel: "ltxv-2.3-pro",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: true,
  },
  ltx23fast: {
    apiModel: "ltxv-2.3-fast",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: true,
  },
  seedance10lite: {
    apiModel: "seedance-1.0-lite",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: true,
  },
  seedance10pro: {
    apiModel: "seedance-1.0-pro",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: true,
  },
  seedance20: {
    apiModel: "seedance-2.0",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: true,
  },
  seedance20fast: {
    apiModel: "seedance-2.0-fast",
    apiVersion: "v2",
    supportsText: true,
    supportsEndFrame: true,
  },
};

function getApiKey(req) {
  const key = req.headers["x-leonardo-key"] || process.env.LEONARDO_API_KEY;

  if (!key || !String(key).trim()) {
    const error = new Error("API Key Leonardo belum diisi.");
    error.statusCode = 401;
    throw error;
  }

  return String(key).trim();
}

function leoHeaders(apiKey) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

async function leoGet(apiKey, path, paramsOrTimeout = undefined, maybeTimeout = 120000) {
  const params =
    paramsOrTimeout && typeof paramsOrTimeout === "object" && !Array.isArray(paramsOrTimeout)
      ? paramsOrTimeout
      : undefined;

  const timeout = typeof paramsOrTimeout === "number" ? paramsOrTimeout : maybeTimeout;

  return axios.get(`${LEONARDO_BASE}${path}`, {
    headers: leoHeaders(apiKey),
    timeout,
    params,
  });
}

async function leoPost(apiKey, path, body) {
  const response = await axios.post(`https://cloud.leonardo.ai/api/rest${path}`, body, {
    headers: leoHeaders(apiKey),
    timeout: 120000,
    maxBodyLength: Infinity,
    validateStatus: () => true,
  });

  const raw = response?.data;

  if (response.status >= 400) {
    const error = new Error(
      raw?.error ||
        raw?.message ||
        raw?.detail ||
        `Request gagal dengan status ${response.status}`
    );

    error.statusCode = response.status;
    error.leonardoError = raw;
    error.debug = {
      path,
      status: response.status,
      raw,
    };

    throw error;
  }

  if (raw == null) {
    const error = new Error("Response API kosong.");
    error.statusCode = 502;
    error.leonardoError = {
      error: "empty-response",
      path,
      code: "empty-response",
    };
    error.debug = raw;
    throw error;
  }

  if (raw?.data && typeof raw.data === "object") {
    return {
      ...raw,
      data: raw.data,
    };
  }

  if (raw?.error || raw?.errors) {
    const error = new Error("Response API berisi error.");
    error.statusCode = 400;
    error.leonardoError = raw;
    error.debug = raw;
    throw error;
  }

  return {
    ok: true,
    data: raw,
    raw,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGenerationId(data) {
  const list = [
    data?.generate?.generationId,
    data?.generationId,
    data?.generation_id,
    data?.id,
    data?.jobId,
    data?.job_id,
    data?.taskId,
    data?.task_id,
    data?.data?.id,
    data?.data?.generationId,
    data?.data?.generation_id,
    data?.sdGenerationJob?.generationId,
    data?.sdGenerationJob?.id,
    data?.generation?.id,
    data?.generation?.generationId,
    data?.request?.id,
    data?.result?.id,
  ];

  return list.find((item) => typeof item === "string" && item.length > 8) || null;
}

function getStatus(data) {
  const directStatus =
    data?.status ||
    data?.generationStatus ||
    data?.state ||
    data?.sdGenerationJob?.status ||
    data?.sdGenerationJob?.generationStatus ||
    data?.generation?.status ||
    data?.generation?.generationStatus ||
    data?.generations_by_pk?.status ||
    data?.generations_by_pk?.generationStatus ||
    data?.data?.status ||
    data?.data?.generationStatus ||
    data?.data?.state ||
    data?.result?.status ||
    data?.result?.generationStatus ||
    "";

  if (directStatus) return String(directStatus).toUpperCase();

  let found = "";

  function walk(obj) {
    if (found || !obj || typeof obj !== "object") return;

    Object.entries(obj).forEach(([key, value]) => {
      if (found) return;

      const k = key.toLowerCase();

      if (
        typeof value === "string" &&
        (k.includes("status") || k === "state")
      ) {
        found = value;
        return;
      }

      if (value && typeof value === "object") {
        walk(value);
      }
    });
  }

  walk(data);

  return String(found || "").toUpperCase();
}

function isFailedStatus(status) {
  const s = String(status || "").toLowerCase();

  return (
    s.includes("fail") ||
    s.includes("error") ||
    s.includes("cancel") ||
    s.includes("reject") ||
    s.includes("blocked") ||
    s.includes("unsafe") ||
    s.includes("moderat") ||
    s.includes("policy")
  );
}

function normalizeImages(data) {
  const results = [];
  const seen = new Set();

  function add(item) {
    if (!item || typeof item !== "object") return;

    const url =
      item.url ||
      item.imageUrl ||
      item.image_url ||
      item.uri ||
      item.src ||
      item.output_url;

    if (!url || String(url).includes(".mp4") || seen.has(url)) return;

    seen.add(url);

    results.push({
      id: item.id || item.imageId || item.image_id || null,
      url,
      raw: item,
    });
  }

  function walk(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      add(value);
      Object.values(value).forEach(walk);
    }
  }

  walk(data);

  return results;
}

function normalizeVideos(data) {
  const results = [];
  const seen = new Set();

  function add(item) {
    if (!item || typeof item !== "object") return;

    const url =
      item.motionMP4URL ||
      item.motion_mp4_url ||
      item.videoUrl ||
      item.video_url ||
      item.mp4Url ||
      item.mp4_url ||
      item.url;

    if (!url || !String(url).includes(".mp4") || seen.has(url)) return;

    seen.add(url);

    results.push({
      id: item.id || item.videoId || item.video_id || null,
      url,
      raw: item,
    });
  }

  function walk(value) {
    if (!value) return;

    if (typeof value === "string" && value.includes(".mp4")) {
      if (!seen.has(value)) {
        seen.add(value);
        results.push({
          id: null,
          url: value,
          raw: value,
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      add(value);
      Object.values(value).forEach(walk);
    }
  }

  walk(data);

  return results;
}

async function fetchGenerationSnapshot(apiKey, generationId, type = "image", expectedCount = 1) {
  try {
    const response = await leoGet(
      apiKey,
      `/v1/generations/${generationId}`,
      undefined,
      120000
    );

    const payload = response.data || {};
    const status = String(getStatus(payload) || "PENDING").toUpperCase();

    return {
      status,
      images: type === "image" ? normalizeImages(payload, expectedCount) : [],
      videos: type === "video" ? normalizeVideos(payload) : [],
      raw: payload,
    };
  } catch (error) {
    const responseData = error?.response?.data || {};
    const status = String(getStatus(responseData) || "").toUpperCase();

    if (status && isFailedStatus(status)) {
      return {
        status,
        images: [],
        videos: [],
        raw: responseData,
      };
    }

    throw error;
  }
}

async function pollGeneration(apiKey, generationId, type = "image", preferredVersion = "v2", expectedCount = 1) {
  let last = {
    status: "PENDING",
    images: [],
    videos: [],
    raw: null,
  };

  for (let attempt = 0; attempt < 36; attempt += 1) {
    last = await fetchGenerationSnapshot(apiKey, generationId, type, expectedCount);
    const status = String(last.status || "").toUpperCase();

    if (type === "image" && last.images.length >= expectedCount) {
      return last;
    }

    if (type === "video" && last.videos.length > 0) {
      return last;
    }

    if (isFailedStatus(status)) {
      return last;
    }

    await sleep(2500);
  }

  return last;
}

const activeImagePolls = new Map();

async function startBackgroundImageJobMonitor(apiKey, clientJobId) {
  if (!apiKey || !clientJobId) return null;
  if (activeImagePolls.has(clientJobId)) return activeImagePolls.get(clientJobId);

  const task = (async () => {
    try {
      const job = getBackendImageJob(clientJobId);
      if (!job?.generationId) return null;

      const expectedCount = Math.max(1, Math.min(4, Number(job.expectedCount || 1)));
      const result = await pollGeneration(apiKey, job.generationId, "image", job.apiVersion || "v2", expectedCount);
      const status = String(result.status || "").toUpperCase();

      if (result.images.length >= expectedCount) {
        saveBackendImageJob(clientJobId, {
          status: "COMPLETE",
          images: result.images,
          raw: result.raw,
        });
        return result;
      }

      if (isFailedStatus(status)) {
        saveBackendImageJob(clientJobId, {
          status,
          raw: result.raw,
          error: "Generate gambar gagal di Leonardo.",
        });
        return result;
      }

      saveBackendImageJob(clientJobId, {
        status,
        raw: result.raw,
      });

      return result;
    } catch (error) {
      console.error("Background image monitor error:", error?.response?.data || error.message);
      return null;
    } finally {
      activeImagePolls.delete(clientJobId);
    }
  })();

  activeImagePolls.set(clientJobId, task);
  return task;
}

function fileExtension(file) {
  const fromName = file.originalname?.split(".").pop()?.toLowerCase();

  if (["png", "jpg", "jpeg", "webp"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (file.mimetype?.includes("png")) return "png";
  if (file.mimetype?.includes("webp")) return "webp";

  return "jpg";
}

function parseInitUpload(data) {
  const info =
    data?.uploadInitImage ||
    data?.upload_init_image ||
    data?.initImage ||
    data?.init_image ||
    data?.data?.uploadInitImage ||
    data?.data?.upload_init_image ||
    data;

  let fields = info?.fields || info?.formFields || info?.form_fields || {};

  if (typeof fields === "string") {
    fields = JSON.parse(fields);
  }

  const url =
    info?.url ||
    info?.uploadUrl ||
    info?.upload_url ||
    info?.presignedUrl ||
    info?.presigned_url;

  const imageId =
    info?.id ||
    info?.imageId ||
    info?.image_id ||
    info?.initImageId ||
    info?.init_image_id;

  if (!url || !imageId) {
    const error = new Error("Response upload Leonardo tidak lengkap.");
    error.debug = data;
    throw error;
  }

  return {
    url,
    fields,
    imageId,
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Backend AI Creator Studio aktif.",
  });
});

app.post("/api/check-key", async (req, res, next) => {
  try {
    const apiKey = getApiKey(req);

    await leoGet(apiKey, "/v1/platformModels");

    res.json({
      ok: true,
      message: "API Key valid",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/upload-init-image", upload.single("file"), async (req, res, next) => {
  try {
    const apiKey = getApiKey(req);
    const file = req.file;

    if (!file) {
      const error = new Error("File gambar belum dipilih.");
      error.statusCode = 400;
      throw error;
    }

    const extension = fileExtension(file);

    const initResponse = await leoPost(apiKey, "/v1/init-image", {
      extension,
    });

    const { url, fields, imageId } = parseInitUpload(initResponse.data);

    const form = new FormData();

    Object.entries(fields || {}).forEach(([key, value]) => {
      form.append(key, value);
    });

    form.append("file", file.buffer, {
      filename: file.originalname || `upload.${extension}`,
      contentType: file.mimetype || `image/${extension}`,
    });

    await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      timeout: 120000,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    res.json({
      ok: true,
      imageId,
      imageType: "UPLOADED",
      filename: file.originalname,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/download-image", async (req, res, next) => {
  try {
    const imageUrl = String(req.query.url || "");

    if (!imageUrl || !imageUrl.startsWith("https://cdn.leonardo.ai/")) {
      const error = new Error("URL gambar Leonardo tidak valid.");
      error.statusCode = 400;
      throw error;
    }

    const filename = `leonardo-image-${Date.now()}.jpg`;

    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
    });

    res.setHeader("Content-Type", response.headers["content-type"] || "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(response.data));
  } catch (error) {
    next(error);
  }
});

app.get("/api/download-file", async (req, res, next) => {
  try {
    const fileUrl = String(req.query.url || "").trim();
    const fallbackName = String(req.query.filename || `ai-creator-squad-${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-");

    if (!fileUrl) {
      const error = new Error("URL file wajib diisi.");
      error.statusCode = 400;
      throw error;
    }

    let parsed;
    try {
      parsed = new URL(fileUrl);
    } catch {
      const error = new Error("URL file tidak valid.");
      error.statusCode = 400;
      throw error;
    }

    if (parsed.protocol !== "https:") {
      const error = new Error("Hanya URL HTTPS yang diizinkan.");
      error.statusCode = 400;
      throw error;
    }

    const response = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      maxRedirects: 5,
    });

    const contentType = response.headers["content-type"] || "application/octet-stream";
    const dispositionName = fallbackName.includes(".")
      ? fallbackName
      : `${fallbackName}${contentType.includes("mp4") ? ".mp4" : contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : contentType.includes("jpeg") ? ".jpg" : ""}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${dispositionName}"`);
    res.send(Buffer.from(response.data));
  } catch (error) {
    next(error);
  }
});

app.post("/api/generate-image", async (req, res, next) => {
  try {
    const apiKey = getApiKey(req);
    const body = req.body || {};
    const modelKey = String(body.modelKey || "flux_kontext");
    const selectedModel = IMAGE_MODELS[modelKey] || IMAGE_MODELS.flux_kontext;
    const prompt = String(body.prompt || "").trim();

    if (!prompt) {
      const error = new Error("Prompt gambar wajib diisi.");
      error.statusCode = 400;
      throw error;
    }

    const requestedWidth = Math.max(256, Number(body.width || 1024));
    const requestedHeight = Math.max(256, Number(body.height || 1024));
    const quantity = Math.max(1, Math.min(4, Number(body.quantity || 1)));
    const styleId = String(body.styleId || "none").trim() || "none";
    const quality = String(body.quality || "MEDIUM").toUpperCase();
    const promptEnhance = String(body.promptEnhance || "OFF").toUpperCase() === "ON" ? "ON" : "OFF";
    const referenceStrength = ["LOW", "MID", "HIGH"].includes(String(body.referenceStrength || "MID").toUpperCase())
      ? String(body.referenceStrength || "MID").toUpperCase()
      : "MID";
    const clientJobId = String(body.clientJobId || "").trim() || null;
    const referenceImageIds = Array.isArray(body.referenceImageIds)
      ? body.referenceImageIds.filter(Boolean).slice(0, selectedModel.maxReferenceImages || 0)
      : [];

    if (clientJobId) {
      saveBackendImageJob(clientJobId, {
        type: "image",
        status: "CREATING",
        generationId: null,
        expectedCount: quantity,
        modelKey,
        apiVersion: selectedModel.apiVersion || "v1",
      });
    }

    let createResponse;

    if ((selectedModel.apiVersion || "v1") === "v2") {
      const parameters = {
        prompt,
        width: requestedWidth,
        height: requestedHeight,
        quantity,
        prompt_enhance: promptEnhance,
      };

      if (selectedModel.supportsQuality) {
        parameters.quality = ["LOW", "MEDIUM", "HIGH"].includes(quality) ? quality : "MEDIUM";
      }

      if (selectedModel.supportsStyles && styleId && styleId !== "none") {
        parameters.style_ids = [styleId];
      }

      if (selectedModel.supportsImageReference && referenceImageIds.length) {
        parameters.guidances = {
          image_reference: referenceImageIds.map((imageId) => {
            const item = {
              image: {
                id: imageId,
                type: "UPLOADED",
              },
            };
            if (selectedModel.referenceMode !== "image_reference_no_strength") {
              item.strength = referenceStrength;
            }
            return item;
          }),
        };
      }

      createResponse = await leoPost(apiKey, "/v2/generations", {
        public: true,
        model: selectedModel.model,
        parameters,
      });
    } else {
      const safeDimensions = sanitizeImageDimensions(requestedWidth, requestedHeight);
      const payload = {
        prompt,
        width: safeDimensions.width,
        height: safeDimensions.height,
        num_images: quantity,
        modelId: selectedModel.modelId,
        alchemy: false,
        promptMagic: false,
        public: true,
        contrast: 3.5,
        enhancePrompt: false,
      };

      if (selectedModel.supportsStyles && styleId && styleId !== "none") {
        payload.styleUUID = styleId;
      }

      if (selectedModel.supportsImageReference && referenceImageIds.length) {
        payload.contextImages = referenceImageIds.slice(0, selectedModel.maxReferenceImages || 4).map((id) => ({
          id,
          type: "UPLOADED",
        }));
      }

      createResponse = await leoPost(apiKey, "/v1/generations", payload);
    }

    const generationId = getGenerationId(createResponse.data);
    const directImages = normalizeImages(createResponse.data, quantity);

    if (clientJobId) {
      saveBackendImageJob(clientJobId, {
        status: directImages.length >= quantity ? "COMPLETE" : "PENDING",
        generationId,
        expectedCount: quantity,
        images: directImages.length ? directImages : undefined,
        raw: createResponse.data,
        apiVersion: selectedModel.apiVersion || "v1",
      });

      if (generationId && directImages.length < quantity) {
        startBackgroundImageJobMonitor(apiKey, clientJobId).catch(() => {});
      }
    }

    res.json({
      ok: true,
      clientJobId: clientJobId || undefined,
      generationId,
      status: directImages.length >= quantity ? "COMPLETE" : "PENDING",
      images: directImages,
      expectedCount: quantity,
      raw: createResponse.data,
      apiVersion: selectedModel.apiVersion || "v1",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/client-image-job/:clientJobId", async (req, res, next) => {
  try {
    cleanupOldBackendJobs();
    const apiKey = getApiKey(req);
    const clientJobId = String(req.params.clientJobId || "").trim();

    if (!clientJobId) {
      const error = new Error("Client job ID wajib diisi.");
      error.statusCode = 400;
      throw error;
    }

    let job = getBackendImageJob(clientJobId);

    if (!job) {
      return res.json({
        ok: true,
        found: false,
        clientJobId,
        status: "PENDING",
        generationId: null,
        expectedCount: 1,
        images: [],
        error: null,
        raw: null,
        updatedAt: new Date().toISOString(),
        createdAt: null,
        apiVersion: null,
      });
    }

    const expectedCount = Math.max(1, Math.min(4, Number(job.expectedCount || 1)));
    const normalizedStatus = String(job.status || "PENDING").toUpperCase();

    if (job.generationId && normalizedStatus !== "COMPLETE" && !isFailedStatus(normalizedStatus)) {
      const snapshot = await fetchGenerationSnapshot(apiKey, job.generationId, "image", expectedCount);
      const snapshotStatus = String(snapshot.status || "PENDING").toUpperCase();

      if (snapshot.images.length >= expectedCount) {
        saveBackendImageJob(clientJobId, {
          status: "COMPLETE",
          images: snapshot.images,
          raw: snapshot.raw,
        });
      } else if (isFailedStatus(snapshotStatus)) {
        saveBackendImageJob(clientJobId, {
          status: snapshotStatus,
          raw: snapshot.raw,
          error: "Generate gambar gagal di Leonardo.",
        });
      } else {
        startBackgroundImageJobMonitor(apiKey, clientJobId).catch(() => {});
      }

      job = getBackendImageJob(clientJobId) || job;
    }

    return res.json({
      ok: true,
      found: true,
      clientJobId,
      status: job.status || "PENDING",
      generationId: job.generationId || null,
      expectedCount: job.expectedCount || 1,
      images: Array.isArray(job.images) ? job.images : [],
      error: job.error || null,
      raw: job.raw || null,
      updatedAt: job.updatedAt || null,
      createdAt: job.createdAt || null,
      apiVersion: job.apiVersion || null,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/generation-status/:type/:generationId", async (req, res, next) => {
  try {
    const apiKey = getApiKey(req);
    const { type, generationId } = req.params;
    const expectedCount = Math.min(
  4,
  Math.max(1, Number(req.query.quantity || req.query.count || 1))
);

    if (!generationId) {
      const error = new Error("Generation ID wajib diisi.");
      error.statusCode = 400;
      throw error;
    }

    if (!["image", "video"].includes(type)) {
      const error = new Error("Type generation tidak valid.");
      error.statusCode = 400;
      throw error;
    }

    const final = await pollGeneration(
  apiKey,
  generationId,
  type,
  "v2",
  type === "image" ? expectedCount : 1
);

    res.json({
      ok: true,
      generationId,
      status: final.status,
      images: final.images,
      videos: final.videos,
      raw: final.raw,
    });
  } catch (error) {
    next(error);
  }
});

function buildV1VideoPayload(body, spec) {
  const {
    prompt,
    negativePrompt,
    resolution = "RESOLUTION_1080",
    width = 1080,
    height = 1920,
    duration = 8,
    startImageId,
    endImageId,
    promptEnhance = "OFF",
    frameInterpolation = true,
  } = body || {};

  const payload = {
    prompt: String(prompt || "").trim(),
    model: spec.apiModel,
    resolution,
    width: Number(width),
    height: Number(height),
    duration: Number(duration),
    isPublic: true,
  };

  if (negativePrompt) {
    payload.negativePrompt = negativePrompt;
  }

  if (startImageId) {
    payload.imageId = startImageId;
    payload.imageType = "UPLOADED";
  }

  if (endImageId && spec.supportsEndFrame) {
    payload.endFrameImage = {
      id: endImageId,
      type: "UPLOADED",
    };
  }

  return payload;
}

function buildV2VideoPayload(body, spec) {
  const {
    prompt,
    resolution = "RESOLUTION_1080",
    width = 1080,
    height = 1920,
    duration = 8,
    startImageId,
    endImageId,
    promptEnhance = "OFF",
    audio = true,
  } = body || {};

  const parameters = {
    prompt: String(prompt || "").trim(),
    mode: resolution,
    prompt_enhance: promptEnhance || "OFF",
    quantity: 1,
    duration: Number(duration),
    width: Number(width),
    height: Number(height),
    audio: Boolean(audio),
    motion_has_audio: Boolean(audio),
  };

  if (startImageId) {
    parameters.guidances = {
      start_frame: [
        {
          image: {
            id: startImageId,
            type: "UPLOADED",
          },
        },
      ],
    };

    if (endImageId && spec.supportsEndFrame) {
      parameters.guidances.end_frame = [
        {
          image: {
            id: endImageId,
            type: "UPLOADED",
          },
        },
      ];
    }
  }

  return {
    model: spec.apiModel,
    public: true,
    parameters,
  };
}

app.post("/api/generate-video", async (req, res, next) => {
  try {
    const apiKey = getApiKey(req);

    const { prompt, modelKey = "veo3", startImageId } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      const error = new Error("Prompt video wajib diisi.");
      error.statusCode = 400;
      throw error;
    }

    const spec = VIDEO_MODELS[modelKey];

    if (!spec) {
      const error = new Error(`Model video tidak dikenal: ${modelKey}`);
      error.statusCode = 400;
      throw error;
    }

    if (!startImageId && !spec.supportsText) {
      const error = new Error(`Model ${spec.apiModel} membutuhkan start frame.`);
      error.statusCode = 400;
      throw error;
    }

    let createResponse;
    let payload;

    if (spec.apiVersion === "v1") {
      payload = buildV1VideoPayload(req.body, spec);

      const endpoint = startImageId
        ? "/v1/generations-image-to-video"
        : "/v1/generations-text-to-video";

      createResponse = await leoPost(apiKey, endpoint, payload);
    } else {
      payload = buildV2VideoPayload(req.body, spec);
      createResponse = await leoPost(apiKey, "/v2/generations", payload);
    }

    const directVideos = normalizeVideos(createResponse.data);

    if (directVideos.length > 0) {
      return res.json({
        ok: true,
        generationId: getGenerationId(createResponse.data),
        videos: directVideos,
        raw: createResponse.data,
      });
    }

    const generationId = getGenerationId(createResponse.data);

    if (!generationId) {
      return res.status(502).json({
        ok: false,
        message:
          "Leonardo tidak mengirim generation ID video. Cek akses model, limit akun, atau payload.",
        raw: createResponse.data,
        sentPayload: payload,
      });
    }

    const final = await pollGeneration(
      apiKey,
      generationId,
      "video",
      spec.apiVersion === "v2" ? "v2" : "v1"
    );

    res.json({
      ok: true,
      generationId,
      status: final.status,
      videos: final.videos,
      raw: final.raw,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  const status = error.statusCode || error.response?.status || 500;
  const leonardoError = error.response?.data;

  console.error("Backend error:", {
  method: req.method,
  path: req.originalUrl,
  status,
  message: error.message,
  leonardoError,
  debug: error.debug,
});

  res.status(status).json({
    ok: false,
    message:
      leonardoError?.error ||
      leonardoError?.message ||
      error.message ||
      "Terjadi error di backend.",
    detail: leonardoError || error.debug || null,
  });
});

if (require.main === module) {
  if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI Creator Studio backend aktif di http://localhost:${PORT}`);
  });
}
}

module.exports = app;