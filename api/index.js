require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.LEONARDO_API_KEY;
const BASE_URL = "https://cloud.leonardo.ai/api/rest";

app.use(cors());
app.use(express.json({ limit: "25mb" }));

function getExtension(file) {
  const name = file.originalname || "";
  const ext = name.split(".").pop().toLowerCase();

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return ext;
  }

  throw new Error("Format gambar harus jpg, jpeg, png, atau webp.");
}

async function readJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function getUploadData(data) {
  const item = data.uploadInitImage || data.init_image || data;

  const id = item.id;
  const url = item.url;
  let fields = item.fields || {};

  if (typeof fields === "string") {
    fields = JSON.parse(fields);
  }

  if (!id || !url) {
    throw new Error("Response upload init image tidak terbaca: " + JSON.stringify(data));
  }

  return { id, url, fields };
}

async function uploadImageToLeonardo(file) {
  const extension = getExtension(file);

  const initResponse = await fetch(`${BASE_URL}/v1/init-image`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ extension }),
  });

  const initData = await readJson(initResponse);

  if (!initResponse.ok) {
    throw new Error("Upload init image gagal: " + JSON.stringify(initData));
  }

  const { id, url, fields } = getUploadData(initData);

  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });

  const blob = new Blob([file.buffer], {
    type: file.mimetype || `image/${extension}`,
  });

  formData.append("file", blob, file.originalname || `image.${extension}`);

  const uploadResponse = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error("Upload gambar ke storage Leonardo gagal: " + errorText);
  }

  return id;
}

function getVideoSize(ratio, resolution) {
  const res = String(resolution || "1080p").toLowerCase();

  if (ratio === "16:9") {
    if (res.includes("720")) return { width: 1280, height: 720, resolutionMode: "RESOLUTION_720" };
    return { width: 1920, height: 1080, resolutionMode: "RESOLUTION_1080" };
  }

  if (ratio === "1:1") {
    if (res.includes("720")) return { width: 720, height: 720, resolutionMode: "RESOLUTION_720" };
    return { width: 1080, height: 1080, resolutionMode: "RESOLUTION_1080" };
  }

  if (res.includes("720")) {
    return { width: 720, height: 1280, resolutionMode: "RESOLUTION_720" };
  }

  return { width: 1080, height: 1920, resolutionMode: "RESOLUTION_1080" };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend AI Creator Squad aktif",
    apiKeyStatus: API_KEY ? "API key terbaca" : "API key belum terbaca",
  });
});

app.post(
  "/api/leonardo/video",
  upload.fields([
    { name: "startFrame", maxCount: 1 },
    { name: "endFrame", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!API_KEY) {
        return res.status(500).json({
          error: "LEONARDO_API_KEY belum ada di file .env",
        });
      }

      const payload = JSON.parse(req.body.payload || "{}");

      const startFile = req.files?.startFrame?.[0];
      const endFile = req.files?.endFrame?.[0];

      if (!payload.prompt || !payload.prompt.trim()) {
        return res.status(400).json({
          error: "Prompt masih kosong.",
        });
      }

      if (!startFile) {
        return res.status(400).json({
          error: "Start frame wajib diupload.",
        });
      }

      const startImageId = await uploadImageToLeonardo(startFile);

      let endImageId = null;

      if (payload.useEndFrame && endFile) {
        endImageId = await uploadImageToLeonardo(endFile);
      }

      const { width, height, resolutionMode } = getVideoSize(
        payload.ratio,
        payload.resolution
      );

      const body = {
        prompt: payload.prompt,
        imageId: startImageId,
        imageType: "UPLOADED",
        model: payload.model || "VEO3_1",
        resolution: resolutionMode,
        duration: Number(payload.duration || 8),
        height,
        width,
        isPublic: false,
      };

      if (payload.negativePrompt && payload.negativePrompt.trim()) {
        body.negativePrompt = payload.negativePrompt;
      }

      if (payload.useEndFrame && endImageId) {
        body.endFrameImage = {
          id: endImageId,
          type: "UPLOADED",
        };
      }

      const videoResponse = await fetch(`${BASE_URL}/v1/generations-image-to-video`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const videoData = await readJson(videoResponse);

      if (!videoResponse.ok) {
        return res.status(videoResponse.status).json({
          error: "Generate video Leonardo gagal.",
          leonardoResponse: videoData,
          sentBody: body,
        });
      }

      return res.json({
        ok: true,
        message: "Request video berhasil dikirim ke Leonardo.",
        startImageId,
        endImageId,
        sentBody: body,
        leonardoResponse: videoData,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: error.message || "Server error",
      });
    }
  }
);
app.post("/api/leonardo/account", async (req, res) => {
  try {
    const { apiKey } = req.body || {};

    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: "API Key Leonardo wajib diisi."
      });
    }

    const response = await fetch("https://cloud.leonardo.ai/api/rest/v1/me", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`
      }
    });

    let data = null;

    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "API Key tidak valid atau akun Leonardo tidak bisa dibaca.",
        leonardoResponse: data
      });
    }

    const details = Array.isArray(data?.user_details)
      ? data.user_details[0]
      : data?.user_details || data;

    const user = details?.user || data?.user || {};

    const balance =
      details?.apiCreditBalance ??
      details?.api_credit_balance ??
      details?.apiPlanTokenBalance ??
      details?.api_plan_token_balance ??
      details?.subscription_tokens ??
      details?.subscriptionTokens ??
      details?.apiTokens ??
      details?.api_tokens ??
      details?.balance ??
      details?.creditBalance ??
      null;

    return res.json({
      ok: true,
      message: "Akun Leonardo berhasil dicek.",
      account: {
        userId: user?.id || details?.userId || details?.id || null,
        username: user?.username || user?.name || details?.username || "Leonardo User",
        email: user?.email || details?.email || null,
        balance: balance,
        raw: details
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Gagal cek akun Leonardo."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend aktif di http://localhost:${PORT}`);
});app.get("/api/leonardo/generation/:id", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "LEONARDO_API_KEY belum ada di file .env",
      });
    }

    const generationId = req.params.id;

    const response = await fetch(`${BASE_URL}/v1/generations/${generationId}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
    });

    const data = await readJson(response);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gagal cek hasil generation Leonardo.",
        leonardoResponse: data,
      });
    }

    return res.json({
      ok: true,
      generationId,
      leonardoResponse: data,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
});
