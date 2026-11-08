import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check API route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "Store POS & ERP" });
  });

  // Smart AI Search API route for Products
  let aiClient: any = null;
  app.post("/api/ai-search-products", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ fallback: true, message: "No GEMINI_API_KEY set" });
      }
      if (!aiClient) {
        const { GoogleGenAI } = await import("@google/genai");
        aiClient = new GoogleGenAI({ apiKey });
      }

      const { prompt, categories = [], units = [] } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Invalid prompt" });
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `أنت محرك بحث ذكي عربي لنظام مستودعات وسوبرماركت ومخازن جملة وتجزئة.
تحليل استعلام المستخدم التالي واستخراج معايير التصفية والبحث المناسبة:
الاستعلام: "${prompt}"
التصنيفات المتاحة: ${JSON.stringify(categories)}
الوحدات المتاحة: ${JSON.stringify(units)}

قم بالرد بصيغة JSON فقط بهذا الشكل الدقيق دون أي نصوص إضافية:
{
  "searchKeyword": "الكلمة أو الكلمات المفتاحية للبحث بالاسم أو الكود (أو فارغ إذا كان استعلام تصفية عام)",
  "category": "اسم التصنيف المطابق أو all",
  "unit": "اسم الوحدة المطابقة أو all",
  "minPrice": null أو رقم,
  "maxPrice": null أو رقم,
  "maxStock": null أو رقم (مثل النواقص),
  "sortBy": "price" أو "price_wholesale" أو "stock" أو "profit" أو "name" أو null,
  "sortOrder": "asc" أو "desc" أو null,
  "explanation": "شرح من 4 إلى 8 كلمات لما تم فهمه من الطلب"
}`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json({ success: true, ...parsed });
    } catch (err: any) {
      console.warn("AI Search fallback warning:", err?.message || err);
      res.json({ fallback: true, error: err?.message || "Internal error" });
    }
  });

  // Smart AI Search API route for Price Changes & Diff Log
  app.post("/api/ai-search-price-changes", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ fallback: true, message: "No GEMINI_API_KEY set" });
      }
      if (!aiClient) {
        const { GoogleGenAI } = await import("@google/genai");
        aiClient = new GoogleGenAI({ apiKey });
      }

      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Invalid prompt" });
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `أنت خبير ذكاء اصطناعي عربي لتحليل تقارير وسجلات تغير وفروق الأسعار (الزيادة والنقصان والأصناف الجديدة) في نظام مستودعات وسوبرماركت.
تحليل استعلام المستخدم التالي وتحديد معايير التصفية:
الاستعلام: "${prompt}"

قم بالرد بصيغة JSON فقط بهذا الشكل الدقيق:
{
  "searchKeyword": "الكلمة المفتاحية للبحث باسم الصنف أو الكود (أو فارغ إذا كان استعلام تصفية عام)",
  "filterType": "all" أو "increase" أو "decrease" أو "new",
  "minDiff": null أو رقم (الحد الأدنى لقيمة الزيادة أو الفرق بالجنيه),
  "maxDiff": null أو رقم,
  "explanation": "شرح من 4 إلى 8 كلمات لما تم فهمه من الطلب"
}`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json({ success: true, ...parsed });
    } catch (err: any) {
      console.warn("Price changes AI Search fallback:", err?.message || err);
      res.json({ fallback: true, error: err?.message || "Internal error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: PORT, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
