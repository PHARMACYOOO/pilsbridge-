import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { demoExtraction, ExtractionSchema, type ScanResponse } from "@/lib/prescription";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const SYSTEM = `You transcribe photographed medical prescriptions for a Nigerian pharmacy-delivery service.
A registered pharmacist reviews every result before anything is dispensed, so your job is faithful transcription, not clinical judgement.

Rules:
- Transcribe only what is written. Never add, substitute, or suggest medicines, and never correct a dose you think is wrong.
- Expand common prescription shorthand into numbers: od/daily = 1, bd = 2, tds = 3, qds = 4, nocte = 1 per day; "× 5/7" = 5 days, "× 2/52" = 14 days; roman numerals ii = 2.
- dose_units is the number of tablets/capsules/sachets per dose; leave it null for injections, inhalers, creams or anything not counted in units.
- quantity_written is only for an explicit total quantity written on the prescription (e.g. "#30", "dispense 20").
- Set legible to false for any line where you are unsure of the drug name, strength or directions.
- Do not transcribe patient names, addresses or other personal identifiers.
- If the image is not a prescription, set is_prescription to false and return no items.`;

// JSON schema for structured output — mirrors ExtractionSchema in lib/prescription.ts.
const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_prescription", "prescriber_details_present", "date_written", "items"],
  properties: {
    is_prescription: { type: "boolean" },
    prescriber_details_present: { type: "boolean", description: "A prescriber name, signature or stamp is visible" },
    date_written: nullable("string"),
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["drug", "strength", "form", "dose_units", "times_per_day", "duration_days", "quantity_written", "directions", "legible"],
        properties: {
          drug: { type: "string", description: "Drug name as written (brand or generic)" },
          strength: nullable("string"),
          form: nullable("string"),
          dose_units: nullable("number"),
          times_per_day: nullable("number"),
          duration_days: nullable("number"),
          quantity_written: nullable("number"),
          directions: { type: "string", description: "Directions exactly as written" },
          legible: { type: "boolean" },
        },
      },
    },
  },
};

const BodySchema = z.object({ image: z.string().startsWith("data:image/") });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a photo of your prescription." } satisfies ScanResponse, { status: 400 });

  const match = parsed.data.image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const mediaType = match?.[1] as (typeof MEDIA_TYPES)[number] | undefined;
  if (!match || !mediaType || !MEDIA_TYPES.includes(mediaType)) {
    return Response.json({ error: "Use a JPG, PNG or WebP photo." } satisfies ScanResponse, { status: 400 });
  }
  const data = match[2];
  if ((data.length * 3) / 4 > MAX_BYTES) {
    return Response.json({ error: "That photo is too large — please retake it." } satisfies ScanResponse, { status: 413 });
  }

  // Without credentials the endpoint returns a sample reading so the interface can be demonstrated.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    await new Promise((r) => setTimeout(r, 1800));
    return Response.json({ extraction: demoExtraction, demo: true } satisfies ScanResponse);
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: "Transcribe this prescription." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "We couldn't read this image. Please send it to a pharmacist instead." } satisfies ScanResponse, { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text.text) : null;
    } catch {}
    const extraction = ExtractionSchema.safeParse(json);
    if (!extraction.success) {
      return Response.json({ error: "We couldn't make sense of that photo. Try again in better light." } satisfies ScanResponse, { status: 422 });
    }
    return Response.json({ extraction: extraction.data, demo: false } satisfies ScanResponse);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "We're busy right now — please try again in a moment." } satisfies ScanResponse, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Prescription read failed", error.status, error.message);
      return Response.json({ error: "The prescription reader is unavailable. Please try again." } satisfies ScanResponse, { status: 502 });
    }
    throw error;
  }
}
