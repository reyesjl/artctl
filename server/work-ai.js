const defaultApiBaseUrl = "https://api.openai.com/v1";
const defaultModel = "gpt-5.2";

function trimOrFallback(value, fallback = "") {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || fallback;
}

function buildWorkPrompt(work) {
  return [
    "Generate a minimal art study note for an art student.",
    "",
    "Use the image and supplied metadata. You may also consult reliable web sources about this object or work if needed.",
    "Return JSON matching the supplied schema.",
    "Prioritize insight over metadata repetition.",
    "Sound like a quiet curator or professor.",
    "Use the supplied Met description or context directly when it is useful, but do not overuse or restate it mechanically.",
    "Explain why the work is visually or socially effective.",
    "Never replace the supplied object with a different known work.",
    "Use external sources to enrich context, not to override identity.",
    "If web sources conflict with the supplied object record, trust the supplied record.",
    "If uncertain, say so plainly instead of guessing.",
    "If the specific object is not identifiable or not well documented, say that plainly in context.",
    "Then give a short general explanation of what the object is, how it functions or was used, and how it relates to art, craft, design, or visual culture.",
    "Do not assume the object is a painting.",
    "Handle any medium: painting, sculpture, glass, print, textile, photography, ceramic, metalwork, furniture, decorative object, or tool.",
    "",
    "Field requirements:",
    "observe: one concise sentence describing something visually observable.",
    "context: one concise sentence explaining historical, artistic, or cultural context grounded only in supplied metadata or reliable source context.",
    "technique: one concise sentence explaining a visible technique, material property, compositional strategy, or why the work succeeds visually.",
    "",
    "Global rules:",
    "concise",
    "calm tone",
    "no dramatic language",
    "no museum-essay voice",
    "no markdown",
    "no bullet lists",
    "no title generation",
    "no repeated metadata dumps",
    "no references to being an AI",
    "no unsupported claims",
    "no more than about 30 words per field",
    "do not include citations, domains, or source links in field text",
    "",
    "Supplied metadata:",
    `Title: ${trimOrFallback(work.title, "Unknown")}`,
    `Artist: ${trimOrFallback(work.artist, "Unknown")}`,
    `Date: ${trimOrFallback(work.date, "Unknown")}`,
    `Context: ${trimOrFallback(work.context, "Unknown")}`,
    `Image URL: ${trimOrFallback(work.imageUrl, "Unavailable")}`,
    `Met URL: ${trimOrFallback(work.metUrl, "Unavailable")}`
  ].join("\n");
}

function stripInlineLinks(value) {
  return String(value ?? "")
    .replace(/\s*\(\[[^\]]+\]\((https?:\/\/[^)]+)\)\)/gu, "")
    .replace(/\s*\((https?:\/\/[^)]+)\)/gu, "")
    .trim();
}

function normalizeStructuredNote(note) {
  return {
    observe: stripInlineLinks(note?.observe ?? ""),
    context: stripInlineLinks(note?.context ?? ""),
    technique: stripInlineLinks(note?.technique ?? "")
  };
}

function readOutputJson(responseBody) {
  const rawText =
    typeof responseBody?.output_text === "string" && responseBody.output_text.trim()
      ? responseBody.output_text.trim()
      : "";

  if (!rawText) {
    const outputItems = Array.isArray(responseBody?.output) ? responseBody.output : [];

    for (const item of outputItems) {
      const contentItems = Array.isArray(item?.content) ? item.content : [];

      for (const contentItem of contentItems) {
        if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
          return JSON.parse(contentItem.text);
        }
      }
    }

    throw new Error("OpenAI returned an empty artwork explanation.");
  }

  return JSON.parse(rawText);
}

function readOutputTextAnnotations(responseBody) {
  const outputItems = Array.isArray(responseBody?.output) ? responseBody.output : [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];

    for (const contentItem of contentItems) {
      if (Array.isArray(contentItem?.annotations)) {
        return contentItem.annotations
          .filter((annotation) => annotation?.type === "url_citation" && annotation?.url)
          .map((annotation) => ({
            startIndex: annotation.start_index,
            endIndex: annotation.end_index,
            url: annotation.url,
            title: annotation.title ?? ""
          }));
      }
    }
  }

  return [];
}

export function createWorkInfoGenerator({
  apiKey,
  model = defaultModel,
  apiBaseUrl = defaultApiBaseUrl,
  fetchImpl = fetch
} = {}) {
  const normalizedApiKey = trimOrFallback(apiKey);

  if (!normalizedApiKey) {
    return null;
  }

  return {
    async explainWorkForArtStudent(work) {
      const response = await fetchImpl(`${apiBaseUrl}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedApiKey}`
        },
        body: JSON.stringify({
          model,
          instructions:
            "You are an expert art history tutor. Produce a minimal, calm, medium-agnostic art study note that follows the schema exactly and avoids unsupported claims.",
          tools: [
            {
              type: "web_search"
            }
          ],
          tool_choice: "auto",
          text: {
            format: {
              type: "json_schema",
              name: "art_study_note",
              strict: true,
              description: "Minimal art study note for students.",
              schema: {
                type: "object",
                properties: {
                  observe: { type: "string" },
                  context: { type: "string" },
                  technique: { type: "string" }
                },
                required: ["observe", "context", "technique"],
                additionalProperties: false
              }
            }
          },
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildWorkPrompt(work)
                }
              ]
            }
          ]
        })
      });
      const responseBody = await response.json();

      if (!response.ok) {
        throw new Error(responseBody?.error?.message || "Unable to generate artwork explanation.");
      }

      const note = normalizeStructuredNote(readOutputJson(responseBody));
      const sources = readOutputTextAnnotations(responseBody);

      return {
        observe: note.observe,
        context: note.context,
        technique: note.technique,
        sources
      };
    }
  };
}
