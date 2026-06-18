import prisma from "@/lib/db/prisma";
import { MaskingStrategy } from "@prisma/client";

interface ScrubResult {
  original: string;
  scrubbed: string;
  detections: Detection[];
}

interface Detection {
  type: string;
  value: string;
  replacement: string;
  start: number;
  end: number;
}

interface RegexPattern {
  pattern: string;
  flags: string;
  label: string;
}

const BUILT_IN_PATTERNS: Array<{
  label: string;
  regex: RegExp;
  category: string;
}> = [
  {
    label: "EMAIL",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    category: "PII",
  },
  {
    label: "PHONE_US",
    regex: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    category: "PII",
  },
  {
    label: "SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: "HIPAA",
  },
  {
    label: "CREDIT_CARD",
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    category: "PCI",
  },
  {
    label: "IP_ADDRESS",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    category: "PII",
  },
  {
    label: "DOB",
    regex: /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
    category: "HIPAA",
  },
  {
    label: "NPI",
    regex: /\bNPI[:\s#]*\d{10}\b/gi,
    category: "HIPAA",
  },
  {
    label: "MRN",
    regex: /\bMRN[:\s#]*[A-Z0-9]{6,12}\b/gi,
    category: "HIPAA",
  },
  {
    label: "IBAN",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
    category: "PCI",
  },
  {
    label: "API_KEY",
    regex: /\b(sk-|pk-|rk-|Bearer\s)[A-Za-z0-9\-_]{20,}\b/g,
    category: "SECURITY",
  },
];

function buildReplacement(
  label: string,
  strategy: MaskingStrategy,
  index: number
): string {
  switch (strategy) {
    case "REDACT":
      return `[REDACTED:${label}]`;
    case "TOKENIZE":
      return `[TOKEN_${label}_${index.toString().padStart(4, "0")}]`;
    case "ANONYMIZE":
    default:
      return `[${label}]`;
  }
}

export async function scrubText(
  text: string,
  tenantId: string
): Promise<ScrubResult> {
  const profile = await prisma.complianceProfile.findUnique({
    where: { tenantId },
  });

  if (!profile) {
    return { original: text, scrubbed: text, detections: [] };
  }

  const { hipaaEnabled, gdprEnabled, pciEnabled, maskingStrategy, customBlocklist, customRegexPatterns } = profile;

  let scrubbed = text;
  const detections: Detection[] = [];
  let tokenIndex = 0;

  const applyPattern = (regex: RegExp, label: string) => {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const replacement = buildReplacement(label, maskingStrategy, ++tokenIndex);
      detections.push({
        type: label,
        value: match[0],
        replacement,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  };

  const categoryFilter = new Set<string>(["PII"]);
  if (hipaaEnabled) categoryFilter.add("HIPAA");
  if (pciEnabled) categoryFilter.add("PCI");

  for (const pattern of BUILT_IN_PATTERNS) {
    if (categoryFilter.has(pattern.category) || gdprEnabled) {
      applyPattern(new RegExp(pattern.regex.source, "g"), pattern.label);
    }
  }

  // Custom regex patterns from the compliance profile
  const customPatterns = customRegexPatterns as RegexPattern[];
  for (const cp of customPatterns) {
    try {
      const regex = new RegExp(cp.pattern, cp.flags || "g");
      applyPattern(regex, cp.label);
    } catch {
      // Invalid regex — skip silently
    }
  }

  // Custom word/phrase blocklist
  for (const word of customBlocklist) {
    if (!word.trim()) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    applyPattern(regex, "BLOCKLISTED");
  }

  // Sort detections in reverse order so replacements don't shift indices
  detections.sort((a, b) => b.start - a.start);

  for (const det of detections) {
    scrubbed =
      scrubbed.slice(0, det.start) + det.replacement + scrubbed.slice(det.end);
  }

  return { original: text, scrubbed, detections };
}

export async function scrubTextBatch(
  texts: string[],
  tenantId: string
): Promise<ScrubResult[]> {
  return Promise.all(texts.map((t) => scrubText(t, tenantId)));
}
