export const chatPlatforms = [
  "Intercom",
  "WhatsApp Business",
  "CSV or JSON export",
  "Something else",
] as const;

export type ContactValues = {
  name: string;
  email: string;
  company: string;
  role: string;
  platform: string;
  message: string;
};

export type ContactField = keyof ContactValues;
export type ContactErrors = Partial<Record<ContactField, string>>;

export const emptyContact: ContactValues = {
  name: "",
  email: "",
  company: "",
  role: "",
  platform: "",
  message: "",
};

export const contactFieldOrder: ContactField[] = [
  "name",
  "email",
  "company",
  "role",
  "platform",
  "message",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeContact(values: Partial<ContactValues>): ContactValues {
  const out = { ...emptyContact };
  for (const key of contactFieldOrder) {
    const raw = values[key];
    out[key] = typeof raw === "string" ? raw.trim() : "";
  }
  return out;
}

export function validateField(field: ContactField, value: string): string | undefined {
  const v = value.trim();
  switch (field) {
    case "name":
      if (!v) return "Enter your name.";
      if (v.length > 120) return "Keep your name under 120 characters.";
      return undefined;
    case "email":
      if (!v) return "Enter your work email.";
      if (v.length > 200 || !EMAIL_RE.test(v)) return "Enter a valid email, like name@company.com.";
      return undefined;
    case "company":
      if (!v) return "Enter your company name.";
      if (v.length > 160) return "Keep your company name under 160 characters.";
      return undefined;
    case "role":
      if (v.length > 120) return "Keep your role under 120 characters.";
      return undefined;
    case "platform":
      if (v && !(chatPlatforms as readonly string[]).includes(v)) return "Choose one of the listed options.";
      return undefined;
    case "message":
      if (v.length > 2000) return "Keep your message under 2,000 characters.";
      return undefined;
  }
}

export function validateContact(values: Partial<ContactValues>): ContactErrors {
  const normalized = normalizeContact(values);
  const errors: ContactErrors = {};
  for (const field of contactFieldOrder) {
    const message = validateField(field, normalized[field]);
    if (message) errors[field] = message;
  }
  return errors;
}
