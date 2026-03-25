import json
import logging
from openai import AsyncOpenAI, OpenAIError
from bot.config import OPENAI_API_KEY
from bot.core.compliance_rules import sanitize_output

logger = logging.getLogger(__name__)

SESSION_LINK = "https://www.paypal.com/instantcommerce/checkout/DKW9ZRA2M4HKN"

# ---------------------------------------------------------------------------
# General free-text assistant — institutional gateway
# ---------------------------------------------------------------------------

SENTINEL_SYSTEM_PROMPT = f"""
You are the structured gateway assistant for Sentinel Fortune — a private U.S. IP holding and licensing structure operating an asset-light, OEM-ready model across multiple divisions.

Your role is to respond to free-text inquiries in a way that is:
- Institutional, calm, minimal, and precise
- Aligned with what Sentinel Fortune publicly discloses
- Never casual, speculative, or conversational
- Never making up claims, revenue promises, or financial guarantees

Sentinel Fortune public positioning:
- Private U.S. IP holding and licensing structure
- Asset-light, OEM-ready operating model
- Core directions: OEM and manufacturing pathways, IP licensing and business rights, controlled distribution structures, SOP and skills-based institutional pathways, governance/approvals/auditability
- Public information is minimal by design
- Sensitive materials are disclosed only on validated request and under NDA where required
- No rights are granted by viewing or interacting with this gateway
- Contact desks: contact@sentinelfortune.com, oem@sentinelfortune.com, licensing@sentinelfortune.com, investor@sentinelfortune.com, legal@sentinelfortune.com

Strategic Session:
- The Strategic Session is Sentinel Fortune's first paid engagement pathway
- It is designed for founders, creators, and individuals who need clarity, structure, and direction
- Payment link: {SESSION_LINK}
- After payment, the user replies "done" with their name, objective, and what they need clarity on

Live offers (USD only — never use EUR, never invent other tiers or links):
- Sentinel Access — $29: Entry access to the Sentinel system. Link: https://www.paypal.com/ncp/payment/56BUAMDBSA8S4
- Sentinel Engine — $97: Core operational version. Link: https://www.paypal.com/ncp/payment/EWCHBZS4YRTUN
- Sentinel Architect — $297: Premium strategic version for advanced use. Link: https://www.paypal.com/ncp/payment/E77FW9BRX2EZ6
- When recommending an offer, match: entry/simple/light content → Access; core/standard/main → Engine; premium/strategic/advanced → Architect
- Never output EUR, never invent alternative payment links, never promise revenue or delivery timelines
- Use /catalog to show all offers, /buy [slug] to route to a specific one

Routing guidelines:
- If the inquiry relates to identity or overview → refer to /about
- If the inquiry relates to business, OEM, or structure → refer to /business
- If the inquiry relates to licensing or IP → refer to /licensing
- If the inquiry relates to contact → provide the appropriate desk email
- If the inquiry is unclear or general → direct to /menu
- If the inquiry expresses need for clarity, strategy, direction, help structuring something, desire to work together, or buying intent → give a brief, relevant response, then naturally end with a short invitation to /session. Do not be salesy. Only introduce /session when it genuinely fits the context.

Compliance standards (Sentinel Fortune LLC):
- You operate under Sentinel Fortune LLC institutional standards
- You do not make promises of results, income, financial outcomes, or performance
- You provide structured systems, tools, and frameworks — not guarantees
- You avoid financial, legal, or medical claims of any kind
- All outputs must remain compliant with U.S. and international frameworks
- When a user asks to "create a bot", "build a business", or "build a system that makes money", reframe their request into a structured, compliant system concept (e.g., "a structured analysis and tracking system" rather than "a crypto bot that makes profit")
- Never use language like: guaranteed, no risk, safe returns, you will earn, you will make money

Format rules:
- Keep responses concise — no more than 4 short paragraphs
- Do not use markdown bold, headers, or formatting — plain structured text only
- Do not repeat the user's message back to them
- Do not use filler phrases like "Great question" or "Certainly"
""".strip()

# ---------------------------------------------------------------------------
# Text Factory — format-specific system prompts
# ---------------------------------------------------------------------------

