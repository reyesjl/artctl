import { describe, expect, test } from "vitest";
import { createWorkInfoGenerator } from "../server/work-ai.js";

describe("work ai generator", () => {
  test("uses structured JSON output with the observe/context/technique schema", async () => {
    const requests = [];
    const generator = createWorkInfoGenerator({
      apiKey: "test-key",
      fetchImpl: async (resource, init) => {
        requests.push({
          resource: String(resource),
          init: {
            ...init,
            body: JSON.parse(init.body)
          }
        });

        return {
          ok: true,
          async json() {
            return {
              output_text: JSON.stringify({
                observe:
                  "The wave arcs over the boats, using scale contrast and repeated curves to focus attention.",
                context:
                  "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images.",
                technique:
                  "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene."
              })
            };
          }
        };
      }
    });

    const result = await generator.explainWorkForArtStudent({
      objectId: 436121,
      title: "The Great Wave off Kanagawa",
      artist: "Katsushika Hokusai",
      date: "ca. 1830-32",
      context: "Print - Polychrome woodblock print; ink and color on paper",
      imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
      metUrl: "https://www.metmuseum.org/art/collection/search/45434"
    });

    expect(result).toEqual({
      observe:
        "The wave arcs over the boats, using scale contrast and repeated curves to focus attention.",
      context:
        "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images.",
      technique:
        "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene.",
      sources: []
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].resource).toBe("https://api.openai.com/v1/responses");
    expect(requests[0].init.body.model).toBe("gpt-5.2");
    expect(requests[0].init.body.text.format).toEqual({
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
    });
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Return JSON matching the supplied schema."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "If the specific object is not identifiable or not well documented, say that plainly in context."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Do not assume the object is a painting."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Handle any medium: painting, sculpture, glass, print, textile, photography, ceramic, metalwork, furniture, decorative object, or tool."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Prioritize insight over metadata repetition."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Sound like a quiet curator or professor."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Use the supplied Met description or context directly when it is useful, but do not overuse or restate it mechanically."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Explain why the work is visually or socially effective."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Never replace the supplied object with a different known work."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "Use external sources to enrich context, not to override identity."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "If web sources conflict with the supplied object record, trust the supplied record."
    );
    expect(requests[0].init.body.input[0].content[0].text).toContain(
      "If uncertain, say so plainly instead of guessing."
    );
  });

  test("returns cited source metadata from web-search annotations when available", async () => {
    const generator = createWorkInfoGenerator({
      apiKey: "test-key",
      model: "gpt-5.2",
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      observe: "Notice the wave structure.",
                      context: "Hokusai worked in Edo Japan.",
                      technique: "Contour rhythm holds the design together."
                    }),
                    annotations: [
                      {
                        type: "url_citation",
                        start_index: 0,
                        end_index: 25,
                        url: "https://www.metmuseum.org/art/collection/search/45434",
                        title: "The Great Wave | The Met"
                      }
                    ]
                  }
                ]
              }
            ]
          };
        }
      })
    });

    const result = await generator.explainWorkForArtStudent({
      objectId: 436121,
      title: "The Great Wave off Kanagawa",
      artist: "Katsushika Hokusai",
      date: "ca. 1830-32",
      context: "Print - Polychrome woodblock print; ink and color on paper",
      imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
      metUrl: "https://www.metmuseum.org/art/collection/search/45434"
    });

    expect(result).toEqual({
      observe: "Notice the wave structure.",
      context: "Hokusai worked in Edo Japan.",
      technique: "Contour rhythm holds the design together.",
      sources: [
        {
          startIndex: 0,
          endIndex: 25,
          url: "https://www.metmuseum.org/art/collection/search/45434",
          title: "The Great Wave | The Met"
        }
      ]
    });
  });

  test("falls back gracefully when one structured field is missing", async () => {
    const generator = createWorkInfoGenerator({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({
              observe: "The lamp silhouette reads clearly against the darker support.",
              technique: "Metal surfaces catch light in small highlights that clarify edges."
            })
          };
        }
      })
    });

    const result = await generator.explainWorkForArtStudent({
      objectId: 123,
      title: "Whale Oil Lamp",
      artist: "",
      date: "",
      context: "Lamp - Brass and iron",
      imageUrl: "",
      metUrl: "https://www.metmuseum.org/art/collection/search/123"
    });

    expect(result).toEqual({
      observe: "The lamp silhouette reads clearly against the darker support.",
      context: "",
      technique: "Metal surfaces catch light in small highlights that clarify edges.",
      sources: []
    });
  });
});
