import Anthropic from "@anthropic-ai/sdk";
import { getProperty } from "@/lib/listings/store";
import { propertyBrief, questionsToAsk } from "@/lib/ai/brief";

const SYSTEM = `You are ImmoKnauer's property assistant for the German market.
Answer ONLY from the PROPERTY BRIEF provided. Structure every answer under these headings, omitting empty ones:
"Known facts", "Calculated estimates", "External data", "Assumptions", "Unknowns".
Never state a property fact that is not in the brief; if the question needs missing data, say it is unknown and suggest what to ask.
You give no legal, tax or lending decisions — flag where a professional (Notar, Steuerberater, bank) is needed.
Answer in the language of the question. Be concise.`;

export async function POST(req: Request) {
  const { propertyId, question } = (await req.json()) as { propertyId?: string; question?: string };
  if (!propertyId || !question || question.length > 2000) return Response.json({ error: "propertyId and question required" }, { status: 400 });
  const view = await getProperty(propertyId);
  if (!view) return Response.json({ error: "Property not found" }, { status: 404 });
  const brief = propertyBrief(view.listing);
  const questions = questionsToAsk(view.listing);

  // No API key: return the grounded brief itself rather than a made-up answer.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ mode: "brief", brief, questions, note: "AI assistant not configured (ANTHROPIC_API_KEY). Showing the structured facts we have." });
  }

  const client = new Anthropic();
  const briefText = brief.map((s) => `[${s.category}] ${s.text}${s.source ? ` (source: ${s.source})` : ""}`).join("\n");
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `PROPERTY BRIEF:\n${briefText}\n\nSuggested questions for the agent:\n${questions.join("\n")}\n\nUSER QUESTION: ${question}` }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal") return Response.json({ mode: "brief", brief, questions, note: "The assistant could not answer this question." });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    return Response.json({ mode: "ai", answer: text, brief });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Rate limited — try again shortly" }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `AI service error ${e.status}` }, { status: 502 });
    throw e;
  }
}