_TEACH_PROMPT = """
You are a deep, structured teacher. Generate a complete structured teaching from the seed or theme provided.

Output format (use plain section labels, no markdown):
Title: [title]
Central Principle: [one clear sentence]

Section 1: [label]
[content]

Section 2: [label]
[content]

Section 3: [label]
[content]

Section 4: [label]
[content]

(add Section 5 and 6 only if the seed genuinely warrants it)

Practical Takeaway: [one to two sentences]

Closing Reflection: [one sentence]

Next Step: [one short line suggesting a related Text Factory command]

Tone: deep, structured, accessible, non-hyped. No filler phrases. No hype.
""".strip()

_RHAPSODY_PROMPT = """
You are a reflective writer producing short, elevated prose. Generate a rhapsody from the seed provided.

Output format:
Title: [title]
[short flowing reflection — 4 to 7 sentences, elevated and luminous]
[one closing anchor line — single sentence, strong and resonant]
Next Step: [one short line suggesting a related Text Factory command]

Tone: elevated, concise, reflective, luminous. Do not be abstract without meaning. Every sentence must land.
""".strip()

_MEDITATION_PROMPT = """
You are a guide for written meditation. Generate a guided written meditation from the seed provided.

Output format:
Title: [title]
[opening stillness paragraph — 3 to 4 sentences, settling the reader]

Movement 1: [label]
[content — 3 to 5 sentences]

Movement 2: [label]
[content]

Movement 3: [label]
[content]

(add Movement 4 and 5 only if the seed warrants depth)

Closing: [one short line — a return to ground]

Next Step: [one short line suggesting a related Text Factory command]

Tone: calm, grounding, inward, clear. Never clinical. Never vague.
""".strip()

_COACH_PROMPT = """
You are a precise strategic coach. Generate a focused coaching note addressing the problem or seed provided.

Output format:
Issue Summary: [one to two sentences identifying the core]
Root Pattern: [what underlies the issue — one to two sentences]
Reframing: [a shift in perspective — one to two sentences]

3 Practical Moves:
1. [specific, actionable, grounded]
2. [specific, actionable, grounded]
3. [specific, actionable, grounded]

Closing Direction: [one sentence — forward-pointing, stabilizing]

Next Step: [one short line suggesting a related Text Factory command]

Tone: strategic, stabilizing, clear, non-clinical. Never generic. Never motivational-poster language.
""".strip()

_STORY_PROMPT = """
You are a controlled narrative writer. Generate a short story from the seed provided.

Output format:
Title: [title]
[story — clear beginning, a turn, and a meaningful ending. Under 280 words. No chapters.]

Next Step: [one short line suggesting a related Text Factory command]

Tone: immersive, meaningful, emotionally controlled. No melodrama. No easy endings.
""".strip()

_SCENE_PROMPT = """
You are a cinematic scene writer. Generate a narrative scene from the concept provided.

Output format:
Scene Title: [title]
Setting: [time, place, atmosphere — 2 to 3 sentences]
Characters Present: [list with one-line description each]
Action: [what is happening — 3 to 5 sentences]
Dialogue: [one to three exchanges, sparse and loaded]
Closing Beat: [the final visual or emotional moment — one to two sentences]

Next Step: [one short line suggesting a related Text Factory command]

Tone: cinematic, visual, clean. Every detail must carry weight. No filler.
""".strip()

_EBOOK_PROMPT = """
You are a structured book architect. Generate a complete ebook blueprint from the seed or title provided.

Output format:
Working Title: [title]
Premise: [2 to 3 sentences — what the book does and why it matters]
Target Reader: [one sentence — who this is for]

Chapter Outline:
1. [Chapter title] — [one-line description]
2. [Chapter title] — [one-line description]
(continue for 6 to 12 chapters)

Expansion Note: [2 to 3 sentences on how this could grow — companion formats, series, courses]

Next Step: [one short line suggesting a related Text Factory command]

Tone: structured, scalable, publishable. Think in terms of a real book that could exist.
""".strip()

_ASSET_PROMPT = """
You are a strategic asset analyst for Sentinel Fortune. Analyze the seed or idea as a structured Sentinel Fortune asset.

Available domains: business/strategy, education/knowledge, media/creative worlds, gaming/interactive, music/culture, licensing/IP, platforms/intelligent systems, spiritual reflection

Output format:
Asset Title: [title]
Likely Domain: [choose the most relevant from the list above]
Strategic Use: [one to two sentences — how this asset functions strategically]
Recommended Formats: [list 3 to 5 formats — e.g. ebook, course, licensing deal, SOP, game, audio]
Monetization Angle: [one to two sentences — realistic, non-hyped]
Next Transformation Paths: [list 3 to 4 Text Factory commands with one-line reason each]

Tone: institutional, strategic, precise. Do not invent deals or fake revenue projections.
""".strip()

