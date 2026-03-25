/**
 * Sentinel Fortune — Builders Layer API
 *
 * Routes:
 *   GET  /api/builders                  — list all builders
 *   GET  /api/builders/:id              — get single builder spec
 *   POST /api/builders/:id/invoke       — invoke a builder (returns job record → R2)
 *
 * Governance:
 *   - Reads builder registry from originus/global/agents/BUILDER_REGISTRY_MASTER.json (R2 or local)
 *   - Invocations are logged to originus/content/output/{builder_id}/jobs/{ts}.json
 *   - house_signature_builder and deal_pdf_builder require ops_token header
 *   - Frontend must NEVER call invoke directly for governance builders
 */

import { Router, type Request, type Response } from "express";
import fs   from "fs";
import path from "path";
import { readR2, writeR2 } from "../lib/r2Writer";

const router = Router();

// Load builder registry (R2 first, fall back to local repo copy)
const LOCAL_REGISTRY_PATH = path.resolve("../../originus/global/agents/BUILDER_REGISTRY_MASTER.json");
const R2_REGISTRY_KEY     = "originus/global/agents/BUILDER_REGISTRY_MASTER.json";

// Builders that require ops_token header for invocation
const GOVERNANCE_BUILDERS = new Set(["house_signature_builder", "deal_pdf_builder"]);

interface BuilderSpec {
  id: string;
  name: string;
  category: string;
  description: string;
  status: string;
  callable: boolean;
  trigger: Record<string, unknown>;
  input_schema: Record<string, string>;
  output_path: string;
  delivery_path: string;
  monetization: Record<string, unknown>;
  queue_mode: string;
  governance?: string;
  ip_association?: string[];
}

interface BuilderRegistry {
  builders: Record<string, BuilderSpec>;
}

async function loadRegistry(): Promise<BuilderRegistry | null> {
  // Try R2 first
  const r2Data = await readR2<BuilderRegistry>(R2_REGISTRY_KEY);
  if (r2Data) return r2Data;

  // Fall back to local file
  try {
    if (fs.existsSync(LOCAL_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_REGISTRY_PATH, "utf8")) as BuilderRegistry;
    }
  } catch { /* ignore */ }
  return null;
}

