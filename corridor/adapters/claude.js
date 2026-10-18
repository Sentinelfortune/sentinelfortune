/* SFL EDITORIAL CORRIDOR — Claude adapter.
 *
 * TRANSLATION ONLY, exactly as the ChatGPT adapter is. Claude tool calls carry
 * nested camelCase objects rather than a flat snake_case payload, so the shape
 * differs; nothing else does.
 *
 * NO CLAUDE-ONLY BYPASS. Claude reaches the same pipeline, through the same
 * action allow-list, under the same Owner-approval gate. There is no path here
 * that ChatGPT does not also have.
 */

import { intentToAction } from "../core/pipeline.js";
import { toCommand } from "./shared.js";

export const CLIENT = "CLIENT_CLAUDE";

/**
 *   { intent, instructionId, ownerUtterance, recordId,
 *     editorial: { branch, contentType, title, slug, summary, body,
 *                  language, translations, topics, tags, authorDisplay,
 *                  heroMedia, media, cta, featured, collection } }
 */
export function fromClaude(request = {}) {
  const ed = request.editorial || {};
  const resolved = intentToAction(request.ownerUtterance, request.intent);

  return toCommand({
    client: CLIENT,
    intent: resolved.intent,
    action: resolved.action,
    confident: resolved.confident,
    intentSource: resolved.source,
    ownerInstructionId: request.instructionId,
    recordId: request.recordId,
    limit: request.limit,
    branchFilter: request.branchFilter,
    record: {
      id: request.recordId,
      branch: ed.branch,
      contentType: ed.contentType,
      title: ed.title,
      slug: ed.slug,
      summary: ed.summary,
      body: ed.body,
      language: ed.language,
      translations: ed.translations,
      topics: ed.topics,
      tags: ed.tags,
      authorDisplay: ed.authorDisplay,
      heroMedia: ed.heroMedia,
      media: ed.media,
      cta: ed.cta,
      featured: ed.featured,
      collection: ed.collection,
      relatedContent: ed.relatedContent,
      publishAt: ed.publishAt,
      expiresAt: ed.expiresAt,
    },
  });
}