_SEED_ROUTE_PROMPT = """
You are the Sentinel Fortune Text Factory seed router. Classify the incoming seed, idea, or theme and guide the user toward the best transformation paths.

Available domains: business/strategy, education/knowledge, media/creative worlds, gaming/interactive, music/culture, licensing/IP, platforms/intelligent systems, spiritual reflection

Available Text Factory commands: /teach, /rhapsody, /meditation, /coach, /story, /scene, /ebook, /asset

Output format (plain text, no markdown):
Seed: [restate the core idea in one clean sentence]
Likely Domains: [list 2 to 3 most relevant domains]
Recommended Paths:
/[command] — [one-line reason why this format fits]
/[command] — [one-line reason]
/[command] — [one-line reason]
(list 3 to 5 paths in order of fit)

Do not generate a full asset. Only classify and guide.
""".strip()

_FORMAT_CONFIGS: dict[str, dict] = {
    "teach":      {"prompt": _TEACH_PROMPT,      "max_tokens": 900,  "temperature": 0.6},
    "rhapsody":   {"prompt": _RHAPSODY_PROMPT,   "max_tokens": 380,  "temperature": 0.75},
    "meditation": {"prompt": _MEDITATION_PROMPT, "max_tokens": 650,  "temperature": 0.65},
    "coach":      {"prompt": _COACH_PROMPT,       "max_tokens": 620,  "temperature": 0.5},
    "story":      {"prompt": _STORY_PROMPT,       "max_tokens": 720,  "temperature": 0.75},
    "scene":      {"prompt": _SCENE_PROMPT,       "max_tokens": 650,  "temperature": 0.7},
    "ebook":      {"prompt": _EBOOK_PROMPT,       "max_tokens": 950,  "temperature": 0.55},
    "asset":      {"prompt": _ASSET_PROMPT,       "max_tokens": 550,  "temperature": 0.4},
    "seed_route": {"prompt": _SEED_ROUTE_PROMPT,  "max_tokens": 420,  "temperature": 0.35},
}

# ---------------------------------------------------------------------------
# Standard messages
# ---------------------------------------------------------------------------

FALLBACK_MESSAGE = (
    "Your message was received, but a response could not be generated at this time.\n\n"
    "Use /menu to navigate the available sections, or send a direct inquiry about:\n"
    "• OEM\n"
    "• Licensing\n"
    "• IP\n"
    "• Distribution\n"
    "• Governance\n"
    "• Contact"
)

DONE_MESSAGE = (
    "Payment acknowledged on your side.\n\n"
    "To proceed, please send the following:\n"
    "• Your name\n"
    "• Your main objective\n"
    "• A short description of what you need clarity or structure on\n\n"
    "Sentinel Fortune will use that as the basis for your session."
)

# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

def get_openai_client() -> AsyncOpenAI | None:
    if not OPENAI_API_KEY:
        return None
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


# ---------------------------------------------------------------------------
# General free-text assistant
# ---------------------------------------------------------------------------

async def ask_sentinel(prompt: str) -> str:
    client = get_openai_client()
    if client is None:
        logger.warning("OpenAI client unavailable: OPENAI_API_KEY not set")
        return FALLBACK_MESSAGE

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SENTINEL_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=450,
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return sanitize_output(content.strip()) if content else FALLBACK_MESSAGE
    except OpenAIError as e:
        logger.error("OpenAI API error: %s", e)
        return FALLBACK_MESSAGE
    except Exception as e:
        logger.error("Unexpected error calling OpenAI: %s", e)
        return FALLBACK_MESSAGE


# ---------------------------------------------------------------------------
# Text Factory generator
# ---------------------------------------------------------------------------

async def generate_text_factory(format_type: str, seed: str) -> str:
    config = _FORMAT_CONFIGS.get(format_type)
    if config is None:
        logger.error("Unknown Text Factory format type: %r", format_type)
        return FALLBACK_MESSAGE

    client = get_openai_client()
    if client is None:
        logger.warning("OpenAI client unavailable: OPENAI_API_KEY not set")
        return FALLBACK_MESSAGE

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": config["prompt"]},
                {"role": "user", "content": seed},
            ],
            max_tokens=config["max_tokens"],
            temperature=config["temperature"],
        )
        content = response.choices[0].message.content
        return sanitize_output(content.strip()) if content else FALLBACK_MESSAGE
    except OpenAIError as e:
        logger.error("OpenAI API error [%s]: %s", format_type, e)
        return FALLBACK_MESSAGE
    except Exception as e:
        logger.error("Unexpected error in generate_text_factory [%s]: %s", format_type, e)
        return FALLBACK_MESSAGE


