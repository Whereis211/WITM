const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM_PROMPT = [
  "You are an AI sales coach embedded in a retail sales-tracking app.",
  "The user is a commission-based retail sales associate tracking their own",
  "daily sales, hours worked, and progress toward a weekly sales goal.",
  "",
  "You will receive a JSON object with the user's real, already-computed sales",
  "figures: dollar amounts, dates, percentages, and streak counts the app",
  "calculated itself. These numbers are exact and final.",
  "Never recompute, re-derive, round differently, or alter any numeric figure",
  "that is already given to you — use the exact values provided, verbatim,",
  "when you state them. Do not invent numbers, transactions, or details that",
  "are not present in the data.",
  "",
  "Respond with ONLY a single valid JSON object — no markdown code fences, no",
  "commentary before or after — matching exactly this shape:",
  "{",
  '  "performanceSummary": string,   // 2-3 concise sentences on current performance',
  '  "goalAnalysis": string,         // whether on pace for the weekly goal and exactly what is needed, using the given numbers',
  '  "nextShiftPlan": string,        // target for the next shift and the pace needed, using the given requiredPerDay figure',
  '  "trendAnalysis": string,        // meaningful changes vs previous days/weeks, using the given trend figures; if data is too sparse for a trend, say so briefly',
  '  "actionableAdvice": string[],   // 1 to 3 specific, data-grounded action items — never generic motivational filler',
  '  "weeklyReview": string | null   // null when hasCompletedWeek is false; otherwise a short summary naming the strongest and weakest metric from the data',
  "}",
  "",
  "Style: concise, practical, specific to the numbers given. No generic hype",
  "(\"You've got this!\", \"Keep pushing!\"). No emoji. Reference the actual",
  "dollar figures, dates, and percentages from the input where relevant."
].join("\n");

function stripCodeFence(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "The AI coach isn't configured on the server yet (missing ANTHROPIC_API_KEY)." });
    return;
  }

  const context = req.body;
  if (!context || typeof context !== "object" || !context.goal) {
    res.status(400).json({ error: "Invalid payload." });
    return;
  }

  const client = new Anthropic({ apiKey: apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Here is my current sales data:\n\n" + JSON.stringify(context) }
      ]
    });

    const textBlock = response.content.find(function (b) { return b.type === "text"; });
    if (!textBlock) {
      res.status(502).json({ error: "The AI coach returned an unexpected response. Try again." });
      return;
    }

    let analysis;
    try {
      analysis = JSON.parse(stripCodeFence(textBlock.text));
    } catch (parseErr) {
      res.status(502).json({ error: "The AI coach returned an unexpected response format. Try again." });
      return;
    }

    if (typeof analysis.performanceSummary !== "string" || !Array.isArray(analysis.actionableAdvice)) {
      res.status(502).json({ error: "The AI coach returned an incomplete analysis. Try again." });
      return;
    }

    res.status(200).json({
      performanceSummary: analysis.performanceSummary,
      goalAnalysis: analysis.goalAnalysis || "",
      nextShiftPlan: analysis.nextShiftPlan || "",
      trendAnalysis: analysis.trendAnalysis || "",
      actionableAdvice: analysis.actionableAdvice,
      weeklyReview: analysis.weeklyReview || null
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "The AI coach is misconfigured. Check the server's API key." });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Too many requests right now. Try again in a moment." });
    } else if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: "The AI service had a problem. Try again." });
    } else {
      res.status(500).json({ error: "Something went wrong generating your analysis. Try again." });
    }
  }
};
