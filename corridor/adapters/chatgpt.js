/* SFL EDITORIAL CORRIDOR — ChatGPT adapter.
 *
 * TRANSLATION ONLY. This file converts the request shape a ChatGPT action
 * sends into the corridor's normalized command. It contains no validation, no
 * authority, no state machine and no publishing logic — all of that lives in
 * the pipeline, and both adapters hand it the same object.
 *
 * If you find yourself adding a rule here, it belongs in the pipeline instead:
 * a rule that exists in one adapter is a rule the other provider does not have.
 */

import { intentToAction } from "../core/pipeline.js";
import { toCommand } from "./shared.js";

export const CLIENT = "CLIENT_CHATGPT";

/**
 * A ChatGPT action request. OpenAI function-calling flattens arguments, so the
 * incoming shape is flat and snake_case; the Owner's own words arrive as
 * `user_message`.
 *
 *   { operation, instruction_id, user_message, branch, content_type,
 *     title, slug, summary, body, language, translations, topics, tags,
 *     hero_media, media, cta, featured, collection, record_id }
 */
export function fromChatGPT(request = {}) {
  const resolved = intentToAction(request.user_message, request.operation);

  return toCommand({
    client: CLIENT,
    intent: resolved.intent,
    action: resolved.action,
    confident: resolved.confident,
    intentSource: resolved.source,
    ownerInstructionId: request.instruction_id,
    recordId: request.record_id,
    limit: request.limit,
    branchFilter: request.branch_filter,
    record: {
      id: request.record_id,
      branch: request.branch,
      contentType: request.content_type,
      title: request.title,
      slug: request.slug,
      summary: request.summary,
      body: request.body,
      language: request.language,
      translations: request.translations,
      topics: request.topics,
      tags: request.tags,
      authorDisplay: request.author_display,
      heroMedia: request.hero_media,
      media: request.media,
      cta: request.cta,
      featured: request.featured,
      collection: request.collection,
      relatedContent: request.related_content,
      publishAt: request.publish_at,
      expiresAt: request.expires_at,
    },
  });
}