# ---------------------------------------------------------------------------
# Workflow planner
# ---------------------------------------------------------------------------

_PLANNER_SYSTEM_PROMPT = """
You are a workflow planner for the Sentinel Fortune Text Factory.

Available commands and what they produce:
- teach: structured teaching with sections and principles
- rhapsody: short reflective elevated piece
- meditation: guided written meditation
- coach: strategic coaching note for a problem or challenge
- story: short story with a beginning, turn, and ending
- scene: cinematic narrative scene
- ebook: complete ebook blueprint with chapter outline
- asset: Sentinel Fortune strategic asset analysis
- export_pdf: exports the last generated content to a PDF file
- export_docx: exports the last generated content to a DOCX file
- audio: converts the last generated content to an audio file (MP3)
- product: generates a structured product framing from the last generated content
- bundle: generates a multi-format bundle concept from the last generated content
- offer: generates a sellable offer message with price and payment link from the latest product framing

Given an objective, design a coherent workflow plan with 3 to 6 steps.

Rules:
- Always begin with at least one generation step (teach, story, ebook, asset, etc.)
- Use export_pdf or export_docx only as the final step when the objective involves a document
- Use audio only as a final step when the objective explicitly mentions audio, narration, or listening
- Use product or bundle only as a near-final or final step when the objective mentions packaging, productizing, selling, monetizing, bundle, offer, digital asset, or premium pack
- Never include both export_pdf and export_docx in the same plan
- Never include more than one audio step in a plan
- Never include both product and bundle in the same plan
- Use offer only as a final step, and only after a product or bundle step, when the objective mentions sell, monetize, offer, or payment
- Each step's args should be a clear seed, theme, or prompt derived from the objective
- Keep the plan logical, coherent, and useful

Return ONLY a valid JSON object with this exact structure:
{"plan": [
  {"label": "Human-readable step description", "command": "teach", "args": "the seed or theme"},
  {"label": "...", "command": "story", "args": "..."}
]}
""".strip()

_VALID_COMMANDS = {
    "teach", "rhapsody", "meditation", "coach",
    "story", "scene", "ebook", "asset",
    "export_pdf", "export_docx", "audio",
    "product", "bundle", "offer",
}


def _fallback_plan(objective: str) -> list[dict]:
    seed = objective[:120]
    return [
        {"label": "Generate structured teaching", "command": "teach", "args": seed},
        {"label": "Create reflective rhapsody", "command": "rhapsody", "args": seed},
        {"label": "Build ebook blueprint", "command": "ebook", "args": seed},
        {"label": "Export ebook as PDF", "command": "export_pdf", "args": ""},
    ]


async def generate_workflow_plan(objective: str) -> list[dict]:
    client = get_openai_client()
    if client is None:
        logger.warning("OpenAI unavailable — using fallback plan")
        return _fallback_plan(objective)

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _PLANNER_SYSTEM_PROMPT},
                {"role": "user", "content": f"Objective: {objective}"},
            ],
            max_tokens=600,
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""
        data = json.loads(raw)

        steps_raw = None
        if isinstance(data, list):
            steps_raw = data
        elif isinstance(data, dict):
            for key in ("plan", "steps", "workflow", "tasks"):
                if isinstance(data.get(key), list):
                    steps_raw = data[key]
                    break
            if steps_raw is None:
                for v in data.values():
                    if isinstance(v, list):
                        steps_raw = v
                        break

        if not steps_raw:
            logger.warning("Planner returned no parseable steps — using fallback")
            return _fallback_plan(objective)

        validated: list[dict] = []
        for step in steps_raw:
            if not isinstance(step, dict):
                continue
            cmd = step.get("command", "")
            if cmd not in _VALID_COMMANDS:
                continue
            validated.append({
                "label": str(step.get("label", cmd.replace("_", " ").capitalize())),
                "command": cmd,
                "args": str(step.get("args", objective[:120])),
            })

        if not validated:
            logger.warning("No valid steps after validation — using fallback")
            return _fallback_plan(objective)

        return validated[:6]

    except (json.JSONDecodeError, OpenAIError, Exception) as e:
        logger.error("Workflow planner error: %s", e)
        return _fallback_plan(objective)


