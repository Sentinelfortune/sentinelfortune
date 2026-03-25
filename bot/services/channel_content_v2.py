"""
Sentinel Channel Content v2 -- Expanded 10-post premium bundles.

Each bundle:
  Post 1     = pinned welcome anchor
  Posts 2-8  = structured value content
  Post 9     = execution orientation
  Post 10    = next-step CTA

Drip mode: reads/writes queue index from R2
  originus/channel_content/{product_id}/queue.json  -> {"index": N}

Bundle storage:
  originus/channel_content/{product_id}/bundle_v2.json (written on first publish)
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_LOG_PREFIX   = "originus/channel_content_logs/"
_QUEUE_PREFIX = "originus/channel_content/"

# ---------------------------------------------------------------------------
# RESET V1 -- 10 posts
# ---------------------------------------------------------------------------

_RESET_V2 = [
    (
        "<b>SENTINEL RESET -- PRIVATE ACCESS</b>\n\n"
        "This channel exists for one purpose:\n"
        "to return you to a stable, clear, operational state.\n\n"
        "You are here because you understand that the internal environment "
        "is the source of all external results.\n\n"
        "Work through this channel in sequence.\n"
        "Each post addresses a specific layer of the reset process.\n\n"
        "Do not rush the sequence.\n"
        "Apply each layer before moving to the next.\n\n"
        "<i>Foundation before momentum. Stability before scale.</i>"
    ),
    (
        "<b>MENTAL DECLUTTER</b>\n\n"
        "The mind under pressure accumulates noise.\n\n"
        "Noise is not the problem. The inability to separate signal from noise is.\n\n"
        "The declutter method:\n\n"
        "1. Write everything currently occupying your mind -- no filter\n"
        "2. Separate each item: Is this actionable right now? Yes or no.\n"
        "3. Remove everything marked 'no' from your active field\n"
        "4. What remains is your current signal\n\n"
        "You are not eliminating concerns.\n"
        "You are removing them from the foreground so you can operate clearly.\n\n"
        "<b>Declutter before you plan. Plan before you execute.</b>"
    ),
    (
        "<b>CLARITY RECOVERY</b>\n\n"
        "Clarity is not a feeling. It is a state produced by a method.\n\n"
        "When clarity is lost, most people search for motivation.\n"
        "This is the wrong move.\n\n"
        "Motivation follows clarity. Clarity does not follow motivation.\n\n"
        "Clarity recovery protocol:\n\n"
        "Step 1 -- Stop all activity for 10 minutes\n"
        "Step 2 -- Answer one question only: What is the actual situation?\n"
        "Step 3 -- Identify one true next action\n"
        "Step 4 -- Take that action within the next 10 minutes\n\n"
        "Clarity is restored through structure and movement, not through thinking.\n\n"
        "<b>Do not think your way to clarity. Move your way there.</b>"
    ),
    (
        "<b>EMOTIONAL STABILIZATION</b>\n\n"
        "Emotional instability is not weakness.\n"
        "It is energy without direction.\n\n"
        "The stabilization principle:\n"
        "You cannot suppress it. You can redirect it.\n\n"
        "When emotional pressure rises:\n\n"
        "1. Name it precisely -- not 'I feel bad' but 'I feel fear / anger / grief'\n"
        "2. Locate it physically -- where in the body is it?\n"
        "3. Accept its presence without acting from it\n"
        "4. Redirect by stating the intended operating state:\n"
        "   'I am choosing to operate from stability.'\n\n"
        "This is not a spiritual practice. It is an operational one.\n"
        "Regulated operators make better decisions.\n\n"
        "<b>Stabilize the operator before executing the operation.</b>"
    ),
    (
        "<b>RESET ACTIONS</b>\n\n"
        "When stabilization is complete, the reset becomes executable.\n\n"
        "These are the five reset actions:\n\n"
        "<b>1. Environment reset</b>\n"
        "Clear the physical space you work in.\n\n"
        "<b>2. Communication reset</b>\n"
        "Close all open loops -- respond, decline, or defer everything pending.\n\n"
        "<b>3. Commitment reset</b>\n"
        "Review current commitments. Remove what no longer belongs.\n\n"
        "<b>4. Priority reset</b>\n"
        "Identify the single most important action for the next 48 hours.\n\n"
        "<b>5. State reset</b>\n"
        "Sleep, move, eat deliberately. The body is infrastructure.\n\n"
        "Execute all five in order. One per day if necessary.\n\n"
        "<b>A reset is not an event. It is a sequence.</b>"
    ),
    (
        "<b>THE RETURN PROTOCOL</b>\n\n"
        "After a reset, the return to operation requires structure.\n\n"
        "Returning too fast re-creates the destabilization.\n"
        "Returning too slow creates avoidance.\n\n"
        "The return protocol:\n\n"
        "Day 1 -- Orientation only. No major decisions.\n"
        "Day 2 -- One action on the primary objective.\n"
        "Day 3 -- Full operating tempo resumed.\n\n"
        "If destabilization returns before Day 3 is complete:\n"
        "Do not restart the reset. Apply stabilization protocol (Post 4) and continue.\n\n"
        "The reset does not need to be repeated. The skills do.\n\n"
        "<b>Build the return into every reset. It is not optional.</b>"
    ),
    (
        "<b>FOUNDATION REBUILDING</b>\n\n"
        "The goal of a reset is not recovery to a previous state.\n"
        "It is construction of a stronger foundation.\n\n"
        "A stronger foundation has four components:\n\n"
        "<b>1. Routines that do not depend on motivation</b>\n"
        "Morning structure. Evening close. Non-negotiable.\n\n"
        "<b>2. Decisions pre-made in advance</b>\n"
        "Energy is not spent deciding what is already decided.\n\n"
        "<b>3. Commitments that match capacity</b>\n"
        "Not fewer goals. Realistic load relative to actual capacity.\n\n"
        "<b>4. Recovery built into the schedule</b>\n"
        "Performance without recovery is degradation.\n\n"
        "<b>The goal is a foundation that does not require another reset.</b>"
    ),
    (
        "<b>STATE MANAGEMENT AS A SYSTEM</b>\n\n"
        "Single resets address crises.\n"
        "State management systems prevent them.\n\n"
        "A state management system requires:\n\n"
        "<b>Daily inputs:</b>\n"
        "Sleep, movement, one point of clarity, one point of progress\n\n"
        "<b>Weekly inputs:</b>\n"
        "Review, reset, forward orientation\n\n"
        "<b>Monthly inputs:</b>\n"
        "Objective review, load assessment, relationship to goals\n\n"
        "The system does not require perfection.\n"
        "It requires consistency at the daily level.\n\n"
        "One missed day is not a system failure.\n"
        "Three consecutive missed days signals a review is needed.\n\n"
        "<b>System maintenance is the product of discipline, not inspiration.</b>"
    ),
    (
        "<b>EXECUTION ORIENTATION</b>\n\n"
        "You have worked through the reset sequence.\n\n"
        "Before returning to full operation, confirm:\n\n"
        "- Internal state is stable (not perfect -- stable)\n"
        "- The ONE primary objective for this week is identified\n"
        "- The first action toward that objective is defined\n"
        "- The daily anchor practice is in place\n\n"
        "If any of the above is missing -- return to the relevant post and complete it.\n\n"
        "Operation built on an incomplete reset is operation built on instability.\n\n"
        "<b>Confirm readiness before resuming full load.</b>"
    ),
    (
        "<b>NEXT STEP -- SENTINEL ACCESS</b>\n\n"
        "The Reset channel addresses the internal foundation.\n\n"
        "If you are ready to move into structured execution:\n\n"
        "Sentinel Access is the next layer.\n"
        "It covers:\n"
        "- How the full Sentinel system operates\n"
        "- How to progress through the product ecosystem\n"
        "- The operational framework for sustained performance\n\n"
        "Everything built here carries forward.\n"
        "Nothing is discarded. The foundation is integrated into the system.\n\n"
        "<i>The reset is complete. The next layer is available when you are ready.</i>"
    ),
]

# ---------------------------------------------------------------------------
# QUICK ACCESS V1 -- 10 posts
# ---------------------------------------------------------------------------

_QUICK_V2 = [
    (
        "<b>SENTINEL QUICK ACCESS -- PRIVATE ACCESS</b>\n\n"
        "This channel is built for operators who need to move fast and move right.\n\n"
        "No lengthy theory. No motivation content. No filler.\n\n"
        "What you will find here:\n"
        "- Frameworks that produce immediate decisions\n"
        "- Filters that eliminate the wrong directions fast\n"
        "- Execution prompts that generate movement within hours\n\n"
        "Work through each post in order on first access.\n"
        "Return to individual posts when facing specific decisions.\n\n"
        "<i>Clarity at speed is a skill. This channel builds it.</i>"
    ),
    (
        "<b>THE CLARITY FRAMEWORK</b>\n\n"
        "Clarity has a structure. It is not a mood.\n\n"
        "The Sentinel Clarity Framework:\n\n"
        "<b>OBSERVE</b>\n"
        "What is actually happening? Not the interpretation -- the facts.\n\n"
        "<b>SEPARATE</b>\n"
        "What is within your control? What is not?\n"
        "Only engage with what is within control.\n\n"
        "<b>DEFINE</b>\n"
        "What outcome do you actually want?\n"
        "State it in one sentence.\n\n"
        "<b>ACT</b>\n"
        "What is the single next action toward that outcome?\n"
        "Take it now.\n\n"
        "OBSERVE. SEPARATE. DEFINE. ACT.\n\n"
        "<b>This is the operating sequence. Run it on every decision point.</b>"
    ),
    (
        "<b>IDEA FILTERING</b>\n\n"
        "The problem is rarely too few ideas.\n"
        "The problem is too many ideas with no filter.\n\n"
        "Apply the three-question filter to every idea before acting on it:\n\n"
        "<b>Q1: Does this directly produce revenue or reduce cost within 30 days?</b>\n"
        "If no -- it is deferred, not acted on.\n\n"
        "<b>Q2: Do you have the resources to execute this now?</b>\n"
        "If no -- it goes to the ideas log, not the active queue.\n\n"
        "<b>Q3: Does this align with the ONE objective this period?</b>\n"
        "If no -- it waits.\n\n"
        "Ideas that pass all three filters enter the active queue.\n"
        "Ideas that fail any filter are logged and released from active attention.\n\n"
        "<b>The filter is not rejection. It is prioritization with precision.</b>"
    ),
    (
        "<b>OFFER SIMPLIFICATION</b>\n\n"
        "Most offers fail not because they are wrong, but because they are unclear.\n\n"
        "The simplification test:\n\n"
        "Can you describe your offer in one sentence that a stranger understands?\n\n"
        "Structure: [Who] gets [What result] by [How] in [What timeframe].\n\n"
        "Example:\n"
        "Operators who are stuck get a clear execution framework "
        "through structured content access in under 30 days.\n\n"
        "If your offer cannot fit this structure cleanly --\n"
        "it is not an offer yet. It is a concept.\n\n"
        "Simplify the offer before promoting it.\n"
        "An unclear offer produces confused buyers, not sales.\n\n"
        "<b>One sentence. Complete information. No jargon.</b>"
    ),
    (
        "<b>QUICK EXECUTION PROMPTS</b>\n\n"
        "When action is needed and you are stuck, use one of these:\n\n"
        "<b>PROMPT 1 -- The 5-minute start</b>\n"
        "Do five minutes of work on the primary task.\n"
        "Not until it is done. Five minutes. Then assess.\n\n"
        "<b>PROMPT 2 -- The constraint question</b>\n"
        "What single thing, if removed, would make this easy?\n"
        "Address only that constraint.\n\n"
        "<b>PROMPT 3 -- The output question</b>\n"
        "What is the smallest deliverable this work produces?\n"
        "Produce that. Expand from there.\n\n"
        "<b>PROMPT 4 -- The 24-hour frame</b>\n"
        "What can be completed in the next 24 hours that moves this forward?\n"
        "Only that. Nothing outside the 24-hour frame.\n\n"
        "<b>Execution prompts break inertia. Use the one that fits the moment.</b>"
    ),
    (
        "<b>DECISION VELOCITY</b>\n\n"
        "Slow decisions are not careful decisions.\n"
        "They are deferred decisions with accumulated anxiety.\n\n"
        "The Sentinel decision rule:\n\n"
        "If a decision requires less than 48 hours of information gathering -- decide now.\n"
        "If it requires more -- set a decision date and gather only what is needed.\n\n"
        "Most decisions that feel complex are actually simple decisions with emotional weight.\n\n"
        "Separate the emotional weight from the logical question.\n"
        "Answer the logical question first.\n"
        "Then address the emotional weight separately.\n\n"
        "Decision velocity is not recklessness.\n"
        "It is the discipline to move at the correct speed for the decision type.\n\n"
        "<b>Match speed to the decision. Do not apply the same pace to all problems.</b>"
    ),
    (
        "<b>OUTPUT OVER INPUT</b>\n\n"
        "High performers do not consume more.\n"
        "They produce more from less.\n\n"
        "The input trap:\n"
        "More content, more courses, more research -- as a substitute for output.\n\n"
        "The output discipline:\n\n"
        "For every hour of input consumed, produce one unit of output.\n"
        "A unit of output is: a decision made, a task completed, something shipped.\n\n"
        "This is not about reducing learning.\n"
        "It is about balancing the input-output ratio to produce tangible results.\n\n"
        "Track your ratio this week:\n"
        "How many hours of input? How many units of output?\n\n"
        "<b>If input exceeds output by more than 2:1 -- shift the balance immediately.</b>"
    ),
    (
        "<b>THE SHORT LOOP</b>\n\n"
        "Long planning cycles produce planning fatigue, not results.\n\n"
        "The short loop model:\n\n"
        "<b>72-hour cycles</b>\n"
        "Set one objective every 72 hours.\n"
        "Review at hour 72. Reset for the next 72.\n\n"
        "This model works because:\n"
        "- 72 hours is long enough to complete meaningful work\n"
        "- Short enough to course-correct before drift becomes damage\n"
        "- Frequent enough to build review discipline\n\n"
        "Start now:\n"
        "What is the ONE objective for the next 72 hours?\n"
        "State it. Write it. Execute against it.\n\n"
        "<b>Three days of focused execution outperforms three weeks of scattered effort.</b>"
    ),
    (
        "<b>EXECUTION ORIENTATION</b>\n\n"
        "You now have the core Quick Access framework.\n\n"
        "Before you close this channel today:\n\n"
        "1. Identify your ONE objective for the next 72 hours\n"
        "2. Apply the Clarity Framework to the first obstacle\n"
        "3. Run the three-question filter on any ideas currently in your head\n"
        "4. Commit to one execution prompt from Post 5 before the day ends\n\n"
        "Do not leave this channel without an active objective and a first action.\n\n"
        "Passive reading produces passive results.\n\n"
        "<b>You have the tools. Use them within the hour.</b>"
    ),
    (
        "<b>NEXT STEP -- SENTINEL ENGINE</b>\n\n"
        "Quick Access gives you the operating speed.\n\n"
        "The next layer is execution infrastructure:\n\n"
        "Sentinel Engine covers:\n"
        "- Full monetization frameworks\n"
        "- Offer-to-revenue systems\n"
        "- Operational discipline at scale\n"
        "- The complete execution architecture\n\n"
        "Quick Access is the entry. Engine is the acceleration.\n\n"
        "When you have completed and applied everything in this channel,\n"
        "the Engine layer is your next move.\n\n"
        "<i>Speed is useful. Speed with architecture is compound.</i>"
    ),
]

# ---------------------------------------------------------------------------
# TEACHINGS VAULT V1 -- 10 posts
# ---------------------------------------------------------------------------

_VAULT_V2 = [
    (
        "<b>SENTINEL TEACHINGS VAULT -- PRIVATE ACCESS</b>\n\n"
        "This channel is not a course.\n"
        "It is a structured library of applied principles.\n\n"
        "The Teachings Vault exists because most operators fail not from lack of effort,\n"
        "but from operating on incomplete or incorrect foundations.\n\n"
        "Each post in this channel addresses one foundational principle.\n"
        "The principles compound. The sequence is deliberate.\n\n"
        "Read slowly. Apply before advancing.\n\n"
        "<i>Depth produces durability. Surface produces fragility.</i>"
    ),
    (
        "<b>TEACHING -- STATE BEFORE STRATEGY</b>\n\n"
        "Every strategy is executed by a person.\n"
        "That person has a state.\n"
        "The strategy performs at the level of the state.\n\n"
        "This is why identical strategies produce different results for different operators.\n"
        "The variable is not the strategy. It is the state of the person executing it.\n\n"
        "Implication:\n"
        "Before evaluating your strategy, evaluate your state.\n\n"
        "A clear, stable operator with a mediocre strategy will outperform\n"
        "a destabilized operator with a perfect strategy.\n\n"
        "State is not a soft concept.\n"
        "It is the most important operational variable.\n\n"
        "<b>Address state first. Strategy second. Tactics third.</b>"
    ),
    (
        "<b>APPLIED REFLECTION -- THE COST OF NOISE</b>\n\n"
        "Noise is any input that consumes attention without producing clarity or output.\n\n"
        "Noise is not always loud.\n"
        "The most damaging noise is low-grade and constant:\n"
        "- Unresolved decisions sitting in the background\n"
        "- Commitments that conflict with each other\n"
        "- Relationships that drain without reciprocating\n"
        "- Content consumed without application\n\n"
        "Measure your noise load:\n"
        "How many unresolved decisions are currently in the background?\n"
        "How many commitments conflict with your primary objective?\n\n"
        "The answer tells you why your output is at its current level.\n\n"
        "<b>Reduce noise before adding more input. Less is not a compromise. It is a strategy.</b>"
    ),
    (
        "<b>STRUCTURED INSIGHT -- THE CLARITY HIERARCHY</b>\n\n"
        "Not all clarity is equal. There is a hierarchy:\n\n"
        "<b>Level 1 -- Clarity of values</b>\n"
        "What do you actually stand for? What will you not compromise?\n\n"
        "<b>Level 2 -- Clarity of direction</b>\n"
        "Where are you building toward? 3-year horizon.\n\n"
        "<b>Level 3 -- Clarity of objective</b>\n"
        "What is the specific outcome for this quarter?\n\n"
        "<b>Level 4 -- Clarity of action</b>\n"
        "What is the next step today?\n\n"
        "Most operators live at Level 4 without establishing Levels 1-3.\n"
        "Actions without direction produce activity, not progress.\n\n"
        "Complete the hierarchy from the top down before optimizing execution.\n\n"
        "<b>Actions are only as useful as the direction they serve.</b>"
    ),
    (
        "<b>EXECUTION LESSON -- THE RIGHT SEQUENCE</b>\n\n"
        "Most execution failures are sequencing failures.\n\n"
        "The correct execution sequence:\n\n"
        "<b>1. Validate the outcome</b>\n"
        "Is this outcome actually worth pursuing at this stage?\n\n"
        "<b>2. Identify the constraint</b>\n"
        "What single factor is most limiting progress right now?\n\n"
        "<b>3. Address only the constraint</b>\n"
        "Everything else is secondary until the constraint is resolved.\n\n"
        "<b>4. Measure and advance</b>\n"
        "After the constraint is resolved, identify the next one.\n\n"
        "The error: working on steps 3 and 4 before completing 1 and 2.\n"
        "This produces optimized effort toward the wrong outcomes.\n\n"
        "<b>Right sequence over fast execution. Every time.</b>"
    ),
    (
        "<b>TEACHING ON OWNERSHIP</b>\n\n"
        "Ownership is not a legal status.\n"
        "It is an operating posture.\n\n"
        "An ownership posture means:\n"
        "The outcome is yours regardless of what contributed to the current situation.\n\n"
        "This is not about blame.\n"
        "It is about agency.\n\n"
        "The operator who says 'This happened to me' is waiting for external correction.\n"
        "The operator who says 'This is mine to resolve' is already in motion.\n\n"
        "Circumstances do not determine outcomes.\n"
        "The response to circumstances does.\n\n"
        "Ownership produces agency.\n"
        "Agency produces options.\n"
        "Options produce leverage.\n\n"
        "<b>Take ownership of the situation before taking action on it.</b>"
    ),
    (
        "<b>TEACHING ON POSITIONING</b>\n\n"
        "Positioning is not marketing.\n"
        "Positioning is the answer to one question:\n"
        "Why would someone choose you over every alternative, including doing nothing?\n\n"
        "Weak positioning answers this question vaguely.\n"
        "Strong positioning answers it precisely.\n\n"
        "The precision test:\n"
        "Can you identify the specific person your offer is designed for?\n"
        "Can you describe the specific problem it resolves?\n"
        "Can you explain why your method produces the result better than alternatives?\n\n"
        "If any answer is unclear -- the positioning is not complete.\n\n"
        "Positioning is defined before any audience-building or marketing begins.\n"
        "Not after.\n\n"
        "<b>Position precisely. Then communicate. In that order.</b>"
    ),
    (
        "<b>THE PRINCIPLE OF DELIBERATE ACTION</b>\n\n"
        "Deliberate action is action taken with conscious intent, clear objective, and measured output.\n\n"
        "The opposite is reactive action: responding to what arrives rather than pursuing what is intended.\n\n"
        "Most operators spend 80% of their time in reactive mode.\n"
        "High performers invert this.\n\n"
        "The deliberate action practice:\n\n"
        "Before taking any significant action, state:\n"
        "- The specific outcome this action is intended to produce\n"
        "- The timeframe for that outcome\n"
        "- How you will measure whether it was achieved\n\n"
        "If you cannot answer all three -- the action is not yet deliberate.\n"
        "Refine it before executing.\n\n"
        "<b>Deliberate action is rare. That is precisely why it compounds.</b>"
    ),
    (
        "<b>EXECUTION ORIENTATION</b>\n\n"
        "You have worked through the core teachings.\n\n"
        "Before proceeding, identify:\n\n"
        "1. Which teaching produced the most friction when you read it?\n"
        "   That is the one most relevant to your current situation.\n\n"
        "2. What one behavioral change would applying that teaching require?\n\n"
        "3. Commit to that change for the next 30 days.\n\n"
        "A teaching that produces no behavioral change is information, not wisdom.\n\n"
        "The Vault is a tool, not a library.\n"
        "Use it to produce change, not to accumulate knowledge.\n\n"
        "<b>One teaching. Applied. Measured. That is the standard here.</b>"
    ),
    (
        "<b>NEXT STEP -- SENTINEL ENGINE</b>\n\n"
        "The Teachings Vault builds the intellectual foundation.\n\n"
        "The Sentinel Engine puts it into operational form:\n"
        "- Monetization systems built on correct principles\n"
        "- Execution architecture that compounds\n"
        "- Offer and revenue frameworks derived from the teachings\n\n"
        "The Vault without the Engine is philosophy.\n"
        "The Engine without the Vault is tactics without grounding.\n\n"
        "Both together produce a complete operating system.\n\n"
        "<i>The foundation is laid. The structure is the next build.</i>"
    ),
]

# ---------------------------------------------------------------------------
# SENTINEL ACCESS V1 -- 10 posts
# ---------------------------------------------------------------------------

_ACCESS_V2 = [
    (
        "<b>SENTINEL ACCESS -- SYSTEM ENTRY</b>\n\n"
        "You have entered the Sentinel operating system.\n\n"
        "Sentinel is not a product. It is a structured methodology\n"
        "for building clarity, execution capability, and long-term leverage.\n\n"
        "Access level is the entry point.\n"
        "It is where the framework is installed before the system is run.\n\n"
        "Work through this channel completely before accessing higher layers.\n"
        "The sequence exists for a reason.\n\n"
        "<i>You cannot run a system you have not yet installed.\n"
        "This channel is the installation.</i>"
    ),
    (
        "<b>THE SENTINEL ECOSYSTEM</b>\n\n"
        "Sentinel is structured in three operational layers:\n\n"
        "<b>LAYER 1 -- FOUNDATION</b>\n"
        "Reset. Quick Access. Teachings Vault. Sentinel Access.\n"
        "Internal stability. Clarity frameworks. Principle installation.\n\n"
        "<b>LAYER 2 -- EXECUTION</b>\n"
        "Sentinel Engine.\n"
        "Monetization. Operations. Revenue architecture. Deal execution.\n\n"
        "<b>LAYER 3 -- ARCHITECTURE</b>\n"
        "Sentinel Architect.\n"
        "Systems design. IP. Long-term positioning. Strategic leverage.\n\n"
        "Each layer requires the previous one to be functional.\n"
        "There is no shortcut through the sequence.\n\n"
        "You are currently in Layer 1.\n\n"
        "<b>Complete Layer 1 before attempting to operate in Layer 2.</b>"
    ),
    (
        "<b>HOW TO USE SENTINEL</b>\n\n"
        "Sentinel is designed to be applied, not studied.\n\n"
        "Three operating rules:\n\n"
        "<b>RULE 1 -- Apply before advancing</b>\n"
        "Each post contains a principle and an application.\n"
        "Do not advance to the next post until you have applied the current one.\n\n"
        "<b>RULE 2 -- One layer at a time</b>\n"
        "Do not attempt to run Layer 2 frameworks while Layer 1 is incomplete.\n"
        "The system is load-bearing. Sequence matters.\n\n"
        "<b>RULE 3 -- Measure by behavior, not understanding</b>\n"
        "The metric is not 'I understand this.'\n"
        "The metric is 'My behavior has changed because of this.'\n\n"
        "<b>If your behavior has not changed -- the framework has not been applied.</b>"
    ),
    (
        "<b>PATH ORIENTATION</b>\n\n"
        "Before entering any system, orientation is required.\n\n"
        "Answer these three questions in writing:\n\n"
        "<b>1. Where are you now?</b>\n"
        "Current situation. Honest assessment. No editing.\n\n"
        "<b>2. Where are you building toward?</b>\n"
        "3-year vision. Specific. Measurable.\n\n"
        "<b>3. What is the gap?</b>\n"
        "What capability, resource, or behavior is currently missing\n"
        "that is required to reach the 3-year vision?\n\n"
        "These answers are your operating map.\n"
        "Every Sentinel framework is applied in service of closing that gap.\n\n"
        "Without the map, the frameworks are tools without a project.\n\n"
        "<b>Complete path orientation before using any other Sentinel tool.</b>"
    ),
    (
        "<b>PROGRESSION LOGIC</b>\n\n"
        "Progression in the Sentinel system is not time-based.\n"
        "It is behavior-based.\n\n"
        "You advance to the next layer when:\n\n"
        "- The frameworks of the current layer are applied consistently\n"
        "- The behaviors required by the current layer are stable\n"
        "- The outcomes of the current layer are visible and measurable\n\n"
        "Time spent in a channel is not a signal of readiness.\n"
        "Behavioral change is.\n\n"
        "Progress check for Layer 1:\n"
        "- Is your internal state consistently stable?\n"
        "- Do you operate with a defined daily structure?\n"
        "- Can you make decisions quickly from a place of clarity?\n\n"
        "If yes -- you are ready for Layer 2.\n"
        "If not -- continue Layer 1 until these are true.\n\n"
        "<b>Readiness is demonstrated, not assumed.</b>"
    ),
    (
        "<b>OPERATING POSTURE</b>\n\n"
        "The Sentinel system requires a specific operating posture.\n\n"
        "That posture is:\n\n"
        "<b>Calm</b> -- not reactive, not urgent, not anxious\n"
        "<b>Clear</b> -- one objective at a time, defined outcomes\n"
        "<b>Direct</b> -- communication and action without ambiguity\n"
        "<b>Patient</b> -- compound results require compound time\n"
        "<b>Accountable</b> -- full ownership of outcomes regardless of cause\n\n"
        "This posture is not a personality type.\n"
        "It is a practiced operating state.\n\n"
        "It is not always natural. It is always chosen.\n\n"
        "When you deviate -- notice it, name it, return to posture.\n\n"
        "<b>Posture is what you return to. Not what you always have.</b>"
    ),
    (
        "<b>WHAT SENTINEL IS NOT</b>\n\n"
        "Clarity about what a system is not prevents misuse.\n\n"
        "Sentinel is not:\n\n"
        "- A motivation system. Do not come here for inspiration.\n"
        "  Come here for structure and method.\n\n"
        "- A shortcut. The sequence exists because it is necessary.\n"
        "  Skipping layers produces shallow results.\n\n"
        "- A community or social platform.\n"
        "  This is a private operating system. It operates quietly.\n\n"
        "- A replacement for professional advice.\n"
        "  For legal, financial, or medical decisions, use qualified professionals.\n\n"
        "Sentinel is a framework for building clarity, execution, and leverage.\n"
        "Used correctly, it compounds.\n"
        "Used incorrectly, it adds complexity.\n\n"
        "<b>Use it for what it is. Do not ask it to be what it is not.</b>"
    ),
    (
        "<b>THE THREE-LAYER SYSTEM IN PRACTICE</b>\n\n"
        "Understanding the architecture makes navigation easier.\n\n"
        "Layer 1 produces: Stable state, clear thinking, structured daily operation\n"
        "Layer 2 produces: Revenue, operational systems, active deal flow\n"
        "Layer 3 produces: Leverage, IP, long-term positioning, scalable infrastructure\n\n"
        "Most operators want Layer 3 results without Layer 1 infrastructure.\n"
        "This is why most operator results plateau.\n\n"
        "The architecture is not arbitrary.\n"
        "It is the sequence in which sustainable performance is actually built.\n\n"
        "Trust the sequence.\n"
        "Execute each layer completely.\n"
        "Advance when the behavior demonstrates readiness.\n\n"
        "<b>The architecture is the advantage. Do not bypass it.</b>"
    ),
    (
        "<b>EXECUTION ORIENTATION</b>\n\n"
        "You have completed the Sentinel Access orientation.\n\n"
        "Before moving forward, confirm the following:\n\n"
        "1. Path orientation is complete (Post 4 answers are written)\n"
        "2. Operating posture is understood and being practiced\n"
        "3. Progression logic is clear -- you know what readiness looks like\n"
        "4. The three-layer architecture is mapped to your current position\n\n"
        "If all four are confirmed -- you are oriented.\n\n"
        "Orientation is the foundation of accurate navigation.\n"
        "An unoriented operator moves fast in the wrong direction.\n\n"
        "<b>Oriented. Stable. Clear. Now you operate.</b>"
    ),
    (
        "<b>NEXT STEP -- SENTINEL ENGINE</b>\n\n"
        "Layer 1 is complete.\n\n"
        "Sentinel Engine is Layer 2.\n\n"
        "It covers:\n"
        "- How to build and validate offers\n"
        "- How to structure revenue across multiple layers\n"
        "- Operational systems for consistent execution\n"
        "- Deal flow, distribution, and conversion\n\n"
        "Entry to Layer 2 requires Layer 1 behaviors to be stable.\n"
        "If they are -- the Engine is your next access point.\n\n"
        "<i>Foundation is complete.\n"
        "The execution layer is open.</i>"
    ),
]

# ---------------------------------------------------------------------------
# SENTINEL ENGINE V1 -- 10 posts
# ---------------------------------------------------------------------------

_ENGINE_V2 = [
    (
        "<b>SENTINEL ENGINE -- EXECUTION LAYER</b>\n\n"
        "This channel operates at Layer 2 of the Sentinel system.\n\n"
        "The Engine is where clarity becomes revenue and revenue becomes systems.\n\n"
        "Prerequisite: Layer 1 (Foundation) must be stable before this layer is effective.\n"
        "If your internal state is still inconsistent -- complete the Reset and Access channels first.\n\n"
        "What this channel delivers:\n"
        "- Execution systems that produce consistent output\n"
        "- Monetization frameworks built on correct sequencing\n"
        "- Operational discipline at the individual and system level\n"
        "- Offer, distribution, and conversion architecture\n\n"
        "<i>The Engine does not run without a stable operator.\n"
        "If you are stable -- this is your layer.</i>"
    ),
    (
        "<b>EXECUTION SYSTEMS</b>\n\n"
        "An execution system is a repeatable structure that produces consistent output.\n\n"
        "Without a system, performance depends on motivation.\n"
        "Motivation is variable. Systems are not.\n\n"
        "The Sentinel execution system is built on three components:\n\n"
        "<b>1. A defined weekly rhythm</b>\n"
        "Specific days and times for specific categories of work.\n"
        "Not flexible. Not optional.\n\n"
        "<b>2. A completion standard</b>\n"
        "What 'done' means for each type of output.\n"
        "Without a standard, nothing is ever truly complete.\n\n"
        "<b>3. A review and reset cycle</b>\n"
        "Weekly review of what was completed and what carries forward.\n"
        "No exceptions.\n\n"
        "<b>Build the system before loading it with objectives.</b>"
    ),
    (
        "<b>MONETIZATION THINKING</b>\n\n"
        "Most monetization problems are not pricing problems or marketing problems.\n"
        "They are clarity problems.\n\n"
        "The monetization clarity questions:\n\n"
        "<b>Q1: What specific problem does your offer solve?</b>\n"
        "Not generally. Specifically. For whom. In what timeframe.\n\n"
        "<b>Q2: Who has this problem and has already tried to solve it?</b>\n"
        "Prior purchase behavior is the strongest indicator of buying intent.\n\n"
        "<b>Q3: What is the result worth to the buyer?</b>\n"
        "Price is set relative to value delivered, not cost incurred.\n\n"
        "<b>Q4: What is the delivery mechanism?</b>\n"
        "How does the buyer access the result?\n\n"
        "When all four are answered precisely, pricing and positioning become straightforward.\n\n"
        "<b>Clarity produces revenue. Confusion repels it.</b>"
    ),
    (
        "<b>OPERATIONAL DISCIPLINE</b>\n\n"
        "Operational discipline is the capacity to execute the correct action\n"
        "at the correct time regardless of internal state.\n\n"
        "It is built through:\n\n"
        "<b>1. Pre-commitment</b>\n"
        "Deciding in advance what will be done and when.\n"
        "Removes the decision overhead during execution.\n\n"
        "<b>2. Environmental design</b>\n"
        "Structuring the environment so the correct action is the easiest action.\n\n"
        "<b>3. Accountability metrics</b>\n"
        "Measuring daily: Was the pre-committed action completed?\n"
        "Binary. Yes or no. No partial credit.\n\n"
        "<b>4. Consequence design</b>\n"
        "What happens when the commitment is not met?\n"
        "Must be defined in advance to be effective.\n\n"
        "<b>Discipline is designed. It is not summoned on demand.</b>"
    ),
    (
        "<b>OFFER CONSTRUCTION</b>\n\n"
        "An offer is not a product. An offer is a structured exchange of value.\n\n"
        "Offer components:\n\n"
        "<b>The promise</b> -- What specific outcome does the buyer get?\n"
        "<b>The proof</b> -- Why should the buyer believe this outcome is achievable?\n"
        "<b>The path</b> -- How does the buyer get from current state to promised outcome?\n"
        "<b>The terms</b> -- Price, access method, timeline.\n\n"
        "An offer with all four components is complete and sellable.\n"
        "An offer missing any component requires refinement before going to market.\n\n"
        "Assessment: Which component of your current offer is weakest?\n"
        "Strengthen that one element before optimizing anything else.\n\n"
        "<b>A complete offer requires all four. Not three. Four.</b>"
    ),
    (
        "<b>DISTRIBUTION LOGIC</b>\n\n"
        "The best offer without distribution produces zero revenue.\n\n"
        "Distribution is the method by which the offer reaches the buyer.\n\n"
        "The Sentinel distribution principle:\n"
        "Own the channel before scaling within it.\n\n"
        "Own the channel means:\n"
        "- You understand how it works mechanically\n"
        "- You can produce consistent output within it\n"
        "- You have evidence of audience response\n\n"
        "Do not add a second distribution channel until the first is owned.\n\n"
        "Most multi-channel failures are premature-scaling failures.\n"
        "Not method failures.\n\n"
        "Channels to consider in sequence: direct outreach, owned content, referral, paid.\n\n"
        "<b>One channel. Owned. Proven. Then the next.</b>"
    ),
    (
        "<b>CONVERSION PRINCIPLES</b>\n\n"
        "Conversion is not persuasion. It is alignment.\n\n"
        "A buyer converts when:\n"
        "- Their problem is precisely identified\n"
        "- Your offer is the correct solution for that specific problem\n"
        "- The trust level matches the price point\n"
        "- The timing is right for them\n\n"
        "You cannot force any of these four conditions.\n"
        "You can create the environment where they are likely.\n\n"
        "Conversion architecture:\n"
        "1. Problem identification -- in their language, not yours\n"
        "2. Solution demonstration -- show the path, not just the destination\n"
        "3. Trust signals -- evidence, structure, consistency\n"
        "4. Invitation -- clear, specific, non-pressured\n\n"
        "<b>Align the offer with the buyer. Do not pressure the buyer into the offer.</b>"
    ),
    (
        "<b>REVENUE ARCHITECTURE</b>\n\n"
        "Revenue architecture is the design of how money flows into and through the operation.\n\n"
        "A complete revenue architecture has:\n\n"
        "<b>Entry revenue</b> -- Low-barrier offers that create relationships\n"
        "<b>Core revenue</b> -- Primary offers that deliver the main value\n"
        "<b>Expansion revenue</b> -- Deeper or broader access for existing buyers\n"
        "<b>Recurring revenue</b> -- Ongoing access with ongoing value delivery\n\n"
        "You do not need all four active simultaneously.\n"
        "You need them designed and sequenced.\n\n"
        "Most operations have core revenue but no entry, expansion, or recurring structure.\n"
        "This limits both acquisition and retention.\n\n"
        "Audit your current revenue architecture:\n"
        "Which of the four do you have? Which are missing?\n\n"
        "<b>Design the architecture before filling it with offers.</b>"
    ),
    (
        "<b>EXECUTION ORIENTATION</b>\n\n"
        "The Engine is a system, not a concept.\n\n"
        "Before closing this channel today:\n\n"
        "1. Define your current primary offer using the four-component framework (Post 5)\n"
        "2. Identify your current distribution channel and confirm it is owned\n"
        "3. Map your current revenue architecture -- which layers are active?\n"
        "4. Commit to one operational discipline practice starting this week\n\n"
        "The Engine runs when you run it.\n"
        "It does not run on understanding alone.\n\n"
        "<b>Execute one component of the Engine this week.\n"
        "Not all of them. One. Completely.</b>"
    ),
    (
        "<b>NEXT STEP -- SENTINEL ARCHITECT</b>\n\n"
        "The Engine is the execution layer.\n\n"
        "Sentinel Architect is the strategy layer:\n"
        "- Long-term system design\n"
        "- IP development and licensing\n"
        "- Strategic positioning and market architecture\n"
        "- Governance and operational scalability\n\n"
        "The Engine generates revenue.\n"
        "The Architect designs the infrastructure that makes the Engine scalable.\n\n"
        "When the Engine is producing consistent, repeatable results --\n"
        "the Architect layer is the next build.\n\n"
        "<i>Execution is proven.\n"
        "Architecture is the next layer.</i>"
    ),
]

# ---------------------------------------------------------------------------
# SENTINEL ARCHITECT V1 -- 10 posts
# ---------------------------------------------------------------------------

_ARCHITECT_V2 = [
    (
        "<b>SENTINEL ARCHITECT -- STRATEGY LAYER</b>\n\n"
        "This channel operates at Layer 3 of the Sentinel system.\n\n"
        "The Architect layer is for operators who have completed Layers 1 and 2\n"
        "and are ready to design long-term leverage.\n\n"
        "This is not where execution happens.\n"
        "This is where the systems that enable execution are designed.\n\n"
        "What this channel delivers:\n"
        "- Strategic positioning at the market and identity level\n"
        "- Long-term systems thinking and architecture logic\n"
        "- IP structuring for leverage beyond personal time\n"
        "- Governance frameworks for operational scale\n\n"
        "<i>The Architect does not build the building.\n"
        "The Architect designs the structure everything else is built on.</i>"
    ),
    (
        "<b>STRATEGIC POSITIONING</b>\n\n"
        "Strategic positioning is the answer to one question:\n"
        "What singular position do you occupy in the market that no one else can claim?\n\n"
        "Not niche. Position.\n\n"
        "A niche is a market segment.\n"
        "A position is a perception held in the mind of the market.\n\n"
        "Strong positions are:\n"
        "- Specific (not 'I help businesses grow')\n"
        "- Defensible (built on genuine capability)\n"
        "- Valuable (the market will pay for this perception)\n"
        "- Consistent (the same across all channels and interactions)\n\n"
        "Your current positioning: Can you state it in one sentence that is specific, "
        "defensible, valuable, and consistent?\n\n"
        "If not -- positioning is incomplete.\n\n"
        "<b>Position before you promote. The position is the infrastructure.</b>"
    ),
    (
        "<b>LONG-TERM SYSTEMS THINKING</b>\n\n"
        "Most operators think in quarterly cycles.\n"
        "Architects think in 3-year cycles with quarterly milestones.\n\n"
        "The difference:\n\n"
        "Quarterly thinking optimizes for this quarter's results.\n"
        "It often sacrifices structural investments that would compound over years.\n\n"
        "3-year thinking asks:\n"
        "What must be true in year 3 for the operation to be where it needs to be?\n"
        "What must be built in year 1 and 2 to make year 3 possible?\n\n"
        "The 3-year map does not require complete certainty.\n"
        "It requires directional clarity and structural investment planning.\n\n"
        "Build your 3-year map.\n"
        "Then identify the quarterly milestones that lead to it.\n"
        "Then execute against the milestones.\n\n"
        "<b>Long-term thinking protects short-term execution from short-sightedness.</b>"
    ),
    (
        "<b>ARCHITECTURE LOGIC</b>\n\n"
        "Architecture is the design of systems that produce results without requiring "
        "the architect's constant presence.\n\n"
        "Architectural thinking asks:\n\n"
        "<b>What are the core systems that produce the primary outcomes?</b>\n"
        "Identify them. Name them. Map them.\n\n"
        "<b>What is required to run each system?</b>\n"
        "People, processes, tools, information. Specify each.\n\n"
        "<b>What would break first if you were removed from the operation?</b>\n"
        "That is the architectural vulnerability. Address it.\n\n"
        "<b>What would continue operating correctly without you?</b>\n"
        "That is the strength of your current architecture.\n\n"
        "Architect thinking moves from 'me' to 'system'.\n"
        "From 'I produce' to 'the system produces'.\n\n"
        "<b>Design the system. Then position yourself as the architect, not the operator.</b>"
    ),
    (
        "<b>BRAND AND IP THINKING</b>\n\n"
        "Brand is the accumulated perception of your operation in the market.\n"
        "IP is the structured knowledge, method, or system that produces your results.\n\n"
        "Most operators have neither fully developed.\n\n"
        "Brand development:\n"
        "- Define the specific perception you want to own\n"
        "- Ensure every output reinforces that perception\n"
        "- Measure brand by what the market says unprompted\n\n"
        "IP development:\n"
        "- Document your primary method completely\n"
        "- Name it\n"
        "- Structure it so others can understand and apply it\n"
        "- Consider how it can be licensed, taught, or sold independently\n\n"
        "IP converts expertise from a service into an asset.\n"
        "An asset generates value without requiring the creator's time.\n\n"
        "<b>Develop IP. It is the most leverageable asset in an operator's portfolio.</b>"
    ),
    (
        "<b>GOVERNANCE THINKING</b>\n\n"
        "Governance is the system of rules, roles, and decisions that keeps the operation "
        "aligned with its objectives as it grows.\n\n"
        "Without governance, growth creates chaos.\n"
        "With governance, growth creates compounding structure.\n\n"
        "Governance at the operator level includes:\n\n"
        "<b>Decision rights</b> -- What decisions do you make? What is delegated?\n"
        "<b>Operating standards</b> -- What is the quality standard for each output?\n"
        "<b>Review cadence</b> -- When and how is the operation reviewed?\n"
        "<b>Boundary conditions</b> -- What will the operation not do, regardless of opportunity?\n\n"
        "Boundary conditions are the most important and least defined governance element.\n"
        "Define what you will not do.\n"
        "This protects the operation from opportunity drift.\n\n"
        "<b>Governance is the structure that allows the operation to grow without losing itself.</b>"
    ),
    (
        "<b>THE ARCHITECT'S MINDSET</b>\n\n"
        "The architect thinks differently from the operator and the executor.\n\n"
        "The operator asks: What do I need to do today?\n"
        "The executor asks: How do I do this faster?\n"
        "The architect asks: Why does this need to be done at all?\n\n"
        "Architect-level questions:\n\n"
        "- Is this activity part of the core system, or is it distraction?\n"
        "- If this works, what is the 10x version of it?\n"
        "- What would have to be true for this to be unnecessary in 2 years?\n"
        "- Who else could run this, and what would they need?\n\n"
        "The architect mindset operates at the system level.\n"
        "Tactics are evaluated against architecture.\n"
        "Not architecture against tactics.\n\n"
        "<b>Adopt the mindset before applying the frameworks.</b>"
    ),
    (
        "<b>LEGACY DESIGN</b>\n\n"
        "Legacy is not about what you leave behind after you stop.\n"
        "Legacy is about what continues to operate, grow, and create value independent of you.\n\n"
        "Legacy design questions:\n\n"
        "1. What would the operation look like in 10 years if built correctly?\n"
        "2. What systems need to exist for that version to be independent?\n"
        "3. What IP needs to be structured and protected?\n"
        "4. What governance needs to be in place?\n"
        "5. Who needs to be developed to lead the systems you design?\n\n"
        "Legacy is not an accident. It is a design.\n"
        "Operators who do not design for legacy build operations that require them indefinitely.\n\n"
        "Design the operation to outlast your direct involvement.\n\n"
        "<b>Legacy is built now. It is experienced later.</b>"
    ),
    (
        "<b>EXECUTION ORIENTATION</b>\n\n"
        "You have completed the Sentinel Architect orientation.\n\n"
        "The Architect layer is the most advanced in the system.\n"
        "It requires everything built in Layers 1 and 2 to be functional.\n\n"
        "Before applying any Architect framework, confirm:\n\n"
        "1. Layer 1 -- Internal state is consistently stable\n"
        "2. Layer 2 -- Revenue systems are producing consistent results\n"
        "3. Positioning -- Clearly defined and consistently communicated\n"
        "4. IP -- At least one system is documented and nameable\n\n"
        "If any of the above is incomplete -- return to that layer and complete it.\n\n"
        "The Architect layer amplifies what is already working.\n"
        "It does not substitute for what is not.\n\n"
        "<b>Confirm the foundation. Then architect the future.</b>"
    ),
    (
        "<b>FINAL POSITION -- SENTINEL ARCHITECT</b>\n\n"
        "You are now oriented at the strategic layer of the Sentinel system.\n\n"
        "The complete system:\n"
        "- Layer 1: Foundation (Reset, Quick Access, Teachings, Access)\n"
        "- Layer 2: Execution (Engine)\n"
        "- Layer 3: Architecture (Architect)\n\n"
        "All three layers are now accessible to you.\n\n"
        "The system compounds when all three layers are operational simultaneously.\n"
        "Foundation provides stability. Execution provides revenue. Architecture provides leverage.\n\n"
        "Your position in the market is now structurally defined.\n"
        "Your operating systems are in place.\n"
        "Your long-term architecture is designed.\n\n"
        "<i>The system is installed.\n"
        "Operate it with discipline.\n"
        "It compounds.</i>"
    ),
]

# ---------------------------------------------------------------------------
# Master v2 content map
# ---------------------------------------------------------------------------

_CONTENT_V2: dict = {
    "reset_v1":             _RESET_V2,
    "quick_access_v1":      _QUICK_V2,
    "teachings_vault_v1":   _VAULT_V2,
    "sentinel_access_v1":   _ACCESS_V2,
    "sentinel_engine_v1":   _ENGINE_V2,
    "sentinel_architect_v1":_ARCHITECT_V2,
}

_ALL_PRODUCTS = list(_CONTENT_V2.keys())


def get_channel_content_v2(product_id: str) -> list:
    """Return the 10-post v2 bundle for a product channel."""
    return _CONTENT_V2.get(product_id, [])


# ---------------------------------------------------------------------------
# R2 helpers
# ---------------------------------------------------------------------------

async def _log_publish(product_id: str, channel_id: str, post_index: int, status: str) -> None:
    try:
        from bot.services.r2_service import put_json
        now = datetime.now(timezone.utc)
        ts = now.strftime("%Y%m%dT%H%M%S")
        key = f"{_LOG_PREFIX}{product_id}/{ts}_{post_index}.json"
        await put_json(key, {
            "product_id": product_id,
            "channel":    channel_id,
            "post_index": post_index,
            "posted_at":  now.isoformat(),
            "status":     status,
            "source":     "telegram_bot_v2",
        })
    except Exception as exc:
        logger.warning("_log_publish v2 failed: %s", exc)


async def _save_bundle_v2(product_id: str, posts: list) -> None:
    """Write the v2 bundle to R2 for reference and future editing."""
    try:
        from bot.services.r2_service import put_json
        key = f"{_QUEUE_PREFIX}{product_id}/bundle_v2.json"
        await put_json(key, {"product_id": product_id, "posts": posts,
                             "saved_at": datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        logger.warning("_save_bundle_v2 failed: %s", exc)


async def _get_drip_index(product_id: str) -> int:
    """Read current drip queue index from R2. Returns 0 if not set."""
    try:
        from bot.services.r2_service import get_json
        key = f"{_QUEUE_PREFIX}{product_id}/queue.json"
        data = await get_json(key)
        if data and isinstance(data.get("index"), int):
            return data["index"]
    except Exception as exc:
        logger.warning("_get_drip_index failed: %s", exc)
    return 0


async def _set_drip_index(product_id: str, index: int) -> None:
    """Write drip queue index to R2."""
    try:
        from bot.services.r2_service import put_json
        key = f"{_QUEUE_PREFIX}{product_id}/queue.json"
        await put_json(key, {
            "product_id": product_id,
            "index": index,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.warning("_set_drip_index failed: %s", exc)


# ---------------------------------------------------------------------------
# Core v2 publish functions
# ---------------------------------------------------------------------------

async def publish_bundle_v2(bot, product_id: str, pin_first: bool = True) -> dict:
    """
    Publish the full 10-post v2 bundle to a product channel.
    Returns {"ok": bool, "published": int, "errors": list}.
    """
    from bot.services.channel_content_service import CHANNEL_IDS

    posts = get_channel_content_v2(product_id)
    if not posts:
        return {"ok": False, "published": 0, "errors": [f"No v2 content for {product_id}"]}

    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        return {"ok": False, "published": 0,
                "errors": [f"Channel ID not configured for {product_id}. "
                           f"Set env var CHANNEL_ID_{product_id.upper()}."]}

    published = 0
    errors = []

    for idx, text in enumerate(posts):
        pin = pin_first and idx == 0
        try:
            sent = await bot.send_message(
                chat_id=int(channel_id),
                text=text,
                parse_mode="HTML",
            )
            if pin:
                try:
                    await bot.pin_chat_message(
                        chat_id=int(channel_id),
                        message_id=sent.message_id,
                        disable_notification=True,
                    )
                except Exception as pin_err:
                    logger.warning("Pin failed on post 0: %s", pin_err)
            asyncio.create_task(_log_publish(product_id, channel_id, idx, "published"))
            published += 1
            await asyncio.sleep(0.5)
        except Exception as exc:
            err_msg = f"Post {idx} failed: {exc}"
            logger.error(err_msg)
            errors.append(err_msg)

    if published > 0:
        asyncio.create_task(_save_bundle_v2(product_id, posts))

    ok = published > 0 and not errors
    logger.info("v2 bundle: product=%s published=%s errors=%s", product_id, published, len(errors))
    return {"ok": ok, "published": published, "errors": errors}


async def drip_next_post(bot, product_id: str) -> dict:
    """
    Publish the next unposted item from the v2 queue.
    Returns {"ok": bool, "index": int, "total": int, "exhausted": bool, "error": str|None}.
    """
    from bot.services.channel_content_service import CHANNEL_IDS

    posts = get_channel_content_v2(product_id)
    if not posts:
        return {"ok": False, "index": 0, "total": 0, "exhausted": False,
                "error": f"No v2 content for {product_id}"}

    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        return {"ok": False, "index": 0, "total": len(posts), "exhausted": False,
                "error": f"Channel ID not configured for {product_id}."}

    index = await _get_drip_index(product_id)
    total = len(posts)

    if index >= total:
        return {"ok": False, "index": index, "total": total, "exhausted": True,
                "error": "Queue exhausted. All posts have been dripped."}

    text = posts[index]
    try:
        await bot.send_message(
            chat_id=int(channel_id),
            text=text,
            parse_mode="HTML",
        )
        next_index = index + 1
        asyncio.create_task(_set_drip_index(product_id, next_index))
        asyncio.create_task(_log_publish(product_id, channel_id, index, "dripped"))
        logger.info("Dripped post %s/%s for %s", index + 1, total, product_id)
        return {"ok": True, "index": index, "total": total, "exhausted": next_index >= total,
                "error": None}
    except Exception as exc:
        logger.error("drip_next_post failed: %s", exc)
        return {"ok": False, "index": index, "total": total, "exhausted": False,
                "error": str(exc)}
