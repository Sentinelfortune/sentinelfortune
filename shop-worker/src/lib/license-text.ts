// Generates the rights/restrictions summary stored on each issued license.
//
// IMPORTANT: this text is a plain-language operational summary, not a
// lawyer-drafted license agreement, and it says so. See
// SHOP_KNOWN_LIMITATIONS.md and OWNER_SHOP_GUIDE.md — the Owner should have
// final license and refund-policy language reviewed by counsel before
// relying on it in a dispute. Nothing generated here is legal advice.

import type { LicenseType } from "../types";

const RETAINED_OWNERSHIP_CLAUSE =
  "Sentinel Fortune LLC retains ownership of all pre-existing frameworks, methodologies, templates, " +
  "brand assets, master files, the Human Approval Gate™ process, the Fact-Locked Prompt Method™, " +
  "and the underlying reusable production architecture used to create this product. " +
  "Purchase of this product conveys only the license rights described below, not ownership of those " +
  "underlying assets.";

const NOT_LEGAL_ADVICE_NOTE =
  "This summary is provided for clarity and is not a substitute for the full license terms, and is not " +
  "legal advice. Sentinel Fortune LLC's complete Terms of Sale govern any purchase.";

export interface LicenseTextOutput {
  rightsSummary: string;
  restrictionsSummary: string;
}

export function generateLicenseText(licenseType: LicenseType, productTitle: string): LicenseTextOutput {
  const rightsByType: Record<LicenseType, string> = {
    SINGLE_BUSINESS:
      `The licensed purchaser may use "${productTitle}" internally within one (1) single business entity, ` +
      `including adapting and customizing the included materials for that business's own internal operations.`,
    MULTI_LOCATION:
      `The licensed purchaser may use "${productTitle}" internally across multiple locations or branches ` +
      `operating under a single parent business entity, including adapting the included materials for each ` +
      `location's internal operations.`,
    CONSULTANT:
      `The licensed purchaser may use "${productTitle}" internally and may apply the included frameworks and ` +
      `templates on behalf of the purchaser's own clients as part of the purchaser's consulting engagements, ` +
      `without redistributing the source files themselves as a standalone product.`,
    WHITE_LABEL:
      `The licensed purchaser may use, rebrand, and resell derivative work based on "${productTitle}" under the ` +
      `purchaser's own brand, subject to the specific terms negotiated for this license.`,
  };

  const restrictionsByType: Record<LicenseType, string> = {
    SINGLE_BUSINESS:
      "May not be resold, sublicensed, or redistributed as a standalone product. May not be shared outside " +
      "the licensed business. May not be used to create a directly competing template/toolkit product for resale.",
    MULTI_LOCATION:
      "May not be resold, sublicensed, or redistributed as a standalone product outside the licensed parent " +
      "business and its own locations. May not be used to create a directly competing template/toolkit product for resale.",
    CONSULTANT:
      "May not redistribute the original source files to clients as a standalone deliverable. May not resell " +
      "the product itself, template, or toolkit as a productized offering under a different name.",
    WHITE_LABEL:
      "Use is limited to the specific scope negotiated in the applicable written agreement for this license; " +
      "no additional white-label rights are implied beyond that agreement.",
  };

  return {
    rightsSummary: `${rightsByType[licenseType]} ${RETAINED_OWNERSHIP_CLAUSE}`,
    restrictionsSummary: `${restrictionsByType[licenseType]} ${NOT_LEGAL_ADVICE_NOTE}`,
  };
}