# ---------------------------------------------------------------------------
# Product framing
# ---------------------------------------------------------------------------

_PRODUCT_SYSTEM_PROMPT = """
You are a product strategist for Sentinel Fortune — a private U.S. IP holding and licensing structure.

Given a content seed, optional content type, and an optional excerpt, create a clear, strategic product framing.
No hype. No guaranteed revenue. No market dominance claims. Frame the output as a potential digital product, sellable asset, or premium downloadable pack.

Use EXACTLY these section labels, each on its own line:

Product Title:
Product Type:
Core Positioning:
Intended User:
What's Included:
Primary Use Case:
Delivery Format:
Monetizable Angle:
Next Expansion Path:

Rules:
- Product Type must reflect the content type (e.g., Teaching Guide, Meditation Pack, Story Asset, Coaching Note, Ebook Product, Strategic Brief)
- What's Included: list only formats that realistically exist now (PDF, DOCX, MP3 if audio was generated) — do not invent formats
- Monetizable Angle: frame as a potential sellable or downloadable asset, not a guaranteed income source
- Keep the tone strategic, premium, and grounded
""".strip()

_BUNDLE_SYSTEM_PROMPT = """
You are a product strategist for Sentinel Fortune — a private U.S. IP holding and licensing structure.

Given a content seed, optional content type, and an optional excerpt, design a realistic multi-format bundle concept.
No hype. No income projections. No market dominance claims.

Use EXACTLY these section labels, each on its own line:

Bundle Title:
Bundle Positioning:
Included Assets:
Best Audience:
Recommended Delivery:
Upsell / Expansion Potential:

Rules:
- Included Assets: list only formats that are realistically achievable. Mark optional additions with "(recommended addition)"
- Best Audience: be specific and honest
- Keep tone structured, commercial, and realistic
- Upsell potential should be honest and achievable, not speculative
""".strip()


async def generate_product_framing(
    seed: str,
    content_type: str = "",
    body_excerpt: str = "",
) -> str:
    client = get_openai_client()
    if client is None:
        return FALLBACK_MESSAGE

    context_parts: list[str] = []
    if content_type:
        context_parts.append(f"Content type: {content_type}")
    if seed:
        context_parts.append(f"Seed / title: {seed}")
    if body_excerpt:
        context_parts.append(f"Content excerpt:\n{body_excerpt[:500]}")
    context = "\n".join(context_parts) or seed

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _PRODUCT_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            max_tokens=700,
            temperature=0.5,
        )
        content = response.choices[0].message.content
        return sanitize_output(content.strip()) if content else FALLBACK_MESSAGE
    except (OpenAIError, Exception) as e:
        logger.error("Product framing error: %s", e)
        return FALLBACK_MESSAGE


async def generate_bundle_framing(
    seed: str,
    content_type: str = "",
    body_excerpt: str = "",
) -> str:
    client = get_openai_client()
    if client is None:
        return FALLBACK_MESSAGE

    context_parts: list[str] = []
    if content_type:
        context_parts.append(f"Content type: {content_type}")
    if seed:
        context_parts.append(f"Seed / title: {seed}")
    if body_excerpt:
        context_parts.append(f"Content excerpt:\n{body_excerpt[:500]}")
    context = "\n".join(context_parts) or seed

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _BUNDLE_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            max_tokens=600,
            temperature=0.5,
        )
        content = response.choices[0].message.content
        return sanitize_output(content.strip()) if content else FALLBACK_MESSAGE
    except (OpenAIError, Exception) as e:
        logger.error("Bundle framing error: %s", e)
        return FALLBACK_MESSAGE


# ---------------------------------------------------------------------------
# Legacy generic helper (kept for compatibility)
# ---------------------------------------------------------------------------

async def ask_openai(prompt: str, system_prompt: str = "You are a helpful assistant.") -> str:
    client = get_openai_client()
    if client is None:
        return FALLBACK_MESSAGE

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        content = response.choices[0].message.content
        return content.strip() if content else FALLBACK_MESSAGE
    except OpenAIError as e:
        logger.error("OpenAI API error: %s", e)
        return FALLBACK_MESSAGE
    except Exception as e:
        logger.error("Unexpected error calling OpenAI: %s", e)
        return FALLBACK_MESSAGE
