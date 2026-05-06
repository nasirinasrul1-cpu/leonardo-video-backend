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

function getLeonardoApiKey(req) {
  const bodyKey = req.body?.apiKey;
  const formKey = req.body?.apiKey;
  const headerKey = req.headers["x-leonardo-api-key"];
  return (bodyKey || formKey || headerKey || API_KEY || "").trim();
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function getExtension(file) {
  const name = file.originalname || "";
  const ext = name.split(".").pop().toLowerCase();

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return ext;
  }

  throw new Error("Format gambar harus jpg, jpeg, png, atau webp.");
}

function extractGenerationId(data) {
  return (
    data?.sdGenerationJob?.generationId ||
    data?.motionSvdGenerationJob?.generationId ||
    data?.generationId ||
    data?.id ||
    data?.data?.generationId ||
    data?.data?.id ||
    null
  );
}

async function uploadImageToLeonardo(file, apiKey) {
  const extension = getExtension(file);

  const initResponse = await fetch(`${BASE_URL}/v1/init-image`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      extension,
    }),
  });

  const initData = await readJson(initResponse);

  if (!initResponse.ok) {
    throw new Error(
      initData?.error ||
        initData?.message ||
        "Gagal membuat upload URL Leonardo."
    );
  }

  const uploadInitImage =
    initData?.uploadInitImage ||
    initData?.initImage ||
    initData?.data ||
    initData;

  const fieldsRaw =
    uploadInitImage?.fields ||
    uploadInitImage?.formFields ||
    uploadInitImage?.uploadFields;

  const url =
    uploadInitImage?.url ||
    uploadInitImage?.uploadUrl ||
    uploadInitImage?.upload_url;

  const imageId =
    uploadInitImage?.id ||
    uploadInitImage?.imageId ||
    uploadInitImage?.initImageId ||
    uploadInitImage?.init_image_id;

  if (!url || !imageId) {
    throw new Error("Response upload Leonardo tidak lengkap.");
  }

  const fields =
    typeof fieldsRaw === "string"
      ? JSON.parse(fieldsRaw)
      : fieldsRaw || {};

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
    throw new Error("Gagal upload gambar ke Leonardo.");
  }

  return imageId;
}

app.get("/", (req, res) => {
  return res.json({
    ok: true,
    message: "Backend AI Creator Squad aktif",
    apiKeyStatus: API_KEY ? "API key terbaca" : "API key belum ada",
  });
});

app.post("/api/leonardo/account", async (req, res) => {
  try {
    const apiKey = getLeonardoApiKey(req);

    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: "API Key Leonardo wajib diisi.",
      });
    }

    const response = await fetch(`${BASE_URL}/v1/me`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await readJson(response);

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "API Key tidak valid atau akun Leonardo tidak bisa dibaca.",
        leonardoResponse: data,
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
      user?.apiCreditBalance ??
      user?.api_credit_balance ??
      null;

    return res.json({
      ok: true,
      message: "Akun Leonardo berhasil dicek.",
      account: {
        userId: user?.id || details?.userId || details?.id || null,
        username:
          user?.username ||
          user?.name ||
          details?.username ||
          details?.name ||
          "Leonardo User",
        email: user?.email || details?.email || null,
        balance,
        raw: details,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Gagal cek akun Leonardo.",
    });
  }
});

app.post(
  "/api/leonardo/video",
  upload.fields([
    { name: "startFrame", maxCount: 1 },
    { name: "endFrame", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const selectedApiKey = getLeonardoApiKey(req);

      if (!selectedApiKey) {
        return res.status(400).json({
          error: "Silakan login akun Leonardo dulu.",
        });
      }

      const payloadRaw = req.body?.payload;

      if (!payloadRaw) {
        return res.status(400).json({
          error: "Payload kosong.",
        });
      }

      let payload;

      try {
        payload = JSON.parse(payloadRaw);
      } catch (error) {
        return res.status(400).json({
          error: "Payload tidak valid.",
        });
      }

      const startFrame = req.files?.startFrame?.[0];
      const endFrame = req.files?.endFrame?.[0];

      if (!startFrame) {
        return res.status(400).json({
          error: "Start frame wajib diupload.",
        });
      }

      const startImageId = await uploadImageToLeonardo(
        startFrame,
        selectedApiKey
      );

      let endImageId = null;

      if (endFrame) {
        endImageId = await uploadImageToLeonardo(endFrame, selectedApiKey);
      }

      const videoBody = {
  model: payload.model,
  prompt: payload.prompt,
  negativePrompt: payload.negativePrompt || "",
  imageId: startImageId,
};

if (payload.motionStrength) {
  videoBody.motionStrength = payload.motionStrength;
}

if (payload.seed) {
  videoBody.seed = payload.seed;
}

if (endImageId) {
  videoBody.endImageId = endImageId;
}

      const videoResponse = await fetch(`${BASE_URL}/v1/generations-motion-svd`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${selectedApiKey}`,
        },
        body: JSON.stringify(videoBody),
      });

      const videoData = await readJson(videoResponse);

      if (!videoResponse.ok) {
        return res.status(videoResponse.status).json({
          error: "Gagal membuat video Leonardo.",
          sentBody: videoBody,
          leonardoResponse: videoData,
        });
      }

      const generationId = extractGenerationId(videoData);

      return res.json({
        ok: true,
        generationId,
        startImageId,
        endImageId,
        sentBody: videoBody,
        leonardoResponse: videoData,
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message || "Server error",
      });
    }
  }
);

app.get("/api/leonardo/generation/:id", async (req, res) => {
  try {
    const selectedApiKey = getLeonardoApiKey(req);

    if (!selectedApiKey) {
      return res.status(400).json({
        error: "Silakan login akun Leonardo dulu.",
      });
    }

    const generationId = req.params.id;

    const response = await fetch(`${BASE_URL}/v1/generations/${generationId}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${selectedApiKey}`,
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend aktif di http://localhost:${PORT}`);
  });
}

module.exports = app;