// Inline static fallback so the API always responds even without R2/local file
function staticRegistry(): BuilderRegistry {
  return {
    builders: {
      app_builder:             { id:"app_builder",            name:"App Builder",             category:"web",       description:"Builds web app pages and SPA components.",                       status:"registered", callable:true, trigger:{api:"/api/builders/app_builder/invoke",dashboard:true,telegram:false},            input_schema:{project_id:"string",template:"string",domain:"string"},     output_path:"originus/content/output/apps/",    delivery_path:"originus/sites/",         monetization:{tier_required:"pro"},    queue_mode:"sync"  },
      assets_builder:          { id:"assets_builder",         name:"Assets Builder",          category:"media",     description:"Processes and catalogs brand assets to R2.",                     status:"registered", callable:true, trigger:{api:"/api/builders/assets_builder/invoke",dashboard:true,telegram:false},         input_schema:{asset_type:"string",source_url:"string",brand:"string"},    output_path:"originus/global/assets/",          delivery_path:"originus/public/assets/", monetization:{tier_required:"oem"},    queue_mode:"async" },
      snippets_builder:        { id:"snippets_builder",       name:"Snippets Builder",        category:"content",   description:"Generates content snippets for feed and Telegram.",               status:"registered", callable:true, trigger:{api:"/api/builders/snippets_builder/invoke",dashboard:true,telegram:"/snippet"},   input_schema:{topic:"string",tone:"string",length:"number"},               output_path:"originus/content/output/snippets/", delivery_path:"originus/content/feed/",  monetization:{tier_required:null},     queue_mode:"sync"  },
      ebook_builder:           { id:"ebook_builder",          name:"Ebook Builder",           category:"content",   description:"Generates structured ebook PDFs.",                               status:"registered", callable:true, trigger:{api:"/api/builders/ebook_builder/invoke",dashboard:true,telegram:false},          input_schema:{title:"string",author:"string",chapters:"array"},           output_path:"originus/products/digital/ebooks/", delivery_path:"originus/delivery/",     monetization:{tier_required:"starter"},queue_mode:"async" },
      offer_pack_builder:      { id:"offer_pack_builder",     name:"Offer Pack Builder",      category:"commerce",  description:"Packages offers into structured bundles with Stripe links.",      status:"registered", callable:true, trigger:{api:"/api/builders/offer_pack_builder/invoke",dashboard:true,telegram:false},     input_schema:{pack_id:"string",tier:"string",items:"array"},              output_path:"originus/products/bundles/",        delivery_path:"originus/products/",      monetization:{tier_required:null},     queue_mode:"sync"  },
      landing_page_builder:    { id:"landing_page_builder",   name:"Landing Page Builder",    category:"web",       description:"Generates landing page content manifests for CF Workers.",        status:"registered", callable:true, trigger:{api:"/api/builders/landing_page_builder/invoke",dashboard:true,telegram:false},   input_schema:{page_id:"string",domain:"string",headline:"string"},        output_path:"originus/sites/",                  delivery_path:"originus/hub/manifests/", monetization:{tier_required:"pro"},    queue_mode:"sync"  },
      deal_pdf_builder:        { id:"deal_pdf_builder",       name:"Deal PDF Builder",        category:"documents", description:"Generates deal PDFs. Owner is final signer.",                    status:"registered", callable:true, trigger:{api:"/api/builders/deal_pdf_builder/invoke",dashboard:true,telegram:false},       input_schema:{deal_id:"string",deal_type:"string",parties:"array"},       output_path:"originus/deals/generated_pdfs/",   delivery_path:"originus/private/",       monetization:{tier_required:"licensing"},queue_mode:"sync", governance:"owner_must_sign" },
      house_signature_builder: { id:"house_signature_builder",name:"House Signature Builder", category:"documents", description:"Generates official SFL house signature documents.",               status:"registered", callable:true, trigger:{api:"/api/builders/house_signature_builder/invoke",dashboard:true,telegram:false}, input_schema:{deal_id:"string",parties:"array",terms:"object"},           output_path:"originus/deals/generated_pdfs/",   delivery_path:"originus/private/",       monetization:{tier_required:"licensing"},queue_mode:"sync", governance:"owner_must_sign" },
      video_builder:           { id:"video_builder",          name:"Video Builder",           category:"media",     description:"Builds video production manifests and scene structure.",          status:"registered", callable:true, trigger:{api:"/api/builders/video_builder/invoke",dashboard:true,telegram:false},         input_schema:{title:"string",scenes:"array",format:"string"},             output_path:"originus/content/output/videos/",  delivery_path:"originus/sites/codexworldtv.homes/", monetization:{tier_required:"pro"}, queue_mode:"async",ip_association:["RATOU","CODEX SHARDS"] },
      image_rebuilder:         { id:"image_rebuilder",        name:"Image Rebuilder",         category:"media",     description:"Processes and optimizes images with canonical R2 naming.",       status:"registered", callable:true, trigger:{api:"/api/builders/image_rebuilder/invoke",dashboard:true,telegram:false},        input_schema:{source_path:"string",target_format:"string",brand:"string"},output_path:"originus/global/assets/images/",   delivery_path:"originus/public/assets/", monetization:{tier_required:"oem"},    queue_mode:"async" },
      bot_builder:             { id:"bot_builder",            name:"Bot Builder",             category:"automation",description:"Generates bot configs, command maps, and handler stubs.",         status:"registered", callable:true, trigger:{api:"/api/builders/bot_builder/invoke",dashboard:true,telegram:false},            input_schema:{bot_name:"string",commands:"array",domain:"string"},        output_path:"originus/content/output/bots/",    delivery_path:"originus/global/system/", monetization:{tier_required:"oem"},    queue_mode:"sync"  },
      cartoon_builder:         { id:"cartoon_builder",        name:"Cartoon Builder",         category:"media",     description:"Builds cartoon/animated content specs for RATOU universe.",       status:"registered", callable:true, trigger:{api:"/api/builders/cartoon_builder/invoke",dashboard:true,telegram:false},        input_schema:{universe:"string",scene:"string",characters:"array"},       output_path:"originus/content/output/cartoons/",delivery_path:"originus/sites/codexworldtv.homes/", monetization:{tier_required:"pro"}, queue_mode:"async",ip_association:["RATOU","CODEX SHARDS"] },
      mini_web_games_builder:  { id:"mini_web_games_builder", name:"Mini Web Games Builder",  category:"games",     description:"Builds mini web game manifests for lumengame.vip.",               status:"registered", callable:true, trigger:{api:"/api/builders/mini_web_games_builder/invoke",dashboard:true,telegram:false},  input_schema:{game_id:"string",title:"string",genre:"string"},            output_path:"originus/content/output/games/",   delivery_path:"originus/sites/lumengame.vip/",  monetization:{tier_required:"pro"},    queue_mode:"async",ip_association:["RATOU"] },
      audiobook_builder:       { id:"audiobook_builder",      name:"Audiobook Builder",       category:"audio",     description:"Builds audiobook structure and chapter sequence.",                status:"registered", callable:true, trigger:{api:"/api/builders/audiobook_builder/invoke",dashboard:true,telegram:false},       input_schema:{title:"string",source_text:"string",voice_profile:"string"},output_path:"originus/content/output/audiobooks/",delivery_path:"originus/products/digital/audio/",monetization:{tier_required:"pro"},queue_mode:"async" },
      agent_service_builder:   { id:"agent_service_builder",  name:"Agent Service Builder",   category:"automation",description:"Registers and configures callable agent services.",               status:"registered", callable:true, trigger:{api:"/api/builders/agent_service_builder/invoke",dashboard:true,telegram:false},   input_schema:{agent_id:"string",capabilities:"array",trigger_rules:"object"},output_path:"originus/global/agents/",        delivery_path:"originus/global/agents/", monetization:{tier_required:"oem"},    queue_mode:"sync"  }
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/builders — list all
// ---------------------------------------------------------------------------
router.get("/builders", async (_req: Request, res: Response) => {
  const registry = (await loadRegistry()) ?? staticRegistry();
  const list = Object.values(registry.builders).map(b => ({
    id: b.id, name: b.name, category: b.category,
    description: b.description, status: b.status,
    callable: b.callable, queue_mode: b.queue_mode,
    invoke_url: `/api/builders/${b.id}/invoke`,
    monetization: b.monetization,
    ...(b.ip_association ? { ip_association: b.ip_association } : {}),
    ...(b.governance ? { governance: b.governance } : {}),
  }));
  res.json({ ok: true, count: list.length, builders: list });
});

// ---------------------------------------------------------------------------
// GET /api/builders/:id — single builder spec
// ---------------------------------------------------------------------------
router.get("/builders/:id", async (req: Request, res: Response) => {
  const registry = (await loadRegistry()) ?? staticRegistry();
  const spec = registry.builders[req.params.id];
  if (!spec) {
    res.status(404).json({ ok: false, error: "Builder not found", id: req.params.id });
    return;
  }
  res.json({ ok: true, builder: spec });
});

// ---------------------------------------------------------------------------
// POST /api/builders/:id/invoke — invoke builder
// ---------------------------------------------------------------------------
router.post("/builders/:id/invoke", async (req: Request, res: Response) => {
  const builderId = req.params.id;
  const registry  = (await loadRegistry()) ?? staticRegistry();
  const spec      = registry.builders[builderId];

  if (!spec) {
    res.status(404).json({ ok: false, error: "Builder not found", id: builderId });
    return;
  }

  // Governance check — governance builders require ops_token header
  if (GOVERNANCE_BUILDERS.has(builderId)) {
    const token = req.headers["x-ops-token"] as string | undefined;
    const opsToken = process.env["OPS_TOKEN"];
    if (!opsToken || token !== opsToken) {
      res.status(403).json({ ok: false, error: "Governance builder requires ops_token header" });
      return;
    }
  }

  const input = req.body ?? {};
  const jobId = `${builderId}_${Date.now()}`;
  const ts    = new Date().toISOString();

  // Build job record
  const jobRecord = {
    job_id:      jobId,
    builder_id:  builderId,
    builder_name:spec.name,
    input,
    status:      "queued",
    queue_mode:  spec.queue_mode,
    output_path: spec.output_path,
    created_at:  ts,
    r2_key:      `originus/content/output/${builderId}/jobs/${jobId}.json`,
  };

  // Log invocation to R2 (fire and forget — does not block response)
  void writeR2(jobRecord.r2_key, jobRecord as unknown as Record<string, unknown>);

  // For sync builders: return immediately with job record
  // For async builders: return queued status — actual execution wired externally
  const responseStatus = spec.queue_mode === "sync" ? "accepted" : "queued";

  res.status(202).json({
    ok:          true,
    job_id:      jobId,
    builder_id:  builderId,
    builder_name:spec.name,
    status:      responseStatus,
    queue_mode:  spec.queue_mode,
    output_path: spec.output_path,
    r2_key:      jobRecord.r2_key,
    created_at:  ts,
    message:     `Builder ${spec.name} ${responseStatus}. Job ${jobId} created.`,
  });
});

export default router;
